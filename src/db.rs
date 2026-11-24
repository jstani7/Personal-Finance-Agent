use std::collections::BTreeMap;
use std::path::Path;
use anyhow::{bail, Result};
use rusqlite::{params, Connection};

use crate::categories::categorize_transaction;
use crate::models::{
    CategoryBudget, CreateTransactionRequest, ImportSummary, SpendingAnomaly, SpendingTrendPoint,
    SubscriptionItem, Transaction,
};

pub const DB_FILE: &str = "finance.db";

pub fn open_db(path: impl AsRef<Path>) -> Result<Connection> {
    let conn = Connection::open(path)?;
    init_db(&conn)?;
    Ok(conn)
}

pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            is_income INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS budgets (
            category TEXT PRIMARY KEY,
            monthly_limit REAL NOT NULL
        )",
        [],
    )?;

    Ok(())
}

pub fn clear_db(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM transactions", [])?;
    Ok(())
}

pub fn insert_transactions(conn: &mut Connection, txs: &[Transaction], replace: bool) -> Result<()> {
    let tx = conn.transaction()?;
    if replace {
        tx.execute("DELETE FROM transactions", [])?;
    }

    {
        let mut stmt = tx.prepare(
            "INSERT INTO transactions (date, description, amount, category, is_income)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;

        for t in txs {
            stmt.execute(params![
                t.date,
                t.description,
                t.amount,
                t.category,
                t.is_income
            ])?;
        }
    }

    tx.commit()?;
    Ok(())
}

pub fn load_transactions(
    conn: &Connection,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<Vec<Transaction>> {
    let s = start_date.unwrap_or("");
    let e = end_date.unwrap_or("");

    let mut stmt = conn.prepare(
        "SELECT id, date, description, amount, category, is_income FROM transactions
         WHERE (?1 = '' OR date >= ?1) AND (?2 = '' OR date <= ?2)
         ORDER BY date DESC",
    )?;

    let rows = stmt.query_map(params![s, e], |row| {
        Ok(Transaction {
            id: row.get(0)?,
            date: row.get(1)?,
            description: row.get(2)?,
            amount: row.get(3)?,
            category: row.get(4)?,
            is_income: row.get(5)?,
        })
    })?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r?);
    }
    Ok(result)
}

