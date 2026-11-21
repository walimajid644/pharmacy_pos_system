#[cfg(debug_assertions)]
use tauri::Manager;

mod audit;
mod backups;
mod catalog;
mod commands;
mod commercial;
mod controlled;
mod credit;
mod database_api;
mod decisions;
mod diagnostics;
mod digital_receipts;
mod expiry;
mod fbr;
mod models;
mod purchase_orders;
mod recovery;
mod registers;
mod sales;
mod shifts;
mod submissions;
mod suggestions;
mod supplier_ledger;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .manage(database_api::SessionState::default())
        .manage(diagnostics::Diagnostics::default())
        .invoke_handler(tauri::generate_handler![
            diagnostics::record_diagnostic,
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
            sales::next_invoice_number,
            credit::save_customer,
            credit::archive_customer,
            credit::customer_statement,
            audit::read_audit_log,
            controlled::controlled_sales_report,
            fbr::validate_fbr_sandbox,
            catalog::preview_catalog_import,
            catalog::import_catalog,
            catalog::bulk_update_catalog,
            registers::list_catalog_register,
            registers::save_catalog_register,
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
            decisions::add_product_batch,
            commands::purchase_receive_enhanced::receive_purchase_with_details,
            commands::purchase_receive_enhanced::get_next_purchase_invoice_number,
            commands::purchase_receive_enhanced::search_products_for_purchase
        ])
        .setup(|app| {
            diagnostics::install_panic_hook(app.handle().clone());
            let pool = database_api::app_pool(app.handle()).map_err(std::io::Error::other)?;
            tauri::async_runtime::block_on(database_api::initialize(&pool)).map_err(|error| {
                diagnostics::record(
                    app.handle(),
                    diagnostics::Event::StartupFailed,
                    diagnostics::Source::App,
                );
                std::io::Error::other(error)
            })?;
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
