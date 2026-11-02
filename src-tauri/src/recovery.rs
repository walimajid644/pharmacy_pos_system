use crate::database_api::{current_actor, select_safe, SessionState};
use serde::Serialize;
use serde_json::{Map, Value};
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;
#[derive(Serialize)]
pub struct SavedSale {
    invoice: Map<String, Value>,
    items: Vec<Map<String, Value>>,
    shop: Option<Map<String, Value>>,
}
#[tauri::command]
pub async fn saved_sale(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    invoice_id: Option<String>,
) -> Result<Option<SavedSale>, String> {
    let pool = crate::database_api::pool(&instances).await?;
    let actor = current_actor(&session).await?;
    get_saved(&pool, &actor, invoice_id).await
}
pub(crate) async fn get_saved(
    pool: &Pool<Sqlite>,
    actor: &str,
    invoice_id: Option<String>,
) -> Result<Option<SavedSale>, String> {
    let role =
        crate::credit::require_role(pool, actor, &["admin", "manager", "cashier", "accountant"])
            .await?;
    let id = if let Some(id) = invoice_id {
        id
    } else {
        let latest:Option<String>=sqlx::query_scalar("SELECT id FROM sales_invoices WHERE cashier_id=? AND status='completed' ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(&actor).fetch_optional(pool).await.map_err(|e|e.to_string())?;
        match latest {
            Some(id) => id,
            None => return Ok(None),
        }
    };
    let row =
        sqlx::query("SELECT cashier_id FROM sales_invoices WHERE id=? AND status='completed'")
            .bind(&id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("Saved completed invoice was not found")?;
    if role == "cashier" && row.get::<String, _>("cashier_id") != actor {
        return Err("Cashiers may recover only their own saved sales".into());
    }
    let invoice=select_safe(&pool,"SELECT i.*,COALESCE(i.customer_name_snapshot,'Walk-in') AS customer_name,i.customer_phone_snapshot AS customer_phone,i.cashier_name_snapshot AS cashier_name FROM sales_invoices i WHERE id=?".into(),vec![id.clone().into()]).await?.remove(0);
    let items=select_safe(&pool,"SELECT i.*,i.product_name_snapshot AS product_name,i.batch_number_snapshot AS batch_number,i.controlled_snapshot AS controlled_substance,i.drap_snapshot AS drap_registration_number FROM sales_invoice_items i LEFT JOIN products p ON p.id=i.product_id WHERE invoice_id=? ORDER BY i.rowid".into(),vec![id.into()]).await?;
    let shop = select_safe(&pool, "SELECT * FROM app_settings LIMIT 1".into(), vec![])
        .await?
        .into_iter()
        .next();
    Ok(Some(SavedSale {
        invoice,
        items,
        shop,
    }))
}
#[tauri::command]
pub async fn cashier_performance(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    start: String,
    end: String,
) -> Result<Vec<Map<String, Value>>, String> {
    let pool = crate::database_api::pool(&instances).await?;
    let actor = current_actor(&session).await?;
    performance(&pool, &actor, start, end).await
}
async fn performance(
    pool: &Pool<Sqlite>,
    actor: &str,
    start: String,
    end: String,
) -> Result<Vec<Map<String, Value>>, String> {
    crate::credit::require_role(pool, actor, &["admin", "manager", "accountant"]).await?;
    let a = chrono::DateTime::parse_from_rfc3339(&start).map_err(|_| "Invalid start date")?;
    let b = chrono::DateTime::parse_from_rfc3339(&end).map_err(|_| "Invalid end date")?;
    if b <= a || (b - a).num_days() > 366 {
        return Err("Choose a valid date range of up to one year".into());
    }
    select_safe(
        &pool,
        PERFORMANCE_SQL.into(),
        vec![start.into(), end.into()],
    )
    .await
}
pub(crate) const PERFORMANCE_SQL: &str = r#"WITH bounds AS (SELECT julianday(?) AS start,julianday(?) AS end),
 s AS (SELECT cashier_id,COUNT(*) AS invoice_count,SUM(net_amount) AS invoiced,SUM(CASE WHEN payment_method='cash' THEN net_amount ELSE 0 END) AS cash,SUM(CASE WHEN payment_method='card' THEN net_amount ELSE 0 END) AS card,SUM(CASE WHEN payment_method='mobile' THEN net_amount ELSE 0 END) AS mobile,SUM(CASE WHEN payment_method='credit' THEN net_amount ELSE 0 END) AS credit,
 SUM(CASE WHEN EXISTS(SELECT 1 FROM sales_returns r WHERE r.original_invoice_id=i.id AND r.status='refunded' AND julianday(r.updated_at)<bounds.end) THEN 1 ELSE 0 END) AS returned_invoices
 FROM sales_invoices i,bounds WHERE i.status='completed' AND julianday(i.invoice_date)>=bounds.start AND julianday(i.invoice_date)<bounds.end GROUP BY cashier_id),
 r AS (SELECT i.cashier_id,COUNT(*) AS return_count,SUM(r.refund_amount) AS refunds FROM sales_returns r JOIN sales_invoices i ON i.id=r.original_invoice_id,bounds WHERE r.status='refunded' AND julianday(r.updated_at)>=bounds.start AND julianday(r.updated_at)<bounds.end GROUP BY i.cashier_id)
 SELECT u.id,u.full_name,COALESCE(s.invoice_count,0) AS invoice_count,COALESCE(s.invoiced,0) AS invoiced,COALESCE(r.return_count,0) AS return_count,COALESCE(r.refunds,0) AS refunds,ROUND(COALESCE(s.invoiced,0)-COALESCE(r.refunds,0),2) AS net_sales,CASE WHEN s.invoice_count>0 THEN ROUND(s.invoiced/s.invoice_count,2) ELSE 0 END AS average_bill,CASE WHEN s.invoice_count>0 THEN ROUND(s.returned_invoices*100.0/s.invoice_count,2) ELSE 0 END AS return_rate,COALESCE(s.cash,0) AS cash,COALESCE(s.card,0) AS card,COALESCE(s.mobile,0) AS mobile,COALESCE(s.credit,0) AS credit FROM users u LEFT JOIN s ON s.cashier_id=u.id LEFT JOIN r ON r.cashier_id=u.id WHERE COALESCE(s.invoice_count,0)>0 OR COALESCE(r.return_count,0)>0 ORDER BY net_sales DESC,u.full_name"#;
#[cfg(test)]
mod tests {
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
        sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,is_active,created_at,updated_at) VALUES('cashier','cashier','x','Test Cashier','cashier',1,'now','now')").execute(&p).await.unwrap();
        sqlx::query("INSERT INTO products(id,sku,name,unit_price,cost_price,created_at,updated_at) VALUES('p','P','Changed catalogue name',999,5,'now','now')").execute(&p).await.unwrap();
        sqlx::query("INSERT INTO product_batches(id,product_id,batch_number,expiry_date,quantity_in_stock,cost_price_at_batch,received_date,created_at,updated_at) VALUES('b','p','CurrentBatch','2099-12-31',100,5,'now','now','now')").execute(&p).await.unwrap();
        p
    }
    async fn invoice(p: &Pool<Sqlite>, id: &str, date: &str, amount: f64, method: &str) {
        sqlx::query("INSERT INTO sales_invoices(id,invoice_number,cashier_id,invoice_date,total_amount,tax_amount,discount_amount,net_amount,payment_method,status,created_at,updated_at,customer_name_snapshot,customer_phone_snapshot,cashier_name_snapshot,received_amount,change_amount) VALUES(?,?,'cashier',?,?,0,0,?,?,'completed',?,?,'Saved Customer','03001234567','Saved Cashier',?,0)").bind(id).bind(id).bind(date).bind(amount).bind(amount).bind(method).bind(date).bind(date).bind(if method=="credit"{0.0}else{amount}).execute(p).await.unwrap();
        sqlx::query("INSERT INTO sales_invoice_items(id,invoice_id,product_id,batch_id,quantity,unit_price,discount_percent,line_total,is_loose_sale,created_at,product_name_snapshot,batch_number_snapshot) VALUES(?,?,'p','b',10,10,0,?,0,?,'Saved Medicine','SavedBatch')").bind(format!("line-{id}")).bind(id).bind(amount).bind(date).execute(p).await.unwrap();
    }
    #[tokio::test]
    async fn recovery_uses_saved_values_and_cashier_cannot_read_another_sale() {
        let p = fixture().await;
        invoice(&p, "inv", "2026-10-25T00:00:00Z", 100.0, "cash").await;
        let saved = get_saved(&p, "cashier", None).await.unwrap().unwrap();
        assert_eq!(saved.invoice["customer_name"], "Saved Customer");
        assert_eq!(saved.items[0]["product_name"], "Saved Medicine");
        assert_eq!(saved.items[0]["line_total"], 100.0);
        sqlx::query("UPDATE sales_invoices SET cashier_id=? WHERE id='inv'")
            .bind(ADMIN)
            .execute(&p)
            .await
            .unwrap();
        assert!(get_saved(&p, "cashier", Some("inv".into())).await.is_err());
        assert!(get_saved(&p, ADMIN, Some("inv".into()))
            .await
            .unwrap()
            .is_some());
    }
    #[tokio::test]
    async fn performance_respects_pakistan_day_boundaries_refunds_and_roles() {
        let p = fixture().await;
        invoice(&p, "before", "2026-10-24T18:59:59Z", 999.0, "cash").await;
        invoice(&p, "start", "2026-10-24T19:00:00Z", 100.0, "card").await;
        invoice(&p, "end", "2026-10-25T18:59:59Z", 200.0, "credit").await;
        invoice(&p, "after", "2026-10-25T19:00:00Z", 999.0, "cash").await;
        sqlx::query("INSERT INTO sales_returns(id,return_number,original_invoice_id,return_date,return_reason,subtotal,tax_amount,refund_amount,refund_method,status,processed_by,created_at,updated_at) VALUES('ret','RET','start','2026-10-25','defective',50,0,50,'card','pending',?,'2026-10-25T12:00:00Z','2026-10-25T12:00:00Z')").bind(ADMIN).execute(&p).await.unwrap();
        sqlx::query("INSERT INTO sales_return_items(id,return_id,invoice_item_id,product_id,batch_id,quantity_returned,unit_price,line_total,restock,created_at) VALUES('rl','ret','line-start','p','b',5,10,50,0,'now')").execute(&p).await.unwrap();
        for status in ["approved", "refunded"] {
            sqlx::query("UPDATE sales_returns SET status=?,approved_by=?,approved_at='2026-10-25T12:00:00Z',updated_at='2026-10-25T12:00:00Z' WHERE id='ret'").bind(status).bind(ADMIN).execute(&p).await.unwrap();
        }
        let rows = performance(
            &p,
            ADMIN,
            "2026-10-24T19:00:00Z".into(),
            "2026-10-25T19:00:00Z".into(),
        )
        .await
        .unwrap();
        assert_eq!(rows.len(), 1);
        let r = &rows[0];
        assert_eq!(r["invoice_count"], 2);
        assert_eq!(r["invoiced"], 300.0);
        assert_eq!(r["refunds"], 50.0);
        assert_eq!(r["net_sales"], 250.0);
        assert_eq!(r["average_bill"], 150.0);
        assert_eq!(r["return_rate"], 50.0);
        assert_eq!(r["credit"], 200.0);
        assert!(performance(
            &p,
            "cashier",
            "2026-10-24T19:00:00Z".into(),
            "2026-10-25T19:00:00Z".into()
        )
        .await
        .is_err());
        assert!(performance(
            &p,
            ADMIN,
            "2026-10-25T19:00:00Z".into(),
            "2026-10-24T19:00:00Z".into()
        )
        .await
        .is_err());
    }
}
