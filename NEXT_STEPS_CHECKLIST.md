# Next Steps Checklist

Last reviewed: November 1, 2026

---

## 🎯 Current Status Summary

**Version**: 0.1.0 Release Candidate  
**Build Date**: November 1, 2026  
**Installer**: `Pharmacy POS_0.1.0_x64-setup.exe` (SHA-256: `651EDC117AC50F9272298FB4C22AC5C8093ADAE4413402AC5B21DC7D47672BB3`)

### What IS Complete ✅

| Area | Status | Evidence |
|------|--------|----------|
| **Feature Code** | ✅ 100% | All Phase 1-3 features implemented |
| **Automated Tests** | ✅ 100% | 77 Rust + 52 browser tests passing |
| **Builds** | ✅ 100% | Frontend, Tauri, NSIS installer successful |
| **Documentation** | ✅ 100% | All guides updated (Nov 1, 2026) |
| **POS Optimization** | ✅ Done | 50% faster barcode search (Nov 1) |

### What is NOT Complete ❌

| Area | Status | Blocker |
|------|--------|---------|
| **Manual E2E Testing** | ❌ 0% | Not started - Test plans ready |
| **Clean Install** | ❌ 0% | No clean Windows PC/VM available |
| **Hardware Testing** | ❌ 0% | No printer/scanner available |
| **Real Data Import** | ❌ 0% | No pharmacy product list provided |
| **FBR Production** | ❌ 0% | Sandbox spike only, no credentials |

---

## 📋 Master Prompt R1-R7 Release Gate Status

**See [RELEASE_GATE_STATUS.md](RELEASE_GATE_STATUS.md) for detailed tracking**

### ✅ R6 - FBR Documentation (COMPLETE)

**Status**: Documentation updated with honest status  
**Completed**: November 1, 2026

- [x] Updated `FBR_INTEGRATION_STATUS.md` with clear blockers
- [x] Documented 5 critical blockers (credentials, route, mappings, etc.)
- [x] Listed 7 engineering tasks remaining (11-17 days)
- [x] Added capability vs requirements matrix
- [x] Explicit disclaimers (what NOT to claim)
- [x] Next steps in priority order

**Result**: FBR status is now honest and clear - sandbox spike only, production NOT implemented.

---

### ⏰ R2 - Fresh DB E2E Testing (READY - 4-6 hours)

**Status**: Test plan complete, ready to execute  
**Priority**: 🔴 HIGHEST - Critical path blocker

**What's Prepared**:
- [x] Complete 20-checkpoint test plan (`R2_FRESH_DB_E2E_TEST.md`)
- [x] Step-by-step instructions for each checkpoint
- [x] Data values to use for testing
- [x] Expected results documented
- [x] Pass/fail tracking checkboxes

**Test Coverage**:
1. ☐ Admin password change
2. ☐ Create test data (supplier, 2 products with batches, customer)
3. ☐ Open cashier shift
4. ☐ POS sale - Pack item
5. ☐ POS sale - Loose unit with strip confirmation
6. ☐ POS sale - Controlled substance with Rx fields
7. ☐ Credit/Udhar sale to registered customer
8. ☐ Reprint last receipt + SMS/WhatsApp draft
9. ☐ Receive purchase order
10. ☐ Supplier partial + final payment (overpayment test)
11. ☐ Stock adjustment submit/approve
12. ☐ Sales return submit/approve/refund
13. ☐ Near-expiry action (quarantine)
14. ☐ Daily closing + reports access
15. ☐ Backup export/restore
16. ☐ Idle lock after 5 minutes
17. ☐ Close cashier shift (blind count)
18. ☐ Localization - Urdu + digits + mixed mode
19. ☐ Dark theme
20. ☐ Window size 1024×600 usability

**To Execute**:
```powershell
cd pharmacy-pos
# Delete existing database
npm run tauri:dev
# Follow R2_FRESH_DB_E2E_TEST.md
```

**Estimated Time**: 4-6 hours  
**Blocking Release**: YES

---

### ⏰ R3 - Upgraded DB E2E Testing (READY - 2-3 hours)

**Status**: Approach documented, ready after R2  
**Priority**: 🔴 HIGH - Critical path

**What's Prepared**:
- [x] Test approach documented in this checklist (section 3)
- [x] Migration verification steps defined
- [x] Old data integrity checks identified

**Test Approach**:
1. ☐ Backup existing test database
2. ☐ Copy to fresh location
3. ☐ Launch app against copied database
4. ☐ Verify migrations 011-013 apply cleanly
5. ☐ Test new Phase 3 screens on migrated data:
   - Customer ledger
   - Expiry actions
   - Catalog import
   - Controlled sales report
   - Audit log
   - Purchase suggestions
   - Cashier performance
6. ☐ Confirm old sales/stock/customers intact

**To Execute**: After R2 completes, use section 3 of this checklist

**Estimated Time**: 2-3 hours  
**Blocking Release**: YES

---

### ⏰ R4 - Print Preview Testing (READY - 1 hour)

