# Pharmacy POS — operations guide

This guide covers the Windows desktop application. Check [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md) for the live-trial release gate and [SETUP.md](SETUP.md) for developer installation. Browser previews do not have access to the desktop database.

## Installation and first setup

Use the Windows setup executable under `src-tauri/target/release/bundle/nsis/` when a current installer has been built. A direct executable build is under `src-tauri/target/release/pharmacy-pos.exe`. Windows requires the WebView2 runtime. Use a display/window of at least 1024 × 600.

On a new database, sign in as `admin` with the initial password `admin123`. The application requires a password change before normal operation. Create individual staff accounts and assign only the required roles; do not share the administrator account. Fresh databases contain no demo products or customers. Existing databases receive additive migrations when opened; preserve a backup before upgrading.

In **General Settings**, enter the pharmacy name, contact details, receipt information, tax and expiry settings. Select the preferred light/dark theme, English/Urdu/mixed language, date format and number style. Appearance preferences apply immediately on this desktop. Review the pharmacy's tax, discount and refund practices before entering live records.

Create suppliers, product categories/manufacturers as needed, and products with unique SKUs/barcodes. Check base-unit prices, pack size, loose-sale permission, reorder level and expiry information. Stock is batch-based: receive purchase orders or use the manager-controlled batch workflow to record actual quantities. Do not fabricate a purchase receipt to correct stock; use Stock Adjustments with a reason and approval.

## Navigation and access

Operational screens open as desktop workspaces over the dashboard. Close the workspace to return. Sales, Products, Purchases and commercial tools share compact headers and independently scrolling tables. The main menus expose actions appropriate to the signed-in role.

- **Admin/manager**: products, suppliers, purchasing, stock decisions, refunds, backups and management tools. User administration is admin-only.
- **Cashier**: sales, customer contact records, own drawer, estimates/pre-orders and customer statements. Cashiers cannot grant/increase customer credit limits or approve stock/refund decisions.
- **Accountant**: reports, sales history, customer statements, payments and expenses. Purchasing, audit and stock decisions remain admin/manager operations.

See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for the shortcut card. In Sales, scan/type an item and use Enter to add the highlighted pack; Shift+Enter adds loose units where allowed. Arrow keys select search results. F8/F9/F10 select cash/card/mobile, and Ctrl+Enter completes a valid sale. Always review the selected customer, quantities and final amount before completion.

## Sales, inventory and returns

Open a cash drawer shift before checkout. Select an active registered customer or leave the transaction as walk-in. Pack quantities multiply by the saved pack size; loose quantities use base units. Bonus quantities consume stock without increasing charged quantity. Line discounts and invoice discounts are distinct, and the displayed final totals are checked again by native checkout.

Sales consume unexpired available batches in expiry order. Loose-strip opening requires confirmation when applicable. Stock, invoice lines and stock movements commit together; insufficient stock or stale totals leave no partial invoice. Optional patient/doctor names and remarks are saved with the sale. The pharmacy remains responsible for clinical and prescription checks outside this inventory workflow.

Use Sales History for saved invoices, A4 invoices and 80 mm receipts. The Windows print dialog selects the actual printer. Product labels use the supported barcode format and a 75 × 35 mm layout. Verify physical printer alignment and scanner readability on the intended equipment before live use.

Sales Returns link to the original invoice and its saved charged prices. Submit the return for approval, then complete the approved refund with its payment method/reference and optional restock decision. Partial refunds allocate original tax and invoice discounts proportionally with cumulative rounding. Returned units cannot exceed the original sale. A refunded record retains a stable refund reference and printable return receipt/credit note. Use Stock Adjustments for documented stock corrections; submitting a request alone does not change available stock.

## Cash drawer and supplier payments

Each cashier opens a shift in **Cash Drawer** with the starting cash before making a sale. At handover, count the cash without seeing the expected value, enter it, and close the shift. The app then shows expected cash and the difference. A manager can close a cashier's open shift. Cash refunds and cash supplier payments are included in the current drawer reconciliation. Keep the closed shift history for review.

**Daily Closing** summarizes sales tenders for the calendar day. Its cash sales figure does not include opening float, cash refunds, or cash supplier payouts; use the Cash Drawer shift record for physical cash reconciliation. Review both before signing off a day.

