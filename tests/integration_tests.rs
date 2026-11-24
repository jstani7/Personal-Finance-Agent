use personal_finance_agent::db::{
    detect_subscriptions, get_category_budgets, get_import_summary, init_db,
    insert_single_transaction, load_transactions, set_category_budget,
};
use personal_finance_agent::models::CreateTransactionRequest;
use rusqlite::Connection;

#[test]
fn test_csv_ingestion_and_sqlite() {
    let sample_csv = "date,description,amount\n2026-01-02,Whole Foods Market,-87.42\n2026-01-03,Salary Deposit,3200.00\n";
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let mut reader = csv::ReaderBuilder::new().from_reader(sample_csv.as_bytes());
    let mut count = 0;
    for r in reader.records() {
        let rec = r.unwrap();
        let date = &rec[0];
        let desc = &rec[1];
        let amount: f64 = rec[2].parse().unwrap();
        let is_income = if amount > 0.0 { 1 } else { 0 };

        conn.execute(
            "INSERT INTO transactions (date, description, amount, category, is_income) VALUES (?1, ?2, ?3, 'Food', ?4)",
            rusqlite::params![date, desc, amount, is_income],
        ).unwrap();
        count += 1;
    }

    assert_eq!(count, 2);

    let spending: f64 = conn.query_row(
        "SELECT SUM(ABS(amount)) FROM transactions WHERE amount < 0",
        [],
        |r| r.get(0),
    ).unwrap();

    assert!((spending - 87.42).abs() < 0.001);
}

#[test]
fn test_insert_single_transaction() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let req = CreateTransactionRequest {
        date: "2026-01-15".to_string(),
        description: "Starbucks Coffee".to_string(),
        amount: -5.75,
        category: None,
    };

    let created = insert_single_transaction(&conn, &req).unwrap();
    assert_eq!(created.category, "Food");
    assert_eq!(created.amount, -5.75);
    assert_eq!(created.is_income, 0);

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 1);
}

#[test]
fn test_detect_subscriptions() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let req1 = CreateTransactionRequest {
        date: "2025-11-15".to_string(),
        description: "Netflix Subscription".to_string(),
        amount: -15.99,
        category: Some("Entertainment".to_string()),
    };
    let req2 = CreateTransactionRequest {
        date: "2025-12-15".to_string(),
        description: "Netflix Subscription".to_string(),
        amount: -15.99,
        category: Some("Entertainment".to_string()),
    };
    let req3 = CreateTransactionRequest {
        date: "2026-01-15".to_string(),
        description: "Netflix Subscription".to_string(),
        amount: -15.99,
        category: Some("Entertainment".to_string()),
    };

    insert_single_transaction(&conn, &req1).unwrap();
    insert_single_transaction(&conn, &req2).unwrap();
    insert_single_transaction(&conn, &req3).unwrap();

    let subs = detect_subscriptions(&conn).unwrap();
    assert_eq!(subs.len(), 1);
    assert_eq!(subs[0].merchant, "Netflix Subscription");
    assert_eq!(subs[0].occurrences, 3);
    assert!((subs[0].amount - 15.99).abs() < 0.001);
}

#[test]
fn test_category_budgets_and_status() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    // Set budget limit for Food to $100
    set_category_budget(&conn, "Food", 100.0).unwrap();

    // Insert an expense of $80 for Food (80% -> warning status)
    let req1 = CreateTransactionRequest {
        date: "2026-01-10".to_string(),
        description: "Trader Joe's".to_string(),
        amount: -80.0,
        category: Some("Food".to_string()),
    };
    insert_single_transaction(&conn, &req1).unwrap();

    let budgets = get_category_budgets(&conn, None, None).unwrap();
    let food_budget = budgets.iter().find(|b| b.category == "Food").unwrap();
    assert_eq!(food_budget.monthly_limit, 100.0);
    assert_eq!(food_budget.current_spent, 80.0);
    assert_eq!(food_budget.status, "warning");

    // Insert another $30 for Food (total $110 -> exceeded status)
    let req2 = CreateTransactionRequest {
        date: "2026-01-12".to_string(),
        description: "In-N-Out Burger".to_string(),
        amount: -30.0,
        category: Some("Food".to_string()),
    };
    insert_single_transaction(&conn, &req2).unwrap();

    let budgets = get_category_budgets(&conn, None, None).unwrap();
    let food_budget = budgets.iter().find(|b| b.category == "Food").unwrap();
    assert_eq!(food_budget.current_spent, 110.0);
    assert_eq!(food_budget.status, "exceeded");
}

#[test]
fn test_date_range_filtering() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    insert_single_transaction(&conn, &CreateTransactionRequest {
        date: "2026-01-05".to_string(),
        description: "January Coffee".to_string(),
        amount: -10.0,
        category: Some("Food".to_string()),
    }).unwrap();

    insert_single_transaction(&conn, &CreateTransactionRequest {
        date: "2026-02-15".to_string(),
        description: "February Grocery".to_string(),
        amount: -50.0,
        category: Some("Food".to_string()),
    }).unwrap();

    // Filter to January only
    let jan_txs = load_transactions(&conn, Some("2026-01-01"), Some("2026-01-31")).unwrap();
    assert_eq!(jan_txs.len(), 1);
    assert_eq!(jan_txs[0].description, "January Coffee");

    let jan_summary = get_import_summary(&conn, Some("2026-01-01"), Some("2026-01-31")).unwrap();
    assert_eq!(jan_summary.rows_imported, 1);
    assert_eq!(jan_summary.total_spending, 10.0);

    // Filter to February only
    let feb_txs = load_transactions(&conn, Some("2026-02-01"), Some("2026-02-28")).unwrap();
    assert_eq!(feb_txs.len(), 1);
    assert_eq!(feb_txs[0].description, "February Grocery");
}