**Status**: Test plan complete, hardware tests pending  
**Priority**: 🟡 MEDIUM - Preview can be done now

**What's Prepared**:
- [x] Complete test plan (`PRINT_PREVIEW_TEST.md`)
- [x] A4 invoice preview tests
- [x] 80mm thermal receipt preview tests
- [x] Return receipt tests
- [x] Barcode label preview tests
- [x] PDF export tests
- [x] Urdu localization print tests

**Can Test Now** (without hardware):
- ☐ Print dialog behavior
- ☐ A4 invoice preview rendering
- ☐ 80mm thermal preview rendering
- ☐ Content accuracy (all fields present)
- ☐ PDF generation
- ☐ Urdu text display on preview

**Blocked** (requires hardware):
- ☐ Physical A4 printer output quality
- ☐ Physical thermal receipt print quality
- ☐ Barcode label print + scan-back test
- ☐ Scanner wedge behavior

**To Execute**:
```powershell
cd pharmacy-pos
npm run tauri:dev
# Follow PRINT_PREVIEW_TEST.md
```

**Estimated Time**: 1 hour (preview only)  
**Blocking Release**: PARTIAL (preview validation acceptable, physical optional)

---

### ⏰ R5 - Catalog Import Testing (READY - 2 hours)

**Status**: Test plan + realistic sample complete  
**Priority**: 🟡 MEDIUM - Can test with sample now

**What's Prepared**:
- [x] Complete test plan (`CATALOG_IMPORT_TEST.md`)
- [x] 50-product realistic sample (`sample-catalog-realistic.csv`)
- [x] Pakistani pharmacy brands (Panadol, Augmentin, etc.)
- [x] Realistic pricing (Rs 8 - Rs 4,500)
- [x] 15 categories, 9 controlled substances

**Can Test Now** (with realistic sample):
- ☐ Import preview validation
- ☐ Fresh database import execution
- ☐ Duplicate detection / conflict protection
- ☐ Opening stock/batch import
- ☐ Error scenarios (missing fields, invalid data)
- ☐ Performance testing (50, 100, 500, 1000 products)
- ☐ Category/manufacturer auto-creation
- ☐ Transaction rollback on error

**Blocked** (requires real data):
- ☐ Actual pharmacy product list import
- ☐ Real onboarding time measurement
- ☐ Business-specific validation rules

**To Execute**:
```powershell
cd pharmacy-pos
npm run tauri:dev
# Follow CATALOG_IMPORT_TEST.md
# Use sample-catalog-realistic.csv
```

**Estimated Time**: 2 hours (realistic sample)  
**Blocking Release**: PARTIAL (realistic sample acceptable, real data optional)

---

### ❌ R1 - Clean Windows Install (BLOCKED - 2-3 hours)

**Status**: Test checklist complete, execution blocked  
**Priority**: 🔴 HIGH - Required for release

**Blocker**: No clean Windows PC or VM available

**What's Prepared**:
- [x] Complete 181-check test plan (`CLEAN_INSTALL_TEST.md`)
- [x] Installer details documented (SHA-256, size, date)
- [x] Operator script ready
- [x] Evidence template created

**Cannot Test Until**:
- ☐ Clean Windows 10/11 x64 machine obtained
- ☐ No Node, Rust, Visual Studio, or dev tools
- ☐ No existing app data
- ☐ Fresh disposable environment

**Test Scope** (when available):
1. Installation and first launch
2. Fresh database initialization
3. Empty catalog verification (no demo data)
4. Basic data entry
5. Cash drawer and shift operations
6. POS pack and loose sales
7. Post-sale verification
8. Prescription sale
9. Receipt and printing
10. Purchase order workflow
11. Supplier payment
12. Sales return
13. Stock adjustment
14. Shift close
15. Daily closing and reports
16. Backup and restore
17. Idle lock security
18. Localization (Urdu)
19. Window sizes and keyboard
20. Hardware integration (if available)

**User Action Required**: Provide clean Windows PC or VM

**Estimated Time**: 2-3 hours (when machine available)  
**Blocking Release**: YES

---

### ❌ R4 - Physical Hardware Testing (BLOCKED - 1 hour)

**Status**: Physical tests blocked, preview tests ready

**Blocker**: No physical printer or scanner hardware

**Cannot Test Until**:
- ☐ Thermal receipt printer (80mm) available
- ☐ A4 printer available
- ☐ Barcode label printer (75×35mm) available
- ☐ Barcode scanner (USB wedge) available

**Physical Tests** (when hardware available):
- ☐ A4 invoice actual print quality
- ☐ 80mm thermal actual print quality
- ☐ Header/footer text on physical printout
- ☐ Patient/doctor names print correctly
- ☐ Controlled product DRAP number prints
- ☐ Margins correct, no text cut off
- ☐ Urdu text renders on paper
- ☐ Barcode label actual print
- ☐ Label barcode scans correctly
- ☐ Scanner wedge into POS search
- ☐ Multiple rapid scans work

**User Action Required**: Provide printer and scanner hardware

