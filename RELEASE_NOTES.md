# Release Notes

## 0.1.0 Release Candidate — November 1, 2026 (Current)

**Status**: ⚠️ Code complete, manual testing incomplete

### What's New (November 1, 2026)

#### POS Search Optimization
- **Instant barcode search**: Barcode patterns (6+ alphanumeric) bypass 150ms debounce (~50% faster)
- **Auto-highlight exact matches**: Barcode matches automatically highlighted in results
- **Fast-path Enter**: Highlighted results add immediately without additional search
- **Performance**: Barcode scan → cart reduced from ~300ms to ~150ms

#### Release Gate Documentation
- Complete R1-R7 test plans prepared (`RELEASE_GATE_STATUS.md`)
- Fresh DB E2E test checklist ready (20 checkpoints, `R2_FRESH_DB_E2E_TEST.md`)
- Print preview test plan (`PRINT_PREVIEW_TEST.md`)
- Catalog import test plan with 50-product realistic sample (`CATALOG_IMPORT_TEST.md`)
- FBR integration status updated with honest blockers (`FBR_INTEGRATION_STATUS.md`)

### Verification Status

#### Completed ✅
- **77 native Rust tests** passed (transactions, permissions, FEFO, migrations)
- **52 browser fixture scenarios** passed (UI flows, idle lock, logout edge cases)
- **Python smoke tests** passed (backup/restore, supplier DB, business day)
- **Frontend build**: TypeScript compilation, Vite production build
- **Tauri build**: NSIS installer created successfully
- **Dependency audit**: npm 0 vulnerabilities, RustSec reviewed (see `DEPENDENCY_AUDIT.md`)

#### NOT Completed ❌
- **Manual desktop E2E testing**: No signed-in workflow verification
- **Clean Windows install**: No clean machine available (R1 blocked)
- **Physical hardware**: Printer and scanner not tested (R4 blocked)
- **Real pharmacy data**: No actual product list imported (R5 blocked)
- **FBR production**: Sandbox spike only, no credentials tested (R6 blocked)

### Current Installer

**File**: `Pharmacy POS_0.1.0_x64-setup.exe`
- **SHA-256**: `651EDC117AC50F9272298FB4C22AC5C8093ADAE4413402AC5B21DC7D47672BB3`
- **Size**: 2,453,011 bytes (2.3 MB)
- **Type**: Unsigned NSIS x64
- **Build Date**: November 1, 2026
- **Status**: NOT tested on clean machine

⚠️ **Do not install on production machines until R1 clean install test passes.**

### Known Limitations

1. **No production FBR integration** - Sandbox validation spike only
2. **Urdu translation incomplete** - Primary screens done, ~70% complete
3. **No manual E2E verification** - Desktop workflows not tested end-to-end
4. **Unsigned installer** - Requires manual security exception
5. **Single store only** - No multi-location support
6. **Windows only** - x64 desktop application
7. **Local database only** - No cloud sync

### Features Included

See [README.md](README.md) for complete feature list. Highlights:

- POS with instant barcode search, pack/loose sales, discounts, keyboard shortcuts
- Cash drawer shifts with blind close reconciliation
- Supplier payments with aging and vouchers
- Customer credit/Udhar with limits
- Sales returns with refund references
- Stock adjustments and expiry actions
- Controlled substance tracking with DRAP numbers
- Prescription fields (patient/doctor)
- Daily backups with 7-day retention
- Digital receipt SMS/WhatsApp drafts
- Invoice and thermal receipt printing
- Barcode label printing (75×35mm Code 39)
- Catalog import (CSV/XLSX)
- English/Urdu/Mixed localization
- Light/dark themes
- Comprehensive reports and audit log

### Next Steps (Before Production Use)

**Ready to Execute** (~11-13 hours):
- [ ] R2 - Fresh DB E2E testing (4-6h) - See `R2_FRESH_DB_E2E_TEST.md`
- [ ] R3 - Upgraded DB E2E testing (2-3h)
- [ ] R4 - Print preview testing (1h) - See `PRINT_PREVIEW_TEST.md`
- [ ] R5 - Catalog import testing (2h) - See `CATALOG_IMPORT_TEST.md`
- [ ] R7 - Final documentation review (2h)

**Blocked (Requires Resources)**:
- [ ] R1 - Clean Windows install test (needs clean PC/VM)
- [ ] R4 - Physical printer/scanner test (needs hardware)
- [ ] R5 - Real pharmacy data import (needs product list)
- [ ] R6 - FBR production integration (needs credentials, 11-17 days engineering)

See [RELEASE_GATE_STATUS.md](RELEASE_GATE_STATUS.md) for detailed R1-R7 tracking.

---

## 0.1.0 Phase 3 Catalog/Controlled-Sale Candidate — November 1, 2026

(Previous release notes preserved for history)

### Phase 3 Features

