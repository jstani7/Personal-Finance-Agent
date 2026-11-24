use std::collections::BTreeMap;
use std::path::Path;
use anyhow::{bail, Result};
use chrono::{Datelike, Local, NaiveDate};
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::db::{open_db, query_transactions_sql};

pub fn summarize_spending(conn: &Connection, period: &str) -> Result<String> {
    let mut stmt = conn.prepare(
        "SELECT date, description, amount, category FROM transactions WHERE amount < 0 ORDER BY date",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, f64>(2)?.abs(),
            row.get::<_, String>(3)?,
        ))
    })?;

    let mut txs = Vec::new();
    for r in rows {
        txs.push(r?);
    }

    if txs.is_empty() {
        return Ok("No spending data in the database. Upload a CSV first.".to_string());
    }

    let max_date_str = txs.iter().map(|t| &t.0).max().unwrap().clone();
    let max_date = NaiveDate::parse_from_str(&max_date_str, "%Y-%m-%d")
        .unwrap_or_else(|_| Local::now().date_naive());

    let (start_date, end_date, label) = match period {
        "last_month" => {
            let year = if max_date.month() == 1 { max_date.year() - 1 } else { max_date.year() };
            let month = if max_date.month() == 1 { 12 } else { max_date.month() - 1 };
            let start = NaiveDate::from_ymd_opt(year, month, 1).unwrap_or(max_date);
            let next_m_start = if month == 12 {
                NaiveDate::from_ymd_opt(year + 1, 1, 1).unwrap_or(max_date)
            } else {
                NaiveDate::from_ymd_opt(year, month + 1, 1).unwrap_or(max_date)
            };
            let end = next_m_start.pred_opt().unwrap_or(max_date);
            (Some(start), Some(end), format!("last month ({} to {})", start, end))
        }
        "this_month" => {
            let start = NaiveDate::from_ymd_opt(max_date.year(), max_date.month(), 1).unwrap_or(max_date);
            (Some(start), None, format!("this month (from {})", start))
        }
        "last_7_days" => {
            let start = max_date - chrono::Duration::days(7);
            (Some(start), None, "last 7 days".to_string())
        }
        _ => (None, None, "all time".to_string()),
    };

    let filtered: Vec<&(String, String, f64, String)> = txs
        .iter()
        .filter(|t| {
            if let Ok(d) = NaiveDate::parse_from_str(&t.0, "%Y-%m-%d") {
                if let Some(s) = start_date {
                    if d < s {
                        return false;
                    }
                }
                if let Some(e) = end_date {
                    if d > e {
                        return false;
                    }
                }
                true
            } else {
                true
            }
        })
        .collect();

    if filtered.is_empty() {
        return Ok(format!("No transactions for {}.", label));
    }

    let total: f64 = filtered.iter().map(|t| t.2).sum();
    let mut by_cat: BTreeMap<String, f64> = BTreeMap::new();
    let mut by_merchant: BTreeMap<String, f64> = BTreeMap::new();

    for t in &filtered {
        *by_cat.entry(t.3.clone()).or_insert(0.0) += t.2;
        *by_merchant.entry(t.1.clone()).or_insert(0.0) += t.2;
    }

    let mut cat_vec: Vec<(String, f64)> = by_cat.into_iter().collect();
    cat_vec.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    let mut merch_vec: Vec<(String, f64)> = by_merchant.into_iter().collect();
    merch_vec.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    let mut lines = vec![
        format!("Spending summary ({}): ${:.2} total", label, total),
        "".to_string(),
    ];

    for (cat, val) in cat_vec {
        let pct = if total > 0.0 { 100.0 * val / total } else { 0.0 };
        lines.push(format!("- {}: ${:.2} ({:.1}%)", cat, val, pct));
    }

    lines.push("\nTop merchants:".to_string());
    for (m, val) in merch_vec.into_iter().take(5) {
        lines.push(format!("- {}: ${:.2}", m, val));
    }

    Ok(lines.join("\n"))
}