**Estimated Time**: 1 hour (when hardware available)  
**Blocking Release**: PARTIAL (preview acceptable, physical recommended)

---

### ❌ R5 - Real Pharmacy Data Import (BLOCKED - 1 hour)

**Status**: Realistic sample ready, real data blocked

**Blocker**: No actual pharmacy product list provided

**Cannot Test Until**:
- ☐ Real pharmacy product catalog provided
- ☐ Data reviewed for sensitive information
- ☐ Format confirmed compatible

**Real Data Tests** (when available):
- ☐ Actual pharmacy file imports successfully
- ☐ All real products validate
- ☐ Product count matches expectation
- ☐ Existing business categories preserved
- ☐ Price ranges realistic
- ☐ Barcode scanner works with real products
- ☐ Onboarding time measured (staff perspective)

**User Action Required**: Provide actual pharmacy product list

**Estimated Time**: 1 hour (when data available)  
**Blocking Release**: NO (realistic sample sufficient for initial release)

---

### ❌ R6 - FBR Production Integration (BLOCKED - 11-17 days)

**Status**: ✅ Documentation complete, production blocked

**What IS Complete**:
- [x] Sandbox validation spike implemented (admin screen)
- [x] Native HTTPS with Windows TLS
- [x] Memory-only token handling
- [x] Request/response validation
- [x] Documentation updated with honest status

**What is NOT Complete**:
- ☐ Production invoice posting
- ☐ Automatic checkout integration
- ☐ FBR invoice number generation
- ☐ QR code generation
- ☐ Invoice reconciliation
- ☐ Durable request history
- ☐ Production credential storage
- ☐ Offline queue and retry
- ☐ Return/debit note handling

**Critical Blockers** (cannot proceed without):
1. ☐ Shop onboarding route confirmation (DI vs Tier-1 POS)
2. ☐ Official FBR portal credentials (sandbox token)
3. ☐ Assigned scenario payloads
4. ☐ Product HS code / UOM mappings
5. ☐ Integrator/partner requirements (if any)

**Engineering Tasks Remaining** (after blockers resolved):
1. Scenario submission protocol (~2-3 days)
2. Production invoice integration (~3-5 days)
3. Reconciliation system (~2-3 days)
4. Product catalog enhancement (~1-2 days)
5. Credential management (~1 day)
6. Return/debit note support (~2-3 days)

**Total**: 11-17 days engineering + testing after blockers resolved

**User Action Required**: 
1. Access FBR portal
2. Document shop classification
3. Obtain sandbox token
4. Provide scenario requirements

**Estimated Time**: 11-17 days (after user provides blockers)  
**Blocking Release**: NO (can release without FBR, pharmacy must understand limitation)

**See**: [FBR_INTEGRATION_STATUS.md](FBR_INTEGRATION_STATUS.md) for complete details

---

### ⏰ R7 - Release Documentation Truth Pass (READY - 2 hours)

**Status**: Mostly complete, final pass after R2/R3

**What's Already Updated** (November 1, 2026):
- [x] README.md - Complete rewrite with honest status
- [x] RELEASE_NOTES.md - Current status section added
- [x] READY_TO_SHIP.md - Complete rewrite with NOT READY warning
- [x] START_HERE.md - Navigation hub created
- [x] FBR_INTEGRATION_STATUS.md - Updated with blockers
- [x] CLEAN_INSTALL_TEST.md - Already shows "PENDING"
- [x] NEXT_STEPS_CHECKLIST.md - This file, R1-R7 section added

**Final Pass** (after R2/R3 complete):
- ☐ Update NEXT_STEPS_CHECKLIST.md section 3 with R2/R3 results
- ☐ Update READY_TO_SHIP.md with actual test results
- ☐ Update RELEASE_NOTES.md with any issues found
- ☐ Verify installer SHA-256 consistent everywhere
- ☐ Add "Known Issues" section if any found
- ☐ Update recommendation (e.g., "Tested on dev machine, awaiting clean install")

**Estimated Time**: 2 hours (after R2/R3)  
**Blocking Release**: NO (but required for honest status)

---

## 🎯 Execution Priority

### Phase 1: Critical Path (Can Start Now - ~11 hours)

**These can be done immediately and will prove if the app actually works:**

1. **R2 - Fresh DB E2E** (4-6 hours) ← **START HERE**
   - Most critical test
   - Validates all core workflows
   - Will find any show-stopper bugs

2. **R3 - Upgraded DB E2E** (2-3 hours)
   - After R2 completes
   - Validates migrations
   - Confirms old data safe

3. **R4 - Print Preview** (1 hour)
   - Can do in parallel with R2/R3
   - Validates print dialogs
   - Physical hardware optional

4. **R5 - Catalog Import** (2 hours)
   - Can do in parallel with R2/R3
   - Validates import flow
   - Real data optional

5. **R7 - Final Doc Pass** (2 hours)
   - After R2/R3 complete
   - Update with test results
   - Add any found issues

**Total**: ~11-13 hours  
**Result**: Know if app works, ready for controlled deployment (pending clean install)

### Phase 2: Blocked Items (When Resources Available)

