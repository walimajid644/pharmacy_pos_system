use serde::Serialize;
use serde_json::{Map, Value};
use sqlx::{Column, Pool, Row, Sqlite, TypeInfo, ValueRef};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_sql::{DbInstances, DbPool};
use tokio::sync::RwLock;
use uuid::Uuid;

const SESSION_IDLE_TIMEOUT: Duration = Duration::from_secs(12 * 60 * 60);

#[derive(Default)]
pub struct SessionState(RwLock<Option<LoginSession>>);

struct LoginSession {
    user_id: String,
    must_change_password: bool,
    last_activity: Instant,
}

#[derive(Serialize)]
pub struct PublicUser {
    id: String,
    username: String,
    full_name: String,
    role: String,
    is_active: bool,
    last_login: Option<String>,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
    must_change_password: bool,
}

fn is_bcrypt_hash(value: &str) -> bool {
    value.len() == 60
        && (value.starts_with("$2a$") || value.starts_with("$2b$") || value.starts_with("$2y$"))
}

pub async fn pool(instances: &DbInstances) -> Result<Pool<Sqlite>, String> {
    let databases = instances.0.read().await;
    match databases.get("sqlite:pharmacy.db") {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("The pharmacy database is not ready".to_string()),
    }
}

pub async fn current_actor(session: &SessionState) -> Result<String, String> {
    session_user(session, false).await
}

async fn session_user(
    session: &SessionState,
    allow_password_change: bool,
) -> Result<String, String> {
    let mut guard = session.0.write().await;
    let active = guard.as_mut().ok_or("Please sign in again")?;
    if active.last_activity.elapsed() >= SESSION_IDLE_TIMEOUT {
        *guard = None;
        return Err(
            "Session locked after 12 hours of inactivity. Please sign in again".to_string(),
        );
    }
    if active.must_change_password && !allow_password_change {
        return Err("Change the default admin password before using the app".to_string());
    }
    active.last_activity = Instant::now();
    Ok(active.user_id.clone())
}

#[tauri::command]
pub async fn touch_session(session: State<'_, SessionState>) -> Result<(), String> {
    session_user(&session, true).await.map(|_| ())
}

pub async fn require_matching_actor(
    session: &SessionState,
    claimed_id: &str,
) -> Result<(), String> {
    if current_actor(session).await? != claimed_id {
        return Err("The signed-in user does not match this request".to_string());
    }
    Ok(())
}

