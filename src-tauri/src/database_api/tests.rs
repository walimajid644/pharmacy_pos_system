use super::*;
use sqlx::sqlite::SqlitePoolOptions;

#[tokio::test]
async fn product_registration_metadata_survives_upgrade_edit_and_restart() {
    let p = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/001_app_schema.sql"))
        .execute(&p)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/002_app_sample.sql"))
        .execute(&p)
        .await
        .unwrap();
    let before: (String, f64, f64, i64) = sqlx::query_as(
        "SELECT id,unit_price,cost_price,pack_size FROM products ORDER BY id LIMIT 1",
    )
    .fetch_one(&p)
    .await
    .unwrap();
    initialize(&p).await.unwrap();
    let defaults: (String, i64, String) =
        sqlx::query_as("SELECT uom,maintain_batch,shelf_location FROM products WHERE id=?")
            .bind(&before.0)
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!(defaults, ("box".into(), 0, "".into()));
    sqlx::query("INSERT INTO shelf_locations(id,name,is_active,created_at,updated_at) VALUES('registration-test-shelf','Shelf A',1,'now','now')")
        .execute(&p).await.unwrap();
    let actor = "00000000-0000-0000-0000-000000000001";
    execute_safe(&p, actor,
        "UPDATE products SET shelf_location=?,remarks=?,uom=?,pack_type=?,ext_disc_percent=?,stm_level=?,maintain_batch=?,fridge_item=?,registration_date=? WHERE id=?".into(),
        vec![serde_json::json!("Shelf A"), serde_json::json!("Keep chilled"), serde_json::json!("bottle"),
             serde_json::json!("100 ml"), serde_json::json!(7.25), serde_json::json!(12),
             serde_json::json!(1), serde_json::json!(1), serde_json::json!("2026-11-21"), serde_json::json!(before.0)],
    ).await.unwrap();
    initialize(&p).await.unwrap();
    let row = sqlx::query("SELECT * FROM products WHERE id=?")
        .bind(&before.0)
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(row.get::<String, _>("shelf_location"), "Shelf A");
    assert_eq!(row.get::<String, _>("remarks"), "Keep chilled");
    assert_eq!(row.get::<String, _>("uom"), "bottle");
    assert_eq!(row.get::<String, _>("pack_type"), "100 ml");
    assert_eq!(row.get::<f64, _>("ext_disc_percent"), 7.25);
    assert_eq!(row.get::<i64, _>("stm_level"), 12);
    assert_eq!(row.get::<i64, _>("maintain_batch"), 1);
    assert_eq!(row.get::<i64, _>("fridge_item"), 1);
    assert_eq!(row.get::<String, _>("registration_date"), "2026-11-21");
    assert_eq!(
        (
            row.get::<f64, _>("unit_price"),
            row.get::<f64, _>("cost_price"),
            row.get::<i64, _>("pack_size")
        ),
        (before.1, before.2, before.3)
    );
    for assignment in [
        "ext_disc_percent=101",
        "stm_level=-1",
        "stm_level=1.5",
        "uom='invalid'",
        "fridge_item=2",
        "registration_date='2026-02-30'",
        "registration_date='2026-99-99'",
    ] {
        assert!(execute_safe(
            &p,
            actor,
            format!("UPDATE products SET {assignment} WHERE id=?"),
            vec![serde_json::json!(before.0)]
        )
        .await
        .is_err());
    }
    execute_safe(&p, actor, "UPDATE products SET shelf_location='',remarks='',pack_type='',ext_disc_percent=0,stm_level=0,maintain_batch=0,fridge_item=0,registration_date=NULL WHERE id=?".into(), vec![serde_json::json!(before.0)]).await.unwrap();
    let cleared: (i64, i64, Option<String>) = sqlx::query_as(
        "SELECT maintain_batch,fridge_item,registration_date FROM products WHERE id=?",
    )
    .bind(&before.0)
    .fetch_one(&p)
    .await
    .unwrap();
    assert_eq!(cleared, (0, 0, None));
}

