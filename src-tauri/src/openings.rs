use crate::database_api::{current_actor, SessionState};
use serde::Deserialize;
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpeningRequest {
    request_id: String,
    kind: String,
    entity_id: String,
    amount_cents: i64,
    entry_date: String,
    reference: String,
    notes: String,
}

pub(crate) async fn record(
    pool: &Pool<Sqlite>,
    actor: &str,
    r: OpeningRequest,
) -> Result<String, String> {
    crate::credit::require_role(pool, actor, &["admin", "manager"]).await?;
    Uuid::parse_str(&r.request_id).map_err(|_| "Invalid opening request identifier")?;
    let date = chrono::NaiveDate::parse_from_str(&r.entry_date, "%Y-%m-%d")
        .map_err(|_| "Enter a valid opening date")?;
    if date.to_string() != r.entry_date
        || date > chrono::Local::now().date_naive()
        || !(-10_000_000_000..=10_000_000_000).contains(&r.amount_cents)
        || r.amount_cents == 0
        || r.reference.trim().is_empty()
        || r.reference.chars().count() > 100
        || r.notes.chars().count() > 500
        || r.reference.chars().any(char::is_control)
    {
        return Err(
            "Enter a nonzero balance, a reference, and an opening date no later than today".into(),
        );
    }
    let table = match r.kind.as_str() {
        "customer" => "customers",
        "supplier" => "suppliers",
        "bank" => "bank_accounts",
        _ => return Err("Choose customer, supplier or bank".into()),
    };
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if let Some(old) = sqlx::query("SELECT * FROM opening_balances WHERE id=?")
        .bind(&r.request_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    {
        if old.get::<String, _>("kind") == r.kind
            && old.get::<String, _>("entity_id") == r.entity_id
            && old.get::<i64, _>("amount_cents") == r.amount_cents
            && old.get::<String, _>("entry_date") == r.entry_date
            && old.get::<String, _>("reference") == r.reference.trim()
            && old.get::<String, _>("notes") == r.notes.trim()
            && old.get::<Option<String>, _>("recorded_by").as_deref() == Some(actor)
        {
            return Ok(r.request_id);
        }
        return Err("This request was already used. Refresh before trying again".into());
    }
    let exists: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {table} WHERE id=? AND is_active=1 AND deleted_at IS NULL"
    ))
    .bind(&r.entity_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if exists != 1 {
        return Err("Choose an active account".into());
    }
    let prior: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM opening_balances WHERE kind=? AND entity_id=?")
            .bind(&r.kind)
            .bind(&r.entity_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    if prior != 0 {
        return Err("An opening balance is already recorded for this account".into());
    }
    if r.kind == "bank" {
        let activity:i64=sqlx::query_scalar("SELECT (SELECT COUNT(*) FROM bank_ledger WHERE account_id=? AND source<>'opening')+(SELECT COUNT(*) FROM bank_reconciliations WHERE account_id=?)")
            .bind(&r.entity_id).bind(&r.entity_id).fetch_one(&mut *tx).await.map_err(|e|e.to_string())?;
        if activity > 0 {
            return Err("Record bank openings before bank transactions or reconciliation".into());
        }
    }
    // Customer insert triggers can create legacy opening ledger rows after migration too.
    if r.kind == "customer" {
        let prior: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM customer_ledger WHERE customer_id=? AND kind='opening'",
        )
        .bind(&r.entity_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        if prior != 0 {
            return Err("This customer already has a historical opening balance".into());
        }
        sqlx::query("UPDATE customers SET current_balance=ROUND(current_balance+?/100.0,2),updated_at=? WHERE id=?")
            .bind(r.amount_cents).bind(chrono::Utc::now().to_rfc3339()).bind(&r.entity_id).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        sqlx::query("INSERT INTO customer_ledger(id,customer_id,kind,source_id,amount_cents,occurred_at,recorded_by,description) VALUES(?,?,'opening',?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&r.entity_id).bind(&r.request_id).bind(r.amount_cents)
            .bind(format!("{}T00:00:00Z",r.entry_date)).bind(actor).bind(format!("Opening: {} · {}",r.reference.trim(),r.notes.trim()))
            .execute(&mut *tx).await.map_err(|e|e.to_string())?;
    }
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO opening_balances(id,kind,entity_id,amount_cents,entry_date,reference,notes,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(&r.request_id).bind(&r.kind).bind(&r.entity_id).bind(r.amount_cents).bind(&r.entry_date)
        .bind(r.reference.trim()).bind(r.notes.trim()).bind(actor).bind(&now).execute(&mut *tx).await.map_err(|_| "Could not record the opening balance. Refresh and check for an existing opening")?;
    sqlx::query("INSERT INTO audit_events(id,event_type,actor_id,occurred_at,entity_type,entity_id,reference,details) VALUES(?,'opening_balance',?,?,'opening_balance',?,?,?)")
        .bind(Uuid::new_v4().to_string()).bind(actor).bind(&now).bind(&r.request_id).bind(r.reference.trim())
        .bind(format!("{} {}; cents={}; date={}",r.kind,r.entity_id,r.amount_cents,r.entry_date)).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(r.request_id)
}

#[tauri::command]
pub async fn record_opening_balance(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: OpeningRequest,
) -> Result<String, String> {
    record(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}

#[cfg(test)]
#[path = "opening_tests.rs"]
mod tests;