In **Supplier Ledger**, record payments only against received purchase orders. The app limits payment to the value received and still unpaid, calculates due dates from supplier payment terms, and creates a printable voucher. Check bank and mobile transfer references against external statements; the app does not initiate those transfers.

## Payments, expenses, estimates and customer pre-orders

- **Accounts → Payments & Receipts** shows customer collections, supplier payments, sales payments and completed refunds. Use **Collect customer balance** for existing customer debt. Use **Pay supplier** for purchase-order payments. Cash movements require an open drawer. A repeated receipt request cannot collect twice.
- **Accounts → Expenses** records dated, categorized expenses paid by cash, bank or mobile. Use **Void**, with a reason, to correct a saved entry; the original record remains in the history. Cash entries cannot be voided after their drawer is closed. Cash entries are reconciled against the currently open drawer, even when the entered business date is earlier.
- **Transactions → Estimates** creates and prints item quotations with an optional validity date. **Transactions → Customer Pre-orders** records requested quantities and an optional expected date for registered customers. Quantities are in base units; products that cannot be sold loose require whole pack multiples. Documents do not reserve stock or collect deposits. Quoted subtotals exclude checkout tax and discounts.
- **Load into Sales** fills the cart using current product prices and unexpired stock in expiry order. Review prices, tax, discounts and payment before checkout. Unavailable stock blocks fulfilment. An expired estimate must be updated before conversion. A successful checkout links the invoice and marks the source document converted in the same transaction. Cancelled or already converted documents cannot be fulfilled again.
- **Register → Advanced Item Search** combines name, generic, SKU, barcode and DRAP searches with category, manufacturer, price, status, controlled-product, stock and expiry filters. Available stock excludes expired batches. Batch details show all recorded batches. Search results are paged in groups of 100. This is an inventory search, not a clinical advice service.

## Phase 1 — polish and hardening

- Dashboard quick actions open New Sale, a receivable-only PO register, Daily Closing and Cash Drawer & Shifts. Low-stock figures exclude expired stock.
- At 1024×600, the sale table scrolls separately, payment details scroll inside the dock, and payment shortcuts plus Complete Sale stay visible. Enter adds the highlighted search result, including when pressed before the debounce finishes.
- A source-document banner shows its number and current-price/tax notice, price-change count and a detach action. Loading errors stay visible with a link back to the document register. Shortages list available/requested units before replacing the cart.
- Commercial edit, batch-detail and expense-void dialogs keep Tab within the dialog. Escape closes the active inner dialog and returns focus to its trigger; an in-progress save cannot be dismissed.
- A closed-drawer cash voucher cannot be voided. The dialog explains the rule and directs staff to a manager/accountant for a current-period correction. Supplier overpayment errors show the attempted and outstanding amounts.
- Primary commercial controls support English, Urdu and mixed labels. Fonts use local/system fallbacks; core screens do not request remote Google Fonts.

## Phase 2 — customer credit, recovery, expiry and cashier reporting

November 1 completion pass: customer rows now label outstanding debt, over-limit debt, account credit and settled balances. Changing the statement customer clears the prior result and disables print/collection until the selected customer loads successfully; delayed results for older selections are ignored. There is no collect-debt action when the loaded customer owes nothing.

**Reports → Near Expiry** includes batches whose remaining physical stock is entirely quarantined, with outside-quarantine and held counts shown separately. Its current retail value includes held units. Manager/admin batch-action links and Product Batch Management row actions select the exact batch in Expiry & Quarantine. Accountants can read the report and must ask a manager for stock actions. The expiry workspace follows the configured warning period and uses local calendar days; expired status and quarantined status are independently shown. Held-only quantities cannot be submitted through an available-stock adjustment; resolve their hold through Quarantine audit.

