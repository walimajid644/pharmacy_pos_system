use crate::database_api::{current_actor, SessionState};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite, Transaction};
use std::collections::{HashMap, HashSet};
use tauri::State;
use tauri_plugin_sql::DbInstances;
use uuid::Uuid;

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogProduct {
    sku: String,
    name: String,
    generic_name: Option<String>,
    barcode: Option<String>,
    category: Option<String>,
    manufacturer: Option<String>,
    retail_price: f64,
    wholesale_price: Option<f64>,
    cost_price: f64,
    pack_size: i64,
    sell_loose: bool,
    controlled: bool,
    drap: Option<String>,
    reorder_level: i64,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpeningBatch {
    number: String,
    expiry: String,
    received: String,
    quantity: i64,
    cost: f64,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportRow {
    #[serde(default)]
    source_row: Option<usize>,
    product: CatalogProduct,
    batch: Option<OpeningBatch>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportRequest {
    request_id: String,
    create_lookups: bool,
    rows: Vec<ImportRow>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRow {
    row: usize,
    sku: String,
    name: String,
    errors: Vec<String>,
    warnings: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    rows: Vec<PreviewRow>,
    valid: bool,
    products: usize,
    batches: usize,
    new_categories: usize,
    new_manufacturers: usize,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogResult {
    operation_id: String,
    products: usize,
    batches: usize,
    categories: usize,
    manufacturers: usize,
}
fn key(s: &str) -> String {
    s.trim().to_lowercase()
}
fn clean(s: &Option<String>) -> Option<String> {
    s.as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
}
fn text(s: &str, max: usize) -> bool {
    !s.trim().is_empty() && s.chars().count() <= max && !s.chars().any(char::is_control)
}
fn price(v: f64) -> bool {
    v.is_finite()
        && (0.0..=100_000_000.0).contains(&v)
        && (v * 100.0 - (v * 100.0).round()).abs() < 0.00001
}
fn normalized(rows: &[ImportRow]) -> Vec<ImportRow> {
    rows.iter()
        .cloned()
        .map(|mut r| {
            let p = &mut r.product;
            p.sku = p.sku.trim().into();
            p.name = p.name.trim().into();
            p.generic_name = clean(&p.generic_name);
            p.barcode = clean(&p.barcode);
            p.category = clean(&p.category);
            p.manufacturer = clean(&p.manufacturer);
            p.drap = clean(&p.drap);
            if let Some(b) = &mut r.batch {
                b.number = b.number.trim().into();
            }
            r
        })
        .collect()
}
async fn lookups(
    tx: &mut Transaction<'_, Sqlite>,
    table: &str,
) -> Result<HashMap<String, Vec<(String, bool)>>, String> {
    let rows = sqlx::query(&format!("SELECT id,name,is_active,deleted_at FROM {table}"))
        .fetch_all(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    let mut map: HashMap<String, Vec<(String, bool)>> = HashMap::new();
    for r in rows {
        map.entry(key(&r.get::<String, _>("name")))
            .or_default()
            .push((
                r.get("id"),
                r.get::<i64, _>("is_active") == 1
                    && r.get::<Option<String>, _>("deleted_at").is_none(),
            ));
    }
    Ok(map)
}
async fn validate(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[ImportRow],
    create: bool,
) -> Result<Preview, String> {
    if rows.is_empty() || rows.len() > 5000 {
        return Err("Import 1–5000 rows at a time".into());
    }
    let categories = lookups(tx, "categories").await?;
    let manufacturers = lookups(tx, "manufacturers").await?;
    let existing = sqlx::query("SELECT sku,barcode FROM products")
        .fetch_all(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    let skus: HashSet<String> = existing
        .iter()
        .map(|r| key(&r.get::<String, _>("sku")))
        .collect();
    let barcodes: HashSet<String> = existing
        .iter()
        .filter_map(|r| r.get::<Option<String>, _>("barcode"))
        .filter(|s| !s.trim().is_empty())
        .map(|s| key(&s))
        .collect();
    let mut seen: HashMap<String, CatalogProduct> = HashMap::new();
    let mut codes: HashMap<String, String> = HashMap::new();
    let mut batches = HashSet::new();
    let mut new_categories = HashSet::new();
    let mut new_manufacturers = HashSet::new();
    let mut result = Vec::new();
    let today = chrono::Local::now().date_naive();
    let mut batch_count = 0;
    for (i, r) in rows.iter().enumerate() {
        let p = &r.product;
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        let sku = key(&p.sku);
        if !text(&p.sku, 100) || !text(&p.name, 200) {
            errors.push(
                "SKU and name are required (max 100 / 200 characters; no control characters)"
                    .into(),
            )
        }
        for (label, value, max) in [
            ("Generic name", &p.generic_name, 200),
            ("Barcode", &p.barcode, 100),
            ("DRAP number", &p.drap, 100),
            ("Category", &p.category, 120),
            ("Manufacturer", &p.manufacturer, 120),
        ] {
            if value.as_deref().is_some_and(|v| !text(v, max)) {
                errors.push(format!("{label} is too long or invalid"))
            }
        }
        if !price(p.retail_price)
            || !price(p.cost_price)
            || p.wholesale_price.is_some_and(|v| !price(v))
        {
            errors.push(
                "Prices must be nonnegative, at most Rs 100,000,000 and have at most two decimals"
                    .into(),
            )
        }
        if !(1..=100000).contains(&p.pack_size) || !(0..=100_000_000).contains(&p.reorder_level) {
            errors.push("Use a whole pack size 1–100000 and reorder level 0–100000000".into())
        }
        if skus.contains(&sku) {
            errors.push(
                "SKU already exists, including archived products; imports never overwrite it"
                    .into(),
            )
        }
        if let Some(prior) = seen.get(&sku) {
            if prior != p {
                errors.push("Repeated SKU has different product details".into())
            }
            if r.batch.is_none() {
                errors.push("Repeated SKU needs a distinct opening batch".into())
            }
        } else {
            seen.insert(sku.clone(), p.clone());
        }
        if let Some(code) = &p.barcode {
            let k = key(code);
            if barcodes.contains(&k) {
                errors.push("Barcode already belongs to an existing product".into())
            }
            if codes.get(&k).is_some_and(|owner| owner != &sku) {
                errors.push("Barcode is shared by different SKUs in this file".into())
            }
            codes.insert(k, sku.clone());
        }
        for (label, name, map, new) in [
            ("Category", &p.category, &categories, &mut new_categories),
            (
                "Manufacturer",
                &p.manufacturer,
                &manufacturers,
                &mut new_manufacturers,
            ),
        ] {
            if let Some(name) = name {
                match map.get(&key(name)) {
                    Some(v) if v.len() == 1 && v[0].1 => {}
                    Some(_) => {
                        errors.push(format!("{label} name is ambiguous, inactive or archived"))
                    }
                    None if create => {
                        new.insert(key(name));
                    }
                    None => errors.push(format!(
                        "{label} does not exist; review and allow creating missing lookup names"
                    )),
                }
            }
        }
        if p.controlled && p.drap.is_none() {
            warnings.push(
                "Controlled product has no DRAP number; verify the catalog before sale".into(),
            )
        }
        if let Some(b) = &r.batch {
            batch_count += 1;
            if !text(&b.number, 100) || !(1..=100_000_000).contains(&b.quantity) || !price(b.cost) {
                errors.push("Opening batch needs a number, positive whole-unit quantity and valid unit cost".into())
            }
            let expiry = chrono::NaiveDate::parse_from_str(&b.expiry, "%Y-%m-%d");
            let received = chrono::NaiveDate::parse_from_str(&b.received, "%Y-%m-%d");
            match (expiry, received) {
                (Ok(e), Ok(d))
                    if e.format("%Y-%m-%d").to_string() == b.expiry
                        && d.format("%Y-%m-%d").to_string() == b.received
                        && d <= today
                        && e >= d =>
                {
                    if e < today {
                        warnings.push("Expired opening stock is not sellable; review expiry/quarantine actions".into())
                    }
                }
                _ => errors.push(
                    "Use real YYYY-MM-DD dates; received must not be future or after expiry".into(),
                ),
            }
            if !p.sell_loose && p.pack_size > 0 && b.quantity % p.pack_size != 0 {
                errors.push("Pack-only opening stock must contain whole packs".into())
            }
            if !batches.insert((sku.clone(), key(&b.number))) {
                errors.push("Opening batch is duplicated for this SKU".into())
            }
        }
        result.push(PreviewRow {
            row: r
                .source_row
                .filter(|n| *n >= 2 && *n <= 100000)
                .unwrap_or(i + 2),
            sku: p.sku.clone(),
            name: p.name.clone(),
            errors,
            warnings,
        });
    }
    Ok(Preview {
        valid: result.iter().all(|r| r.errors.is_empty()),
        rows: result,
        products: seen.len(),
        batches: batch_count,
        new_categories: new_categories.len(),
        new_manufacturers: new_manufacturers.len(),
    })
}
async fn ensure_lookup(
    tx: &mut Transaction<'_, Sqlite>,
    map: &mut HashMap<String, Vec<(String, bool)>>,
    table: &str,
    name: &Option<String>,
    now: &str,
) -> Result<Option<String>, String> {
    let Some(name) = name else { return Ok(None) };
    let k = key(name);
    if let Some(v) = map.get(&k) {
        return Ok(Some(v[0].0.clone()));
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(&format!(
        "INSERT INTO {table}(id,name,is_active,created_at,updated_at) VALUES(?,?,1,?,?)"
    ))
    .bind(&id)
    .bind(name)
    .bind(now)
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    map.insert(k, vec![(id.clone(), true)]);
    Ok(Some(id))
}
async fn prior(
    tx: &mut Transaction<'_, Sqlite>,
    id: &str,
    actor: &str,
    payload: &str,
) -> Result<Option<CatalogResult>, String> {
    if let Some(r) =
        sqlx::query("SELECT actor_id,payload_json,result_json FROM catalog_operations WHERE id=?")
            .bind(id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?
    {
        if r.get::<String, _>("actor_id") != actor || r.get::<String, _>("payload_json") != payload
        {
            return Err("Operation ID was used for different data; start a new preview".into());
        }
        return serde_json::from_str(&r.get::<String, _>("result_json"))
            .map(Some)
            .map_err(|e| e.to_string());
    }
    Ok(None)
}
async fn journal(
    tx: &mut Transaction<'_, Sqlite>,
    kind: &str,
    actor: &str,
    payload: &str,
    result: &CatalogResult,
    now: &str,
) -> Result<(), String> {
    sqlx::query("INSERT INTO catalog_operations(id,kind,actor_id,payload_json,result_json,created_at) VALUES(?,?,?,?,?,?)").bind(&result.operation_id).bind(kind).bind(actor).bind(payload).bind(serde_json::to_string(result).map_err(|e|e.to_string())?).bind(now).execute(&mut **tx).await.map_err(|e|e.to_string())?;
    let details = if kind == "bulk" {
        let p: serde_json::Value = serde_json::from_str(payload).map_err(|e| e.to_string())?;
        format!(
            "{} products; category={}; reorder={}; pack={}",
            result.products, p["category"], p["reorderLevel"], p["packSize"]
        )
    } else {
        format!(
            "{} products; {} opening batches; {} categories; {} manufacturers",
            result.products, result.batches, result.categories, result.manufacturers
        )
    };
    sqlx::query("INSERT INTO audit_events(id,event_type,actor_id,occurred_at,entity_type,entity_id,reference,details) VALUES(?,?,?,?, 'catalog_operation',?,?,?)").bind(Uuid::new_v4().to_string()).bind(format!("catalog_{kind}")).bind(actor).bind(now).bind(&result.operation_id).bind(&result.operation_id).bind(details).execute(&mut **tx).await.map_err(|e|e.to_string())?;
    Ok(())
}
async fn preview(pool: &Pool<Sqlite>, actor: &str, r: ImportRequest) -> Result<Preview, String> {
    crate::credit::require_role(pool, actor, &["admin", "manager"]).await?;
    let rows = normalized(&r.rows);
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let p = validate(&mut tx, &rows, r.create_lookups).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(p)
}
async fn import(
    pool: &Pool<Sqlite>,
    actor: &str,
    r: ImportRequest,
) -> Result<CatalogResult, String> {
    crate::credit::require_role(pool, actor, &["admin", "manager"]).await?;
    Uuid::parse_str(&r.request_id).map_err(|_| "Invalid operation ID")?;
    let payload = serde_json::to_string(&r).map_err(|e| e.to_string())?;
    if payload.len() > 5_000_000 {
        return Err("Import payload exceeds 5 MB".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if let Some(result) = prior(&mut tx, &r.request_id, actor, &payload).await? {
        return Ok(result);
    }
    let rows = normalized(&r.rows);
    let checked = validate(&mut tx, &rows, r.create_lookups).await?;
    if !checked.valid {
        let first = checked.rows.iter().find(|r| !r.errors.is_empty()).unwrap();
        return Err(format!(
            "Row {} ({}): {}. Nothing imported; refresh preview.",
            first.row,
            first.sku,
            first.errors.join("; ")
        ));
    }
    let now = chrono::Utc::now().to_rfc3339();
    let mut categories = lookups(&mut tx, "categories").await?;
    let mut manufacturers = lookups(&mut tx, "manufacturers").await?;
    let mut ids: HashMap<String, String> = HashMap::new();
    let operation_id = r.request_id.clone();
    for r in rows {
        let p = r.product;
        let sku = key(&p.sku);
        let id = if let Some(id) = ids.get(&sku) {
            id.clone()
        } else {
            let category =
                ensure_lookup(&mut tx, &mut categories, "categories", &p.category, &now).await?;
            let manufacturer = ensure_lookup(
                &mut tx,
                &mut manufacturers,
                "manufacturers",
                &p.manufacturer,
                &now,
            )
            .await?;
            let id = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO products(id,sku,name,generic_name,barcode,category_id,manufacturer_id,unit_price,wholesale_price,cost_price,pack_size,sell_by_loose_unit,controlled_substance,drap_registration_number,reorder_level,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)").bind(&id).bind(&p.sku).bind(&p.name).bind(&p.generic_name).bind(&p.barcode).bind(category).bind(manufacturer).bind(p.retail_price).bind(p.wholesale_price).bind(p.cost_price).bind(p.pack_size).bind(p.sell_loose).bind(p.controlled).bind(&p.drap).bind(p.reorder_level).bind(&now).bind(&now).execute(&mut *tx).await.map_err(|e|e.to_string())?;
            ids.insert(sku, id.clone());
            id
        };
        if let Some(b) = r.batch {
            let batch = Uuid::new_v4().to_string();
            let open = if p.sell_loose {
                b.quantity % p.pack_size
            } else {
                0
            };
            sqlx::query("INSERT INTO product_batches(id,product_id,batch_number,expiry_date,quantity_in_stock,loose_open_remaining,cost_price_at_batch,received_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(&batch).bind(&id).bind(&b.number).bind(&b.expiry).bind(b.quantity).bind(open).bind(b.cost).bind(&b.received).bind(&now).bind(&now).execute(&mut *tx).await.map_err(|e|e.to_string())?;
            sqlx::query("INSERT INTO stock_movements(id,product_id,batch_id,movement_type,quantity,reference_type,reference_id,reason,user_id,movement_date,created_at) VALUES(?,?,?,'in',?,'catalog_import',?,'Reviewed opening stock import',?,?,?)").bind(Uuid::new_v4().to_string()).bind(&id).bind(batch).bind(b.quantity).bind(&operation_id).bind(actor).bind(&now).bind(&now).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        }
    }
    let result = CatalogResult {
        operation_id: r.request_id,
        products: checked.products,
        batches: checked.batches,
        categories: checked.new_categories,
        manufacturers: checked.new_manufacturers,
    };
    journal(&mut tx, "import", actor, &payload, &result, &now).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(result)
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BulkItem {
    id: String,
    updated_at: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BulkRequest {
    request_id: String,
    products: Vec<BulkItem>,
    category: Option<String>,
    reorder_level: Option<i64>,
    pack_size: Option<i64>,
}
async fn bulk(pool: &Pool<Sqlite>, actor: &str, r: BulkRequest) -> Result<CatalogResult, String> {
    crate::credit::require_role(pool, actor, &["admin", "manager"]).await?;
    Uuid::parse_str(&r.request_id).map_err(|_| "Invalid operation ID")?;
    if r.products.is_empty()
        || r.products.len() > 500
        || r.category.is_none() && r.reorder_level.is_none() && r.pack_size.is_none()
        || r.reorder_level
            .is_some_and(|n| !(0..=100_000_000).contains(&n))
        || r.pack_size.is_some_and(|n| !(1..=100000).contains(&n))
    {
        return Err("Select 1–500 products and valid category/reorder/pack changes".into());
    }
    let payload = serde_json::to_string(&r).map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if let Some(result) = prior(&mut tx, &r.request_id, actor, &payload).await? {
        return Ok(result);
    }
    if let Some(category) = r.category.as_ref().filter(|s| !s.is_empty()) {
        let found: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM categories WHERE id=? AND is_active=1 AND deleted_at IS NULL",
        )
        .bind(category)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        if found != 1 {
            return Err("Category is unavailable".into());
        }
    }
    let now = chrono::Utc::now().to_rfc3339();
    let mut seen = HashSet::new();
    for p in &r.products {
        if !seen.insert(&p.id) {
            return Err("Product selected twice".into());
        }
        let row = sqlx::query(
            "SELECT updated_at,pack_size,name FROM products WHERE id=? AND deleted_at IS NULL",
        )
        .bind(&p.id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Product is unavailable")?;
        if row.get::<String, _>("updated_at") != p.updated_at {
            return Err(
                "Catalog changed since selection. Reload and review bulk changes again.".into(),
            );
        }
        if r.pack_size
            .is_some_and(|n| n != row.get::<i64, _>("pack_size"))
        {
            let used:i64=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM product_batches WHERE product_id=? UNION ALL SELECT 1 FROM sales_invoice_items WHERE product_id=? UNION ALL SELECT 1 FROM purchase_order_items WHERE product_id=? UNION ALL SELECT 1 FROM stock_movements WHERE product_id=?)").bind(&p.id).bind(&p.id).bind(&p.id).bind(&p.id).fetch_one(&mut *tx).await.map_err(|e|e.to_string())?;
            if used != 0 {
                return Err(format!(
                    "{} has stock or transaction history. Pack size cannot be changed in bulk.",
                    row.get::<String, _>("name")
                ));
            }
        }
        sqlx::query("UPDATE products SET category_id=CASE WHEN ? THEN ? ELSE category_id END,reorder_level=COALESCE(?,reorder_level),pack_size=COALESCE(?,pack_size),updated_at=? WHERE id=?").bind(r.category.is_some()).bind(r.category.as_deref().filter(|s|!s.is_empty())).bind(r.reorder_level).bind(r.pack_size).bind(&now).bind(&p.id).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    }
    let result = CatalogResult {
        operation_id: r.request_id,
        products: r.products.len(),
        batches: 0,
        categories: 0,
        manufacturers: 0,
    };
    journal(&mut tx, "bulk", actor, &payload, &result, &now).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(result)
}
#[tauri::command]
pub async fn preview_catalog_import(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: ImportRequest,
) -> Result<Preview, String> {
    preview(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
#[tauri::command]
pub async fn import_catalog(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: ImportRequest,
) -> Result<CatalogResult, String> {
    import(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
#[tauri::command]
pub async fn bulk_update_catalog(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: BulkRequest,
) -> Result<CatalogResult, String> {
    bulk(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}

#[cfg(test)]
#[path = "catalog_tests.rs"]
mod tests;