#[tokio::test]
async fn fresh_database_initializes_in_rust() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    initialize(&pool).await.unwrap();
    let admin: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let products: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM products")
        .fetch_one(&pool)
        .await
        .unwrap();
    let customers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM customers")
        .fetch_one(&pool)
        .await
        .unwrap();
    let suppliers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM suppliers")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(admin > 0);
    assert_eq!(products, 0);
    assert_eq!(customers, 0);
    assert_eq!(suppliers, 0);
    initialize(&pool).await.unwrap();
}

#[tokio::test]
async fn existing_database_gets_guards_without_losing_data() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    let old_schema = include_str!("../../migrations/001_app_schema.sql")
        .replace("    sale_quantity INTEGER,\r\n", "")
        .replace("    sale_quantity INTEGER,\n", "");
    sqlx::raw_sql(&old_schema).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO customers (id, customer_code, first_name, last_name, customer_type, created_at, updated_at) VALUES ('saved', 'C-TEST', 'Saved', 'Customer', 'retail', 'now', 'now')")
        .execute(&pool).await.unwrap();
    initialize(&pool).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM customers WHERE id = 'saved'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let columns = sqlx::query("PRAGMA table_info(sales_invoice_items)")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert!(columns
        .iter()
        .any(|column| column.get::<String, _>("name") == "sale_quantity"));
    for name in ["bonus_quantity", "bonus_units", "cost_price"] {
        assert!(columns
            .iter()
            .any(|column| column.get::<String, _>("name") == name));
    }
    let invoice_columns = sqlx::query("PRAGMA table_info(sales_invoices)")
        .fetch_all(&pool)
        .await
        .unwrap();
    for name in ["received_amount", "change_amount", "previous_balance"] {
        assert!(invoice_columns
            .iter()
            .any(|column| column.get::<String, _>("name") == name));
    }
    initialize(&pool).await.unwrap();
    let closing_columns = sqlx::query("PRAGMA table_info(daily_closing)")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert!(closing_columns
        .iter()
        .any(|column| column.get::<String, _>("name") == "notes"));
    let blocked = sqlx::query("INSERT INTO sales_returns (id, return_number, original_invoice_id, return_date, return_reason, subtotal, tax_amount, refund_amount, refund_method, status, processed_by, created_at, updated_at) VALUES ('bad', 'BAD', 'missing', '2026-10-25', 'other', 0, 0, 0, 'cash', 'refunded', 'missing', 'now', 'now')")
        .execute(&pool).await;
    assert!(blocked.is_err());
}

#[tokio::test]
async fn older_settings_schema_gains_receipt_and_expiry_fields() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/001_initial_schema.sql"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO app_settings (id, company_name, created_at, updated_at) VALUES ('old', 'Saved Pharmacy', 'now', 'now')")
        .execute(&pool).await.unwrap();
    initialize(&pool).await.unwrap();
    let row = sqlx::query("SELECT company_name, near_expiry_days, receipt_header, receipt_footer, show_drap FROM app_settings WHERE id = 'old'")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(row.get::<String, _>("company_name"), "Saved Pharmacy");
    assert_eq!(row.get::<i64, _>("near_expiry_days"), 60);
    assert_eq!(row.get::<i64, _>("show_drap"), 1);
    initialize(&pool).await.unwrap();
}