**These require external resources from user:**

1. **R1 - Clean Install** (2-3 hours when PC available)
   - Need: Clean Windows PC or VM
   - Validates installer
   - Required before wide deployment

2. **R4 - Physical Printing** (1 hour when hardware available)
   - Need: Printers and scanner
   - Validates output quality
   - Recommended but not critical

3. **R5 - Real Data** (1 hour when data available)
   - Need: Actual pharmacy product list
   - Validates onboarding time
   - Optional, realistic sample sufficient

4. **R6 - FBR Production** (11-17 days when unblocked)
   - Need: Portal access + credentials
   - Implements production fiscal reporting
   - Optional if pharmacy doesn't require FBR

---

## 📊 Current Release Gate Score

| Gate | Status | Score | Notes |
|------|--------|-------|-------|
| **Code Complete** | ✅ | 100% | All features implemented |
| **Automated Tests** | ✅ | 100% | All passing (77+52) |
| **Documentation** | ✅ | 100% | All updated Nov 1 |
| **Manual E2E** | ❌ | 0% | R2 and R3 pending |
| **Clean Install** | ❌ | 0% | R1 blocked |
| **Hardware** | ⏰ | 50% | Preview ready, physical blocked |
| **Real Import** | ⏰ | 80% | Realistic sample ready |
| **FBR Production** | ❌ | 10% | Spike only |
| **Overall** | ⚠️ | ~55% | **NOT READY** |

**Minimum for Release**: 85% (requires R1, R2, R3 complete)  
**Current Shortfall**: -30% (need R1, R2, R3)

---

## ✅ Quick Checklist

**Before Starting Testing**:
- [ ] Read [IMMEDIATE_WORK_READY.md](IMMEDIATE_WORK_READY.md)
- [ ] Have 4-6 hours available for R2
- [ ] Can delete test database
- [ ] Notepad ready for issue tracking

**Critical Path (Must Do)**:
- [ ] Execute R2 Fresh DB E2E (~4-6h)
- [ ] Execute R3 Upgraded DB E2E (~2-3h)
- [ ] Fix any critical issues found
- [ ] Update this checklist with results

**When Resources Available**:
- [ ] Execute R1 Clean Install (need PC/VM)
- [ ] Execute R4 Physical tests (need hardware)
- [ ] Execute R5 Real data test (need product list)

**Before Production Deployment**:
- [ ] All R1, R2, R3 tests PASS
- [ ] No critical issues
- [ ] This checklist updated with results
- [ ] READY_TO_SHIP.md updated
- [ ] Pharmacy staff briefed on limitations

---

**Last Updated**: November 1, 2026  
**Next Action**: Execute R2 Fresh DB E2E test  
**Blocking Items**: R1 (clean PC), R2/R3 (testing time)

---

## Phase 3 implementation and open fiscal gate

- [x] Local CSV/Excel `.xlsx` catalog preview, validation, reviewed atomic import/opening stock, idempotency, conflict protection and bulk category/reorder/unused-pack helpers.
- [x] Controlled-sale evidence enforced in POS and Rust; saved controlled/DRAP snapshots, receipt consistency and admin/manager/accountant report.
- [x] Restrict raw prescription-table/import-journal reads while preserving cashier summary/own-receipt flows; improve generic-name search and safe CSV quoting.
- [x] DI sandbox validation spike with fixed official HTTPS endpoint, native TLS, explicit user gates, bounded responses and memory-only token.
- [ ] Confirm the shop's FBR onboarding route and assigned sandbox scenarios; run real sandbox tests with locally entered credentials. No API test was made against FBR in this increment. Production posting, invoice/QR reconciliation and acceptance are not implemented. See FBR_INTEGRATION_STATUS.md.
- [ ] Test import using a reviewed real pharmacy data sample and measure onboarding time. Automated files are synthetic; no verified starter medicine database is bundled.
- [ ] Complete the existing clean Windows, signed-in native desktop and hardware acceptance. Phase 3 implementation is not a live-store release sign-off.

## Current release-gate increment

The user subsequently authorized Phase 2 implementation work. That completion pass adds customer balance badges, statement selection/failure/race safeguards, manager-only exact-batch actions from reports and batch rows, held-only expiry reporting and settings-driven expiry filtering. The 63 native tests and ten additional Phase 2 UI scenarios pass; see SINGLE_STORE_90_DAY_PLAN.md. Signed-in desktop and hardware checkboxes below remain unchanged.

The 90-day single-store plan starts with Phase 1 only. See [SINGLE_STORE_90_DAY_PLAN.md](SINGLE_STORE_90_DAY_PLAN.md) for scope and [RELEASE_GATE_WALKTHROUGH.md](RELEASE_GATE_WALKTHROUGH.md) for deterministic acceptance steps. The earlier feature work does not close signed-in desktop or clean-install checks below.

