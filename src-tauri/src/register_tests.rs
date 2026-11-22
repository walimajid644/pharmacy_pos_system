use super::*;
use sqlx::sqlite::SqlitePoolOptions;

const ADMIN: &str = "00000000-0000-0000-0000-000000000001";
fn request(kind: Kind, name: &str) -> SaveRequest {
    SaveRequest {
        kind,
        id: None,
        name: name.into(),
        description: Some("Test description".into()),
        is_active: true,
        expected_updated_at: None,
    }
}
fn edit(kind: Kind, entry: &Entry, name: &str, active: bool) -> SaveRequest {
    SaveRequest {
        kind,
        id: Some(entry.id.clone()),
        name: name.into(),
        description: entry.description.clone(),
        is_active: active,
        expected_updated_at: Some(entry.updated_at.clone()),
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
async fn register_crud_guards_roles_duplicates_and_stale_edits() {
    let p = fixture().await;
    for role in ["cashier", "accountant", "manager"] {
        sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,created_at,updated_at) VALUES(?,?, 'x',?,?, 'now','now')")
            .bind(role).bind(format!("register-{role}")).bind(role).bind(role).execute(&p).await.unwrap();
    }
    for kind in [
        Kind::Category,
        Kind::Manufacturer,
        Kind::Shelf,
        Kind::ExpenseHead,
        Kind::IncomeHead,
        Kind::Bank,
    ] {
        for actor in ["cashier", "accountant"] {
            assert!(save(&p, actor, request(kind, "Forbidden register"))
                .await
                .is_err());
            assert!(list(&p, actor, kind).await.is_err());
        }
        let id = save(&p, "manager", request(kind, "Register test"))
            .await
            .unwrap();
        let row = list(&p, ADMIN, kind)
            .await
            .unwrap()
            .into_iter()
            .find(|row| row.id == id)
            .unwrap();
        assert_eq!(row.assigned_count, 0);
        assert!(save(&p, ADMIN, request(kind, " register TEST "))
            .await
            .is_err());
        save(&p, ADMIN, edit(kind, &row, "Renamed register", false))
            .await
            .unwrap();
        assert!(save(&p, ADMIN, edit(kind, &row, "Stale overwrite", true))
            .await
            .is_err());
        let latest = list(&p, ADMIN, kind)
            .await
            .unwrap()
            .into_iter()
            .find(|row| row.id == id)
            .unwrap();
        assert!(!latest.is_active);
        assert_eq!(latest.name, "Renamed register");
        assert!(save(&p, ADMIN, request(kind, "Renamed register"))
            .await
            .is_err());
        save(&p, ADMIN, edit(kind, &latest, "Renamed register", true))
            .await
            .unwrap();
    }
    assert!(save(&p, ADMIN, request(Kind::Shelf, &"x".repeat(81)))
        .await
        .is_err());
    assert!(save(&p, ADMIN, request(Kind::Category, "bad\nname"))
        .await
        .is_err());
    assert!(save(&p, ADMIN, request(Kind::Manufacturer, "  "))
        .await
        .is_err());
    let audits:i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_events WHERE entity_type IN ('categories','manufacturers','shelf_locations')").fetch_one(&p).await.unwrap();
    assert_eq!(audits, 9);
}

#[tokio::test]
async fn shelf_renames_and_deactivation_preserve_product_assignments() {
    let p = fixture().await;
    let shelf = save(&p, ADMIN, request(Kind::Shelf, "Shelf A"))
        .await
        .unwrap();
    let category = save(&p, ADMIN, request(Kind::Category, "Register category"))
        .await
        .unwrap();
    let company = save(&p, ADMIN, request(Kind::Manufacturer, "Register company"))
        .await
        .unwrap();
    sqlx::query("INSERT INTO products(id,sku,name,unit_price,cost_price,pack_size,category_id,manufacturer_id,shelf_location,created_at,updated_at) VALUES('reg-product','REG-PRODUCT','Register product',10,5,10,?,?, 'Shelf A','now','now')")
        .bind(&category).bind(&company).execute(&p).await.unwrap();
    let linked: String =
        sqlx::query_scalar("SELECT shelf_location_id FROM products WHERE id='reg-product'")
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!(linked, shelf);
    let row = list(&p, ADMIN, Kind::Shelf)
        .await
        .unwrap()
        .into_iter()
        .find(|row| row.id == shelf)
        .unwrap();
    assert_eq!(row.assigned_count, 1);
    save(&p, ADMIN, edit(Kind::Shelf, &row, "Shelf B", true))
        .await
        .unwrap();
    let current: (String, String) = sqlx::query_as(
        "SELECT shelf_location,shelf_location_id FROM products WHERE id='reg-product'",
    )
    .fetch_one(&p)
    .await
    .unwrap();
    assert_eq!(current, ("Shelf B".into(), shelf.clone()));
    let row = list(&p, ADMIN, Kind::Shelf)
        .await
        .unwrap()
        .into_iter()
        .find(|row| row.id == shelf)
        .unwrap();
    save(&p, ADMIN, edit(Kind::Shelf, &row, "Shelf B", false))
        .await
        .unwrap();
    sqlx::query(
        "UPDATE products SET shelf_location='Shelf B',fridge_item=1 WHERE id='reg-product'",
    )
    .execute(&p)
    .await
    .unwrap();
    assert!(sqlx::query("INSERT INTO products(id,sku,name,unit_price,cost_price,pack_size,shelf_location,created_at,updated_at) VALUES('reg-new','REG-NEW','New',10,5,1,'Shelf B','now','now')").execute(&p).await.is_err());
    assert!(sqlx::query("DELETE FROM shelf_locations WHERE id=?")
        .bind(&shelf)
        .execute(&p)
        .await
        .is_err());
    let row = list(&p, ADMIN, Kind::Shelf)
        .await
        .unwrap()
        .into_iter()
        .find(|row| row.id == shelf)
        .unwrap();
    save(&p, ADMIN, edit(Kind::Shelf, &row, "Shelf B", true))
        .await
        .unwrap();
    sqlx::query("UPDATE products SET shelf_location='' WHERE id='reg-product'")
        .execute(&p)
        .await
        .unwrap();
    let cleared: Option<String> =
        sqlx::query_scalar("SELECT shelf_location_id FROM products WHERE id='reg-product'")
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!(cleared, None);
    for kind in [Kind::Category, Kind::Manufacturer] {
        let id = if matches!(kind, Kind::Category) {
            &category
        } else {
            &company
        };
        let row = list(&p, ADMIN, kind)
            .await
            .unwrap()
            .into_iter()
            .find(|row| row.id == *id)
            .unwrap();
        assert_eq!(row.assigned_count, 1);
        save(&p, ADMIN, edit(kind, &row, &row.name, false))
            .await
            .unwrap();
        let still_linked: String = sqlx::query_scalar(&format!(
            "SELECT {} FROM products WHERE id='reg-product'",
            kind.column()
        ))
        .fetch_one(&p)
        .await
        .unwrap();
        assert_eq!(&still_linked, id);
    }
}
