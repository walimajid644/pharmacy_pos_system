use super::*;
use sqlx::sqlite::SqlitePoolOptions;
const ADMIN: &str = "00000000-0000-0000-0000-000000000001";
async fn fixture() -> Pool<Sqlite> {
    let p = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database_api::initialize(&p).await.unwrap();
    for id in ["bank-a", "bank-b"] {
        sqlx::query(
            "INSERT INTO bank_accounts(id,name,created_at,updated_at) VALUES(?,?, 'now','now')",
        )
        .bind(id)
        .bind(id)
        .execute(&p)
        .await
        .unwrap();
    }
    sqlx::query("INSERT INTO opening_balances(id,kind,entity_id,amount_cents,entry_date,reference,notes,recorded_by,created_at) VALUES('opening-a','bank','bank-a',10000,'2020-01-01','Opening','',?,'now')").bind(ADMIN).execute(&p).await.unwrap();
    sqlx::query("INSERT INTO income_heads(id,name,created_at,updated_at) VALUES('head','Testing income','now','now')").execute(&p).await.unwrap();
    p
}
fn movement(kind: &str, cents: i64, drawer: bool) -> BankRequest {
    serde_json::from_value(json!({"requestId":Uuid::new_v4().to_string(),"kind":kind,"accountId":"bank-a","toAccountId":if kind=="transfer"{Some("bank-b")}else{None},"amountCents":cents,"entryDate":"2020-01-02","reference":"BT test","notes":"Reviewed","cashDrawer":drawer})).unwrap()
}
fn income(method: &str, cents: i64) -> IncomeRequest {
    serde_json::from_value(json!({"requestId":Uuid::new_v4().to_string(),"headId":"head","description":"Non-sales income","amountCents":cents,"method":method,"bankAccountId":if method=="bank"{Some("bank-a")}else{None},"entryDate":"2020-01-02","reference":"IN test"})).unwrap()
}
async fn balance(p: &Pool<Sqlite>, bank: &str) -> i64 {
    sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents),0) FROM bank_ledger WHERE account_id=?")
        .bind(bank)
        .fetch_one(p)
        .await
        .unwrap()
}
#[tokio::test]
async fn transfers_are_atomic_conserve_money_and_retry_without_duplicate_legs() {
    let p = fixture().await;
    let r = movement("transfer", 2500, false);
    let id = r.request_id.clone();
    record_bank(&p, ADMIN, r).await.unwrap();
    let mut replay = movement("transfer", 2500, false);
    replay.request_id = id.clone();
    record_bank(&p, ADMIN, replay).await.unwrap();
    assert_eq!(
        (balance(&p, "bank-a").await, balance(&p, "bank-b").await),
        (7500, 2500)
    );
    let legs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bank_ledger WHERE source='bank'")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(legs, 2);
    let mut changed = movement("transfer", 2600, false);
    changed.request_id = id.clone();
    assert!(record_bank(&p, ADMIN, changed).await.is_err());
    void_posting(&p, ADMIN, "bank", &id, "Wrong account")
        .await
        .unwrap();
    void_posting(&p, ADMIN, "bank", &id, "Retry").await.unwrap();
    assert_eq!(
        (balance(&p, "bank-a").await, balance(&p, "bank-b").await),
        (10000, 0)
    );
    let mut bad = movement("transfer", 100, false);
    bad.to_account_id = Some("bank-a".into());
    assert!(record_bank(&p, ADMIN, bad).await.is_err());
    sqlx::query("UPDATE bank_accounts SET is_active=0 WHERE id='bank-b'")
        .execute(&p)
        .await
        .unwrap();
    assert!(record_bank(&p, ADMIN, movement("transfer", 100, false))
        .await
        .is_err());
}
#[tokio::test]
async fn drawer_movements_and_income_are_counted_once_without_creating_sales() {
    let p = fixture().await;
    assert!(record_bank(&p, ADMIN, movement("deposit", 2000, true))
        .await
        .is_err());
    let shift = crate::shifts::open(&p, ADMIN, 10000).await.unwrap();
    record_bank(&p, ADMIN, movement("deposit", 2000, true))
        .await
        .unwrap();
    record_bank(&p, ADMIN, movement("withdrawal", 500, true))
        .await
        .unwrap();
    let cash = income("cash", 1000);
    let cash_id = cash.request_id.clone();
    record_income(&p, ADMIN, cash).await.unwrap();
    let bank = income("bank", 750);
    let id = bank.request_id.clone();
    record_income(&p, ADMIN, bank).await.unwrap();
    let mut replay = income("bank", 750);
    replay.request_id = id;
    record_income(&p, ADMIN, replay).await.unwrap();
    record_income(&p, ADMIN, income("mobile", 300))
        .await
        .unwrap();
    assert_eq!(balance(&p, "bank-a").await, 12250);
    let closed = crate::shifts::close(
        &p,
        ADMIN,
        serde_json::from_value(json!({"shiftId":shift,"countedCashCents":9500,"notes":null}))
            .unwrap(),
    )
    .await
    .unwrap();
    let result = serde_json::to_value(closed).unwrap();
    assert_eq!(result["expectedCashCents"], 9500);
    assert_eq!(result["varianceCents"], 0);
    assert!(void_posting(&p, ADMIN, "income", &cash_id, "Closed drawer")
        .await
        .is_err());
    let sales: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(sales, 0);
    let posts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM income_entries")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(posts, 3);
}
#[tokio::test]
async fn reconciliation_checks_selected_entries_and_seals_both_transfer_accounts() {
    let p = fixture().await;
    let deposit = movement("deposit", 2000, false);
    let dep = deposit.request_id.clone();
    record_bank(&p, ADMIN, deposit).await.unwrap();
    let transfer = movement("transfer", 1000, false);
    let tr = transfer.request_id.clone();
    record_bank(&p, ADMIN, transfer).await.unwrap();
    sqlx::query("INSERT INTO account_entries(id,number,kind,category,description,amount_cents,method,entry_date,recorded_by,created_at,bank_account_id) VALUES('expense','EX','expense','General','Uncleared expense',500,'bank','2020-01-02',?,'now','bank-a')").bind(ADMIN).execute(&p).await.unwrap();
    let keys = vec![format!("bank:{dep}:from"), format!("bank:{tr}:from")];
    let rec_id = Uuid::new_v4().to_string();
    let request = |cents, entries: Vec<String>| {
        serde_json::from_value(json!({"requestId":rec_id,"accountId":"bank-a","statementDate":"2020-01-31","statementBalanceCents":cents,"reference":"Statement Jan","entryKeys":entries})).unwrap()
    };
    assert!(reconcile(&p, ADMIN, request(11001, keys.clone()))
        .await
        .is_err());
    assert!(
        reconcile(&p, ADMIN, request(11000, vec![format!("bank:{tr}:to")]))
            .await
            .is_err()
    );
    let empty: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bank_clearances")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(empty, 0);
    reconcile(&p, ADMIN, request(11000, keys.clone()))
        .await
        .unwrap();
    reconcile(&p, ADMIN, request(11000, keys)).await.unwrap();
    let statement = statement(&p, ADMIN, "bank-a", "2020-01-02", "2020-01-31")
        .await
        .unwrap();
    assert_eq!(statement["beforeCents"], 10000);
    assert_eq!(statement["closingCents"], 10500);
    assert_eq!(statement["clearedCents"], 11000);
    assert!(
        void_posting(&p, ADMIN, "bank", &tr, "Cannot reverse the other bank leg")
            .await
            .is_err()
    );
    assert!(
        crate::commercial::void_entry(&p, ADMIN, "expense", "Closed bank period")
            .await
            .is_err()
    );
    assert_eq!(balance(&p, "bank-a").await, 10500);
    assert!(record_bank(&p, ADMIN, movement("deposit", 100, false))
        .await
        .is_err());
    let mut later = movement("deposit", 100, false);
    later.entry_date = "2020-02-01".into();
    record_bank(&p, ADMIN, later).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bank_reconciliations")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(count, 1);
    crate::database_api::initialize(&p).await.unwrap();
    assert_eq!(balance(&p, "bank-a").await, 10600);
}
#[tokio::test]
async fn legacy_bank_vouchers_link_without_reposting_or_changing_customer_balance() {
    let p = fixture().await;
    sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,current_balance,created_at,updated_at) VALUES('c','BANK-C','Bank','Customer','retail',100,'now','now')").execute(&p).await.unwrap();
    let receipt=serde_json::from_value(json!({"requestId":Uuid::new_v4().to_string(),"kind":"receipt","customerId":"c","category":"Collection","description":"Old bank collection","amountCents":2500,"method":"bank","reference":"RC","entryDate":"2020-01-02"})).unwrap();
    crate::commercial::record_entry(&p, ADMIN, receipt)
        .await
        .unwrap();
    let id: String = sqlx::query_scalar("SELECT id FROM account_entries LIMIT 1")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(balance(&p, "bank-a").await, 10000);
    assign(&p, ADMIN, "account", &id, "bank-a").await.unwrap();
    assign(&p, ADMIN, "account", &id, "bank-a").await.unwrap();
    assert_eq!(balance(&p, "bank-a").await, 12500);
    let amount: f64 = sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='c'")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(amount, 75.0);
    assert!(assign(&p, ADMIN, "account", &id, "bank-b").await.is_err());
    crate::commercial::void_entry(&p, ADMIN, &id, "Reverse collection")
        .await
        .unwrap();
    assert_eq!(balance(&p, "bank-a").await, 10000);
    let amount: f64 = sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='c'")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(amount, 100.0);
}
#[tokio::test]
async fn income_heads_keep_saved_snapshots_and_guards_reject_unauthorized_or_invalid_writes() {
    let p = fixture().await;
    let r = income("bank", 500);
    let id = r.request_id.clone();
    record_income(&p, ADMIN, r).await.unwrap();
    sqlx::query("UPDATE income_heads SET name='Renamed',is_active=0 WHERE id='head'")
        .execute(&p)
        .await
        .unwrap();
    let name: String = sqlx::query_scalar("SELECT head_name FROM income_entries WHERE id=?")
        .bind(&id)
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(name, "Testing income");
    let mut replay = income("bank", 500);
    replay.request_id = id.clone();
    record_income(&p, ADMIN, replay).await.unwrap();
    assert!(record_income(&p, ADMIN, income("bank", 500)).await.is_err());
    void_posting(&p, ADMIN, "income", &id, "Duplicate income")
        .await
        .unwrap();
    assert_eq!(balance(&p, "bank-a").await, 10000);
    sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,created_at,updated_at) VALUES('cashier','bank-cashier','x','Cashier','cashier','now','now')").execute(&p).await.unwrap();
    assert!(record_bank(&p, "cashier", movement("deposit", 100, false))
        .await
        .is_err());
    assert!(record_income(&p, "cashier", income("bank", 100))
        .await
        .is_err());
    assert!(statement(&p, "cashier", "bank-a", "", "2020-01-31")
        .await
        .is_err());
    assert!(assign(&p, "cashier", "account", "x", "bank-a")
        .await
        .is_err());
    for amount in [0, -1, i64::MIN, i64::MAX] {
        assert!(record_bank(&p, ADMIN, movement("deposit", amount, false))
            .await
            .is_err());
    }
    let mut bad = movement("deposit", 100, false);
    bad.entry_date = "2020-02-30".into();
    assert!(record_bank(&p, ADMIN, bad).await.is_err());
}