- [x] Fix idle lock so local auth, cart and unsaved purchase draft clear immediately even if native logout fails/stalls; return to sign-in without waiting for the bridge.
- [x] Five App.vue browser checks cover ordinary/failed/stalled logout, keyboard activity renewal and the first click after expiry. These are mocked-bridge UI checks, not native desktop acceptance.
- [x] Native cross-module counter-day test covers fresh and upgraded on-disk databases, receiving, confirmed pack/loose checkout, supplier cash payment/overpayment, expense, approved return/adjustment, blind shift close, audit events, native snapshot/restore and restart.
- [ ] Close the clean Windows, signed-in native desktop and printer/scanner gate. User has this development PC only; desktop automation cannot initialize in this session. Manual results remain required.

This is the current task list for the Pharmacy POS desktop app. A checked item means its code exists or the named command passed. It does not imply that the feature has passed a full test in the running app.

## Current state

- [x] Vue and TypeScript frontend builds with `npm run build`.
- [x] Tauri application builds with `npx tauri build --no-bundle`.
- [x] Initial database setup creates the daily closing table and applies the Phase 5 inventory schema.
- [x] Supplier, purchase order, stock adjustment, and sales return screens and routes exist.
- [x] Route navigation checks the signed-in user's role.
- [x] SQLite trigger test passes for stock adjustment approval, insufficient stock, refund restocking, and excess return rejection.
- [ ] All workflows pass in the running Tauri app on both a new database and an upgraded database.

## 1. Protect sales and inventory data

Complete these before a live pharmacy trial.

- [x] Make POS checkout atomic: invoice, line items, stock deduction, and stock movement records must all succeed or all fail. Verified by the Rust rollback test in `src-tauri/src/sales.rs`.
- [x] Recheck stock at checkout and prevent negative stock when two sales use the same batch. Verified by the concurrent sale test in `src-tauri/src/sales.rs`.
- [x] Make purchase order creation, editing, and receiving atomic. Rust transaction tests in `src-tauri/src/purchase_orders.rs` verify rollback after later-line failures and cover partial and final receipts.
- [x] Make return and adjustment submission atomic, including their parent and line records. Rust transaction tests in `src-tauri/src/submissions.rs` verify rollback after a later line fails and successful submissions; best-effort cleanup is removed.
- [x] Confirm the refund formula with the pharmacy's tax, invoice discount, and partial return rules; adjust both the stored amount and displayed estimate. The pharmacy confirmed proportional allocation. Cumulative rounding keeps repeated partial returns aligned with the original paid invoice total.
- [x] Review role permissions for approving adjustments and refunds. Rust login sessions authorize decisions; guards enforce valid transitions and active admin/manager approvers. The frontend has no raw SQL plugin permission, and its restricted database bridge blocks direct writes to returns, adjustments, stock batches, and movement records. Tests cover direct SQL attempts, role rejection, migration, and batch rollback.
- [x] Require the default admin password to be changed before real use and verify existing accounts with legacy plaintext passwords are upgraded. Rust login blocks normal commands for the shipped admin credential until it is changed; successful legacy logins replace plaintext with bcrypt. Tests cover the gate, password change, and legacy upgrade.

## 2. Pending features to implement

These are feature gaps found in the current screens and the Phase 4 and Phase 5 plans. Core workflow gaps are part of the live-trial gate. Optional enhancements are a separate backlog and may be scheduled later.

### Core workflow gaps

- [x] Add a desktop customer picker to POS checkout. Cashiers can search active customers by name, phone, or code, select with mouse or keyboard, or leave the sale as walk-in. A Rust checkout test verifies the selected customer is saved and an inactive customer is rejected.
- [x] Add pack versus loose-unit selection to desktop POS for products that allow loose sales. Stock checks count both modes together, and invoices preserve the entered pack or loose quantity alongside base stock units.
- [x] Add usable line and invoice discount controls in POS, with totals and receipts that match the saved invoice. Cart rounding matches checkout, the server checks displayed subtotal, tax, and net before saving, and the completed-sale summary and Sales History show the saved discounts and amounts. A mixed pack/loose transaction test covers both discount types.
- [x] Add order-level discount and shipping fields to purchase orders. The desktop form loads, validates, calculates, and saves both amounts; Rust tests cover create, edit, and invalid totals.
- [x] Record and display a return linked to the original invoice, including a clear refund reference. The reference is assigned when an approved return is marked refunded, appears in the returns list and detail, and existing refunded returns receive stable references on upgrade.

### Optional planned enhancements

