use std::collections::BTreeMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: Option<i64>,
    pub date: String,
    pub description: String,
    pub amount: f64,
    pub category: String,
    pub is_income: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSummary {
    pub rows_imported: usize,
    pub total_spending: f64,
    pub category_breakdown: BTreeMap<String, f64>,
    pub date_range: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpendingTrendPoint {
    pub date: String,
    pub daily: f64,
    pub cumulative: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub question: String,
    pub chat_history: Option<Vec<(String, String)>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub answer: String,
}
