use crate::database_api::{current_actor, SessionState};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenShiftRequest {
    opening_cash_cents: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseShiftRequest {
    shift_id: String,
    counted_cash_cents: i64,
    notes: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShiftSummary {
    id: String,
    cashier_id: String,
    cashier_name: String,
    opened_at: String,
    opening_cash_cents: i64,
    closed_at: Option<String>,
    counted_cash_cents: Option<i64>,
    expected_cash_cents: Option<i64>,
    variance_cents: Option<i64>,
    status: String,
}

async fn require_cashier(pool: &Pool<Sqlite>, actor: &str) -> Result<(), String> {
    let role: Option<String> = sqlx::query_scalar(
        "SELECT role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
    )
    .bind(actor).fetch_optional(pool).await.map_err(|e| e.to_string())?;
    if !matches!(role.as_deref(), Some("admin" | "manager" | "cashier")) {
        return Err("This account cannot open a cash drawer".into());
    }
    Ok(())
}

pub(crate) async fn open(pool: &Pool<Sqlite>, actor: &str, cents: i64) -> Result<String, String> {
    if cents < 0 || cents > 100_000_000_00 {
        return Err("Enter a valid opening cash amount".into());
    }
    require_cashier(pool, actor).await?;
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO cashier_shifts (id, cashier_id, opened_at, opening_cash_cents, status) VALUES (?, ?, ?, ?, 'open')")
        .bind(&id).bind(actor).bind(now).bind(cents)
        .execute(pool).await.map_err(|_| "Close the current shift before opening another".to_string())?;
    Ok(id)
}

pub(crate) async fn close(pool: &Pool<Sqlite>, actor: &str, request: CloseShiftRequest) -> Result<ShiftSummary, String> {
    if request.counted_cash_cents < 0 || request.counted_cash_cents > 100_000_000_00 {
        return Err("Enter a valid counted cash amount".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let row = sqlx::query("SELECT cashier_id, opening_cash_cents FROM cashier_shifts WHERE id = ? AND status = 'open'")
        .bind(&request.shift_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?
        .ok_or("Shift is no longer open")?;
    let cashier_id: String = row.get("cashier_id");
    if cashier_id != actor {
        let role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL")
            .bind(actor).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;
        if !matches!(role.as_deref(), Some("admin" | "manager")) {
            return Err("Only the cashier or a manager can close this shift".into());
        }
    }
    let cash_sales: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CAST(ROUND(net_amount * 100) AS INTEGER)), 0) FROM sales_invoices WHERE shift_id = ? AND status = 'completed' AND payment_method = 'cash'",
    ).bind(&request.shift_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let cash_refunds: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CAST(ROUND(refund_amount * 100) AS INTEGER)), 0) FROM sales_returns WHERE refund_shift_id = ? AND status = 'refunded' AND refund_method = 'cash'",
    ).bind(&request.shift_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let supplier_cash: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM supplier_payments WHERE shift_id = ? AND method = 'cash'")
        .bind(&request.shift_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let account_cash:i64=sqlx::query_scalar("SELECT COALESCE(SUM(CASE WHEN kind='receipt' THEN amount_cents ELSE -amount_cents END),0) FROM account_entries WHERE shift_id=? AND method='cash' AND status='posted'").bind(&request.shift_id).fetch_one(&mut *tx).await.map_err(|e|e.to_string())?;
    let expected = row.get::<i64, _>("opening_cash_cents") + cash_sales - cash_refunds - supplier_cash + account_cash;
    let variance = request.counted_cash_cents - expected;
    let now = chrono::Utc::now().to_rfc3339();
    let changed = sqlx::query("UPDATE cashier_shifts SET status = 'closed', closed_at = ?, closed_by = ?, counted_cash_cents = ?, expected_cash_cents = ?, variance_cents = ?, notes = ? WHERE id = ? AND status = 'open'")
        .bind(&now).bind(actor).bind(request.counted_cash_cents).bind(expected).bind(variance)
        .bind(request.notes.as_deref()).bind(&request.shift_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    if changed.rows_affected() != 1 { return Err("Shift is no longer open".into()); }
    tx.commit().await.map_err(|e| e.to_string())?;
    get_shift(pool, &request.shift_id).await
}

async fn get_shift(pool: &Pool<Sqlite>, id: &str) -> Result<ShiftSummary, String> {
    let row = sqlx::query("SELECT sh.*, u.full_name AS cashier_name FROM cashier_shifts sh JOIN users u ON u.id = sh.cashier_id WHERE sh.id = ?")
        .bind(id).fetch_one(pool).await.map_err(|e| e.to_string())?;
    Ok(ShiftSummary {
        id: row.get("id"), cashier_id: row.get("cashier_id"), cashier_name: row.get("cashier_name"),
        opened_at: row.get("opened_at"), opening_cash_cents: row.get("opening_cash_cents"),
        closed_at: row.get("closed_at"), counted_cash_cents: row.get("counted_cash_cents"),
        expected_cash_cents: row.get("expected_cash_cents"), variance_cents: row.get("variance_cents"),
        status: row.get("status"),
    })
}

#[tauri::command]
pub async fn open_shift(instances: State<'_, DbInstances>, session: State<'_, SessionState>, request: OpenShiftRequest) -> Result<String, String> {
    open(&crate::database_api::pool(&instances).await?, &current_actor(&session).await?, request.opening_cash_cents).await
}

#[tauri::command]
pub async fn close_shift(instances: State<'_, DbInstances>, session: State<'_, SessionState>, request: CloseShiftRequest) -> Result<ShiftSummary, String> {
    close(&crate::database_api::pool(&instances).await?, &current_actor(&session).await?, request).await
}

#[tauri::command]
pub async fn current_shift(instances: State<'_, DbInstances>, session: State<'_, SessionState>) -> Result<Option<ShiftSummary>, String> {
    current_actor(&session).await?;
    let pool = crate::database_api::pool(&instances).await?;
    let id: Option<String> = sqlx::query_scalar("SELECT id FROM cashier_shifts WHERE status = 'open' LIMIT 1")
        .fetch_optional(&pool).await.map_err(|e| e.to_string())?;
    match id { Some(id) => Ok(Some(get_shift(&pool, &id).await?)), None => Ok(None) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn shift_count_is_blind_until_close_and_variance_is_recorded() {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        crate::database_api::initialize(&pool).await.unwrap();
        let actor = "00000000-0000-0000-0000-000000000001";
        let id = open(&pool, actor, 10_000).await.unwrap();
        assert!(open(&pool, actor, 0).await.is_err());
        let pending = get_shift(&pool, &id).await.unwrap();
        assert_eq!(pending.expected_cash_cents, None);
        sqlx::query("INSERT INTO sales_invoices (id, invoice_number, cashier_id, shift_id, invoice_date, total_amount, tax_amount, discount_amount, net_amount, payment_method, status, created_at, updated_at) VALUES ('sale', 'SHIFT-SALE', ?, ?, '2026-10-28T12:00:00Z', 15, 0, 0, 15, 'cash', 'completed', 'now', 'now')")
            .bind(actor).bind(&id).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO suppliers (id, supplier_code, name, created_at, updated_at) VALUES ('sup', 'S', 'Supplier', 'now', 'now')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO purchase_orders (id, po_number, supplier_id, order_date, status, total_amount, created_by, created_at, updated_at) VALUES ('po', 'PO', 'sup', '2026-10-28', 'received', 5, ?, 'now', 'now')")
            .bind(actor).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO supplier_payments (id, voucher_number, supplier_id, po_id, amount_cents, method, paid_at, recorded_by, shift_id) VALUES ('payment', 'SP-TEST', 'sup', 'po', 500, 'cash', 'now', ?, ?)")
            .bind(actor).bind(&id).execute(&pool).await.unwrap();
        let closed = close(&pool, actor, CloseShiftRequest { shift_id: id.clone(), counted_cash_cents: 11_000, notes: Some("handover".into()) }).await.unwrap();
        assert_eq!(closed.expected_cash_cents, Some(11_000));
        assert_eq!(closed.variance_cents, Some(0));
        assert!(close(&pool, actor, CloseShiftRequest { shift_id: id, counted_cash_cents: 0, notes: None }).await.is_err());
        assert!(open(&pool, actor, 0).await.is_ok());
    }
    #[tokio::test]
    async fn reconciliation_includes_customer_receipts_expenses_and_excludes_voids() {
        let pool=SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        crate::database_api::initialize(&pool).await.unwrap();
        let actor="00000000-0000-0000-0000-000000000001";let id=open(&pool,actor,10_000).await.unwrap();
        sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,created_at,updated_at) VALUES('c','C','T','C','retail','now','now')").execute(&pool).await.unwrap();
        for (key,kind,cents,status) in [("r","receipt",3000,"posted"),("e","expense",1500,"posted"),("v","expense",9999,"void")] {
            sqlx::query("INSERT INTO account_entries(id,number,kind,customer_id,category,description,amount_cents,method,entry_date,shift_id,recorded_by,created_at,status) VALUES(?,?,?,?,?,?,?,'cash','2020-01-01',?,?,'now',?)")
            .bind(key).bind(key).bind(kind).bind(if kind=="receipt"{Some("c")}else{None}).bind("General").bind("Test").bind(cents).bind(&id).bind(actor).bind(status).execute(&pool).await.unwrap();
        }
        let result=close(&pool,actor,CloseShiftRequest{shift_id:id,counted_cash_cents:11500,notes:None}).await.unwrap();assert_eq!(result.expected_cash_cents,Some(11500));assert_eq!(result.variance_cents,Some(0));
    }

}
