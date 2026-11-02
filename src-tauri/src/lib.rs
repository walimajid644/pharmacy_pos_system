#[cfg(debug_assertions)]
use tauri::Manager;

mod database_api;
mod backups;
mod digital_receipts;
mod decisions;
mod purchase_orders;
mod sales;
mod commercial;
mod credit;
mod expiry;
mod recovery;
mod audit;
mod suggestions;
mod catalog;
mod controlled;
mod fbr;
mod shifts;
mod supplier_ledger;
mod submissions;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .manage(database_api::SessionState::default())
        .invoke_handler(tauri::generate_handler![
            database_api::login_user,
            database_api::change_password,
            database_api::logout_user,
            database_api::touch_session,
            database_api::database_select,
            database_api::database_execute,
            backups::create_backup,
            backups::backup_status,
            digital_receipts::open_whatsapp_receipt,
            sales::checkout_sale,
            credit::save_customer,
            credit::archive_customer,
            credit::customer_statement,
            audit::read_audit_log,
            controlled::controlled_sales_report,
            fbr::validate_fbr_sandbox,
            catalog::preview_catalog_import,
            catalog::import_catalog,
            catalog::bulk_update_catalog,
            suggestions::purchase_suggestions,
            recovery::saved_sale,
            recovery::cashier_performance,
            expiry::hold_batch,
            expiry::resolve_batch_hold,
            commercial::record_account_entry,
            commercial::void_account_entry,
            commercial::save_commercial_document,
            commercial::cancel_commercial_document,
            shifts::open_shift,
            shifts::close_shift,
            shifts::current_shift,
            supplier_ledger::record_supplier_payment,
            purchase_orders::save_purchase_order,
            purchase_orders::receive_purchase_order,
            purchase_orders::cancel_purchase_order,
            submissions::submit_stock_adjustment,
            submissions::submit_sales_return,
            decisions::decide_stock_adjustment,
            decisions::decide_sales_return,
            decisions::add_product_batch
        ])
        .setup(|app| {
            let pool = database_api::app_pool(app.handle()).map_err(std::io::Error::other)?;
            tauri::async_runtime::block_on(database_api::initialize(&pool))
                .map_err(std::io::Error::other)?;
            backups::start_daily(app.handle(), pool);
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