pub fn get_import_summary(
    conn: &Connection,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<ImportSummary> {
    let s = start_date.unwrap_or("");
    let e = end_date.unwrap_or("");

    let count: usize = conn.query_row(
        "SELECT COUNT(*) FROM transactions WHERE (?1 = '' OR date >= ?1) AND (?2 = '' OR date <= ?2)",
        params![s, e],
        |r| r.get(0),
    )?;

    if count == 0 {
        return Ok(ImportSummary {
            rows_imported: 0,
            total_spending: 0.0,
            category_breakdown: BTreeMap::new(),
            date_range: "No data".to_string(),
        });
    }

    let min_date: String = conn.query_row(
        "SELECT COALESCE(MIN(date), '') FROM transactions WHERE (?1 = '' OR date >= ?1) AND (?2 = '' OR date <= ?2)",
        params![s, e],
        |r| r.get(0),
    )?;
    let max_date: String = conn.query_row(
        "SELECT COALESCE(MAX(date), '') FROM transactions WHERE (?1 = '' OR date >= ?1) AND (?2 = '' OR date <= ?2)",
        params![s, e],
        |r| r.get(0),
    )?;

    let total_spending: f64 = conn.query_row(
        "SELECT COALESCE(SUM(ABS(amount)), 0.0) FROM transactions WHERE amount < 0 AND (?1 = '' OR date >= ?1) AND (?2 = '' OR date <= ?2)",
        params![s, e],
        |r| r.get(0),
    )?;

    let mut stmt = conn.prepare(
        "SELECT category, SUM(ABS(amount)) FROM transactions WHERE amount < 0 AND (?1 = '' OR date >= ?1) AND (?2 = '' OR date <= ?2) GROUP BY category ORDER BY SUM(ABS(amount)) DESC",
    )?;

    let cat_rows = stmt.query_map(params![s, e], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?;

    let mut category_breakdown = BTreeMap::new();
    for c in cat_rows {
        let (cat, sum) = c?;
        category_breakdown.insert(cat, sum);
    }

    Ok(ImportSummary {
        rows_imported: count,
        total_spending,
        category_breakdown,
        date_range: format!("{} to {}", min_date, max_date),
    })
}

pub fn query_transactions_sql(conn: &Connection, sql: &str) -> Result<String> {
    let cleaned = sql.trim().trim_end_matches(';').trim();
    let lower = cleaned.to_lowercase();

    if !lower.starts_with("select") {
        bail!("Error: only SELECT queries are allowed.");
    }

    let forbidden = ["insert", "update", "delete", "drop", "alter", "create", "attach"];
    for f in forbidden {
        let regex = format!(r"\b{}\b", f);
        if regex::Regex::new(&regex)?.is_match(&lower) {
            bail!("Error: mutating SQL statements are not allowed.");
        }
    }

    let mut stmt = conn.prepare(cleaned)?;
    let col_count = stmt.column_count();
    let col_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();

    let mut rows = stmt.query([])?;
    let mut lines = vec![col_names.join(" | ")];

    let mut count = 0;
    while let Some(row) = rows.next()? {
        count += 1;
        let mut row_vals = Vec::new();
        for i in 0..col_count {
            let val = match row.get_ref(i)? {
                rusqlite::types::ValueRef::Null => "NULL".to_string(),
                rusqlite::types::ValueRef::Integer(v) => v.to_string(),
                rusqlite::types::ValueRef::Real(v) => format!("{:.2}", v),
                rusqlite::types::ValueRef::Text(v) => String::from_utf8_lossy(v).to_string(),
                rusqlite::types::ValueRef::Blob(_) => "[BLOB]".to_string(),
            };
            row_vals.push(val);
        }
        lines.push(row_vals.join(" | "));
        if count >= 100 {
            lines.push("... (truncated to 100 rows)".to_string());
            break;
        }
    }

    if count == 0 {
        return Ok("Query returned no rows.".to_string());
    }

    Ok(lines.join("\n"))
}

pub fn get_spending_trends(
    conn: &Connection,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<Vec<SpendingTrendPoint>> {
    let s = start_date.unwrap_or("");
    let e = end_date.unwrap_or("");

    let mut stmt = conn.prepare(
        "SELECT date, SUM(ABS(amount)) FROM transactions WHERE amount < 0 AND (?1 = '' OR date >= ?1) AND (?2 = '' OR date <= ?2) GROUP BY date ORDER BY date",
    )?;

    let rows = stmt.query_map(params![s, e], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?;

    let mut points = Vec::new();
    let mut running_total = 0.0;
    for r in rows {
        let (date, daily) = r?;
        running_total += daily;
        points.push(SpendingTrendPoint {
            date,
            daily,
            cumulative: running_total,
        });
    }

    Ok(points)
}

pub fn insert_single_transaction(conn: &Connection, tx: &CreateTransactionRequest) -> Result<Transaction> {
    let clean_amount = if tx.amount > 0.0
        && !tx.description.to_lowercase().contains("salary")
        && !tx.description.to_lowercase().contains("deposit")
        && !tx.description.to_lowercase().contains("income")
    {
        -tx.amount.abs()
    } else {
        tx.amount
    };

    let is_income = if clean_amount > 0.0 { 1 } else { 0 };
    let category = if let Some(ref c) = tx.category {
        if !c.trim().is_empty() {
            c.trim().to_string()
        } else {
            categorize_transaction(&tx.description, clean_amount).to_string()
        }
    } else {
        categorize_transaction(&tx.description, clean_amount).to_string()
    };

    conn.execute(
        "INSERT INTO transactions (date, description, amount, category, is_income) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![tx.date, tx.description, clean_amount, category, is_income],
    )?;

    let id = conn.last_insert_rowid();
    Ok(Transaction {
        id: Some(id),
        date: tx.date.clone(),
        description: tx.description.clone(),
        amount: clean_amount,
        category,
        is_income,
    })
}

pub fn detect_subscriptions(conn: &Connection) -> Result<Vec<SubscriptionItem>> {
    let mut stmt = conn.prepare(
        "SELECT description, category, ABS(amount), COUNT(*) as cnt, MAX(date) as last_d
         FROM transactions
         WHERE amount < 0
         GROUP BY description, ROUND(ABS(amount), 1)
         HAVING cnt >= 2
         ORDER BY cnt DESC, ABS(amount) DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SubscriptionItem {
            merchant: row.get(0)?,
            category: row.get(1)?,
            amount: row.get(2)?,
            occurrences: row.get(3)?,
            last_date: row.get(4)?,
            frequency: "Monthly / Recurring".to_string(),
        })
    })?;

    let mut subs = Vec::new();
    for r in rows {
        subs.push(r?);
    }

    Ok(subs)
}

pub fn set_category_budget(conn: &Connection, category: &str, limit: f64) -> Result<()> {
    conn.execute(
        "INSERT INTO budgets (category, monthly_limit) VALUES (?1, ?2)
         ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit",
        params![category, limit],
    )?;
    Ok(())
}

pub fn get_category_budgets(
    conn: &Connection,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<Vec<CategoryBudget>> {
    let s = start_date.unwrap_or("");
    let e = end_date.unwrap_or("");

    let mut stmt = conn.prepare(
        "SELECT DISTINCT category FROM (
            SELECT category FROM transactions WHERE amount < 0
            UNION
            SELECT category FROM budgets
        ) ORDER BY category",
    )?;

    let categories: Vec<String> = stmt
        .query_map([], |r| r.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    let mut budgets = Vec::new();
    for cat in categories {
        let user_limit: Option<f64> = conn
            .query_row(
                "SELECT monthly_limit FROM budgets WHERE category = ?1",
                params![cat],
                |r| r.get(0),
            )
            .ok();

        let spent: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(ABS(amount)), 0.0) FROM transactions 
                 WHERE amount < 0 AND category = ?1 AND (?2 = '' OR date >= ?2) AND (?3 = '' OR date <= ?3)",
                params![cat, s, e],
                |r| r.get(0),
            )
            .unwrap_or(0.0);

        let monthly_limit = user_limit.unwrap_or_else(|| {
            if spent > 0.0 {
                ((spent * 1.15) / 50.0).ceil() * 50.0
            } else {
                300.0
            }
        });

        let percentage = if monthly_limit > 0.0 {
            (spent / monthly_limit) * 100.0
        } else {
            0.0
        };

        let status = if percentage > 100.0 {
            "exceeded".to_string()
        } else if percentage >= 75.0 {
            "warning".to_string()
        } else {
            "ok".to_string()
        };

        budgets.push(CategoryBudget {
            category: cat,
            monthly_limit,
            current_spent: spent,
            percentage,
            status,
        });
    }

    budgets.sort_by(|a, b| b.percentage.partial_cmp(&a.percentage).unwrap_or(std::cmp::Ordering::Equal));

    Ok(budgets)
}

pub fn detect_anomalies(
    conn: &Connection,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<Vec<SpendingAnomaly>> {
    let s = start_date.unwrap_or("");
    let e = end_date.unwrap_or("");

    let mut stmt = conn.prepare(
        "SELECT id, date, description, category, ABS(amount) as amt
         FROM transactions
         WHERE amount < 0 AND (?1 = '' OR date >= ?1) AND (?2 = '' OR date <= ?2)
         ORDER BY date DESC",
    )?;

    struct TxRow {
        id: i64,
        date: String,
        description: String,
        category: String,
        amt: f64,
    }

    let rows = stmt.query_map(params![s, e], |r| {
        Ok(TxRow {
            id: r.get(0)?,
            date: r.get(1)?,
            description: r.get(2)?,
            category: r.get(3)?,
            amt: r.get(4)?,
        })
    })?;

    let mut txs = Vec::new();
    for r in rows {
        txs.push(r?);
    }

    let mut cat_amounts: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    for t in &txs {
        cat_amounts.entry(t.category.clone()).or_default().push(t.amt);
    }

    struct CatStats {
        mean: f64,
        std_dev: f64,
    }

    let mut cat_stats: BTreeMap<String, CatStats> = BTreeMap::new();
    for (cat, vals) in cat_amounts {
        let n = vals.len() as f64;
        if n == 0.0 {
            continue;
        }
        let mean = vals.iter().sum::<f64>() / n;
        let variance = if n > 1.0 {
            vals.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0)
        } else {
            0.0
        };
        let std_dev = variance.sqrt();
        cat_stats.insert(cat, CatStats { mean, std_dev });
    }

    let mut anomalies = Vec::new();
    for t in txs {
        if let Some(stats) = cat_stats.get(&t.category) {
            let mean = stats.mean;
            let std_dev = stats.std_dev;

            let z_score = if std_dev > 1.0 {
                (t.amt - mean) / std_dev
            } else {
                0.0
            };

            let is_z_outlier = z_score >= 2.0 && (t.amt - mean) >= 35.0;
            let is_ratio_spike = mean > 0.0 && t.amt >= (2.2 * mean) && (t.amt - mean) >= 40.0;
            let is_absolute_surge = t.amt >= 250.0 && (t.amt - mean) >= 40.0;

            if is_z_outlier || is_ratio_spike || is_absolute_surge {
                let reason = if is_ratio_spike {
                    format!("{:.1}x higher than category average (${:.2})", t.amt / mean, mean)
                } else if is_z_outlier {
                    format!("Statistical outlier (Z-Score +{:.1})", z_score)
                } else {
                    format!("Unusual high expenditure ($+{:.2} above mean)", t.amt - mean)
                };

                anomalies.push(SpendingAnomaly {
                    id: t.id,
                    date: t.date,
                    description: t.description,
                    amount: t.amt,
                    category: t.category,
                    category_avg: mean,
                    z_score,
                    reason,
                });
            }
        }
    }

    anomalies.sort_by(|a, b| b.amount.partial_cmp(&a.amount).unwrap_or(std::cmp::Ordering::Equal));

    Ok(anomalies)
}
