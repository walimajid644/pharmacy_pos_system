use crate::database_api::{current_actor, SessionState};
use serde::Deserialize;
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;
use uuid::Uuid;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldRequest {
    request_id: String,
    batch_id: String,
    quantity: i64,
    reason: String,
}
pub(crate) async fn hold(
    pool: &Pool<Sqlite>,
    actor: &str,
    r: HoldRequest,
) -> Result<String, String> {
    crate::credit::require_role(pool, actor, &["admin", "manager"]).await?;
    Uuid::parse_str(&r.request_id).map_err(|_| "Invalid request identifier")?;
    if r.quantity <= 0 || r.reason.trim().is_empty() || r.reason.len() > 500 {
        return Err("Enter a positive whole-unit quantity and quarantine reason".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if let Some(prior) = sqlx::query("SELECT batch_id,quantity,reason FROM batch_holds WHERE id=?")
        .bind(&r.request_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    {
        if prior.get::<String, _>("batch_id") == r.batch_id
            && prior.get::<i64, _>("quantity") == r.quantity
            && prior.get::<String, _>("reason") == r.reason.trim()
        {
            return Ok(r.request_id);
        }
        return Err("Request was already used; refresh the batch list".into());
    }
    let row = sqlx::query(
        "SELECT quantity_in_stock,loose_open_remaining FROM product_batches WHERE id=?",
    )
    .bind(&r.batch_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Batch not found")?;
    let total = row.get::<i64, _>("quantity_in_stock");
    let open = row.get::<i64, _>("loose_open_remaining");
    let held_open = (r.quantity - (total - open)).max(0);
    let changed=sqlx::query("UPDATE product_batches SET quantity_in_stock=quantity_in_stock-?,loose_open_remaining=MAX(0,loose_open_remaining-?),updated_at=? WHERE id=? AND quantity_in_stock>=?").bind(r.quantity).bind(held_open).bind(chrono::Utc::now().to_rfc3339()).bind(&r.batch_id).bind(r.quantity).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    if changed.rows_affected() != 1 {
        return Err(
            "Quarantine quantity exceeds current available stock. Refresh the batch list.".into(),
        );
    }
    sqlx::query("INSERT INTO batch_holds(id,batch_id,quantity,open_units,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?)").bind(&r.request_id).bind(&r.batch_id).bind(r.quantity).bind(held_open).bind(r.reason.trim()).bind(actor).bind(chrono::Utc::now().to_rfc3339()).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    movement(
        &mut tx,
        &r.batch_id,
        -r.quantity,
        &r.request_id,
        actor,
        "Quarantine: units excluded from sale",
    )
    .await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(r.request_id)
}
async fn movement(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    batch: &str,
    qty: i64,
    source: &str,
    actor: &str,
    reason: &str,
) -> Result<(), String> {
    sqlx::query("INSERT INTO stock_movements(id,product_id,batch_id,movement_type,quantity,reference_type,reference_id,reason,user_id,movement_date,created_at) SELECT ?,product_id,id,'adjustment',?,'quarantine',?,?,?,?,? FROM product_batches WHERE id=?").bind(Uuid::new_v4().to_string()).bind(qty).bind(source).bind(reason).bind(actor).bind(chrono::Utc::now().to_rfc3339()).bind(chrono::Utc::now().to_rfc3339()).bind(batch).execute(&mut **tx).await.map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn hold_batch(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: HoldRequest,
) -> Result<String, String> {
    hold(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
async fn resolve(
    pool: &Pool<Sqlite>,
    actor: &str,
    id: &str,
    action: &str,
    notes: &str,
) -> Result<(), String> {
    crate::credit::require_role(pool, actor, &["admin", "manager"]).await?;
    if !matches!(action, "released" | "written_off" | "returned")
        || notes.trim().is_empty()
        || notes.len() > 500
    {
        return Err("Choose a resolution and enter its reason or supplier-return reference".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let row=sqlx::query("SELECT h.*,b.expiry_date<date('now','localtime') AS expired,p.is_active,p.deleted_at FROM batch_holds h JOIN product_batches b ON b.id=h.batch_id JOIN products p ON p.id=b.product_id WHERE h.id=? AND h.status='held'").bind(id).fetch_optional(&mut *tx).await.map_err(|e|e.to_string())?.ok_or("This quarantine has already been resolved")?;
    if action == "released" {
        if row.get::<i64, _>("expired") != 0
            || row.get::<i64, _>("is_active") == 0
            || row.get::<Option<String>, _>("deleted_at").is_some()
        {
            return Err("Expired or inactive products cannot be released for sale. Write off or return these held units instead.".into());
        }
        sqlx::query("UPDATE product_batches SET quantity_in_stock=quantity_in_stock+?,loose_open_remaining=loose_open_remaining+?,updated_at=? WHERE id=?").bind(row.get::<i64,_>("quantity")).bind(row.get::<i64,_>("open_units")).bind(chrono::Utc::now().to_rfc3339()).bind(row.get::<String,_>("batch_id")).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        movement(
            &mut tx,
            &row.get::<String, _>("batch_id"),
            row.get::<i64, _>("quantity"),
            id,
            actor,
            "Released from quarantine",
        )
        .await?;
    }
    let n=sqlx::query("UPDATE batch_holds SET status=?,resolved_by=?,resolved_at=?,resolution_notes=? WHERE id=? AND status='held'").bind(action).bind(actor).bind(chrono::Utc::now().to_rfc3339()).bind(notes.trim()).bind(id).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    if n.rows_affected() != 1 {
        return Err("Quarantine already resolved".into());
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn resolve_batch_hold(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    id: String,
    action: String,
    notes: String,
) -> Result<(), String> {
    resolve(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        &id,
        &action,
        &notes,
    )
    .await
}
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    const ACTOR: &str = "00000000-0000-0000-0000-000000000001";
    async fn fixture() -> Pool<Sqlite> {
        let p = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database_api::initialize(&p).await.unwrap();
        sqlx::query("INSERT INTO products(id,sku,name,unit_price,cost_price,pack_size,created_at,updated_at) VALUES('p','P','Product',10,5,10,'now','now')").execute(&p).await.unwrap();
        sqlx::query("INSERT INTO product_batches(id,product_id,batch_number,expiry_date,quantity_in_stock,loose_open_remaining,cost_price_at_batch,received_date,created_at,updated_at) VALUES('b','p','B','2099-12-31',20,5,5,'now','now','now')").execute(&p).await.unwrap();
        p
    }
    #[tokio::test]
    async fn quarantine_excludes_units_once_and_release_restores_open_units() {
        let p = fixture().await;
        let id = Uuid::new_v4().to_string();
        let make = || HoldRequest {
            request_id: id.clone(),
            batch_id: "b".into(),
            quantity: 18,
            reason: "Damaged packaging".into(),
        };
        hold(&p, ACTOR, make()).await.unwrap();
        hold(&p, ACTOR, make()).await.unwrap();
        let stock: (i64, i64) = sqlx::query_as(
            "SELECT quantity_in_stock,loose_open_remaining FROM product_batches WHERE id='b'",
        )
        .fetch_one(&p)
        .await
        .unwrap();
        assert_eq!(stock, (2, 2));
        resolve(&p, ACTOR, &id, "released", "Inspection passed")
            .await
            .unwrap();
        assert!(resolve(&p, ACTOR, &id, "released", "Again").await.is_err());
        let stock: (i64, i64) = sqlx::query_as(
            "SELECT quantity_in_stock,loose_open_remaining FROM product_batches WHERE id='b'",
        )
        .fetch_one(&p)
        .await
        .unwrap();
        assert_eq!(stock, (20, 5));
        let movements: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM stock_movements WHERE reference_type='quarantine'",
        )
        .fetch_one(&p)
        .await
        .unwrap();
        assert_eq!(movements, 2);
    }
    #[tokio::test]
    async fn expired_hold_cannot_release_and_disposal_does_not_decrement_twice() {
        let p = fixture().await;
        sqlx::query("UPDATE product_batches SET expiry_date='2000-01-01' WHERE id='b'")
            .execute(&p)
            .await
            .unwrap();
        let id = hold(
            &p,
            ACTOR,
            HoldRequest {
                request_id: Uuid::new_v4().to_string(),
                batch_id: "b".into(),
                quantity: 5,
                reason: "Expired".into(),
            },
        )
        .await
        .unwrap();
        assert!(resolve(&p, ACTOR, &id, "released", "Unsafe release")
            .await
            .is_err());
        resolve(
            &p,
            ACTOR,
            &id,
            "written_off",
            "Destroyed under manager supervision",
        )
        .await
        .unwrap();
        assert!(resolve(&p, ACTOR, &id, "returned", "Duplicate")
            .await
            .is_err());
        let stock: i64 =
            sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id='b'")
                .fetch_one(&p)
                .await
                .unwrap();
        assert_eq!(stock, 15);
    }
    #[tokio::test]
    async fn excess_and_unauthorized_holds_leave_stock_unchanged() {
        let p = fixture().await;
        let make = || HoldRequest {
            request_id: Uuid::new_v4().to_string(),
            batch_id: "b".into(),
            quantity: 21,
            reason: "Too many".into(),
        };
        assert!(hold(&p, ACTOR, make()).await.is_err());
        sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,is_active,created_at,updated_at) VALUES('cashier','cashier','x','Cashier','cashier',1,'now','now')").execute(&p).await.unwrap();
        assert!(hold(&p, "cashier", make()).await.is_err());
        let stock: i64 =
            sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id='b'")
                .fetch_one(&p)
                .await
                .unwrap();
        assert_eq!(stock, 20);
    }
}