#[tokio::test]
async fn existing_refunded_returns_gain_stable_references() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/001_app_schema.sql"))
        .execute(&pool)
        .await
        .unwrap();
    let old_inventory = include_str!("../../migrations/004_phase5_inventory.sql")
        .replace("    refund_reference TEXT UNIQUE,\r\n", "")
        .replace("    refund_reference TEXT UNIQUE,\n", "");
    sqlx::raw_sql(&old_inventory).execute(&pool).await.unwrap();
    sqlx::query("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO schema_migrations (version) VALUES ('004_phase5_inventory')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO users (id, username, password_hash, full_name, role, created_at, updated_at) VALUES ('admin', 'admin-test', 'x', 'Admin', 'admin', 'now', 'now')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO sales_invoices (id, invoice_number, cashier_id, invoice_date, total_amount, tax_amount, discount_amount, net_amount, payment_method, status, created_at, updated_at) VALUES ('invoice', 'INV-OLD', 'admin', '2026-10-25', 10, 0, 0, 10, 'cash', 'completed', 'now', 'now')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO sales_returns (id, return_number, original_invoice_id, return_date, return_reason, subtotal, tax_amount, refund_amount, refund_method, status, processed_by, approved_by, approved_at, created_at, updated_at) VALUES ('return', 'RET-OLD', 'invoice', '2026-10-25', 'other', 10, 0, 10, 'cash', 'refunded', 'admin', 'admin', 'now', 'now', 'now')")
        .execute(&pool).await.unwrap();

    initialize(&pool).await.unwrap();
    let reference: String =
        sqlx::query_scalar("SELECT refund_reference FROM sales_returns WHERE id = 'return'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(reference, "RF-RET-OLD");
    initialize(&pool).await.unwrap();
    let still_same: String =
        sqlx::query_scalar("SELECT refund_reference FROM sales_returns WHERE id = 'return'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(reference, still_same);
}

#[tokio::test]
async fn restricted_write_handler_blocks_direct_approval_sql() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    initialize(&pool).await.unwrap();
    let admin = "00000000-0000-0000-0000-000000000001";
    assert!(execute_safe(
        &pool,
        admin,
        "UPDATE sales_returns SET status = 'refunded' WHERE id = ?".into(),
        vec![Value::from("any")]
    )
    .await
    .is_err());
    assert!(execute_safe(
        &pool,
        admin,
        "UPDATE stock_adjustments SET status = 'approved' WHERE id = ?".into(),
        vec![Value::from("any")]
    )
    .await
    .is_err());
    assert!(execute_safe(
        &pool,
        admin,
        "DROP TRIGGER guard_return_decision".into(),
        vec![]
    )
    .await
    .is_err());
    assert!(execute_safe(
        &pool,
        admin,
        "UPDATE app_settings SET theme = ? WHERE id = ?".into(),
        vec![Value::from("dark"), Value::from("missing")]
    )
    .await
    .is_ok());
    let rows = select_safe(
        &pool,
        "SELECT COUNT(*) AS count, COALESCE(SUM(tax_rate), 0) AS tax FROM app_settings".into(),
        vec![],
    )
    .await
    .unwrap();
    assert_eq!(rows[0]["count"], 1);
    assert_eq!(rows[0]["tax"], 0.0);
}

#[test]
fn frontend_has_no_raw_sql_plugin_capability() {
    let capability: Value =
        serde_json::from_str(include_str!("../../capabilities/default.json")).unwrap();
    let permissions = capability["permissions"].as_array().unwrap();
    assert!(permissions
        .iter()
        .all(|value| !value.as_str().unwrap().starts_with("sql:")));
}

#[test]
fn direct_sql_gateway_rejects_sensitive_writes_and_non_select_reads() {
    assert!(!read_only_sql(
        "UPDATE sales_returns SET status = 'refunded'"
    ));
    assert!(!read_only_sql(
        "SELECT 1; UPDATE sales_returns SET status = 'refunded'"
    ));
    assert_eq!(
        writable_table("UPDATE sales_returns SET status = 'refunded'"),
        Some("sales_returns".into())
    );
    assert_eq!(
        writable_table("INSERT INTO stock_adjustments (id) VALUES (?)"),
        Some("stock_adjustments".into())
    );
    assert!(!allowed_table("sales_returns", "admin"));
    assert!(!allowed_table("stock_adjustments", "manager"));
    assert!(!allowed_table("product_batches", "admin"));
    assert!(!allowed_table("users", "cashier"));
    assert!(
        writable_table("WITH x AS (SELECT 1) UPDATE sales_returns SET status='refunded'").is_none()
    );
    assert!(writable_table("DROP TRIGGER guard_return_decision").is_none());
}

#[test]
fn native_password_check_accepts_shipped_admin_hash() {
    assert!(bcrypt::verify(
        "admin123",
        "$2b$10$HQ7l1TORz9fOTS.z8LgCF.z6cyelNU./qRveBuFGIyQhUy6ORutX2"
    )
    .unwrap());
    assert!(!bcrypt::verify(
        "wrong",
        "$2b$10$HQ7l1TORz9fOTS.z8LgCF.z6cyelNU./qRveBuFGIyQhUy6ORutX2"
    )
    .unwrap());
}

