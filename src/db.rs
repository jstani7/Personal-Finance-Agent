use std::collections::BTreeMap;
use std::path::Path;
use anyhow::{bail, Result};
use rusqlite::{params, Connection};

use crate::categories::categorize_transaction;
use crate::models::{CreateTransactionRequest, ImportSummary, SpendingTrendPoint, SubscriptionItem, Transaction};

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

pub fn load_transactions(conn: &Connection) -> Result<Vec<Transaction>> {
    let mut stmt = conn.prepare(
        "SELECT id, date, description, amount, category, is_income FROM transactions ORDER BY date",
    )?;

    let rows = stmt.query_map([], |row| {
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

pub fn get_import_summary(conn: &Connection) -> Result<ImportSummary> {
    let count: usize = conn.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))?;

    if count == 0 {
        return Ok(ImportSummary {
            rows_imported: 0,
            total_spending: 0.0,
            category_breakdown: BTreeMap::new(),
            date_range: "No data".to_string(),
        });
    }

    let min_date: String = conn.query_row(
        "SELECT COALESCE(MIN(date), '') FROM transactions",
        [],
        |r| r.get(0),
    )?;
    let max_date: String = conn.query_row(
        "SELECT COALESCE(MAX(date), '') FROM transactions",
        [],
        |r| r.get(0),
    )?;

    let total_spending: f64 = conn.query_row(
        "SELECT COALESCE(SUM(ABS(amount)), 0.0) FROM transactions WHERE amount < 0",
        [],
        |r| r.get(0),
    )?;

    let mut stmt = conn.prepare(
        "SELECT category, SUM(ABS(amount)) FROM transactions WHERE amount < 0 GROUP BY category ORDER BY SUM(ABS(amount)) DESC",
    )?;

    let cat_rows = stmt.query_map([], |row| {
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
    let mut lines = Vec::new();
    lines.push(col_names.join(" | "));
    lines.push("-".repeat(lines[0].len()));

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

pub fn get_spending_trends(conn: &Connection) -> Result<Vec<SpendingTrendPoint>> {
    let mut stmt = conn.prepare(
        "SELECT date, SUM(ABS(amount)) FROM transactions WHERE amount < 0 GROUP BY date ORDER BY date",
    )?;

    let rows = stmt.query_map([], |row| {
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