- CSV/Excel `.xlsx` catalog onboarding with blank template, worksheet choice, quoted UTF-8/Urdu values, protected text identifiers, row errors/warnings, lookup-name opt-in and explicit review. New-SKU imports and optional opening batches/movements commit together with an immutable retry journal and audit entry. Existing/archived SKU or barcode conflicts cannot silently overwrite data.
- Reviewed bulk category/reorder/unused-pack setup with selected revisions, all-or-nothing writes, stock/history guards and audit details. POS generic-name search is enabled; report CSV quoting neutralizes spreadsheet formulas.
- Controlled checkout requires both patient+doctor names or a dedicated prescription note/reference in Vue and Rust. New sales freeze controlled classification/DRAP with saved invoice data. The admin/manager/accountant report and receipt paths use snapshots; legacy classification is explicitly marked.
- Raw prescription tables/import journal are protected from cashier SQL reads; cashier dashboard/commercial references use a summary view and own-sale recovery keeps its ownership check.
- FBR is required but onboarding route remains unknown. Implemented an admin/manager DI sandbox validation **spike only**, using the fixed official HTTPS validation method, native TLS, no redirects, time/size limits, explicit route/synthetic-data acknowledgement and a memory-only token. No real FBR API test was performed. Production posting, applicable route adaptation, tax mapping, reconciliation and official acceptance are not complete; see [FBR_INTEGRATION_STATUS.md](FBR_INTEGRATION_STATUS.md).
- Verification: **77 native tests and 52 browser scenarios passed**, plus parser tests using actual synthetic `.xlsx`/UTF-8 CSV, real SQLite/upgrade/report checks, cart, day and saved-receipt smoke tests. Production frontend, optimized executable and NSIS installer builds passed. The browser FBR command is mocked and no real token was used.
- Real pharmacy sample import, onboarding-speed benchmark, signed-in native desktop, clean Windows and intended printer/scanner acceptance remain open. No verified starter medicine database, statutory narcotics register, DRAP verification or production FBR-compliance claim is included. Dependency findings are recorded in DEPENDENCY_AUDIT.md.

Current Phase 3 NSIS x64 installer: `Pharmacy POS_0.1.0_x64-setup.exe`, 2,453,011 bytes. SHA-256: `651EDC117AC50F9272298FB4C22AC5C8093ADAE4413402AC5B21DC7D47672BB3`. The candidate remains unsigned; no installation or FBR acceptance was performed by the build.

## 0.1.0 Phase 2 completion candidate — November 1, 2026

- Customer list badges distinguish outstanding debt, over-limit debt, account credit and settled accounts in English/Urdu/mixed and light/dark.
- Customer statements discard prior data/actions when selection changes. Failed/stale responses cannot print or collect against the wrong customer; collection uses the loaded customer and is disabled for zero/credit balances.
- Near-expiry reports retain held-only batches, show separate outside/held counts, use local calendar-day expiry differences and include held quantities in current retail value. Admin/managers can open exact batch actions; accountants remain read-only.
- Product batch rows link to their exact expiry/quarantine workspace. The workspace follows the pharmacy's configured warning period and shows expired/near-expiry and quarantine states separately. Existing adjustment approvals and quarantine resolutions still control stock writes.
- No schema changes or new stock/balance mutation paths. Native regression suite: **63 passed**. Browser suites: **42 scenarios passed**, including ten new Phase 2 scenarios for statements, printing/collection, expiry links, roles, settings and cashier report usability. Real SQLite report/valuation/upgrade checks and frontend build pass.
- Signed-in native desktop, clean Windows, printer/scanner and live-store acceptance remain open. Browser fixtures use mocked Tauri commands and are not native E2E evidence. See SINGLE_STORE_90_DAY_PLAN.md and RELEASE_GATE_WALKTHROUGH.md.

Phase 2 executable and NSIS installer builds passed. Installer: `Pharmacy POS_0.1.0_x64-setup.exe`, 2,235,064 bytes; SHA-256: `913233F8CE33886709C0875A6187E97056F2B80F2981997F6787A4B4A2698720`. The candidate remains unsigned and was not installed by this test run.

## 0.1.0 verification candidate — November 1, 2026

Phase 1 of the 90-day single-store plan is in progress. This candidate is **not accepted for live pharmacy use**; clean Windows, signed-in native desktop and hardware acceptance remain open.

### Changes and evidence

- Five-minute lock now clears local authentication, cart and pending purchase draft immediately. Sign-in appears even if native logout fails or stalls.
- Immediate barcode input and its following Enter share one in-flight bounded product/batch lookup. Delayed repeated Enter adds once; Escape prevents stale results from adding, and failures leave the cart unchanged with an error.
- Added a native counter-day test on fresh and populated pre-inventory databases. It verifies first-password gating, additive migration/restart, PO receiving, pack/loose sale with strip confirmation, insufficient confirmation rollback, supplier payment/voucher/overpayment, expense, approved return/adjustment, movement totals, blind cash close, closed-drawer void rejection, audit events, actual Daily Closing/Reports SQL and native snapshot/restore.
- Native suite: **63 tests passed**. Browser suites: **32 scenarios passed** (11 counter polish, 7 credit/expiry/recovery, 6 pricing/suggestions/audit, 8 idle/search cases). Browser suites use real Vue screens and stores with mocked Tauri commands; they do not establish native desktop E2E acceptance.
- Production TypeScript/Vite build, inventory triggers, commercial SQL/upgrade/valuation, cart, local-day and saved receipt text checks passed.
- Existing feature-expansion phases remain included: shared operational workspace modals, Udhar ledger, expiry/quarantine, cashier performance, saved last-sale receipts, retail/wholesale pricing, reviewed purchase suggestions and read-only audit log. See PHARMACY_OPERATIONS.md for behavior and limitations.