#[tokio::test]
async fn default_admin_is_gated_until_password_changes() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    initialize(&pool).await.unwrap();
    let (user, active) = authenticate_user(&pool, "admin", "admin123")
        .await
        .unwrap()
        .unwrap();
    assert!(user.must_change_password);
    let session = SessionState(RwLock::new(Some(active)));
    assert!(current_actor(&session).await.is_err());
    assert!(
        change_user_password(&pool, &user.id, "wrong", "New secret password 2026")
            .await
            .is_err()
    );
    assert!(
        change_user_password(&pool, &user.id, "admin123", "New secret password 2026")
            .await
            .is_ok()
    );
    assert!(authenticate_user(&pool, "admin", "admin123")
        .await
        .unwrap()
        .is_none());
    let (changed, _) = authenticate_user(&pool, "admin", "New secret password 2026")
        .await
        .unwrap()
        .unwrap();
    assert!(!changed.must_change_password);
}

#[tokio::test]
async fn plaintext_account_is_upgraded_after_successful_login() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    initialize(&pool).await.unwrap();
    sqlx::query("INSERT INTO users (id, username, password_hash, full_name, role, created_at, updated_at) VALUES ('legacy', 'legacy', 'legacy-secret', 'Legacy User', 'cashier', 'now', 'now')")
        .execute(&pool).await.unwrap();
    assert!(authenticate_user(&pool, "legacy", "wrong")
        .await
        .unwrap()
        .is_none());
    let unchanged: String =
        sqlx::query_scalar("SELECT password_hash FROM users WHERE id = 'legacy'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(unchanged, "legacy-secret");
    let (user, _) = authenticate_user(&pool, "legacy", "legacy-secret")
        .await
        .unwrap()
        .unwrap();
    assert!(!user.must_change_password);
    let hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = 'legacy'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(hash.starts_with("$2"));
    assert!(bcrypt::verify("legacy-secret", &hash).unwrap());
}

#[tokio::test]
async fn idle_session_is_still_active_just_before_twelve_hours() {
    let session = SessionState(RwLock::new(Some(LoginSession {
        user_id: "cashier".to_string(),
        must_change_password: false,
        last_activity: Instant::now() - Duration::from_secs(12 * 60 * 60 - 60),
    })));
    assert_eq!(current_actor(&session).await.unwrap(), "cashier");
    assert!(session.0.read().await.is_some());
}

#[tokio::test]
async fn idle_session_expires_and_cannot_access_commands() {
    let session = SessionState(RwLock::new(Some(LoginSession {
        user_id: "cashier".to_string(),
        must_change_password: false,
        last_activity: Instant::now() - SESSION_IDLE_TIMEOUT,
    })));
    assert!(current_actor(&session).await.is_err());
    assert!(session.0.read().await.is_none());
    assert!(current_actor(&session).await.is_err());
}

#[tokio::test]
async fn cost_ten_hash_is_upgraded_after_successful_login() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    initialize(&pool).await.unwrap();
    let old_hash = bcrypt::hash("staff-secret-2026", 10).unwrap();
    sqlx::query("INSERT INTO users (id, username, password_hash, full_name, role, created_at, updated_at) VALUES ('staff', 'staff', ?, 'Staff', 'cashier', 'now', 'now')")
        .bind(&old_hash).execute(&pool).await.unwrap();
    assert!(authenticate_user(&pool, "staff", "wrong")
        .await
        .unwrap()
        .is_none());
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT password_hash FROM users WHERE id = 'staff'")
            .fetch_one(&pool)
            .await
            .unwrap(),
        old_hash
    );
    assert!(authenticate_user(&pool, "staff", "staff-secret-2026")
        .await
        .unwrap()
        .is_some());
    let upgraded: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = 'staff'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(upgraded.starts_with("$2b$12$"));
    assert!(bcrypt::verify("staff-secret-2026", &upgraded).unwrap());
}
#[tokio::test]
async fn direct_customer_balance_or_limit_sql_is_blocked() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    initialize(&pool).await.unwrap();
    let actor = "00000000-0000-0000-0000-000000000001";
    assert!(execute_safe(
        &pool,
        actor,
        "UPDATE customers SET current_balance=0".into(),
        vec![]
    )
    .await
    .is_err());
    assert!(execute_safe(
        &pool,
        actor,
        "UPDATE customers SET credit_limit=999999".into(),
        vec![]
    )
    .await
    .is_err());
}
