#[test]
fn test_csv_ingestion_and_sqlite() {
    let sample_csv = "date,description,amount\n2026-01-02,Whole Foods Market,-87.42\n2026-01-03,Salary Deposit,3200.00\n";
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute(
        "CREATE TABLE transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            is_income INTEGER NOT NULL DEFAULT 0
        )",
        [],
    ).unwrap();

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
