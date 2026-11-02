# Single-store 90-day plan — execution status

Updated: November 1, 2026. The user authorized advancing through the Phase 2 completion pass and now **Phase 3**. The user also confirmed FBR integration is required, but its onboarding route is not yet known. Implementation progress does not close the desktop or fiscal acceptance gates.

## Phase 1 — reliability and daily counter parity

| Requirement | Evidence / status |
| --- | --- |
| Current frontend, native tests and Windows installer | Build/test results recorded in RELEASE_NOTES.md and test-results/release-gate/ |
| Fresh and upgraded database counter-day integrity | Native cross-module test covers both, including restart and native snapshot/restore; not desktop UI acceptance |
| First admin password change | Native authentication gate and password change tested; desktop first-run check pending |
| Receiving, sale pack/loose/strip confirm, return, adjustment, supplier cash payment and blind closing | Integrated native workflow and individual regression tests; signed-in desktop walkthrough pending |
| Daily Closing / Reports | Actual view SQL checked against the counter-day fixture; signed-in desktop display/printing pending |
| Idle lock after five minutes | Real App.vue browser fixture verifies cleared cart/draft, login route, activity renewal, resumed click, failed/stalled native logout; native session expiry also has a separate Rust test |
| POS micro-polish and operational edge-case messages | Existing implementation retained; isolated browser regression evidence at 1024×600 |
| Clean Windows without developer tools | Pending: user has development PC only; no clean PC/VM available in this session |
| Signed-in native desktop E2E on fresh/upgraded data | Pending: computer-use runtime fails to initialize with “failed to write kernel assets”; browser fixtures are not a substitute |
| Receipt/label printers and barcode scanner | Pending: intended hardware unavailable |

**Release gate remains open. Phase 1 is not accepted for live operation.** The user authorized continuing the implementation sequence; clean Windows and hardware results have not been inferred from that authorization.

Use [CLEAN_INSTALL_TEST.md](CLEAN_INSTALL_TEST.md), [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md) and [RELEASE_GATE_WALKTHROUGH.md](RELEASE_GATE_WALKTHROUGH.md) for remaining acceptance. Record the tested installer hash and OS/environment with each manual run. Never run the disposable walkthrough against pharmacy records.

## Phase 2 — money control and expiry completion pass

| Area | Implementation / verification |
| --- | --- |
| Customer Udhar | Existing atomic sales, limits, receipts/voids, credit-note returns, printable statement and aging retained; relevant native regressions pass |
| Balance clarity | Customer badges distinguish debt, over-limit, account credit and settled balances; light/dark and bilingual labels |
| Correct statement customer | Selection clears old data/actions immediately; failed or out-of-order requests cannot restore an earlier customer. Print/collection use loaded customer; account credit has no debt-collection action |
| Expiry report actionability | Includes held-only batches, separate outside/held counts, current retail value including held stock and manager-only links to exact batch |
| Expiry warning setting | Workspace uses configured warning days and local calendar-day helpers; expired and quarantined badges remain independently visible |
| Batch navigation | Product batch rows open exact batch actions; existing approval/hold resolution rules retained |
| Cashier performance | Existing date ranges, roles, net/refund metrics and separate credit mix verified; totals visible at 1024×600 |
| Data model | No schema changes and no new raw stock/balance writes |

Automated evidence: 63 native tests, 42 browser scenarios across five suites, real SQLite expiry/valuation checks and production build. Ten new scenarios are in `tests/single_store_phase2_ui_smoke.mjs`, with screenshots/results in `test-results/single-store-phase2/`. Native desktop and printer/scanner acceptance are still pending; Phase 2 is implemented, not signed off for live use.

## Phase 3 — onboarding, controlled sales and FBR spike

- Implemented CSV/Excel `.xlsx` onboarding with a downloadable template, worksheet choice, row validation, category/manufacturer opt-in, opening batches/movements, all-or-nothing native commit and an immutable idempotency journal. Imports create new SKUs only; existing or archived SKU/barcode conflicts cannot silently overwrite catalog data.
- Added reviewed bulk category/reorder/pack helpers. Updates require selected product revisions, and pack changes are blocked for products with batches or transaction history. Audit/journal records commit atomically. No new price/stock bulk-update path was introduced.
- POS searches generic names and enforces either both patient+doctor names or a dedicated prescription note/reference for controlled items, with native revalidation. Controlled classification and DRAP are frozen on new invoice lines; saved receipts and the role-restricted report use those snapshots.
- Prescription-table and catalog-journal SQL reads are restricted. Cashier dashboard/commercial references use a summary view; own saved-sale recovery retains its native ownership check. Imported historical classification is marked and missing historical prescription evidence is not invented.
- Existing wholesale pricing, purchase suggestions and sensitive-action audit remain implemented and under regression tests.
- **FBR:** a real DI sandbox validation connector is implemented as a spike, based on official material, with no production/post-invoice path. Route confirmation, credentials, real sandbox scenarios and production design/acceptance remain open. See [FBR_INTEGRATION_STATUS.md](FBR_INTEGRATION_STATUS.md).

Automated evidence: 77 native tests, 52 browser scenarios across six suites, parser tests using actual synthetic `.xlsx`/UTF-8 CSV and real SQLite checks. No real pharmacy import sample, live FBR request, clean Windows, signed-in native desktop or physical printer/scanner acceptance is claimed. No verified starter medicine database is bundled; a user-provided catalog pack can use the same reviewed import path. The under-one-day onboarding target is not yet benchmarked at a real shop.

## Reproducible automated checks

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features
python tests/commercial_operations_smoke.py
python tests/test_inventory_schema.py
node --experimental-strip-types tests/pos_cart_smoke.mjs
node --experimental-strip-types tests/business_day_smoke.mjs
node --experimental-strip-types tests/saved_sale_smoke.mjs
```

With local Vite on 127.0.0.1:1422, run `tests/phase1_ui_smoke.mjs`, `tests/phase2_ui_smoke.mjs`, `tests/phase3_ui_smoke.mjs` and `tests/release_gate_ui_smoke.mjs` with Node and permission to launch isolated headless Edge. The idle tests advance only the fixture's Date.now clock; production timeout remains five minutes. App.vue and auth/cart/draft stores are real, while Tauri commands are mocked. Native tests use synthetic temporary SQLite databases, never the installed database.

For the Phase 2 completion pass, also run `node tests/single_store_phase2_ui_smoke.mjs`. It covers the new balance, statement and expiry behaviors; screenshots/results are isolated from the earlier phase suites.

Build the current NSIS installer with `node node_modules/@tauri-apps/cli/tauri.js build`. Run `python tests/release_artifacts.py` afterward to record SHA-256 and sizes for the executable and installer.

Phase 3 adds `node --experimental-strip-types tests/catalog_file_smoke.mjs` and `node tests/single_store_phase3_ui_smoke.mjs`. Current executable/installer hashes and verification are in `test-results/single-store-phase3/`; see RELEASE_NOTES.md and CLEAN_INSTALL_TEST.md for tracked release metadata.