- **Customers → Edit**: managers set the credit limit. Cashiers may create/edit contact records but cannot grant or raise credit. New customers start with zero balance; balance and limit writes cannot use the generic SQL gateway.
- **POS → Credit / Udhar**: select an active registered customer. The account balance plus the final invoice amount, including tax/discounts, must fit the credit limit. Walk-in credit is blocked. Checkout records zero cash received, updates the customer balance and ledger in the same transaction as invoice/stock changes, and keeps existing shift and FEFO checks.
- **Accounts → Customer Udhar Ledger**: saved debits, collections, voids and credit notes, printable statements and current FIFO aging (0–29 / 30–59 / 60–89 / 90+ days). Existing balances are preserved as opening balances with unknown age. Date filters affect the statement, not current aging. The statement reads balance and movements from one database snapshot.
- **Accounts → Payments & Receipts**: collect against outstanding customer balance. Receipts remain idempotent; voids restore ledger/debt once. Inactive customers can settle existing debt; accounts with a non-zero balance cannot be archived. Credit invoices are not counted as collected sale payments.
- **Credit-sale returns** must use a credit note, rather than paying cash that may not have been collected. A completed credit note reduces account balance atomically with the refund/restock decision; a negative balance is credit owed to the customer. A credit note requires a registered customer.
- **POS → Reprint last** recovers the current cashier's last completed invoice after restarting or clearing the cart. Reprint, Copy SMS receipt and WhatsApp draft use saved invoice amounts and snapshots, never the live cart. A cashier may recover only their own sales; managers/accountants retain existing history access. Copying text or opening a WhatsApp draft does not automatically send a message. WhatsApp requires the user's normal connection; core checkout and printing remain offline.
- New invoices freeze customer/cashier names, customer phone, product name and batch number. Older invoices freeze the best available current names/contact details on upgrade; their original stored prices/totals remain unchanged. Long digital receipts use a bounded saved-data summary, retaining invoice number and monetary totals.
- **Transactions → Expiry & Quarantine**, also linked from near-expiry dashboard rows and Batch Management: a manager may place units on an immediate safety hold. Held units are excluded from stock available to POS, remain physically tracked and remain included in stock valuation.
- Quarantine audit shows who placed/resolved each hold. Release requires an active, unexpired item. Destruction/write-off and confirmed supplier return resolve held quantity without decrementing available stock a second time. These resolutions do not create supplier financial credits automatically. Enter the inspection/destruction/return reference in resolution notes.
- Write-off/return of units outside quarantine opens the existing **Stock Adjustments** form with batch/reason selected; approval rules still apply.
- **Reports → Cashier Performance** (admin/manager/accountant): local business-day ranges; invoiced sales and gross payment mix include credit separately. Refunds are assigned to the original cashier using their completed-refund date. Net sales = period invoiced value minus period refunds; average bill = invoiced value / invoice count. Return rate is the share of period invoices with a completed refund by the end of the period. Returns may relate to older sales, so period net sales can be negative.

## Phase 3 — wholesale pricing, purchase suggestions and audit log

- **Products → Add/Edit**: retail unit price remains the existing price. Set an optional wholesale unit price for wholesale customers; blank uses retail. An explicit zero is a zero price. Prices are per base unit; packs multiply by pack size.
- **Sales**: selecting a customer applies their retail/wholesale type to the whole cart immediately. Walk-in uses retail. The visible price badge identifies the mode. Discounts/tax use that price, and native checkout verifies current customer type and prices before saving. A changed price blocks stale totals so staff can reload/review. Saved invoice lines retain the charged price after catalog edits. Estimates/pre-orders load current customer-specific prices; review the price-change notice before checkout.
- **Transactions → Purchase Suggestions** (admin/manager), also linked from Purchases: calculate demand over completed local business days; today is excluded. Free stock units count in demand. Choose coverage and lead-time days. Target is the larger of reorder level and rounded-up demand for coverage plus lead time. Subtract current unexpired, non-quarantined stock and outstanding sent/partial PO quantities, then round the shortage up to whole packs. Draft POs do not count as incoming stock. Returns affect current stock; they do not erase historical demand.
- Suggestions are ordered by stock-out, reorder threshold, lead-time risk and coverage gap. The previous received supplier is a reference. Review quantities and select a supplier before opening the **unsaved draft editor**, up to 100 lines. Review unit costs and open orders there, then explicitly save/send using the normal PO workflow. Suggestions never order, receive or pay automatically. Closing an unsaved editor loses that draft.
- **Admin → Audit Log** (admin/manager): read-only history with local date, action and user filters, in pages of 100. Records include stock-adjustment and return decisions, actual refund operator, expense voids, customer credit limits and ledger movements, shift opening/closing, supplier payments and quarantine decisions. New events commit in the same transaction as their action; failed operations leave no audit entry. Audit rows cannot be edited/deleted through the app or generic SQL gateway.
- Upgrade history is marked **Imported history**. It reflects available final records; earlier unknown transitions, missing actors and historical customer-limit changes cannot be reconstructed. Pre-upgrade completed returns show an unknown refund operator instead of attributing the refund to the earlier approver. This operational log is not tamper-proof against someone with direct database-file access.

