use crate::database_api::{current_actor, SessionState};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;
use uuid::Uuid;

pub(crate) async fn require_role(
    pool: &Pool<Sqlite>,
    actor: &str,
    roles: &[&str],
) -> Result<String, String> {
    let role: String = sqlx::query_scalar(
        "SELECT role FROM users WHERE id=? AND is_active=1 AND deleted_at IS NULL",
    )
    .bind(actor)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Account is unavailable")?;
    if !roles.contains(&role.as_str()) {
        return Err("This account is not permitted to perform this operation".into());
    }
    Ok(role)
}
pub(crate) async fn append(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    customer: &str,
    kind: &str,
    source: &str,
    cents: i64,
    actor: &str,
    description: &str,
) -> Result<(), String> {
    sqlx::query("INSERT INTO customer_ledger(id,customer_id,kind,source_id,amount_cents,occurred_at,recorded_by,description) VALUES(?,?,?,?,?,?,?,?)").bind(Uuid::new_v4().to_string()).bind(customer).bind(kind).bind(source).bind(cents).bind(chrono::Utc::now().to_rfc3339()).bind(actor).bind(description).execute(&mut **tx).await.map_err(|e|e.to_string())?;
    Ok(())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerRequest {
    id: Option<String>,
    first_name: String,
    last_name: String,
    phone_number: Option<String>,
    address: Option<String>,
    customer_type: String,
    credit_limit: f64,
    is_active: bool,
}
async fn save(pool: &Pool<Sqlite>, actor: &str, r: CustomerRequest) -> Result<String, String> {
    let role = require_role(pool, actor, &["admin", "manager", "cashier"]).await?;
    if r.first_name.trim().is_empty()
        || r.last_name.trim().is_empty()
        || r.first_name.len() > 100
        || r.last_name.len() > 100
        || r.phone_number.as_deref().unwrap_or("").len() > 40
        || r.address.as_deref().unwrap_or("").len() > 500
        || !matches!(r.customer_type.as_str(), "retail" | "wholesale")
        || !r.credit_limit.is_finite()
        || r.credit_limit < 0.0
        || r.credit_limit > 100_000_000.0
        || ((r.credit_limit * 100.0).round() - r.credit_limit * 100.0).abs() > 0.00001
    {
        return Err("Check customer name, type and credit limit (at most two decimals)".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = r.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
    let prior: Option<f64> = if r.id.is_some() {
        Some(
            sqlx::query_scalar(
                "SELECT credit_limit FROM customers WHERE id=? AND deleted_at IS NULL",
            )
            .bind(&id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("Customer is unavailable")?,
        )
    } else {
        None
    };
    if role == "cashier" && (r.credit_limit - prior.unwrap_or(0.0)).abs() > 0.00001 {
        return Err("Only a manager can set or change a customer credit limit".into());
    }
    if r.id.is_some() {
        sqlx::query("UPDATE customers SET first_name=?,last_name=?,phone_number=?,address=?,customer_type=?,credit_limit=?,is_active=?,updated_at=? WHERE id=? AND deleted_at IS NULL").bind(r.first_name.trim()).bind(r.last_name.trim()).bind(r.phone_number).bind(r.address).bind(r.customer_type).bind(r.credit_limit).bind(r.is_active).bind(&now).bind(&id).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    } else {
        let code = format!(
            "C-{}",
            &Uuid::new_v4().simple().to_string()[..10].to_uppercase()
        );
        sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,phone_number,address,customer_type,credit_limit,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(&id).bind(code).bind(r.first_name.trim()).bind(r.last_name.trim()).bind(r.phone_number).bind(r.address).bind(r.customer_type).bind(r.credit_limit).bind(r.is_active).bind(&now).bind(&now).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    }
    if (r.credit_limit-prior.unwrap_or(0.0)).abs()>0.00001 {sqlx::query("INSERT INTO audit_events(id,event_type,actor_id,occurred_at,entity_type,entity_id,reference,details) VALUES(?,'customer_limit',?,?,'customer',?,?,?)").bind(Uuid::new_v4().to_string()).bind(actor).bind(&now).bind(&id).bind(&id).bind(format!("Credit limit Rs {:.2} → Rs {:.2}",prior.unwrap_or(0.0),r.credit_limit)).execute(&mut *tx).await.map_err(|e|e.to_string())?;}
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(id)
}
#[tauri::command]
pub async fn save_customer(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: CustomerRequest,
) -> Result<String, String> {
    save(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
#[tauri::command]
pub async fn archive_customer(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    id: String,
) -> Result<(), String> {
    let pool = crate::database_api::pool(&instances).await?;
    let actor = current_actor(&session).await?;
    require_role(&pool, &actor, &["admin", "manager", "cashier"]).await?;
    let n=sqlx::query("UPDATE customers SET deleted_at=?,updated_at=? WHERE id=? AND ROUND(current_balance*100)=0 AND deleted_at IS NULL").bind(chrono::Utc::now().to_rfc3339()).bind(chrono::Utc::now().to_rfc3339()).bind(id).execute(&pool).await.map_err(|e|e.to_string())?;
    if n.rows_affected() != 1 {
        return Err("Settle this customer's balance before archiving the account".into());
    }
    Ok(())
}
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Aging {
    current: i64,
    days30: i64,
    days60: i64,
    days90: i64,
    unknown: i64,
    credit: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Statement {
    customer: serde_json::Value,
    entries: Vec<serde_json::Map<String, serde_json::Value>>,
    aging: Aging,
}
#[tauri::command]
pub async fn customer_statement(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    customer_id: String,
) -> Result<Statement, String> {
    let pool = crate::database_api::pool(&instances).await?;
    let actor = current_actor(&session).await?;
    statement(&pool, &actor, &customer_id).await
}
async fn statement(
    pool: &Pool<Sqlite>,
    actor: &str,
    customer_id: &str,
) -> Result<Statement, String> {
    require_role(pool, actor, &["admin", "manager", "cashier", "accountant"]).await?;
    // Both reads share a SQLite snapshot, so a concurrent collection cannot split the statement.
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let customer=crate::database_api::json_rows(sqlx::query("SELECT id,customer_code,first_name,last_name,current_balance,credit_limit,is_active,deleted_at FROM customers WHERE id=?").bind(customer_id).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?)?.into_iter().next().ok_or("Customer was not found")?;
    let entries=crate::database_api::json_rows(sqlx::query("SELECT l.*,a.status AS payment_status,COALESCE(i.invoice_number,a.number,r.return_number,l.source_id) AS reference FROM customer_ledger l LEFT JOIN sales_invoices i ON l.kind='credit_sale' AND i.id=l.source_id LEFT JOIN account_entries a ON l.kind IN ('payment','void_payment') AND a.id=l.source_id LEFT JOIN sales_returns r ON l.kind='credit_return' AND r.id=l.source_id WHERE l.customer_id=? ORDER BY julianday(l.occurred_at),l.rowid").bind(customer_id).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?)?;
    tx.commit().await.map_err(|e| e.to_string())?;
    let aging = age_entries(&entries, chrono::Utc::now());
    Ok(Statement {
        customer: customer.into(),
        entries,
        aging,
    })
}
fn age_entries(
    entries: &[serde_json::Map<String, serde_json::Value>],
    now: chrono::DateTime<chrono::Utc>,
) -> Aging {
    let mut debits = Vec::new();
    let mut credits = 0i64;
    for e in entries {
        let kind = e["kind"].as_str().unwrap_or("");
        let cents = e["amount_cents"].as_i64().unwrap_or(0);
        if kind == "void_payment"
            || (kind == "payment" && e["payment_status"].as_str() != Some("posted"))
        {
            continue;
        }
        if cents < 0 {
            credits += -cents
        } else {
            debits.push((kind, e["occurred_at"].as_str().unwrap_or(""), cents));
        }
    }
    let mut aging = Aging::default();
    for (kind, date, cents) in debits {
        let paid = credits.min(cents);
        credits -= paid;
        let unpaid = cents - paid;
        if kind == "opening" {
            aging.unknown += unpaid;
            continue;
        }
        let days = chrono::DateTime::parse_from_rfc3339(date)
            .map(|d| (now - d.with_timezone(&chrono::Utc)).num_days())
            .unwrap_or(0);
        match days {
            d if d >= 90 => aging.days90 += unpaid,
            d if d >= 60 => aging.days60 += unpaid,
            d if d >= 30 => aging.days30 += unpaid,
            _ => aging.current += unpaid,
        }
    }
    aging.credit = credits;
    aging
}
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    #[test]
    fn aging_allocates_active_collections_fifo_and_preserves_unknown_opening_age() {
        let make = |kind: &str, amount: i64, date: &str, status: Value| {
            serde_json::json!({"kind":kind,"amount_cents":amount,"occurred_at":date,"payment_status":status}).as_object().unwrap().clone()
        };
        let now = chrono::DateTime::parse_from_rfc3339("2026-10-31T12:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        let mut entries = vec![
            make("opening", 1000, "2026-10-31T00:00:00Z", Value::Null),
            make("credit_sale", 1000, "2026-06-01T00:00:00Z", Value::Null),
            make("credit_sale", 1000, "2026-10-25T00:00:00Z", Value::Null),
            make(
                "payment",
                -1500,
                "2026-10-30T00:00:00Z",
                Value::String("posted".into()),
            ),
        ];
        let a = age_entries(&entries, now);
        assert_eq!(
            (a.unknown, a.days90, a.current, a.credit),
            (0, 500, 1000, 0)
        );
        entries[3].insert("payment_status".into(), Value::String("void".into()));
        entries.push(make(
            "void_payment",
            1500,
            "2026-10-31T00:00:00Z",
            Value::Null,
        ));
        let a = age_entries(&entries, now);
        assert_eq!((a.unknown, a.days90, a.current), (1000, 1000, 1000));
        entries.push(make(
            "credit_return",
            -3500,
            "2026-10-31T01:00:00Z",
            Value::Null,
        ));
        let a = age_entries(&entries, now);
        assert_eq!((a.current, a.unknown, a.days90, a.credit), (0, 0, 0, 500));
    }
    use serde_json::Value;
    #[tokio::test]
    async fn cashier_cannot_grant_credit_or_raise_limit() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database_api::initialize(&pool).await.unwrap();
        sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,is_active,created_at,updated_at) VALUES('cashier','cashier','x','Cashier','cashier',1,'now','now')").execute(&pool).await.unwrap();
        let make = |id: Option<String>, limit| CustomerRequest {
            id,
            first_name: "Test".into(),
            last_name: "Customer".into(),
            phone_number: None,
            address: None,
            customer_type: "retail".into(),
            credit_limit: limit,
            is_active: true,
        };
        assert!(save(&pool, "cashier", make(None, 100.0)).await.is_err());
        let id = save(&pool, "cashier", make(None, 0.0)).await.unwrap();
        assert!(save(&pool, "cashier", make(Some(id.clone()), 100.0))
            .await
            .is_err());
        save(
            &pool,
            "00000000-0000-0000-0000-000000000001",
            make(Some(id.clone()), 100.0),
        )
        .await
        .unwrap();
        save(&pool, "cashier", make(Some(id), 100.0)).await.unwrap();
    }
    #[tokio::test]
    async fn additive_migration_preserves_legacy_balance_as_unknown_age_opening() {
        let p = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/001_initial_schema.sql"))
            .execute(&p)
            .await
            .unwrap();
        sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,current_balance,created_at,updated_at) VALUES('legacy','LEG','Old','Customer','retail',125.45,'2020-01-01','2020-01-01')").execute(&p).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/011_credit_and_expiry.sql"))
            .execute(&p)
            .await
            .unwrap();
        let balance: f64 =
            sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='legacy'")
                .fetch_one(&p)
                .await
                .unwrap();
        let opening:i64=sqlx::query_scalar("SELECT amount_cents FROM customer_ledger WHERE customer_id='legacy' AND kind='opening'").fetch_one(&p).await.unwrap();
        assert_eq!((balance, opening), (125.45, 12545));
    }
    #[tokio::test]
    async fn statement_returns_balanced_snapshot_with_unknown_opening_age() {
        let p = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database_api::initialize(&p).await.unwrap();
        sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,current_balance,credit_limit,created_at,updated_at) VALUES('c','C','Test','Customer','retail',100,150,'now','now')").execute(&p).await.unwrap();
        let result = statement(&p, "00000000-0000-0000-0000-000000000001", "c")
            .await
            .unwrap();
        assert_eq!(result.customer["current_balance"], 100.0);
        assert_eq!(result.aging.unknown, 10000);
        assert_eq!(
            result
                .entries
                .iter()
                .map(|e| e["amount_cents"].as_i64().unwrap())
                .sum::<i64>(),
            10000
        );
    }
}