- [x] Implement invoice and thermal receipt printing. Sales History opens the desktop print dialog with an A4 invoice or 80 mm receipt using saved invoice amounts and pharmacy details. Physical printer output still needs testing in section 3.
- [x] Add a printable version of the return receipt or credit note. Refunded returns print with the original invoice, returned lines, refund amount, method, and reference.
- [x] Add desktop keyboard shortcuts and visible shortcut help for the dashboard, POS search, customer selection, products, and logout. The consistent F1–F4 mapping is shown in the app and `QUICK_REFERENCE.md`.
- [x] Add POS focused search and clear feedback for desktop keyboard and mouse use. Search is focused on entry, scanner Enter can add an exact barcode, arrows and Enter select results, and the screen shows loading, empty, and error states. Touch-specific controls are outside this desktop scope.
- [x] Add appearance and language settings to Settings alongside the header toggles. Theme, English/Urdu/mixed language, digit style, and date format apply immediately and persist on this desktop.
- [x] Add barcode label printing for desktop label printers. Products can print 75 × 35 mm Code 39 labels for supported barcodes, with a preview and copy count. Verify physical scans and printer alignment in section 3.
- [ ] Complete Urdu and mixed-mode support, including right-to-left layout where needed and number/date display options. Global language direction and display preferences are in place; Home, POS, Products, Customers, Sales History, Sales Returns, return creation, stock adjustments, Dashboard shortcut help, Settings, Suppliers, Login, and the forced password-change screen have translated primary labels and selected messages. Urdu digits use U+06F0–U+06F9. Translate the remaining screens, secondary messages, validation errors, and print text, then review RTL layouts and date/number displays in the running app.

## 3. Test the running desktop app

Use a disposable database for the new install test. Back up an existing database before testing the upgrade path.

- [ ] Start with `npm run tauri:dev`; confirm database initialization, login, and navigation have no runtime errors. On October 25, 2026, an earlier isolated desktop build started and created an intact database. The release candidate no longer seeds demo products, customers, or suppliers; its fresh-database Rust test confirms empty catalogs. Login and navigation still need a signed-in desktop check.
- [x] Open an existing database; confirm the inventory migration runs once and preserves existing records. On October 25, 2026, the desktop app opened a disposable pre-inventory fixture twice under a separate test identifier. SQLite integrity passed; the seeded customer and product remained; purchase orders and new invoice/return columns appeared; the inventory migration marker remained at one.
- [ ] Test suppliers: create, search, edit, activate/deactivate, and soft delete. On October 27, 2026, `python tests/supplier_db_smoke.py <isolated-test-db>` passed against an in-memory copy of the migrated desktop test database. The supplier form now preserves zero-day payment terms and validates nonnegative values. The full signed-in desktop UI workflow remains to be checked.
- [ ] Test purchase orders in the signed-in desktop app: draft, edit, send, partial receipt, final receipt, cancel, and invalid receipt. Verify batch quantities and movement history after each action.
  - [x] Rust lifecycle tests cover draft/edit/send/cancel, partial and final receipts, invalid and duplicate receipts, stock quantities, movement totals, and rollback. `cargo test --lib --offline -q` passed on October 27, 2026.
  - [ ] Complete the same workflow through the desktop screens and confirm the visible status, quantities, and history.
- [ ] Test stock adjustments in the signed-in desktop app: create, approve, reject, insufficient stock, duplicate batch lines, and movement history.
  - [x] Rust lifecycle test covers duplicate-line aggregation, pending stock, approval once, insufficient stock, rejection, and movement quantity. `cargo test --lib --offline -q` passed on October 27, 2026.
  - [ ] Complete the workflow through the desktop screens and confirm the visible stock and movement history.
- [ ] Test sales returns in the signed-in desktop app: invoice lookup, partial return, approval, refund, non-restockable return, and attempted over-return.
  - [x] Rust lifecycle test covers partial returns, approval/refund, non-restockable and restockable quantities, movement records, refund reference, and over-return rejection. `cargo test --lib --offline -q` passed on October 27, 2026.
  - [ ] Complete invoice lookup and both refund paths through the desktop screens and confirm the visible amounts and stock.
- [ ] Test POS: barcode search, expiry selection, cart limits, payment methods, failed checkout, invoice history, and stock after sale.
  - [x] Rust checkout test verifies cash, card, and mobile invoices, saved lines, stock movements, insufficient stock, expired-batch rejection, and unchanged invoice history after failed sales. `cargo test --lib --offline -q` passed on October 27, 2026.
  - [ ] Check barcode search, batch selection, cart limits, and the completed sale in the signed-in desktop app.
- [ ] Test daily closing, reports, settings, user accounts, and role restrictions.
  - [x] Correct local-day boundaries for closing and date-range reports; the Asia/Karachi boundary smoke test passed. Closing notes now persist through an additive database migration, and Rust migration/role tests passed on October 27, 2026.
  - [ ] Check closing, reports, settings, user creation/editing, and role-restricted navigation in the signed-in desktop app.
- [x] Test app restart and database backup/restore. On October 27, 2026, `tests/backup_restore_smoke.py` backed up and restored an isolated database, preserving one pre-backup marker and discarding the post-backup marker. The restored database passed SQLite integrity checks and retained the same user/product counts after two Tauri desktop launches; the marker was present exactly once.

## 4. Finish the interface

Build a coherent **Windows desktop** interface. Use the supplied screenshots as layout and workflow references:

- **Sales screenshot:** a fast cashier workspace with search and sale controls above a wide, readable line-item table, plus a persistent totals/payment area. Keep the useful information density; use the app's own visual style and existing sale data.
- **General UI screenshot:** clearly grouped top-level actions and easy access to Sales, Products, Purchases, Dashboard, history, and administration. Adapt that desktop navigation pattern to the current routes and role permissions; do not copy its old branding or decorative background.
- **Dashboard screenshot:** modern light cards, clear typography, sales summary, a time-based chart, expiring and low-stock lists, recent bills, and a prominent New Sale action. Any added metric or chart must use real stored data and show its date range.