pub fn get_category_spending(conn: &Connection, category: &str, period: &str) -> Result<String> {
    let cat_norm = category.trim();
    let mut stmt = conn.prepare(
        "SELECT date, amount FROM transactions WHERE LOWER(category) = LOWER(?1) AND amount < 0",
    )?;

    let rows = stmt.query_map([cat_norm], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?.abs()))
    })?;

    let mut total = 0.0;
    for r in rows {
        let (d_str, amt) = r?;
        // Basic date filter
        if period == "last_7_days" {
            if let Ok(d) = NaiveDate::parse_from_str(&d_str, "%Y-%m-%d") {
                let limit = Local::now().date_naive() - chrono::Duration::days(7);
                if d < limit {
                    continue;
                }
            }
        }
        total += amt;
    }

    Ok(format!("{} spending ({}): ${:.2}", cat_norm, period, total))
}

pub fn suggest_weekly_budget(conn: &Connection) -> Result<String> {
    let mut stmt = conn.prepare(
        "SELECT date, amount, category FROM transactions WHERE amount < 0 ORDER BY date",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, f64>(1)?.abs(),
            row.get::<_, String>(2)?,
        ))
    })?;

    let mut dates = Vec::new();
    let mut total_spend = 0.0;
    let mut by_cat: BTreeMap<String, f64> = BTreeMap::new();

    for r in rows {
        let (d, amt, cat) = r?;
        dates.push(d);
        total_spend += amt;
        *by_cat.entry(cat).or_insert(0.0) += amt;
    }

    if dates.is_empty() {
        return Ok("No transaction data loaded. Upload a CSV first.".to_string());
    }

    let min_d = NaiveDate::parse_from_str(dates.first().unwrap(), "%Y-%m-%d")
        .unwrap_or_else(|_| Local::now().date_naive());
    let max_d = NaiveDate::parse_from_str(dates.last().unwrap(), "%Y-%m-%d")
        .unwrap_or_else(|_| Local::now().date_naive());

    let days = (max_d - min_d).num_days().max(1);
    let weeks = ((days as f64) / 7.0).ceil().max(1.0) as i64;
    let weekly_avg = total_spend / (weeks as f64);

    let mut cat_vec: Vec<(String, f64)> = by_cat.into_iter().collect();
    cat_vec.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    let mut lines = vec![
        format!("Based on {} week(s) of data, average weekly spending: ${:.2}", weeks, weekly_avg),
        "".to_string(),
        "Suggested weekly budget by category (proportional to past spending, 10% trim on discretionary):".to_string(),
    ];

    let discretionary = ["Entertainment", "Shopping", "Food"];
    for (cat, total) in &cat_vec {
        let share = if total_spend > 0.0 { total / total_spend } else { 0.0 };
        let mut weekly = weekly_avg * share;
        if discretionary.contains(&cat.as_str()) {
            weekly *= 0.9;
        }
        lines.push(format!("- {}: ${:.2}/week", cat, weekly));
    }

    if let Some((top_cat, top_val)) = cat_vec.first() {
        lines.push("".to_string());
        lines.push(format!("Largest category: {} (${:.2} total).", top_cat, top_val));
        lines.push("Tip: cap Entertainment and Shopping first if you want quick savings.".to_string());
    }

    Ok(lines.join("\n"))
}

pub fn find_largest_discretionary_expenses(conn: &Connection, limit: usize) -> Result<String> {
    let mut stmt = conn.prepare(
        "SELECT date, description, category, ABS(amount) FROM transactions 
         WHERE amount < 0 AND category IN ('Entertainment', 'Shopping', 'Food')
         ORDER BY ABS(amount) DESC LIMIT ?1",
    )?;

    let rows = stmt.query_map([limit], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, f64>(3)?,
        ))
    })?;

    let mut lines = vec!["Largest discretionary expenses:".to_string()];
    let mut count = 0;
    for r in rows {
        let (d, desc, cat, amt) = r?;
        count += 1;
        lines.push(format!("- {} | {} | {} | ${:.2}", d, desc, cat, amt));
    }

    if count == 0 {
        return Ok("No discretionary expenses found.".to_string());
    }

    Ok(lines.join("\n"))
}

