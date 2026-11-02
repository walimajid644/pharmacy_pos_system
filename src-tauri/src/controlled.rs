use crate::database_api::{current_actor, json_rows, SessionState};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::{Pool, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;
#[derive(Deserialize)]
pub struct ReportRequest {
    start: String,
    end: String,
    offset: i64,
}
#[derive(Serialize)]
pub struct ControlledPage {
    rows: Vec<Map<String, Value>>,
    total: i64,
    units: i64,
}
pub(crate) async fn read(
    pool: &Pool<Sqlite>,
    actor: &str,
    r: ReportRequest,
) -> Result<ControlledPage, String> {
    crate::credit::require_role(pool, actor, &["admin", "manager", "accountant"]).await?;
    let start = chrono::DateTime::parse_from_rfc3339(&r.start).map_err(|_| "Invalid start date")?;
    let end = chrono::DateTime::parse_from_rfc3339(&r.end).map_err(|_| "Invalid end date")?;
    if start >= end || r.offset < 0 || r.offset > 10_000_000 {
        return Err("Check report dates and page".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let filter="l.controlled_snapshot=1 AND i.status='completed' AND julianday(i.invoice_date)>=julianday(?) AND julianday(i.invoice_date)<julianday(?)";
    let (total,units):(i64,i64)=sqlx::query_as(&format!("SELECT COUNT(*),COALESCE(SUM(l.quantity),0) FROM sales_invoice_items l JOIN sales_invoices i ON i.id=l.invoice_id WHERE {filter}")).bind(&r.start).bind(&r.end).fetch_one(&mut *tx).await.map_err(|e|e.to_string())?;
    let rows=json_rows(sqlx::query(&format!("SELECT l.id,i.invoice_number,i.invoice_date,i.cashier_name_snapshot AS cashier_name,i.patient_name,i.doctor_name,i.prescription_note,l.product_name_snapshot AS product_name,l.batch_number_snapshot AS batch_number,l.drap_snapshot AS drap,l.quantity,l.bonus_units,l.regulatory_snapshot FROM sales_invoice_items l JOIN sales_invoices i ON i.id=l.invoice_id WHERE {filter} ORDER BY julianday(i.invoice_date) DESC,l.rowid DESC LIMIT 100 OFFSET ?")).bind(&r.start).bind(&r.end).bind(r.offset).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?)?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(ControlledPage { rows, total, units })
}
#[tauri::command]
pub async fn controlled_sales_report(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: ReportRequest,
) -> Result<ControlledPage, String> {
    read(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
