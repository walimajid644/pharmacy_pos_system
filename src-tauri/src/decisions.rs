use crate::database_api::{current_actor, SessionState};
use serde::Deserialize;
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionRequest {
    pub(crate) record_id: String,
    pub(crate) timestamp: String,
    pub(crate) action: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBatchRequest {
    product_id: String,
    batch_number: String,
    expiry_date: String,
    quantity: i64,
    cost: f64,
    received_date: String,
    timestamp: String,
}

async fn database_pool(instances: &DbInstances) -> Result<Pool<Sqlite>, String> {
    let databases = instances.0.read().await;
    match databases.get("sqlite:pharmacy.db") {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("The pharmacy database is not ready".to_string()),
    }
}

async fn require_approver(tx: &mut sqlx::Transaction<'_, Sqlite>, id: &str) -> Result<(), String> {
    let user =
        sqlx::query("SELECT role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL")
            .bind(id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("Approver account is unavailable")?;
    let role: String = user.get("role");
    if !matches!(role.as_str(), "admin" | "manager") {
        return Err("This account cannot approve adjustments or refunds".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn decide_stock_adjustment(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: DecisionRequest,
) -> Result<(), String> {
    decide_adjustment(
        &database_pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}

pub(crate) async fn decide_adjustment(
    pool: &Pool<Sqlite>,
    actor: &str,
    request: DecisionRequest,
) -> Result<(), String> {
    if !matches!(request.action.as_str(), "approved" | "rejected") {
        return Err("Invalid adjustment decision".to_string());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    require_approver(&mut tx, actor).await?;
    let changed = sqlx::query(
        "UPDATE stock_adjustments SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? \
         WHERE id = ? AND status = 'pending'",
    )
    .bind(&request.action).bind(actor).bind(&request.timestamp)
    .bind(&request.timestamp).bind(&request.record_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    if changed.rows_affected() != 1 {
        return Err("Adjustment is no longer pending".to_string());
    }
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn decide_sales_return(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: DecisionRequest,
) -> Result<(), String> {
    decide_return(
        &database_pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}

pub(crate) async fn decide_return(
    pool: &Pool<Sqlite>,
    actor: &str,
    request: DecisionRequest,
) -> Result<(), String> {
    let prior = match request.action.as_str() {
        "approved" | "rejected" => "pending",
        "refunded" => "approved",
        _ => return Err("Invalid return decision".to_string()),
    };
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    require_approver(&mut tx, actor).await?;
    let refund_shift_id: Option<String> = if request.action == "refunded" {
        let method: String = sqlx::query_scalar("SELECT refund_method FROM sales_returns WHERE id = ? AND status = 'approved'")
            .bind(&request.record_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?
            .ok_or("Return is not approved")?;
        if method == "cash" {
            Some(sqlx::query_scalar("SELECT id FROM cashier_shifts WHERE status = 'open' LIMIT 1")
                .fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?
                .ok_or("Open a cash drawer shift before paying a cash refund")?)
        } else { None }
    } else { None };
    let changed = sqlx::query(
        "UPDATE sales_returns SET status = ?, approved_by = COALESCE(approved_by, ?), \
         approved_at = COALESCE(approved_at, ?), refunded_by = CASE WHEN ? = 'refunded' THEN ? ELSE refunded_by END, refund_reference = CASE WHEN ? = 'refunded' THEN ? ELSE refund_reference END, refund_shift_id = COALESCE(?, refund_shift_id), updated_at = ? \
         WHERE id = ? AND status = ?",
    )
    .bind(&request.action)
    .bind(actor)
    .bind(&request.timestamp)
    .bind(&request.action)
    .bind(actor)
    .bind(&request.action)
    .bind(format!("RF-{}", Uuid::new_v4().simple()))
    .bind(refund_shift_id)
    .bind(&request.timestamp)
    .bind(&request.record_id)
    .bind(prior)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if changed.rows_affected() != 1 {
        return Err("Return status has changed".to_string());
    }
    if request.action=="refunded" {
        let r=sqlx::query("SELECT r.refund_method,r.refund_amount,i.customer_id FROM sales_returns r JOIN sales_invoices i ON i.id=r.original_invoice_id WHERE r.id=?").bind(&request.record_id).fetch_one(&mut *tx).await.map_err(|e|e.to_string())?;
        if r.get::<String,_>("refund_method")=="credit_note" {
            let customer=r.get::<Option<String>,_>("customer_id").ok_or("Credit note requires a registered customer")?;let cents=(r.get::<f64,_>("refund_amount")*100.0).round() as i64;
            sqlx::query("UPDATE customers SET current_balance=ROUND(current_balance-?/100.0,2),updated_at=? WHERE id=?").bind(cents).bind(&request.timestamp).bind(&customer).execute(&mut *tx).await.map_err(|e|e.to_string())?;
            crate::credit::append(&mut tx,&customer,"credit_return",&request.record_id,-cents,actor,"Sales return credit note").await?;
        }
    }
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_product_batch(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: NewBatchRequest,
) -> Result<String, String> {
    add_batch(
        &database_pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}

async fn add_batch(
    pool: &Pool<Sqlite>,
    actor: &str,
    request: NewBatchRequest,
) -> Result<String, String> {
    if request.batch_number.trim().is_empty()
        || request.quantity <= 0
        || !request.cost.is_finite()
        || request.cost < 0.0
        || request.expiry_date.len() != 10
        || request.received_date.len() != 10
    {
        return Err("Invalid batch details".to_string());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    require_approver(&mut tx, actor).await?;
    let found: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM products WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
    )
    .bind(&request.product_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if found != 1 {
        return Err("Product is unavailable".to_string());
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, cost_price_at_batch, received_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(&request.product_id).bind(request.batch_number.trim())
        .bind(&request.expiry_date).bind(request.quantity).bind(request.cost)
        .bind(&request.received_date).bind(&request.timestamp).bind(&request.timestamp)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO stock_movements (id, product_id, batch_id, movement_type, quantity, reference_type, user_id, movement_date, created_at) VALUES (?, ?, ?, 'in', ?, 'purchase', ?, ?, ?)")
        .bind(Uuid::new_v4().to_string()).bind(&request.product_id).bind(&id)
        .bind(request.quantity).bind(actor).bind(&request.timestamp).bind(&request.timestamp)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    const ADMIN: &str = "00000000-0000-0000-0000-000000000001";
    const CASHIER: &str = "cashier-test";

    async fn fixture() -> Pool<Sqlite> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/001_initial_schema.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/004_phase5_inventory.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/007_desktop_operations.sql"))
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO cashier_shifts (id, cashier_id, opened_at, opening_cash_cents, status) VALUES ('test-shift', ?, '2026-10-25T09:00:00Z', 10000, 'open')")
            .bind(ADMIN).execute(&pool).await.unwrap();
        sqlx::query("ALTER TABLE sales_returns ADD COLUMN refunded_by TEXT").execute(&pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/005_approval_guards.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO users (id, username, password_hash, full_name, role, created_at, updated_at) VALUES (?, 'cashier-test', 'hash', 'Cashier', 'cashier', 'now', 'now')")
            .bind(CASHIER).execute(&pool).await.unwrap();
        pool
    }

    fn request(record_id: &str, action: &str) -> DecisionRequest {
        DecisionRequest {
            record_id: record_id.into(),
            timestamp: "2026-10-25T12:00:00Z".into(),
            action: action.into(),
        }
    }

    #[tokio::test]
    async fn adjustment_rejects_cashier_and_direct_sql_bypass() {
        let pool = fixture().await;
        sqlx::query("INSERT INTO stock_adjustments (id, adjustment_number, adjustment_date, adjustment_type, reason, total_value, status, created_by, created_at, updated_at) VALUES ('adj', 'ADJ-TEST', '2026-10-25', 'increase', 'found', 5, 'pending', ?, 'now', 'now')")
            .bind(ADMIN).execute(&pool).await.unwrap();
        assert!(
            decide_adjustment(&pool, CASHIER, request("adj", "approved"))
                .await
                .is_err()
        );
        assert!(sqlx::query("UPDATE stock_adjustments SET status = 'approved', approved_by = ?, approved_at = 'now' WHERE id = 'adj'")
            .bind(CASHIER).execute(&pool).await.is_err());
        assert!(sqlx::query("UPDATE stock_adjustments SET status = 'rejected', approved_by = ?, approved_at = 'now' WHERE id = 'adj'")
            .bind(ADMIN).execute(&pool).await.is_ok());
        assert!(decide_adjustment(&pool, ADMIN, request("adj", "approved"))
            .await
            .is_err());
    }

    #[tokio::test]
    async fn return_requires_approval_before_refund_and_privileged_user() {
        let pool = fixture().await;
        sqlx::query("INSERT INTO sales_invoices (id, invoice_number, cashier_id, invoice_date, total_amount, tax_amount, discount_amount, net_amount, payment_method, status, created_at, updated_at) VALUES ('invoice', 'INV-TEST', ?, '2026-10-25', 10, 0, 0, 10, 'cash', 'completed', 'now', 'now')")
            .bind(ADMIN).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO sales_returns (id, return_number, original_invoice_id, return_date, return_reason, subtotal, tax_amount, refund_amount, refund_method, status, processed_by, created_at, updated_at) VALUES ('ret', 'RET-TEST', 'invoice', '2026-10-25', 'defective', 5, 0, 5, 'cash', 'pending', ?, 'now', 'now')")
            .bind(ADMIN).execute(&pool).await.unwrap();
        assert!(decide_return(&pool, ADMIN, request("ret", "refunded"))
            .await
            .is_err());
        assert!(decide_return(&pool, CASHIER, request("ret", "approved"))
            .await
            .is_err());
        assert!(sqlx::query("UPDATE sales_returns SET status = 'refunded', approved_by = ?, approved_at = 'now' WHERE id = 'ret'")
            .bind(ADMIN).execute(&pool).await.is_err());
        assert!(sqlx::query("UPDATE sales_returns SET status = 'approved', approved_by = ?, approved_at = 'now' WHERE id = 'ret'")
            .bind(CASHIER).execute(&pool).await.is_err());
        decide_return(&pool, ADMIN, request("ret", "approved"))
            .await
            .unwrap();
        let pending_reference: Option<String> = sqlx::query_scalar("SELECT refund_reference FROM sales_returns WHERE id = 'ret'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(pending_reference, None);
        decide_return(&pool, ADMIN, request("ret", "refunded"))
            .await.unwrap();
        let refund_reference: String = sqlx::query_scalar("SELECT refund_reference FROM sales_returns WHERE id = 'ret'")
            .fetch_one(&pool).await.unwrap();
        assert!(refund_reference.starts_with("RF-"));
        assert!(decide_return(&pool, ADMIN, request("ret", "refunded")).await.is_err());
        let unchanged: String = sqlx::query_scalar("SELECT refund_reference FROM sales_returns WHERE id = 'ret'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(refund_reference, unchanged);
        assert!(
            sqlx::query("UPDATE sales_returns SET status = 'rejected' WHERE id = 'ret'")
                .execute(&pool)
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn batch_creation_requires_manager_and_rolls_back_without_movement() {
        let pool = fixture().await;
        sqlx::query("INSERT INTO products (id, sku, name, unit_price, cost_price, created_at, updated_at) VALUES ('p1', 'P1', 'Test', 10, 5, 'now', 'now')")
            .execute(&pool).await.unwrap();
        let request = || NewBatchRequest {
            product_id: "p1".into(),
            batch_number: "B1".into(),
            expiry_date: "2099-12-31".into(),
            quantity: 5,
            cost: 5.0,
            received_date: "2026-10-25".into(),
            timestamp: "2026-10-25T12:00:00Z".into(),
        };
        assert!(add_batch(&pool, CASHIER, request()).await.is_err());
        sqlx::raw_sql("CREATE TRIGGER fail_movement BEFORE INSERT ON stock_movements BEGIN SELECT RAISE(ABORT, 'test failure'); END;")
            .execute(&pool).await.unwrap();
        assert!(add_batch(&pool, ADMIN, request()).await.is_err());
        let batches: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM product_batches")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(batches, 0);
        sqlx::query("DROP TRIGGER fail_movement")
            .execute(&pool)
            .await
            .unwrap();
        assert!(add_batch(&pool, ADMIN, request()).await.is_ok());
        let movements: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(movements, 1);
    }
}