#[tokio::test]
async fn linked_receipts_expenses_and_supplier_payments_reach_the_bank_once() {
    let p = fixture().await;
    sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,current_balance,created_at,updated_at) VALUES('c','LINK-C','Linked','Customer','retail',100,'now','now')").execute(&p).await.unwrap();
    let payment = |kind: &str, amount| {
        serde_json::from_value(json!({"requestId":Uuid::new_v4().to_string(),"kind":kind,"customerId":if kind=="receipt"{Some("c")}else{None},"category":"General","description":"Linked voucher","amountCents":amount,"method":"bank","bankAccountId":"bank-a","reference":"Linked","entryDate":"2020-01-02"})).unwrap()
    };
    crate::commercial::record_entry(&p, ADMIN, payment("receipt", 1500))
        .await
        .unwrap();
    crate::commercial::record_entry(&p, ADMIN, payment("expense", 200))
        .await
        .unwrap();
    assert_eq!(balance(&p, "bank-a").await, 11300);
    sqlx::query("INSERT INTO suppliers(id,supplier_code,name,created_at,updated_at) VALUES('sup','BANK-SUP','Linked supplier','now','now')").execute(&p).await.unwrap();
    let opening=crate::openings::record(&p,ADMIN,serde_json::from_value(json!({"requestId":Uuid::new_v4().to_string(),"kind":"supplier","entityId":"sup","amountCents":1000,"entryDate":"2020-01-01","reference":"Opening","notes":""})).unwrap()).await.unwrap();
    let req_id = Uuid::new_v4().to_string();
    let payment = || {
        serde_json::from_value(json!({"requestId":req_id,"poId":opening,"amountCents":500,"method":"bank","bankAccountId":"bank-a","reference":"Supplier","notes":null})).unwrap()
    };
    crate::supplier_ledger::record(&p, ADMIN, payment())
        .await
        .unwrap();
    crate::supplier_ledger::record(&p, ADMIN, payment())
        .await
        .unwrap();
    assert_eq!(balance(&p, "bank-a").await, 10800);
    sqlx::query("INSERT INTO products(id,sku,name,unit_price,cost_price,created_at,updated_at) VALUES('bank-product','BANK-P','Product',10,5,'now','now')").execute(&p).await.unwrap();
    sqlx::query("INSERT INTO purchase_orders(id,po_number,supplier_id,order_date,status,total_amount,created_by,created_at,updated_at) VALUES('po','BANK-PO','sup','2020-01-02','partial',100,?,'now','now')").bind(ADMIN).execute(&p).await.unwrap();
    sqlx::query("INSERT INTO purchase_order_items(id,po_id,product_id,quantity_ordered,quantity_received,unit_cost,line_total,created_at) VALUES('bank-line','po','bank-product',10,5,10,100,'now')").execute(&p).await.unwrap();
    let req_id = Uuid::new_v4().to_string();
    let payment = || {
        serde_json::from_value(json!({"requestId":req_id,"poId":"po","amountCents":1000,"method":"bank","bankAccountId":"bank-a","reference":"Supplier PO","notes":null})).unwrap()
    };
    crate::supplier_ledger::record(&p, ADMIN, payment())
        .await
        .unwrap();
    crate::supplier_ledger::record(&p, ADMIN, payment())
        .await
        .unwrap();
    assert_eq!(balance(&p, "bank-a").await, 9800);
}