pub fn check_budget_alerts(conn: &Connection) -> Result<String> {
    let mut stmt = conn.prepare(
        "SELECT category, SUM(ABS(amount)) FROM transactions WHERE amount < 0 GROUP BY category ORDER BY SUM(ABS(amount)) DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?;

    let mut cat_sums = Vec::new();
    let mut total = 0.0;
    for r in rows {
        let (cat, sum) = r?;
        total += sum;
        cat_sums.push((cat, sum));
    }

    if cat_sums.is_empty() {
        return Ok("No transactions loaded yet.".to_string());
    }

    let mut lines = vec!["Budget & Overspending Risk Analysis:".to_string(), "".to_string()];
    for (cat, val) in &cat_sums {
        let share = if total > 0.0 { 100.0 * val / total } else { 0.0 };
        if share > 30.0 {
            lines.push(format!("- **CRITICAL ALERT: {}**: ${:.2} ({:.1}% of entire budget). Exceeds recommended 30% single-category cap.", cat, val, share));
        } else if share > 20.0 {
            lines.push(format!("- **WATCH: {}**: ${:.2} ({:.1}% of total spend). Nearing high allocation threshold.", cat, val, share));
        } else {
            lines.push(format!("- **ON TRACK: {}**: ${:.2} ({:.1}% of total spend). Healthy allocation.", cat, val, share));
        }
    }

    Ok(lines.join("\n"))
}

pub fn get_tools_definition() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "query_transactions_sql",
                "description": "Run a read-only SQL SELECT against the transactions table in SQLite. Table schema: transactions(id, date, description, amount, category, is_income). amount is negative for expenses and positive for income.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "sql": {
                            "type": "string",
                            "description": "The SQL SELECT statement to execute."
                        }
                    },
                    "required": ["sql"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "summarize_spending",
                "description": "Summarize spending totals and breakdown. period: 'all', 'last_month', 'last_7_days', or 'this_month'.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "period": {
                            "type": "string",
                            "enum": ["all", "last_month", "last_7_days", "this_month"],
                            "description": "Time period to summarize."
                        }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_category_spending",
                "description": "Get total spending for one category (Food, Transport, Entertainment, Utilities, Shopping, Health, Other).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "description": "The category name."
                        },
                        "period": {
                            "type": "string",
                            "description": "Time period ('all', 'last_7_days', etc.)."
                        }
                    },
                    "required": ["category"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "suggest_weekly_budget",
                "description": "Generate a suggested weekly budget plan from historical spending patterns with a 10% trim on discretionary categories.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "find_largest_discretionary_expenses",
                "description": "Find the largest individual discretionary expenses (Entertainment, Shopping, Food).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Number of expenses to return (default: 5)."
                        }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "check_budget_alerts",
                "description": "Analyze category spending distributions to identify budget overruns and categories exceeding safe allocation thresholds.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        }
    ])
}

pub fn execute_tool(db_path: &Path, name: &str, args_json: &str) -> String {
    let conn = match open_db(db_path) {
        Ok(c) => c,
        Err(e) => return format!("Database error: {}", e),
    };
    let args: Value = serde_json::from_str(args_json).unwrap_or(json!({}));
    match name {
        "query_transactions_sql" => {
            let sql = args["sql"].as_str().unwrap_or("");
            match query_transactions_sql(&conn, sql) {
                Ok(res) => res,
                Err(e) => format!("SQL error: {}", e),
            }
        }
        "summarize_spending" => {
            let period = args["period"].as_str().unwrap_or("all");
            match summarize_spending(&conn, period) {
                Ok(res) => res,
                Err(e) => format!("Error: {}", e),
            }
        }
        "get_category_spending" => {
            let cat = args["category"].as_str().unwrap_or("");
            let period = args["period"].as_str().unwrap_or("all");
            match get_category_spending(&conn, cat, period) {
                Ok(res) => res,
                Err(e) => format!("Error: {}", e),
            }
        }
        "suggest_weekly_budget" => {
            match suggest_weekly_budget(&conn) {
                Ok(res) => res,
                Err(e) => format!("Error: {}", e),
            }
        }
        "find_largest_discretionary_expenses" => {
            let limit = args["limit"].as_u64().unwrap_or(5) as usize;
            match find_largest_discretionary_expenses(&conn, limit) {
                Ok(res) => res,
                Err(e) => format!("Error: {}", e),
            }
        }
        "check_budget_alerts" => {
            match check_budget_alerts(&conn) {
                Ok(res) => res,
                Err(e) => format!("Error: {}", e),
            }
        }
        other => format!("Unknown tool: {}", other),
    }
}