Windows NSIS installer built successfully: `Pharmacy POS_0.1.0_x64-setup.exe`, 2,234,283 bytes. SHA-256: `CA1BDF6EE99ABAD51BD8ECF54625ACB9D66B5F3C3B7A8B59A2312D2E940737E1`. The candidate remains unsigned; building the package does not prove clean installation.

### Remaining acceptance

The user has the development PC only. A clean PC/VM without developer tools and the intended receipt/label printers and scanner were not available. Desktop automation initialization failed with “failed to write kernel assets: The system cannot find the path specified.” No signed-in native desktop result is claimed from this increment. Installer hash/size are recorded in CLEAN_INSTALL_TEST.md and `test-results/release-gate/artifacts.json` after bundling.

Use [SINGLE_STORE_90_DAY_PLAN.md](SINGLE_STORE_90_DAY_PLAN.md) for scope/status and [RELEASE_GATE_WALKTHROUGH.md](RELEASE_GATE_WALKTHROUGH.md) for the remaining manual gate. No catalog-import, controlled-drug enforcement/report or FBR feature work is started under this plan.

## 0.1.0 release candidate — rebuilt October 29, 2026

This is a Windows desktop candidate for verification, not an approved live-pharmacy release.

### Included

- POS sales with batch-aware stock deduction, pack/loose quantities, discounts, customer selection, and invoice/receipt printing.
- Product, customer, supplier, purchase order, stock adjustment, sales return, daily closing, reports, settings, and user screens.
- Dashboard totals and inventory alerts based on stored data.
- Role checks for sensitive inventory and refund actions, with backend transaction tests.
- First-login password change for the initial administrator.
- A fresh database now starts without demonstration products or customers.
- NSIS installer configuration and Pharmacy POS application icon.
- Five-minute inactivity lock enforced in the desktop UI and Rust session; the unsaved POS cart is cleared on logout.
- Bcrypt cost 12 for new passwords, with cost-10 hashes upgraded after successful login.
- Settings-driven expiry warnings and receipt header/footer/DRAP printing for controlled products.
- Confirmation before soft-deleting a customer.
- Additive upgrade for older databases missing receipt and expiry settings columns.
- Cashier shift opening and blind close reconciliation; cash sales and refunds are associated with a drawer shift.
- Confirmed loose-strip opening, strict FEFO batch choice, and an audit record for each broken strip decision.
- Optional patient and prescribing doctor fields saved with sales and shown on printed receipts.
- Supplier payments against received purchase orders, due-date aging, and printable payment vouchers.
- Automatic daily SQLite snapshots retained for seven days, with optional manager export to an existing local or USB folder.
- Copyable SMS receipt summaries and an optional WhatsApp draft link for a saved customer phone number. No SMS is sent by the app.
- Dashboard active-customer count, sales comparison with yesterday, and role-aware quick actions.
- POS desktop layout redesigned around a compact entry strip, sticky sale table, summary bar, and right payment dock. Its existing checkout and keyboard handlers remain in place.
- Login uses a compact two-column desktop layout so the sign-in controls fit the minimum Windows window height. Sales, Products, and Purchases open in individual route-driven dialogs over Dashboard.

The candidate installer is unsigned. Windows may show a publisher warning; code signing is required before broad distribution.

Candidate installer: `Pharmacy POS_0.1.0_x64-setup.exe` (2,114,452 bytes). SHA-256: `4DBEB5C78540EEC9EA82B40800F7B52B927A1522A705B0CB65F5ABE9D54D6CBC`.

### Verification completed

- Frontend TypeScript and production build.
- All 33 Rust library tests, the frontend production build, and NSIS bundling passed on October 29, including shift reconciliation, supplier overpayment rejection, confirmed FEFO strip opening, and SQLite snapshot reopening.
- Database migration, inventory trigger, business-day, and isolated backup/restore checks recorded in [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md).
- npm advisory audit after dependency updates: no reported vulnerabilities as of October 27, 2026.
- RustSec lockfile findings reviewed for this Windows target; see [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md) for the unresolved, non-applicable optional MySQL advisory.

### Still required before live use

- Signed-in, end-to-end checks on a fresh and an upgraded database.
- English, Urdu, mixed-mode, light/dark, keyboard, window-size, and printer checks.
- Installation and operation on a clean Windows machine without development tools.
- Confirmed backup ownership and recovery drill at the pharmacy.
- Signed-in checks of the new shift, supplier ledger, digital receipt, Rx receipt, and backup screens on both fresh and upgraded databases.

See [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md) for the full release gate and [PHARMACY_OPERATIONS.md](PHARMACY_OPERATIONS.md) for staff procedures.