## Database, backup and restore

Before using the new onboarding/controlled-sale workflows, follow the Phase 3 instructions below and preserve an off-device backup before upgrading.

The desktop SQL plugin stores `pharmacy.db` in the application's Windows configuration directory, normally `%APPDATA%\com.pharmacypos.app\pharmacy.db`. Windows can hide AppData; enter the path in File Explorer. Development and installed builds using the same application identifier may access the same user data. Keep a backup before testing an upgrade against an existing installation.

The application creates consistent daily SQLite snapshots in its application-data **Backups** folder and retains seven days of daily snapshots. **Backup** shows snapshot status and lets an admin/manager export to an existing folder, including an attached USB drive. Export a separate off-device copy and check that it exists; a snapshot on the same disk does not protect against disk failure. Do not manually copy an open SQLite database as a substitute for a consistent snapshot.

Restore is a controlled manual recovery, not a merge:

1. Close every Pharmacy POS instance and preserve a dated copy of the current database and any associated `-wal` / `-shm` files.
2. Select a known readable SQLite snapshot and record its date. Keep the original backup unchanged.
3. With the app fully closed, replace the database with a copy of that snapshot. Move old associated WAL/SHM files aside with the preserved original so they cannot be replayed against the restored file. Use the actual configured database directory if Windows has redirected it.
4. Start the app and check sign-in, recent invoices, products and stock totals. Record the backup date and what was recovered.

Restoring an older backup discards transactions after that backup. Do not mix the main database file from one backup with WAL files from another. If uncertain, stop and get technical support before replacing files.

## Support

Record the app version, Windows version, screen, exact error text and last action. Close the app and preserve a dated copy of the database before troubleshooting data issues. Do not send passwords or the database over an untrusted channel. The project has no configured support contact; the pharmacy should name its local technical maintainer and secure backup owner before deployment.

For installation failures, check WebView2 and installer access to its bootstrapper. For workflow errors, compare [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md) and provide the details above to the maintainer. Do not delete the database as a repair step. Receipt and label printing use the Windows print dialog; test the intended printers and barcode scanner before live transactions.

## Phase 3 — catalog onboarding and controlled sales