pub async fn initialize(pool: &Pool<Sqlite>) -> Result<(), String> {
    let has_users: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'users'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if has_users == 0 {
        sqlx::raw_sql(include_str!("../migrations/001_app_schema.sql"))
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    let setting_columns = sqlx::query("PRAGMA table_info(app_settings)")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    for (name, statement) in [
        (
            "low_stock_threshold",
            "ALTER TABLE app_settings ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 10",
        ),
        (
            "near_expiry_days",
            "ALTER TABLE app_settings ADD COLUMN near_expiry_days INTEGER NOT NULL DEFAULT 60",
        ),
        (
            "receipt_header",
            "ALTER TABLE app_settings ADD COLUMN receipt_header TEXT",
        ),
        (
            "receipt_footer",
            "ALTER TABLE app_settings ADD COLUMN receipt_footer TEXT",
        ),
        (
            "show_drap",
            "ALTER TABLE app_settings ADD COLUMN show_drap INTEGER NOT NULL DEFAULT 1",
        ),
    ] {
        if !setting_columns
            .iter()
            .any(|column| column.get::<String, _>("name") == name)
        {
            sqlx::query(statement)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    let invoice_columns = sqlx::query("PRAGMA table_info(sales_invoice_items)")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    if !invoice_columns
        .iter()
        .any(|column| column.get::<String, _>("name") == "sale_quantity")
    {
        sqlx::query("ALTER TABLE sales_invoice_items ADD COLUMN sale_quantity INTEGER")
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    sqlx::raw_sql("CREATE TABLE IF NOT EXISTS daily_closing (id TEXT PRIMARY KEY, closing_date TEXT NOT NULL UNIQUE, total_sales REAL NOT NULL, total_cash REAL NOT NULL, total_card REAL NOT NULL, closed_by TEXT NOT NULL, closing_time TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (closed_by) REFERENCES users(id)); CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);")
        .execute(pool).await.map_err(|e| e.to_string())?;
    let closing_columns = sqlx::query("PRAGMA table_info(daily_closing)")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    if !closing_columns
        .iter()
        .any(|column| column.get::<String, _>("name") == "notes")
    {
        sqlx::query("ALTER TABLE daily_closing ADD COLUMN notes TEXT")
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    let has_inventory: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version = '004_phase5_inventory'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if has_inventory == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!("../migrations/004_phase5_inventory.sql"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO schema_migrations (version) VALUES ('004_phase5_inventory')")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    let return_columns = sqlx::query("PRAGMA table_info(sales_returns)")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    if !return_columns
        .iter()
        .any(|column| column.get::<String, _>("name") == "refund_reference")
    {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::query("ALTER TABLE sales_returns ADD COLUMN refund_reference TEXT")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("UPDATE sales_returns SET refund_reference = 'RF-' || return_number WHERE status = 'refunded'")
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_refund_reference ON sales_returns(refund_reference)")
        .execute(pool).await.map_err(|e| e.to_string())?;
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_return_line_unique ON sales_return_items(return_id, invoice_item_id)")
        .execute(pool).await.map_err(|e| e.to_string())?;
    sqlx::raw_sql(include_str!("../migrations/006_inventory_triggers.sql"))
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::raw_sql(include_str!("../migrations/005_approval_guards.sql"))
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    let has_operations: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version = '007_desktop_operations'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if has_operations == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!("../migrations/007_desktop_operations.sql"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO schema_migrations (version) VALUES ('007_desktop_operations')")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    let has_drawer: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version = '008_supplier_drawer'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if has_drawer == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!("../migrations/008_supplier_drawer.sql"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO schema_migrations (version) VALUES ('008_supplier_drawer')")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    let has_sale_details: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version = '009_pos_sale_details'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if has_sale_details == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!("../migrations/009_pos_sale_details.sql"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO schema_migrations (version) VALUES ('009_pos_sale_details')")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    let commercial: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version='010_commercial_operations'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if commercial == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!("../migrations/010_commercial_operations.sql"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO schema_migrations(version) VALUES ('010_commercial_operations')")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    let phase2: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version='011_credit_and_expiry'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if phase2 == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!("../migrations/011_credit_and_expiry.sql"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO schema_migrations(version) VALUES('011_credit_and_expiry')")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    let phase3: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version='012_pricing_and_audit'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if phase3 == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!("../migrations/012_pricing_and_audit.sql"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO schema_migrations(version) VALUES('012_pricing_and_audit')")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    let onboarding: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version='013_catalog_and_controlled'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if onboarding == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!("../migrations/013_catalog_and_controlled.sql"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO schema_migrations(version) VALUES('013_catalog_and_controlled')")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    // Older installations may have recorded migration 013 before this view was added.
    ensure_dashboard_view(pool).await?;
    let medicine_products: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version='014_100_medicine_products'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if medicine_products == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!("../migrations/014_100_medicine_products.sql"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO schema_migrations(version) VALUES('014_100_medicine_products')")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    let product_details: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version='015_product_registration_details'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if product_details == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!(
            "../migrations/015_product_registration_details.sql"
        ))
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        sqlx::query(
            "INSERT INTO schema_migrations(version) VALUES('015_product_registration_details')",
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    let registers: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version='016_catalog_registers'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if registers == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!("../migrations/016_catalog_registers.sql"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO schema_migrations(version) VALUES('016_catalog_registers')")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    sqlx::query("INSERT INTO app_settings (id, company_name, tax_rate, currency_symbol, theme, created_at, updated_at) SELECT ?, 'Pharmacy POS', 0, 'Rs', 'light', datetime('now'), datetime('now') WHERE NOT EXISTS (SELECT 1 FROM app_settings)")
        .bind(Uuid::new_v4().to_string()).execute(pool).await.map_err(|e| e.to_string())?;
    
    // Enhanced purchase receipt fields migration
    let has_enhanced_purchase: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version='017_enhanced_purchase_receipt'"
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if has_enhanced_purchase == 0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::raw_sql(include_str!("../../migrations/add_enhanced_purchase_receipt_fields.sql"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO schema_migrations(version) VALUES('017_enhanced_purchase_receipt')")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn login_user(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    username: String,
    password: String,
) -> Result<Option<PublicUser>, String> {
    *session.0.write().await = None;
    let pool = pool(&instances).await?;
    let result = authenticate_user(&pool, &username, &password).await?;
    if let Some((_, active)) = &result {
        *session.0.write().await = Some(LoginSession {
            user_id: active.user_id.clone(),
            must_change_password: active.must_change_password,
            last_activity: Instant::now(),
        });
    }
    Ok(result.map(|(user, _)| user))
}

async fn authenticate_user(
    pool: &Pool<Sqlite>,
    username: &str,
    password: &str,
) -> Result<Option<(PublicUser, LoginSession)>, String> {
    let row = sqlx::query(
        "SELECT * FROM users WHERE username = ? AND is_active = 1 AND deleted_at IS NULL",
    )
    .bind(username.trim())
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some(row) = row else { return Ok(None) };
    let hash: String = row.get("password_hash");
    let is_bcrypt = is_bcrypt_hash(&hash);
    let valid = if is_bcrypt {
        bcrypt::verify(password, &hash).map_err(|e| e.to_string())?
    } else {
        password == hash
    };
    if !valid {
        return Ok(None);
    }
    let id: String = row.get("id");
    if is_bcrypt {
        let cost = hash
            .get(4..6)
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(12);
        if cost < 12 {
            let upgraded = bcrypt::hash(password, 12).map_err(|e| e.to_string())?;
            let changed = sqlx::query("UPDATE users SET password_hash = ?, last_login = datetime('now'), updated_at = datetime('now') WHERE id = ? AND password_hash = ?")
                .bind(upgraded).bind(&id).bind(&hash)
                .execute(pool).await.map_err(|e| e.to_string())?;
            if changed.rows_affected() != 1 {
                return Err("Account changed during login; try again".to_string());
            }
        } else {
            sqlx::query("UPDATE users SET last_login = datetime('now') WHERE id = ?")
                .bind(&id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    } else {
        let upgraded = bcrypt::hash(password, 12).map_err(|e| e.to_string())?;
        let changed = sqlx::query("UPDATE users SET password_hash = ?, last_login = datetime('now'), updated_at = datetime('now') WHERE id = ? AND password_hash = ?")
            .bind(upgraded).bind(&id).bind(&hash)
            .execute(pool).await.map_err(|e| e.to_string())?;
        if changed.rows_affected() != 1 {
            return Err("Account changed during login; try again".to_string());
        }
    }
    let must_change_password =
        id == "00000000-0000-0000-0000-000000000001" && password == "admin123";
    let active = LoginSession {
        user_id: id.clone(),
        must_change_password,
        last_activity: Instant::now(),
    };
    Ok(Some((
        PublicUser {
            id,
            username: row.get("username"),
            full_name: row.get("full_name"),
            role: row.get("role"),
            is_active: row.get::<i64, _>("is_active") != 0,
            last_login: row.get("last_login"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            deleted_at: row.get("deleted_at"),
            must_change_password,
        },
        active,
    )))
}

#[tauri::command]
pub async fn change_password(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    let actor = session_user(&session, true).await?;
    change_user_password(
        &pool(&instances).await?,
        &actor,
        &current_password,
        &new_password,
    )
    .await?;
    if let Some(active) = session.0.write().await.as_mut() {
        if active.user_id == actor {
            active.must_change_password = false;
        }
    }
    Ok(())
}

async fn change_user_password(
    pool: &Pool<Sqlite>,
    actor: &str,
    current_password: &str,
    new_password: &str,
) -> Result<(), String> {
    if new_password.len() < 12 || new_password.len() > 72 {
        return Err("Use a new password between 12 and 72 bytes".to_string());
    }
    if new_password == current_password
        || (actor == "00000000-0000-0000-0000-000000000001" && new_password == "admin123")
    {
        return Err("Choose a password different from the current password".to_string());
    }
    let hash: String = sqlx::query_scalar(
        "SELECT password_hash FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
    )
    .bind(actor)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("User account is unavailable")?;
    let valid = if is_bcrypt_hash(&hash) {
        bcrypt::verify(current_password, &hash).map_err(|e| e.to_string())?
    } else {
        current_password == hash
    };
    if !valid {
        return Err("Current password is incorrect".to_string());
    }
    let upgraded = bcrypt::hash(new_password, 12).map_err(|e| e.to_string())?;
    let changed = sqlx::query("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ? AND password_hash = ?")
        .bind(upgraded).bind(actor).bind(hash).execute(pool).await.map_err(|e| e.to_string())?;
    if changed.rows_affected() != 1 {
        return Err("Account changed; try again".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn logout_user(session: State<'_, SessionState>) -> Result<(), String> {
    *session.0.write().await = None;
    Ok(())
}

fn bind_values<'q>(
    mut query: sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    values: Vec<Value>,
) -> sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    for value in values {
        query = match value {
            Value::Null => query.bind(None::<String>),
            Value::Bool(v) => query.bind(v),
            Value::Number(v) if v.is_i64() => query.bind(v.as_i64().unwrap()),
            Value::Number(v) => query.bind(v.as_f64().unwrap_or_default()),
            Value::String(v) => query.bind(v),
            _ => query.bind(value.to_string()),
        };
    }
    query
}

fn read_only_sql(query: &str) -> bool {
    let trimmed = query.trim();
    trimmed
        .split_whitespace()
        .next()
        .is_some_and(|word| word.eq_ignore_ascii_case("SELECT"))
        && !trimmed.contains(';')
        && !trimmed.contains("--")
        && !trimmed.contains("/*")
}

#[tauri::command]
pub async fn database_select(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    query: String,
    values: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    let actor = current_actor(&session).await?;
    if !read_only_sql(&query) {
        return Err("Only read-only SELECT queries are allowed".to_string());
    }
    if query.to_ascii_lowercase().contains("password_hash") {
        return Err("Password hashes cannot be read by the frontend".to_string());
    }
    let db = pool(&instances).await?;
    authorize_select(&db, &actor, &query).await?;
    select_safe(&db, query, values).await
}

async fn authorize_select(db: &Pool<Sqlite>, actor: &str, query: &str) -> Result<(), String> {
    let q = query.to_ascii_lowercase();
    if q.contains("audit_events") || q.contains("catalog_operations") {
        crate::credit::require_role(db, actor, &["admin", "manager"]).await?;
    }
    if q.contains("sales_invoices") || q.contains("sales_invoice_items") {
        crate::credit::require_role(db, actor, &["admin", "manager", "accountant"]).await?;
    }
    Ok(())
}

async fn ensure_dashboard_view(pool: &Pool<Sqlite>) -> Result<(), String> {
    sqlx::query("CREATE VIEW IF NOT EXISTS sales_dashboard AS SELECT id,invoice_number,invoice_date,net_amount,payment_method,status,customer_id FROM sales_invoices")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) async fn select_safe(
    pool: &Pool<Sqlite>,
    query: String,
    values: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    let rows = bind_values(sqlx::query(&query), values)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    json_rows(rows)
}

pub(crate) fn json_rows(
    rows: Vec<sqlx::sqlite::SqliteRow>,
) -> Result<Vec<Map<String, Value>>, String> {
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        let mut record = Map::new();
        for column in row.columns() {
            let name = column.name();
            if name.eq_ignore_ascii_case("password_hash") {
                return Err("Password hashes cannot be read by the frontend".to_string());
            }
            let raw = row.try_get_raw(name).map_err(|e| e.to_string())?;
            let value = if raw.is_null() {
                Value::Null
            } else {
                match raw.type_info().name() {
                    "INTEGER" => {
                        Value::from(row.try_get::<i64, _>(name).map_err(|e| e.to_string())?)
                    }
                    "REAL" => Value::from(row.try_get::<f64, _>(name).map_err(|e| e.to_string())?),
                    _ => Value::from(row.try_get::<String, _>(name).map_err(|e| e.to_string())?),
                }
            };
            record.insert(name.to_string(), value);
        }
        result.push(record);
    }
    Ok(result)
}

fn writable_table(query: &str) -> Option<String> {
    let trimmed = query.trim();
    if trimmed.contains(';') || trimmed.contains("--") || trimmed.contains("/*") {
        return None;
    }
    let tokens: Vec<_> = trimmed.split_whitespace().collect();
    let table = if tokens.len() >= 3
        && tokens[0].eq_ignore_ascii_case("UPDATE")
        && tokens[2].eq_ignore_ascii_case("SET")
    {
        tokens[1]
    } else if tokens.len() >= 3
        && ((tokens[0].eq_ignore_ascii_case("INSERT") && tokens[1].eq_ignore_ascii_case("INTO"))
            || (tokens[0].eq_ignore_ascii_case("DELETE") && tokens[1].eq_ignore_ascii_case("FROM")))
    {
        tokens[2]
    } else {
        return None;
    };
    if !table
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'_')
    {
        return None;
    }
    Some(table.to_ascii_lowercase())
}

fn allowed_table(table: &str, role: &str) -> bool {
    match table {
        "users" => role == "admin",
        "products" | "suppliers" | "app_settings" | "daily_closing" => {
            matches!(role, "admin" | "manager")
        }
        "customers" => false,
        _ => false,
    }
}

#[tauri::command]
pub async fn database_execute(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    query: String,
    values: Vec<Value>,
) -> Result<i64, String> {
    let actor = current_actor(&session).await?;
    execute_safe(&pool(&instances).await?, &actor, query, values).await
}

async fn execute_safe(
    pool: &Pool<Sqlite>,
    actor: &str,
    query: String,
    values: Vec<Value>,
) -> Result<i64, String> {
    let table = writable_table(&query).ok_or("Unsupported write query")?;
    let role: String = sqlx::query_scalar(
        "SELECT role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
    )
    .bind(actor)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("User account is unavailable")?;
    if !allowed_table(&table, &role) {
        return Err("This write is not permitted".to_string());
    }
    let result = bind_values(sqlx::query(&query), values)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result.last_insert_rowid())
}

pub fn app_pool(app: &AppHandle) -> Result<Pool<Sqlite>, String> {
    tauri::async_runtime::block_on(pool(&app.state::<DbInstances>()))
}

#[cfg(test)]
mod tests;

#[cfg(test)]
#[path = "release_gate_tests.rs"]
mod release_gate_tests;

#[cfg(test)]
mod prescription_read_tests {
    use super::*;
    #[tokio::test]
    async fn repairs_missing_dashboard_view_without_changing_catalog() {
        let p = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql("CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT); INSERT INTO products VALUES('p1','Tearsplus'); CREATE TABLE sales_invoices(id TEXT,invoice_number TEXT,invoice_date TEXT,net_amount REAL,payment_method TEXT,status TEXT,customer_id TEXT);")
            .execute(&p).await.unwrap();
        ensure_dashboard_view(&p).await.unwrap();
        ensure_dashboard_view(&p).await.unwrap();
        let products: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM products")
            .fetch_one(&p)
            .await
            .unwrap();
        let sales: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_dashboard")
            .fetch_one(&p)
            .await
            .unwrap();
        assert_eq!(products, 1);
        assert_eq!(sales, 0);
    }

    #[tokio::test]
    async fn cashier_reads_summary_not_prescription_tables_or_import_journal() {
        let p = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        initialize(&p).await.unwrap();
        sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,created_at,updated_at) VALUES('cashier','cashier-summary','x','Cashier','cashier','now','now')").execute(&p).await.unwrap();
        for q in [
            "SELECT * FROM sales_invoices",
            "SELECT * FROM sales_invoice_items",
            "SELECT * FROM catalog_operations",
        ] {
            assert!(authorize_select(&p, "cashier", q).await.is_err())
        }
        authorize_select(&p, "cashier", "SELECT * FROM sales_dashboard")
            .await
            .unwrap();
        assert!(select_safe(
            &p,
            "SELECT prescription_note FROM sales_dashboard".into(),
            vec![]
        )
        .await
        .is_err());
        assert!(select_safe(
            &p,
            "SELECT patient_name FROM sales_dashboard".into(),
            vec![]
        )
        .await
        .is_err());
    }
}
