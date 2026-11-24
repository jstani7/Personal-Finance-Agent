use std::collections::HashMap;
use std::path::Path;
use anyhow::{bail, Context, Result};
use chrono::NaiveDate;
use rusqlite::Connection;

use crate::categories::categorize_transaction;
use crate::db::{get_import_summary, insert_transactions};
use crate::models::{ImportSummary, Transaction};

pub fn parse_amount_str(raw: &str) -> Option<f64> {
    let clean = raw
        .trim()
        .replace('$', "")
        .replace(',', "")
        .replace(' ', "");
    clean.parse::<f64>().ok()
}

pub fn parse_date_str(raw: &str) -> Option<String> {
    let clean = raw.trim();
    let formats = [
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%m-%d-%Y",
        "%d-%m-%Y",
        "%b %d, %Y",
        "%B %d, %Y",
    ];

    for fmt in formats {
        if let Ok(d) = NaiveDate::parse_from_str(clean, fmt) {
            return Some(d.format("%Y-%m-%d").to_string());
        }
    }
    None
}

pub fn ingest_csv_data(csv_content: &[u8], conn: &mut Connection, replace: bool) -> Result<ImportSummary> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(csv_content);

    let headers = reader.headers()?.clone();
    let mut col_map: HashMap<String, usize> = HashMap::new();

    for (idx, h) in headers.iter().enumerate() {
        let norm = h.trim().to_lowercase().replace(' ', "_");
        let mapped = match norm.as_str() {
            "transaction_date" | "posted_date" => "date",
            "memo" | "narrative" | "details" | "merchant" => "description",
            "transaction_amount" | "value" => "amount",
            other => other,
        };
        col_map.insert(mapped.to_string(), idx);
    }

    let has_date = col_map.contains_key("date");
    let has_desc = col_map.contains_key("description");
    let has_amount = col_map.contains_key("amount");
    let has_debit_credit = col_map.contains_key("debit") || col_map.contains_key("credit");

    if !has_date || !has_desc || (!has_amount && !has_debit_credit) {
        bail!("CSV must include date, description, and amount (or debit/credit columns).");
    }

    let mut transactions = Vec::new();

    for result in reader.records() {
        let record = result?;
        let date_raw = col_map.get("date").and_then(|&i| record.get(i)).unwrap_or("");
        let desc = col_map.get("description").and_then(|&i| record.get(i)).unwrap_or("");

        let date = match parse_date_str(date_raw) {
            Some(d) => d,
            None => continue, // Skip header / invalid date rows
        };

        let amount = if let Some(&idx) = col_map.get("amount") {
            let raw = record.get(idx).unwrap_or("");
            parse_amount_str(raw).unwrap_or(0.0)
        } else {
            let debit_val = col_map
                .get("debit")
                .and_then(|&i| record.get(i))
                .and_then(parse_amount_str)
                .unwrap_or(0.0);
            let credit_val = col_map
                .get("credit")
                .and_then(|&i| record.get(i))
                .and_then(parse_amount_str)
                .unwrap_or(0.0);

            if debit_val != 0.0 {
                -debit_val.abs()
            } else if credit_val != 0.0 {
                credit_val.abs()
            } else {
                0.0
            }
        };

        if amount == 0.0 && desc.is_empty() {
            continue;
        }

        let category = categorize_transaction(desc, amount).to_string();
        let is_income = if amount > 0.0 { 1 } else { 0 };

        transactions.push(Transaction {
            id: None,
            date,
            description: desc.to_string(),
            amount,
            category,
            is_income,
        });
    }

    insert_transactions(conn, &transactions, replace)?;
    get_import_summary(conn, None, None)
}

pub fn ingest_csv_file(path: impl AsRef<Path>, conn: &mut Connection, replace: bool) -> Result<ImportSummary> {
    let bytes = std::fs::read(path)?;
    ingest_csv_data(&bytes, conn, replace)
}

pub async fn parse_pdf_data(pdf_bytes: &[u8], conn: &mut Connection, replace: bool) -> Result<ImportSummary> {
    let text = pdf_extract::extract_text_from_mem(pdf_bytes)
        .context("Could not extract text from PDF file")?;

    if text.trim().is_empty() {
        bail!("No text extracted from PDF - statement may be a scanned image.");
    }

    let api_key = std::env::var("ORQ_API_KEY")
        .context("ORQ_API_KEY is not set. Copy .env.example to .env and set your key.")?;
    let base_url = std::env::var("ORQ_BASE_URL")
        .unwrap_or_else(|_| "https://api.orq.ai/v3/router".to_string());
    let model = std::env::var("ORQ_MODEL")
        .unwrap_or_else(|_| "deepseek-v4-flash".to_string());

    let prompt = format!(
        "You are a bank statement parser. Read the bank statement text below and identify \
        every transaction regardless of the column names, layout, or format used. \
        For each transaction extract: a date, a short description or merchant name, and a \
        single amount (negative for money going out, positive for money coming in). \
        If the statement uses separate debit and credit columns, combine them into one amount. \
        Return ONLY a JSON array where every object has exactly these three keys: \
        \"date\" (YYYY-MM-DD string), \"description\" (string), \"amount\" (number). \
        Do not include any explanation, notes, markdown, or text outside the JSON array.\n\n\
        Bank statement text:\n{}",
        text
    );

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 4096
    });

    let res = client
        .post(format!("{}/chat/completions", base_url.trim_end_matches('/')))
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await?;

    let json: serde_json::Value = res.json().await?;
    let raw_content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim();

    // Strip potential markdown code fences
    let mut clean = raw_content;
    if clean.starts_with("```") {
        if let Some(idx) = clean.find('\n') {
            clean = &clean[idx + 1..];
        }
    }
    if clean.ends_with("```") {
        clean = clean.trim_end_matches('`').trim();
    }

    #[derive(serde::Deserialize)]
    struct ParsedTx {
        date: String,
        description: String,
        amount: f64,
    }

    let parsed: Vec<ParsedTx> = serde_json::from_str(clean)
        .context("Failed to parse LLM extraction as JSON transaction array")?;

    let mut transactions = Vec::new();
    for p in parsed {
        let date = parse_date_str(&p.date).unwrap_or(p.date);
        let category = categorize_transaction(&p.description, p.amount).to_string();
        let is_income = if p.amount > 0.0 { 1 } else { 0 };

        transactions.push(Transaction {
            id: None,
            date,
            description: p.description,
            amount: p.amount,
            category,
            is_income,
        });
    }

    insert_transactions(conn, &transactions, replace)?;
    get_import_summary(conn, None, None)
}