pub async fn resolve_llm_config() -> Result<(String, String, String)> {
    if let Ok(key) = std::env::var("ORQ_API_KEY") {
        if !key.trim().is_empty() && key != "your-orq-api-key-here" {
            let url = std::env::var("ORQ_BASE_URL")
                .unwrap_or_else(|_| "https://api.orq.ai/v3/router".to_string());
            let model = std::env::var("ORQ_MODEL")
                .unwrap_or_else(|_| "deepseek-v4-flash".to_string());
            return Ok((key, url, model));
        }
    }

    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        if !key.trim().is_empty() && key != "your-api-key-here" {
            let url = std::env::var("OPENAI_BASE_URL")
                .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());
            let model = std::env::var("OPENAI_MODEL")
                .unwrap_or_else(|_| "gpt-4o-mini".to_string());
            return Ok((key, url, model));
        }
    }

    // Auto-detect local Ollama for zero-configuration offline use
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(800))
        .build()?;
    if let Ok(res) = client.get("http://localhost:11434/api/tags").send().await {
        if res.status().is_success() {
            let json: Value = res.json().await.unwrap_or(json!({}));
            let model = json["models"]
                .as_array()
                .and_then(|m| m.first())
                .and_then(|m| m["name"].as_str())
                .unwrap_or("llama3")
                .to_string();
            return Ok(("ollama".to_string(), "http://localhost:11434/v1".to_string(), model));
        }
    }

    bail!("No LLM provider configured. Set ORQ_API_KEY (or OPENAI_API_KEY) in .env, or run Ollama at http://localhost:11434 for offline private use.")
}

pub async fn ask_finance_agent(
    db_path: &Path,
    question: &str,
    chat_history: &[(String, String)],
) -> Result<String> {
    let (api_key, base_url, model) = resolve_llm_config().await?;

    let today = Local::now().format("%Y-%m-%d").to_string();
    let system_prompt = format!(
        "You are a Personal Finance Agent helping users understand their bank transactions.\n\n\
        You have access to categorized transaction data in SQLite (categories: Food, Transport, Entertainment, Utilities, Shopping, Health, Other).\n\
        Expenses have negative amounts; income is positive.\n\n\
        Use the provided tools to answer questions with real numbers from the data. When users ask about budgets, call suggest_weekly_budget.\n\
        For vague questions like \"unnecessary expenses\", use find_largest_discretionary_expenses and highlight Entertainment, Shopping, and non-essential Food.\n\n\
        Be concise, use USD formatting, and cite figures from tool results. If no data is loaded, tell the user to upload a CSV.\n\
        Today's reference date for relative periods is {today}.\n\n\
        Always format responses using proper markdown: use **bold** (no spaces between asterisks and text) for key figures and category names, use bullet points for lists, and use clean line breaks between sections for readability."
    );

    let mut messages = vec![
        json!({"role": "system", "content": system_prompt})
    ];

    for (user_msg, asst_msg) in chat_history {
        messages.push(json!({"role": "user", "content": user_msg}));
        messages.push(json!({"role": "assistant", "content": asst_msg}));
    }
    messages.push(json!({"role": "user", "content": question}));

    let tools = get_tools_definition();
    let client = reqwest::Client::new();
    let completions_url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let mut current_iteration = 0;
    while current_iteration < 5 {
        current_iteration += 1;

        let req_body = json!({
            "model": model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0.2
        });

        let res = client
            .post(&completions_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&req_body)
            .send()
            .await?;

        if !res.status().is_success() {
            let err_text = res.text().await?;
            bail!("LLM API returned status error: {}", err_text);
        }

        let res_json: Value = res.json().await?;
        let choice = &res_json["choices"][0];
        let message = &choice["message"];

        messages.push(message.clone());

        let tool_calls = message["tool_calls"].as_array();
        if let Some(calls) = tool_calls {
            if calls.is_empty() {
                if let Some(content) = message["content"].as_str() {
                    return Ok(content.to_string());
                }
            }

            for call in calls {
                let call_id = call["id"].as_str().unwrap_or("");
                let fn_name = call["function"]["name"].as_str().unwrap_or("");
                let fn_args = call["function"]["arguments"].as_str().unwrap_or("{}");

                let tool_output = execute_tool(db_path, fn_name, fn_args);
                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": tool_output
                }));
            }
        } else if let Some(content) = message["content"].as_str() {
            return Ok(content.to_string());
        } else {
            break;
        }
    }

    Ok("I could not generate a response.".to_string())
}