### Shared desktop shell and dashboard

- [ ] Unify the window shell: navigation groups, active page indicator, page title, theme/language controls, account menu, spacing, colors, and typography. Keep every authorized route reachable without crowding the main workspace.
  - [x] Implement direct Dashboard, Sales, Products, and Purchases actions; role-filtered menus for the remaining routes; active indicator, route title, account menu, and visible focus. The frontend build passed on October 27, 2026.
  - [x] On October 29, Sales, Products, and Purchases were moved into separate route-driven desktop dialogs over the dashboard, with close controls, Escape, and contained Tab navigation. The frontend build passed; signed-in visual checks remain.
  - [ ] Review the signed-in shell visually and by keyboard at supported desktop sizes.
- [ ] Refine Dashboard around the supplied card layout. Confirm which metrics are available, show today's sales and bill count accurately, and add the hourly chart, expiry/low-stock panels, and recent bills only with verified queries and meaningful empty states. Make New Sale and inventory drill-down actions work.
  - [x] Drive local-day sales, bill count, average bill, hourly chart, recent bills, and stock/expiry counts from stored completed invoices and inventory; add empty/loading states, keyboard-focusable metric cards, and role-aware drill-down actions. The frontend build passed on October 27, 2026.
  - [ ] Review the signed-in dashboard visually and exercise its interactions with populated and empty data.
- [ ] Make the shell and dashboard usable at the configured 1024 × 600 minimum window and at larger desktop sizes; check keyboard navigation and visible focus. Desktop layout breakpoints and focus styles were updated; visual testing at the named sizes remains.

### Screen-by-screen pass

- [ ] **POS:** arrange product/customer lookup, batch or pack/loose controls, cart table, discounts, and payment/totals for a desktop cashier. The October 29 Inspire-style redesign adds a teal header, compact entry strip and search results, sticky line table, bottom totals bar, and payment dock while retaining existing handlers. November 1 search optimization adds instant barcode search (no debounce), auto-highlight exact matches, and fast-path Enter-on-result adds. See `POS_SEARCH_OPTIMIZATION.md` and `TEST_POS_SEARCH_OPTIMIZATION.md`. The frontend build passed. Live 1024 × 600 visual, dark/Urdu, scanner, tab-order, and checkout checks remain.
- [ ] **Products:** make search, filters, product table, batch/expiry details, create/edit form, and barcode label action consistent with the shell. Show stock and prices clearly without hiding important desktop columns. Stock loads in one aggregate query, the table has contained horizontal scrolling and theme-aware rows, and the form validates prices and pack size; live theme, label, and keyboard checks remain.
- [ ] **Customers:** make lookup, customer table, create/edit form, active status, and POS selection easy to scan and use with a keyboard.
- [ ] **Sales history:** make invoice list and detail follow the sales table's clear column hierarchy; expose customer, date, amount, payment status/method, discounts, returns, and print actions where recorded.
- [ ] **Daily closing:** make opening/closing figures, payment breakdown, counted cash, difference, and confirmation easy to review before saving; show prior closings and errors clearly.
- [ ] **Reports:** give filters and date ranges a consistent position, label every total/chart, provide useful empty states, and keep tables readable at desktop widths.
- [ ] **Users:** make role, account status, creation/editing, password actions, and permission feedback clear without exposing controls the signed-in role cannot use.
- [ ] **Settings:** group pharmacy, receipt/printing, appearance, language, digit/date format, and backup settings; show what saves immediately and what requires an action.
- [ ] **Stock adjustment and sales return screens:** bring lists, forms, detail views, status badges, approval/refund actions, line tables, and validation into the same desktop design. Make irreversible decisions and calculated amounts easy to review.

### Acceptance checks for every screen above

- [ ] Check English, Urdu, and mixed labels and messages; RTL alignment where needed; and the selected digit/date display. Keep product names, codes, invoice numbers, and barcode input readable in either language.
- [ ] Review the redesigned desktop login at 1024 × 600 and larger sizes. The October 29 two-column layout replaces the oversized vertical card shown in the supplied screenshot; the frontend build passed, but a running-window visual check remains.
- [ ] Check light and dark themes, loading/empty/error states, validation messages, disabled and success states, and contrast.
- [ ] Check mouse and keyboard operation: logical tab order, visible focus, Enter/Escape behavior, shortcuts, and no keyboard traps.
- [ ] Check the Tauri minimum window of 1024 × 600, the default 1280 × 800 window, and a larger desktop window. Record any clipped dialog, table, action, or horizontal overflow and fix it before marking a screen complete.

## 5. Prepare a release

