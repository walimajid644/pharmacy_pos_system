//! Native cross-module release checks. These are not signed-in desktop UI evidence.
use super::*;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

fn request<T: DeserializeOwned>(value: Value) -> T {
    serde_json::from_value(value).unwrap()
}
async fn integer(pool: &Pool<Sqlite>, sql: &str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

#[tokio::test]
async fn release_gate_counter_day_on_fresh_and_upgraded_database() {
    for upgrade in [false, true] {
        let dir = std::env::temp_dir().join(format!("pharmacy-counter-gate-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("source.db");
        let options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true)
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options.clone())
            .await
            .unwrap();
        if upgrade {
            // A populated database from before inventory/commercial/credit migrations.
            sqlx::raw_sql(include_str!("../migrations/001_app_schema.sql"))
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO products(id,sku,name,unit_price,cost_price,created_at,updated_at) VALUES('legacy','LEGACY','Preserved catalog',12,5,'2025-01-01','2025-01-01')").execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,current_balance,created_at,updated_at) VALUES('legacy-client','LEGACY-C','Old','Customer','retail',125,'2025-01-01','2025-01-01')").execute(&pool).await.unwrap();
        }
        initialize(&pool).await.unwrap();
        initialize(&pool).await.unwrap();
        assert_eq!(
            integer(
                &pool,
                "SELECT COUNT(*) FROM schema_migrations WHERE version='012_pricing_and_audit'"
            )
            .await,
            1
        );
        assert_eq!(
            integer(&pool, "SELECT COUNT(*) FROM products").await,
            if upgrade { 1 } else { 0 }
        );
        if upgrade {
            assert_eq!(integer(&pool,"SELECT CAST(current_balance*100 AS INTEGER) FROM customers WHERE id='legacy-client'").await,12500);
            assert_eq!(integer(&pool,"SELECT amount_cents FROM customer_ledger WHERE customer_id='legacy-client' AND kind='opening'").await,12500);
        }

        let (user, login) = authenticate_user(&pool, "admin", "admin123")
            .await
            .unwrap()
            .unwrap();
        assert!(user.must_change_password);
        let session = SessionState(RwLock::new(Some(login)));
        assert!(current_actor(&session).await.is_err());
        change_user_password(&pool, &user.id, "admin123", "Synthetic counter test 2026")
            .await
            .unwrap();
        let (_, login) = authenticate_user(&pool, "admin", "Synthetic counter test 2026")
            .await
            .unwrap()
            .unwrap();
        *session.0.write().await = Some(login);
        let actor = current_actor(&session).await.unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let day = chrono::Local::now().format("%Y-%m-%d").to_string();
        let shift = crate::shifts::open(&pool, &actor, 10000).await.unwrap();
        assert!(crate::shifts::open(&pool, &actor, 0).await.is_err());
        sqlx::query("INSERT INTO suppliers(id,supplier_code,name,payment_terms,created_at,updated_at) VALUES('supplier','GATE-S','Synthetic supplier',30,?,?)").bind(&now).bind(&now).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO products(id,sku,name,barcode,unit_price,cost_price,pack_size,sell_by_loose_unit,created_at,updated_at) VALUES('medicine','GATE-M','Synthetic medicine','990000000001',10,5,10,1,?,?)").bind(&now).bind(&now).execute(&pool).await.unwrap();
        let po=serde_json::to_value(crate::purchase_orders::save_order(&pool,request(json!({
            "poId":null,"supplierId":"supplier","orderDate":day,"expectedDeliveryDate":null,
            "notes":"Synthetic counter day","discountAmount":0,"shippingCost":0,"status":"sent",
            "userId":actor,"timestamp":now,"items":[{"productId":"medicine","quantityOrdered":20,"unitCost":5,"taxRate":0,"discountPercent":0}]
        }))).await.unwrap()).unwrap();
        let po_id = po["id"].as_str().unwrap();
        let line: String = sqlx::query_scalar("SELECT id FROM purchase_order_items WHERE po_id=?")
            .bind(po_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        crate::purchase_orders::receive_order(&pool,request(json!({"poId":po_id,"userId":actor,"timestamp":now,"items":[{"poItemId":line,"quantity":20,"batchNumber":"GATE-B","expiryDate":"2099-12-31"}]}))).await.unwrap();
        let batch: String =
            sqlx::query_scalar("SELECT id FROM product_batches WHERE product_id='medicine'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            integer(
                &pool,
                "SELECT quantity_in_stock FROM product_batches WHERE product_id='medicine'"
            )
            .await,
            20
        );
        let mut sale = json!({"cashierId":actor,"customerId":null,"paymentMethod":"cash","receivedAmount":150,"orderDiscount":0,
            "expectedSubtotal":120,"expectedTaxAmount":0,"expectedNetAmount":120,"timestamp":now,
            "patientName":"Synthetic patient","doctorName":"Synthetic doctor","notes":"Gate sale",
            "items":[{"productId":"medicine","batchId":batch,"quantity":1,"isLooseSale":false,"discountPercent":0},
                     {"productId":"medicine","batchId":batch,"quantity":2,"isLooseSale":true,"discountPercent":0,"confirmBreak":false}]});
        assert!(crate::sales::record_sale(&pool, request(sale.clone()))
            .await
            .unwrap_err()
            .contains("Confirm the batch"));
        assert_eq!(
            integer(&pool, "SELECT COUNT(*) FROM sales_invoices").await,
            0
        );
        assert_eq!(
            integer(
                &pool,
                "SELECT quantity_in_stock FROM product_batches WHERE product_id='medicine'"
            )
            .await,
            20
        );
        sale["items"][1]["confirmBreak"] = json!(true);
        require_matching_actor(&session, &actor).await.unwrap();
        let receipt = serde_json::to_value(
            crate::sales::record_sale(&pool, request(sale))
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(receipt["netAmount"], 120.0);
        assert_eq!(receipt["changeAmount"], 30.0);
        assert_eq!(
            integer(
                &pool,
                "SELECT quantity_in_stock FROM product_batches WHERE product_id='medicine'"
            )
            .await,
            8
        );
        assert_eq!(
            integer(&pool, "SELECT COUNT(*) FROM loose_break_events").await,
            1
        );
        let payment=serde_json::to_value(crate::supplier_ledger::record(&pool,&actor,request(json!({"poId":po_id,"amountCents":4000,"method":"cash","reference":"GATE","notes":null}))).await.unwrap()).unwrap();
        assert_eq!(payment["balanceCents"], 6000);
        assert!(payment["voucherNumber"]
            .as_str()
            .unwrap()
            .starts_with("SP-"));
        let rejected=crate::supplier_ledger::record(&pool,&actor,request(json!({"poId":po_id,"amountCents":6001,"method":"cash","reference":null,"notes":null}))).await.err().unwrap();
        assert!(rejected.contains("60.01") && rejected.contains("60.00"));
        let expense = Uuid::new_v4().to_string();
        crate::commercial::record_entry(&pool,&actor,request(json!({"requestId":expense,"kind":"expense","customerId":null,"category":"Other","description":"Synthetic expense","amountCents":1000,"method":"cash","reference":"GATE","entryDate":day}))).await.unwrap();
        let invoice = receipt["invoiceId"].as_str().unwrap();
        let sold_line: String = sqlx::query_scalar(
            "SELECT id FROM sales_invoice_items WHERE invoice_id=? AND is_loose_sale=1",
        )
        .bind(invoice)
        .fetch_one(&pool)
        .await
        .unwrap();
        let returned=crate::submissions::submit_return(&pool,request(json!({"userId":actor,"timestamp":now,"invoiceId":invoice,"reason":"other","notes":"Synthetic return","refundMethod":"cash","items":[{"invoiceItemId":sold_line,"quantity":1,"restock":true}]}))).await.unwrap();
        for action in ["approved", "refunded"] {
            crate::decisions::decide_return(
                &pool,
                &actor,
                request(json!({"recordId":returned,"timestamp":now,"action":action})),
            )
            .await
            .unwrap();
        }
        let adjustment=crate::submissions::submit_adjustment(&pool,request(json!({"userId":actor,"timestamp":now,"adjustmentType":"decrease","reason":"damaged","notes":"Synthetic adjustment","items":[{"batchId":batch,"quantity":1}]}))).await.unwrap();
        crate::decisions::decide_adjustment(
            &pool,
            &actor,
            request(json!({"recordId":adjustment,"timestamp":now,"action":"approved"})),
        )
        .await
        .unwrap();
        assert_eq!(
            integer(
                &pool,
                "SELECT quantity_in_stock FROM product_batches WHERE product_id='medicine'"
            )
            .await,
            8
        );
        assert_eq!(
            integer(
                &pool,
                "SELECT SUM(quantity) FROM stock_movements WHERE product_id='medicine'"
            )
            .await,
            8
        );
        assert_eq!(integer(&pool,"SELECT COUNT(*) FROM cashier_shifts WHERE status='open' AND expected_cash_cents IS NULL").await,1);
        let closed = serde_json::to_value(
            crate::shifts::close(
                &pool,
                &actor,
                request(json!({"shiftId":shift,"countedCashCents":16000,"notes":"Blind count"})),
            )
            .await
            .unwrap(),
        )
        .unwrap();
        assert_eq!(closed["expectedCashCents"], 16000);
        assert_eq!(closed["varianceCents"], 0);
        assert!(
            crate::commercial::void_entry(&pool, &actor, &expense, "After closed shift")
                .await
                .unwrap_err()
                .contains("closed")
        );
        let date = chrono::Local::now().date_naive();
        let start = date
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_local_timezone(chrono::Local)
            .unwrap()
            .with_timezone(&chrono::Utc)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let end = (date + chrono::Duration::days(1))
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_local_timezone(chrono::Local)
            .unwrap()
            .with_timezone(&chrono::Utc)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        // Run the actual view SQL, not a parallel test-only report implementation.
        for (view, section) in [
            (
                include_str!("../../src/views/DailyClosingView.vue"),
                "async function loadTodaySales()",
            ),
            (
                include_str!("../../src/views/ReportsView.vue"),
                "async function generateDailySalesReport()",
            ),
        ] {
            let query = view
                .split(section)
                .nth(1)
                .unwrap()
                .split('`')
                .nth(1)
                .unwrap();
            let rows = select_safe(&pool, query.into(), vec![json!(start), json!(end)])
                .await
                .unwrap();
            assert_eq!(rows.len(), 1);
            assert_eq!(rows[0]["invoice_count"], 1);
            assert_eq!(rows[0]["total_sales"].as_f64(), Some(120.0));
        }
        execute_safe(&pool,&actor,"INSERT INTO daily_closing (id,closing_date,total_sales,total_cash,total_card,closed_by,closing_time,created_at,notes) VALUES(?,?,?,?,?,?,?,?,?)".into(),vec![json!(Uuid::new_v4().to_string()),json!(day),json!(120),json!(120),json!(0),json!(actor),json!(now),json!(now),json!("Gate close")]).await.unwrap();
        assert_eq!(
            integer(
                &pool,
                "SELECT COUNT(*) FROM audit_events WHERE event_type='supplier_payment'"
            )
            .await,
            1
        );
        assert_eq!(
            integer(
                &pool,
                "SELECT COUNT(*) FROM audit_events WHERE event_type='return_refunded'"
            )
            .await,
            1
        );
        assert_eq!(
            integer(
                &pool,
                "SELECT COUNT(*) FROM audit_events WHERE event_type='shift_close'"
            )
            .await,
            1
        );
        // Exercise native VACUUM snapshot; restore into a separate disposable file.
        let saved =
            serde_json::to_value(crate::backups::save(&pool, &dir, false).await.unwrap()).unwrap();
        sqlx::query("UPDATE products SET name='Post-backup change' WHERE id='medicine'")
            .execute(&pool)
            .await
            .unwrap();
        let restored = dir.join("restored.db");
        std::fs::copy(saved["path"].as_str().unwrap(), &restored).unwrap();
        pool.close().await;
        let restored_options = options.filename(&restored);
        let reopened = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(restored_options.clone())
            .await
            .unwrap();
        initialize(&reopened).await.unwrap();
        assert_eq!(
            integer(
                &reopened,
                "SELECT COUNT(*) FROM products WHERE name='Synthetic medicine'"
            )
            .await,
            1
        );
        assert_eq!(
            integer(&reopened, "SELECT COUNT(*) FROM sales_invoices").await,
            1
        );
        assert_eq!(
            integer(
                &reopened,
                "SELECT quantity_in_stock FROM product_batches WHERE product_id='medicine'"
            )
            .await,
            8
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
                .fetch_one(&reopened)
                .await
                .unwrap(),
            "ok"
        );
        assert!(sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&reopened)
            .await
            .unwrap()
            .is_empty());
        reopened.close().await;
        let again = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(restored_options)
            .await
            .unwrap();
        initialize(&again).await.unwrap();
        assert_eq!(
            integer(&again, "SELECT COUNT(*) FROM daily_closing").await,
            1
        );
        again.close().await;
        std::fs::remove_dir_all(dir).unwrap();
    }
}
