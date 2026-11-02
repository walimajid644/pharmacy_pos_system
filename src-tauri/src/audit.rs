use crate::database_api::{current_actor, json_rows, SessionState};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::{Pool, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRequest {
    pub start: Option<String>,
    pub end: Option<String>,
    pub event_type: Option<String>,
    pub actor_id: Option<String>,
    pub offset: i64,
}
#[derive(Serialize)]
pub struct AuditPage {
    events: Vec<Map<String, Value>>,
    total: i64,
    types: Vec<String>,
    users: Vec<Map<String, Value>>,
}
async fn read(pool: &Pool<Sqlite>, actor: &str, r: AuditRequest) -> Result<AuditPage, String> {
    crate::credit::require_role(pool, actor, &["admin", "manager"]).await?;
    if r.offset < 0 || r.offset > 10_000_000 {
        return Err("Invalid page".into());
    }
    for date in [&r.start, &r.end].into_iter().flatten() {
        chrono::DateTime::parse_from_rfc3339(date).map_err(|_| "Choose valid dates")?;
    }
    if let (Some(start), Some(end)) = (&r.start, &r.end) {
        if chrono::DateTime::parse_from_rfc3339(start).unwrap()
            >= chrono::DateTime::parse_from_rfc3339(end).unwrap()
        {
            return Err("End date must follow start date".into());
        }
    }
    if r.event_type.as_deref().unwrap_or("").len() > 80
        || r.actor_id.as_deref().unwrap_or("").len() > 100
    {
        return Err("Invalid audit filter".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let filter="(? IS NULL OR julianday(e.occurred_at)>=julianday(?)) AND (? IS NULL OR julianday(e.occurred_at)<julianday(?)) AND (? IS NULL OR e.event_type=?) AND (? IS NULL OR e.actor_id=?)";
    let count = format!("SELECT COUNT(*) FROM audit_events e WHERE {filter}");
    let total: i64 = sqlx::query_scalar(&count)
        .bind(&r.start)
        .bind(&r.start)
        .bind(&r.end)
        .bind(&r.end)
        .bind(&r.event_type)
        .bind(&r.event_type)
        .bind(&r.actor_id)
        .bind(&r.actor_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    let query=format!("SELECT e.*,u.full_name AS actor_name FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id WHERE {filter} ORDER BY julianday(e.occurred_at) DESC,e.rowid DESC LIMIT 100 OFFSET ?");
    let events = json_rows(
        sqlx::query(&query)
            .bind(&r.start)
            .bind(&r.start)
            .bind(&r.end)
            .bind(&r.end)
            .bind(&r.event_type)
            .bind(&r.event_type)
            .bind(&r.actor_id)
            .bind(&r.actor_id)
            .bind(r.offset)
            .fetch_all(&mut *tx)
            .await
            .map_err(|e| e.to_string())?,
    )?;
    let types =
        sqlx::query_scalar("SELECT DISTINCT event_type FROM audit_events ORDER BY event_type")
            .fetch_all(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    let users=json_rows(sqlx::query("SELECT DISTINCT u.id,u.full_name FROM users u JOIN audit_events e ON e.actor_id=u.id ORDER BY u.full_name").fetch_all(&mut *tx).await.map_err(|e|e.to_string())?)?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(AuditPage {
        events,
        total,
        types,
        users,
    })
}
#[tauri::command]
pub async fn read_audit_log(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: AuditRequest,
) -> Result<AuditPage, String> {
    read(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::decisions::DecisionRequest;
    use sqlx::sqlite::SqlitePoolOptions;
    const ADMIN: &str = "00000000-0000-0000-0000-000000000001";
    fn request() -> AuditRequest {
        AuditRequest {
            start: None,
            end: None,
            event_type: None,
            actor_id: None,
            offset: 0,
        }
    }
    async fn fixture() -> Pool<Sqlite> {
        let p = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database_api::initialize(&p).await.unwrap();
        p
    }
    #[tokio::test]
    async fn immutable_log_filters_paginates_and_denies_non_managers() {
        let p = fixture().await;
        for i in 0..101 {
            sqlx::query("INSERT INTO audit_events(id,event_type,actor_id,occurred_at,entity_type,entity_id,reference,details) VALUES(?,'test_event',?,'2026-10-31T12:00:00Z','test','test','TEST','test')").bind(i.to_string()).bind(ADMIN).execute(&p).await.unwrap();
        }
        let first = read(&p, ADMIN, request()).await.unwrap();
        assert_eq!((first.total, first.events.len()), (101, 100));
        let mut r = request();
        r.offset = 100;
        assert_eq!(read(&p, ADMIN, r).await.unwrap().events.len(), 1);
        let mut r = request();
        r.event_type = Some("missing".into());
        assert_eq!(read(&p, ADMIN, r).await.unwrap().total, 0);
        let mut r = request();
        r.start = Some("2026-10-31T19:00:00Z".into());
        assert_eq!(read(&p, ADMIN, r).await.unwrap().total, 0);
        let mut r = request();
        r.actor_id = Some(ADMIN.into());
        assert_eq!(read(&p, ADMIN, r).await.unwrap().total, 101);
        assert!(sqlx::query("UPDATE audit_events SET details='changed'")
            .execute(&p)
            .await
            .is_err());
        assert!(sqlx::query("DELETE FROM audit_events")
            .execute(&p)
            .await
            .is_err());
        for role in ["cashier", "accountant"] {
            sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,is_active,created_at,updated_at) VALUES(?,?,'x',?,?,1,'now','now')").bind(role).bind(role).bind(role).bind(role).execute(&p).await.unwrap();
            assert!(read(&p, role, request()).await.is_err());
        }
    }
    #[tokio::test]
    async fn failed_stock_decision_rolls_back_audit_and_success_records_actor() {
        let p = fixture().await;
        sqlx::query("INSERT INTO products(id,sku,name,unit_price,cost_price,created_at,updated_at) VALUES('p','P','Product',10,5,'now','now')").execute(&p).await.unwrap();
        sqlx::query("INSERT INTO product_batches(id,product_id,batch_number,expiry_date,quantity_in_stock,cost_price_at_batch,received_date,created_at,updated_at) VALUES('b','p','B','2099-12-31',3,5,'now','now','now')").execute(&p).await.unwrap();
        sqlx::query("INSERT INTO stock_adjustments(id,adjustment_number,adjustment_date,adjustment_type,reason,total_value,status,created_by,created_at,updated_at) VALUES('adj','ADJ','2026-10-31','decrease','expired',25,'pending',?,'now','now')").bind(ADMIN).execute(&p).await.unwrap();
        sqlx::query("INSERT INTO stock_adjustment_items(id,adjustment_id,product_id,batch_id,quantity_adjusted,unit_cost,line_value,created_at) VALUES('line','adj','p','b',5,5,25,'now')").execute(&p).await.unwrap();
        let decide = |action: &str| DecisionRequest {
            record_id: "adj".into(),
            timestamp: "2026-10-31T12:00:00Z".into(),
            action: action.into(),
        };
        assert!(
            crate::decisions::decide_adjustment(&p, ADMIN, decide("approved"))
                .await
                .is_err()
        );
        assert_eq!(read(&p, ADMIN, request()).await.unwrap().total, 0);
        crate::decisions::decide_adjustment(&p, ADMIN, decide("rejected"))
            .await
            .unwrap();
        let log = read(&p, ADMIN, request()).await.unwrap();
        assert_eq!(log.events[0]["event_type"], "adjustment_rejected");
        assert_eq!(log.events[0]["actor_id"], ADMIN);
    }
    #[tokio::test]
    async fn return_audit_records_actual_refunder_not_original_approver() {
        let p = fixture().await;
        sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,is_active,created_at,updated_at) VALUES('m','m','x','Second Manager','manager',1,'now','now')").execute(&p).await.unwrap();
        sqlx::query("INSERT INTO products(id,sku,name,unit_price,cost_price,created_at,updated_at) VALUES('p','P','Product',10,5,'now','now')").execute(&p).await.unwrap();
        sqlx::query("INSERT INTO product_batches(id,product_id,batch_number,expiry_date,quantity_in_stock,cost_price_at_batch,received_date,created_at,updated_at) VALUES('b','p','B','2099-12-31',3,5,'now','now','now')").execute(&p).await.unwrap();
        sqlx::query("INSERT INTO sales_invoices(id,invoice_number,cashier_id,invoice_date,total_amount,tax_amount,discount_amount,net_amount,payment_method,status,created_at,updated_at) VALUES('i','INV',?,'2026-10-31',10,0,0,10,'card','completed','now','now')").bind(ADMIN).execute(&p).await.unwrap();
        sqlx::query("INSERT INTO sales_invoice_items(id,invoice_id,product_id,batch_id,quantity,unit_price,discount_percent,line_total,is_loose_sale,created_at) VALUES('il','i','p','b',1,10,0,10,0,'now')").execute(&p).await.unwrap();
        sqlx::query("INSERT INTO sales_returns(id,return_number,original_invoice_id,return_date,return_reason,subtotal,tax_amount,refund_amount,refund_method,status,processed_by,created_at,updated_at) VALUES('ret','RET','i','2026-10-31','defective',10,0,10,'card','pending',?,'now','now')").bind(ADMIN).execute(&p).await.unwrap();
        sqlx::query("INSERT INTO sales_return_items(id,return_id,invoice_item_id,product_id,batch_id,quantity_returned,unit_price,line_total,restock,created_at) VALUES('rl','ret','il','p','b',1,10,10,0,'now')").execute(&p).await.unwrap();
        let r = |action: &str| DecisionRequest {
            record_id: "ret".into(),
            timestamp: "2026-10-31T12:00:00Z".into(),
            action: action.into(),
        };
        crate::decisions::decide_return(&p, ADMIN, r("approved"))
            .await
            .unwrap();
        crate::decisions::decide_return(&p, "m", r("refunded"))
            .await
            .unwrap();
        let actor: String = sqlx::query_scalar(
            "SELECT actor_id FROM audit_events WHERE event_type='return_refunded'",
        )
        .fetch_one(&p)
        .await
        .unwrap();
        assert_eq!(actor, "m");
    }
}

