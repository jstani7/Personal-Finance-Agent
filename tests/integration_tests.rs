use personal_finance_agent::db::{detect_subscriptions, init_db, insert_single_transaction};
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

    // Insert Netflix 3 times in consecutive months
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