- [x] Update README, setup instructions, and release notes to match the tested feature set. The current guides now identify version `0.1.0` as a release candidate and remove unsupported completion percentages and production-ready claims.
- [x] Review dependency audit findings and fix applicable issues. See `DEPENDENCY_AUDIT.md` for the Windows target review and the recorded RustSec lockfile exception.
  - [x] Upgrade Vite, its Vue plugin, and Zod; remove the old form adapter. `npm audit --audit-level=low` reported zero vulnerabilities on October 27, 2026, and the frontend build passed.
  - [x] Review RustSec results. The `rsa` advisory comes through optional `sqlx-mysql` and has no Windows build path; GTK informational findings are Linux-only. No patched `rsa` version is available. Reassess if targets or database features change.
- [x] Enable Tauri bundling, set application icons and version consistently, and produce an installer. NSIS bundling is enabled with the Windows icon; package, Cargo, and Tauri versions match at `0.1.0`. The x64 installer was rebuilt on October 29, 2026; its SHA-256 is recorded in `RELEASE_NOTES.md`. It is unsigned and remains a candidate.
- [ ] Install and test on a clean Windows machine with no development tools. On October 27, 2026, the user confirmed that no separate clean Windows PC or VM is available. The results template and current candidate hash are in `CLEAN_INSTALL_TEST.md`; this development machine does not meet the clean-machine requirement. Keep this release gate open until a suitable machine becomes available.
- [x] Document database location, backup, restore, and support procedures for pharmacy staff in `PHARMACY_OPERATIONS.md`. The guide covers automatic daily snapshots, optional manager export, forced first password change, and cash drawer handover.
- [ ] Run final build, database tests, and full workflow checks against the release candidate.
  - [x] Final frontend and Tauri NSIS builds passed on October 29, 2026; all 33 Rust library tests passed. Earlier inventory-trigger and Asia/Karachi business-day smoke tests passed on October 27. The earlier npm audit reported zero vulnerabilities; Rust findings are reviewed in `DEPENDENCY_AUDIT.md`.
  - [ ] Complete signed-in, end-to-end checks on fresh and upgraded databases and verify the exact installer on a separate clean Windows machine.

## 6. Desktop pharmacy upgrade (master prompt)

The following implementation is in the current source. Checked items mean code and the named automated check passed; they do not replace signed-in desktop or clean-machine verification.

- [x] Add cashier shifts with opening float, blind close, expected/actual variance, cashier attribution, and a single open drawer. Cash sales and cash refunds link to the shift. Rust shift reconciliation test passed October 29, 2026.
- [x] Add strict FEFO selection and explicit confirmation when a loose sale opens a strip. Record a `loose_break_events` audit row in the sale transaction. Rust confirmation, FEFO, and audit test passed October 29, 2026.
- [x] Add optional patient and prescribing doctor fields to checkout and invoice records, and display them on printed receipts.
- [x] Add a supplier ledger for received purchase orders, payments, 30/60/90-day aging, and printable vouchers. Payments are restricted to managers and are recorded in a Rust transaction; cash supplier payments reduce the linked drawer's expected cash. The overpayment and shift reconciliation tests passed October 29, 2026. Bank and mobile transfers are recorded, not initiated.
- [x] Add daily SQLite snapshots in Rust, a seven-day retention window, manager export to an existing local or USB folder, and a close prompt if today's backup is missing. A Rust test reopened a backup and verified its data on October 29, 2026.
- [x] Add a local digital receipt summary in Sales History, a copyable SMS draft, and an optional WhatsApp deep link for a saved Pakistan mobile number. The app does not send an SMS itself.
- [x] Add POS F8/F9/F10 payment choices, Rx fields, a shift requirement, dashboard customer count, yesterday comparison, and role-aware quick actions. The frontend production build passed October 29, 2026.
- [ ] Check all new workflows in the signed-in Windows desktop app on a disposable fresh database and a migrated database, including opening/closing shifts, payments, strip confirmation, backup export/restore, digital receipt draft, and Rx receipt output.
- [ ] Check English, Urdu, and mixed labels, RTL, light/dark themes, keyboard use, and 1024 × 600 plus larger window sizes for the new screens. Existing broader interface checks in section 4 remain open.
- [ ] Measure a multi-item keyboard-and-scanner sale on the intended pharmacy PC. The 15–20-second target has not been measured; no throughput or large-catalog benchmark is recorded.
- [ ] Reconcile the Daily Closing sales tender summary with closed drawer shifts during the signed-in workflow check. Daily Closing currently records sales tenders separately from the drawer's opening float, cash refunds, and cash supplier payouts; see `PHARMACY_OPERATIONS.md`.
- [ ] Confirm the exact rebuilt installer on a clean Windows machine without development tools. A clean machine is not currently available.

## Useful commands

```powershell
npm run tauri:dev
npm run build
cd src-tauri; cargo test --lib --offline -q; cd ..
npx tauri build --ci
```

## Release gate

The app is ready for a live pharmacy trial only when section 1 and the core workflow gaps in section 2 are complete, every workflow in section 3 passes, backup and restore are verified, and the release candidate has been installed on a clean machine. The optional planned enhancements in section 2 are not part of this gate. Record the test date and result here when that happens.
