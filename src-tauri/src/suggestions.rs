use crate::database_api::{current_actor, SessionState};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionRequest {
    pub start: String,
    pub end: String,
    pub lookback_days: i64,
    pub coverage_days: i64,
    pub lead_days: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub product_id: String,
    pub name: String,
    pub sku: String,
    pub pack_size: i64,
    pub available: i64,
    pub incoming: i64,
    pub recent_units: i64,
    pub daily_rate: f64,
    pub days_cover: Option<f64>,
    pub reorder_level: i64,
    pub target_stock: i64,
    pub suggested_units: i64,
    pub estimated_cost: f64,
    pub urgency: i64,
    pub supplier_name: Option<String>,
}
fn quantity(
    available: i64,
    incoming: i64,
    recent: i64,
    reorder: i64,
    pack: i64,
    r: &SuggestionRequest,
) -> Result<(i64, i64, f64), String> {
    let rate = recent.max(0) as f64 / r.lookback_days as f64;
    let target = (rate * (r.coverage_days + r.lead_days) as f64)
        .ceil()
        .max(reorder as f64) as i64;
    let need = target
        .saturating_sub(available)
        .saturating_sub(incoming)
        .max(0);
    let pack = pack.max(1);
    let units = if need == 0 {
        0
    } else {
        need.checked_add(pack - 1)
            .and_then(|n| (n / pack).checked_mul(pack))
            .ok_or("Suggested quantity is too large; check product history")?
    };
    Ok((target, units, rate))
}
async fn suggest(
    pool: &Pool<Sqlite>,
    actor: &str,
    r: SuggestionRequest,
) -> Result<Vec<Suggestion>, String> {
    crate::credit::require_role(pool, actor, &["admin", "manager"]).await?;
    let start = chrono::DateTime::parse_from_rfc3339(&r.start).map_err(|_| "Invalid start date")?;
    let end = chrono::DateTime::parse_from_rfc3339(&r.end).map_err(|_| "Invalid end date")?;
    if !(1..=180).contains(&r.lookback_days)
        || !(1..=180).contains(&r.coverage_days)
        || !(0..=90).contains(&r.lead_days)
        || end <= start
        || ((end - start).num_seconds() as f64 / 86400.0 - r.lookback_days as f64).abs() > 0.1
    {
        return Err("Check lookback, coverage and lead-time days".into());
    }
    let rows = sqlx::query(SUGGESTIONS_SQL)
        .bind(&r.start)
        .bind(&r.end)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut result = vec![];
    for row in rows {
        let available = row.get::<i64, _>("available");
        let incoming = row.get::<i64, _>("incoming");
        let recent = row.get::<i64, _>("recent_units");
        let reorder = row.get::<i64, _>("reorder_level");
        let pack = row.get::<i64, _>("pack_size");
        let (target, units, rate) = quantity(available, incoming, recent, reorder, pack, &r)?;
        if units == 0 {
            continue;
        }
        let cover = if rate > 0.0 {
            Some(available as f64 / rate)
        } else {
            None
        };
        let urgency = if available == 0 {
            0
        } else if available <= reorder {
            1
        } else if cover.is_some_and(|n| n <= r.lead_days as f64) {
            2
        } else {
            3
        };
        result.push(Suggestion {
            product_id: row.get("id"),
            name: row.get("name"),
            sku: row.get("sku"),
            pack_size: pack.max(1),
            available,
            incoming,
            recent_units: recent,
            daily_rate: rate,
            days_cover: cover,
            reorder_level: reorder,
            target_stock: target,
            suggested_units: units,
            estimated_cost: row.get("cost_price"),
            urgency,
            supplier_name: row.get("supplier_name"),
        });
    }
    result.sort_by(|a, b| {
        a.urgency
            .cmp(&b.urgency)
            .then_with(|| {
                a.days_cover
                    .unwrap_or(f64::INFINITY)
                    .total_cmp(&b.days_cover.unwrap_or(f64::INFINITY))
            })
            .then_with(|| b.suggested_units.cmp(&a.suggested_units))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(result)
}
#[tauri::command]
pub async fn purchase_suggestions(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: SuggestionRequest,
) -> Result<Vec<Suggestion>, String> {
    suggest(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
pub(crate) const SUGGESTIONS_SQL: &str = r#"WITH stock AS (SELECT product_id,SUM(quantity_in_stock) AS available FROM product_batches WHERE expiry_date>=date('now','localtime') GROUP BY product_id),
 incoming AS (SELECT l.product_id,SUM(MAX(0,l.quantity_ordered-l.quantity_received)) AS incoming FROM purchase_order_items l JOIN purchase_orders p ON p.id=l.po_id WHERE p.status IN ('sent','partial') GROUP BY l.product_id),
 demand AS (SELECT l.product_id,SUM(l.quantity) AS recent_units FROM sales_invoice_items l JOIN sales_invoices i ON i.id=l.invoice_id WHERE i.status='completed' AND julianday(i.invoice_date)>=julianday(?) AND julianday(i.invoice_date)<julianday(?) GROUP BY l.product_id)
 SELECT p.id,p.name,p.sku,p.pack_size,p.reorder_level,p.cost_price,COALESCE(s.available,0) AS available,COALESCE(o.incoming,0) AS incoming,COALESCE(d.recent_units,0) AS recent_units,
 (SELECT s.name FROM purchase_order_items l JOIN purchase_orders po ON po.id=l.po_id JOIN suppliers s ON s.id=po.supplier_id WHERE l.product_id=p.id AND po.status IN ('partial','received') AND s.is_active=1 AND s.deleted_at IS NULL ORDER BY po.order_date DESC,po.created_at DESC LIMIT 1) AS supplier_name
 FROM products p LEFT JOIN stock s ON s.product_id=p.id LEFT JOIN incoming o ON o.product_id=p.id LEFT JOIN demand d ON d.product_id=p.id WHERE p.is_active=1 AND p.deleted_at IS NULL"#;
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    const ADMIN: &str = "00000000-0000-0000-0000-000000000001";
    fn request() -> SuggestionRequest {
        SuggestionRequest {
            start: "2026-10-01T00:00:00Z".into(),
            end: "2026-10-31T00:00:00Z".into(),
            lookback_days: 30,
            coverage_days: 10,
            lead_days: 5,
        }
    }
    #[test]
    fn rounds_shortfall_to_packs_and_accounts_for_incoming() {
        let r = request();
        assert_eq!(quantity(5, 7, 30, 20, 10, &r).unwrap(), (20, 10, 1.0));
        assert_eq!(quantity(5, 20, 30, 20, 10, &r).unwrap().1, 0);
        assert_eq!(quantity(0, 0, 0, 15, 10, &r).unwrap().1, 20);
    }
    #[tokio::test]
    async fn suggestions_exclude_expiry_and_drafts_and_never_create_orders() {
        let p = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database_api::initialize(&p).await.unwrap();
        for (id, reorder) in [("p", 20), ("empty", 10), ("inactive", 10)] {
            sqlx::query("INSERT INTO products(id,sku,name,pack_size,unit_price,cost_price,reorder_level,is_active,created_at,updated_at) VALUES(?,?,?,10,10,5,?,?,'now','now')").bind(id).bind(id).bind(id).bind(reorder).bind(if id=="inactive"{0}else{1}).execute(&p).await.unwrap();
        }
        sqlx::query("INSERT INTO product_batches(id,product_id,batch_number,expiry_date,quantity_in_stock,cost_price_at_batch,received_date,created_at,updated_at) VALUES('fresh','p','F','2099-12-31',5,5,'now','now','now'),('expired','p','E','2000-01-01',999,5,'now','now','now')").execute(&p).await.unwrap();
        sqlx::query("INSERT INTO suppliers(id,supplier_code,name,created_at,updated_at) VALUES('s','S','Supplier','now','now')").execute(&p).await.unwrap();
        for (id, status, ordered, received) in [
            ("sent", "sent", 7, 0),
            ("draft", "draft", 100, 0),
            ("received", "received", 20, 20),
        ] {
            sqlx::query("INSERT INTO purchase_orders(id,po_number,supplier_id,order_date,status,total_amount,created_by,created_at,updated_at) VALUES(?,?,'s','2026-10-01',?,100,?,'now','now')").bind(id).bind(id).bind(status).bind(ADMIN).execute(&p).await.unwrap();
            sqlx::query("INSERT INTO purchase_order_items(id,po_id,product_id,quantity_ordered,quantity_received,unit_cost,line_total,created_at) VALUES(?,?,'p',?,?,5,100,'now')").bind(id).bind(id).bind(ordered).bind(received).execute(&p).await.unwrap();
        }
        for (id, date, status, qty) in [
            ("sale", "2026-10-15T00:00:00Z", "completed", 30),
            ("old", "2026-09-30T23:59:59Z", "completed", 500),
            ("cancelled", "2026-10-15T00:00:00Z", "cancelled", 500),
        ] {
            sqlx::query("INSERT INTO sales_invoices(id,invoice_number,cashier_id,invoice_date,total_amount,tax_amount,discount_amount,net_amount,payment_method,status,created_at,updated_at) VALUES(?,?,?, ?,10,0,0,10,'cash',?,'now','now')").bind(id).bind(id).bind(ADMIN).bind(date).bind(status).execute(&p).await.unwrap();
            sqlx::query("INSERT INTO sales_invoice_items(id,invoice_id,product_id,batch_id,quantity,unit_price,discount_percent,line_total,is_loose_sale,created_at) VALUES(?,?,'p','fresh',?,10,0,10,0,'now')").bind(id).bind(id).bind(qty).execute(&p).await.unwrap();
        }
        let rows = suggest(&p, ADMIN, request()).await.unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].product_id, "empty");
        let row = rows.iter().find(|r| r.product_id == "p").unwrap();
        assert_eq!(
            (
                row.available,
                row.incoming,
                row.recent_units,
                row.suggested_units
            ),
            (5, 7, 30, 10)
        );
        assert_eq!(row.supplier_name.as_deref(), Some("Supplier"));
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM purchase_orders")
            .fetch_one(&p)
            .await
            .unwrap();
        assert_eq!(n, 3);
        sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,is_active,created_at,updated_at) VALUES('a','a','x','Accountant','accountant',1,'now','now')").execute(&p).await.unwrap();
        assert!(suggest(&p, "a", request()).await.is_err());
    }
}