- **Register → Catalog Import**, also linked from Products: download the blank CSV template, enter UTF-8 CSV or Excel `.xlsx`, select a worksheet if needed and validate. Files stay local. Limits are 5 MB, 5000 data rows and 25 MB expanded workbook data. Older `.xls`, formulas, numeric Excel SKU/barcode cells and malformed values are rejected. Format SKU/barcode as Text before entering them so leading zeros survive.
- Required columns are `sku,name,unit_price,cost_price`; the template lists optional generic, barcode, category, manufacturer, wholesale, pack/loose, reorder, controlled/DRAP and opening-batch fields. Prices/costs are per base unit, with at most two decimals. Blank wholesale price falls back to retail; explicit zero remains zero.
- Imports create new products only. Existing/archived SKUs, conflicting barcodes and ambiguous/inactive lookup names are errors. Creating missing category/manufacturer names requires an explicit opt-in. For multiple opening batches, repeat identical product details and use distinct batch numbers. To import no stock, leave every batch column blank.
- Opening quantities are base units, not packs. Pack-only products require pack multiples. Partial loose opening stock is initialized as open units. Imported expired stock is warned about and cannot be sold; it is not silently destroyed or quarantined. Imported opening stock creates movements and an audit record, not a supplier PO/bill, cash entry or payment. Use the normal purchase flow for goods that should accrue supplier debt.
- Review row errors/warnings, unit prices, quantities, dates and new names, then acknowledge and confirm. The complete payload is validated again at commit; any failure rolls back products, lookups, batches, movements and journal/audit together. Retrying the same operation ID cannot duplicate stock. If the app restarts before the response is seen, check Products/Audit Log before starting another import; the new-SKU conflict rule also prevents re-importing those SKUs as new stock.
- **Register → Bulk Catalog Setup** changes selected products only, up to 500 per review. Blank reorder/pack fields keep current values; category can be retained, cleared or explicitly selected. Pack changes require unused products with no batches or transaction history. Any stale product revision or invalid selected product blocks the whole change; reload and review. These helpers do not edit prices or stock.
- **Controlled sales:** mark products correctly in the catalog. POS requires both patient and prescribing doctor, or a separate prescription note/reference, before checkout. Generic sale remarks do not satisfy that rule. Native checkout enforces it even when a product becomes controlled after the cart was loaded. New invoice lines freeze controlled status and recorded DRAP number; later catalog edits do not rewrite them.
- **Reports → Controlled Sales** (admin/manager/accountant) shows saved cashier/time, product/batch/DRAP, prescription evidence and base stock units including bonus units, in pages of 100. Original sale facts remain; returns are separate records. This lightweight operational report is not a certified narcotics register or clinical validation system. Imported classification reflects the catalog at upgrade and is labeled; missing historic prescriptions remain missing.
- Saved-sale reprint and Sales History use saved classification/DRAP, with the configured DRAP receipt setting. The number is recorded catalog data, not verification with DRAP. Test physical receipt layout. Cashiers retain own-sale recovery; raw prescription-table/import-journal reads are blocked, while the dashboard uses summary data.
- **Admin → FBR DI Sandbox Check** is a sandbox validation spike only. Confirm the portal's actual route, enter only a sandbox token locally and use assigned synthetic JSON. Credentials are cleared after each attempt and on exit. No invoices are posted, no local sales are automatically sent and production is not connected. See [FBR_INTEGRATION_STATUS.md](FBR_INTEGRATION_STATUS.md) for required next steps and official references.

Phase 3 verification adds `node --experimental-strip-types tests/catalog_file_smoke.mjs` and, against local Vite, `node tests/single_store_phase3_ui_smoke.mjs`. The current totals are 77 native tests and 52 browser scenarios. Fixtures use synthetic data and mocked FBR commands, not the live tax API or real pharmacy database.

## Developer verification

For the November 1 single-store release-gate increment, see [SINGLE_STORE_90_DAY_PLAN.md](SINGLE_STORE_90_DAY_PLAN.md) and [RELEASE_GATE_WALKTHROUGH.md](RELEASE_GATE_WALKTHROUGH.md). That earlier increment recorded 63 passing native tests, including an integrated fresh/upgrade counter day and restore; eight additional browser scenarios cover five-minute idle lock and delayed/failed scanner searches. Local drafts are cleared before native logout responds. These checks do not close clean Windows, signed-in native desktop or physical-hardware acceptance.

Run `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features` for native transaction and authorization tests, and `python tests/commercial_operations_smoke.py` for real SQLite/UI-query checks including a populated Phase 2 upgrade. Run the Node smoke scripts `tests/pos_cart_smoke.mjs`, `tests/business_day_smoke.mjs` and `tests/saved_sale_smoke.mjs` with `node --experimental-strip-types`.

Start Vite on `127.0.0.1:1422`, then run `node tests/phase1_ui_smoke.mjs`, `node tests/phase2_ui_smoke.mjs` and `node tests/phase3_ui_smoke.mjs` with permission to launch isolated headless Edge. These mount real Vue screens using mocked Tauri commands and never open the live database. Screenshots/results are written under `test-results/phase1/`, `phase2/` and `phase3/`. The earlier feature-expansion Phase 3 recorded 62 Rust tests and 24 browser scenarios. The current single-store Phase 3 totals are 77 native tests and 52 browser scenarios across six suites; include tests/release_gate_ui_smoke.mjs, tests/single_store_phase2_ui_smoke.mjs and tests/single_store_phase3_ui_smoke.mjs in the current run. Physical hardware and signed-in desktop tests remain distinct from these isolated checks.
