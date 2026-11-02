# Clean Windows Installation Test

## Current Status: **PENDING CLEAN MACHINE**

**Development PC only.** User has confirmed no separate clean Windows PC or VM is currently available. All manual acceptance results below remain **PENDING** until executed on a machine that meets the clean install requirements.

## Test Requirements

### Environment
- **Fresh Windows 10 or 11 x64** (separate PC or disposable VM)
- **No development tools**: No Node.js, Rust, Visual Studio, or this repository
- **No existing application data**: Confirm `%APPDATA%\com.pharmacypos.app` does not exist
- **WebView2**: May be installed automatically by the installer if not present
- **Use synthetic data only**: No real pharmacy information during testing

### Candidate Installer
- **Filename**: `Pharmacy POS_0.1.0_x64-setup.exe`
- **SHA-256**: `651EDC117AC50F9272298FB4C22AC5C8093ADAE4413402AC5B21DC7D47672BB3`
- **Size**: 2,453,011 bytes (2.3 MB)
- **Build date**: November 1, 2026 (Phase 3 catalog/controlled-sale candidate)
- **Type**: Unsigned NSIS x64 installer
- **Artifact manifest**: `test-results/single-store-phase3/artifacts.json`

**Critical**: Verify the installer SHA-256 hash matches before proceeding. Use PowerShell:
```powershell
Get-FileHash "Pharmacy POS_0.1.0_x64-setup.exe" -Algorithm SHA256
```

## Supporting Evidence (Not Clean Machine Results)

The following automated tests **pass** but do not substitute for clean machine acceptance:
- 77 native Rust tests (fresh/upgrade database, transactions, permissions)
- 52 browser fixture scenarios (UI flows, idle-lock, logout edge cases)
- Synthetic fresh and upgraded database counter-day tests
- Database integrity and migration checks

**These are development evidence only.** See [RELEASE_GATE_WALKTHROUGH.md](RELEASE_GATE_WALKTHROUGH.md) and [SINGLE_STORE_90_DAY_PLAN.md](SINGLE_STORE_90_DAY_PLAN.md) for full acceptance criteria.


## Test Execution Record

Record operator name, date, Windows version/build, WebView2 version, and actual installer SHA-256 before starting.

**Test Operator**: _________________  
**Test Date**: _________________  
**Windows Version**: _________________ (e.g., Windows 11 Pro 23H2, Build 22631.4602)  
**Architecture**: x64  
**WebView2 Runtime**: _________________ (check after install)  
**Installer SHA-256**: _________________  
**Installer verified**: ☐ Yes ☐ No

### Installation and First Launch

| Check | Result / Notes |
| --- | --- |
| Installer launches without errors | ☐ Pass ☐ Fail: _________________ |
| WebView2 bootstrap completes (if needed) | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| Installation completes successfully | ☐ Pass ☐ Fail: _________________ |
| Desktop shortcut created | ☐ Pass ☐ Fail: _________________ |
| Start Menu entry created | ☐ Pass ☐ Fail: _________________ |
| Desktop shortcut launches application | ☐ Pass ☐ Fail: _________________ |
| No development tools or npm required | ☐ Pass ☐ Fail: _________________ |

### Fresh Database Initialization

| Check | Result / Notes |
| --- | --- |
| Fresh database created at `%APPDATA%\com.pharmacypos.app\pharmacy.db` | ☐ Pass ☐ Fail: _________________ |
| Database file size reasonable (< 500 KB for empty DB) | ☐ Pass Size: _______ KB |
| Login screen appears on first launch | ☐ Pass ☐ Fail: _________________ |
| Default admin credentials: username `admin`, password `admin` | ☐ Pass ☐ Fail: _________________ |
| Forced password change on first admin login | ☐ Pass ☐ Fail: _________________ |
| Successfully set new admin password | ☐ Pass ☐ Fail: _________________ |
| Sign out and sign in with new password works | ☐ Pass ☐ Fail: _________________ |

### Empty Catalog Verification

| Check | Result / Notes |
| --- | --- |
| Products screen shows zero products | ☐ Pass ☐ Fail: _________________ |
| Customers screen shows zero customers | ☐ Pass ☐ Fail: _________________ |
| Suppliers screen shows zero suppliers | ☐ Pass ☐ Fail: _________________ |
| No demo/sample data present | ☐ Pass ☐ Fail: _________________ |
| Dashboard shows empty state | ☐ Pass ☐ Fail: _________________ |

### Basic Data Entry

| Check | Result / Notes |
| --- | --- |
| Create test supplier (name, code, contact) | ☐ Pass ☐ Fail: _________________ |
| Create test product (name, SKU, barcode, pack size, prices) | ☐ Pass ☐ Fail: _________________ |
| Create test batch for product (batch number, expiry, quantity) | ☐ Pass ☐ Fail: _________________ |
| Create test customer (name, code, phone) | ☐ Pass ☐ Fail: _________________ |
| All data saves and appears in respective lists | ☐ Pass ☐ Fail: _________________ |

### Cash Drawer and Shift Operations

| Check | Result / Notes |
| --- | --- |
| Open cashier shift with Rs 100 float | ☐ Pass ☐ Fail: _________________ |
| Shift status shows "open" in POS header | ☐ Pass ☐ Fail: _________________ |
| Cannot open second shift for same cashier | ☐ Pass ☐ Fail: _________________ |

### POS Sale - Pack and Loose

| Check | Result / Notes |
| --- | --- |
| Search finds test product by name | ☐ Pass ☐ Fail: _________________ |
| Search finds test product by barcode | ☐ Pass ☐ Fail: _________________ |
| Add pack to cart (Enter key) | ☐ Pass ☐ Fail: _________________ |
| Add loose unit to cart (Shift+Enter) | ☐ Pass ☐ Fail: _________________ |
| Loose unit requires strip confirmation | ☐ Pass ☐ Fail: _________________ |
| Declining strip confirmation prevents sale | ☐ Pass ☐ Fail: _________________ |
| Accepting strip confirmation adds item | ☐ Pass ☐ Fail: _________________ |
| "Strip opened" badge shows on line item | ☐ Pass ☐ Fail: _________________ |
| Cart shows correct quantities and totals | ☐ Pass ☐ Fail: _________________ |
| Enter cash received amount | ☐ Pass ☐ Fail: _________________ |
| Change calculated correctly | ☐ Pass ☐ Fail: _________________ |
| Complete sale (Ctrl+Enter or button) | ☐ Pass ☐ Fail: _________________ |
| Invoice number generated | ☐ Pass Invoice #: _______ |
| Cart clears after successful sale | ☐ Pass ☐ Fail: _________________ |

### Post-Sale Verification

| Check | Result / Notes |
| --- | --- |
| Sale appears in Sales History | ☐ Pass ☐ Fail: _________________ |
| Invoice detail shows correct line items | ☐ Pass ☐ Fail: _________________ |
| Stock deducted correctly (verify in Products) | ☐ Pass Expected: _______ Actual: _______ |
| Stock movement recorded | ☐ Pass ☐ Fail: _________________ |

### Prescription Sale (Controlled Product)

| Check | Result / Notes |
| --- | --- |
| Enter patient name in POS | ☐ Pass ☐ Fail: _________________ |
| Enter doctor name in POS | ☐ Pass ☐ Fail: _________________ |
| Complete sale with Rx fields | ☐ Pass ☐ Fail: _________________ |
| Patient and doctor names saved with invoice | ☐ Pass ☐ Fail: _________________ |

### Receipt and Printing

| Check | Result / Notes |
| --- | --- |
| Last invoice shows in POS header | ☐ Pass ☐ Fail: _________________ |
| Reprint last receipt button works | ☐ Pass ☐ Fail: _________________ |
| A4 invoice print preview opens | ☐ Pass ☐ Fail: _________________ |
| 80mm thermal receipt preview opens | ☐ Pass ☐ Fail: _________________ |
| Receipt header/footer configured in settings | ☐ Pass ☐ Fail: _________________ |
| Receipt shows patient/doctor if entered | ☐ Pass ☐ Fail: _________________ |
| **Physical print test (if printer available)** | ☐ Pass ☐ N/A ☐ Fail: _________________ |

### Digital Receipt

| Check | Result / Notes |
| --- | --- |
| Copy SMS text from Sales History | ☐ Pass ☐ Fail: _________________ |
| SMS draft contains invoice details | ☐ Pass ☐ Fail: _________________ |
| WhatsApp link generated for Pakistan mobile | ☐ Pass ☐ Fail: _________________ |
| WhatsApp link opens (test with dummy number) | ☐ Pass ☐ Fail: _________________ |

### Purchase Order Workflow

| Check | Result / Notes |
| --- | --- |
| Create purchase order for 20 units @ Rs 5 | ☐ Pass ☐ Fail: _________________ |
| Send purchase order (status changes) | ☐ Pass ☐ Fail: _________________ |
| Receive 20 units into batch | ☐ Pass ☐ Fail: _________________ |
| Stock increases by 20 units | ☐ Pass ☐ Fail: _________________ |
| Incoming stock movement recorded (+20) | ☐ Pass ☐ Fail: _________________ |
| Received value calculated correctly (Rs 100) | ☐ Pass ☐ Fail: _________________ |

### Supplier Payment

| Check | Result / Notes |
| --- | --- |
| Pay Rs 40 cash against received PO | ☐ Pass ☐ Fail: _________________ |
| Outstanding balance shows Rs 60 | ☐ Pass ☐ Fail: _________________ |
| Payment voucher printable | ☐ Pass ☐ Fail: _________________ |
| Attempt Rs 60.01 payment rejected | ☐ Pass ☐ Fail: _________________ |
| Overpayment error message clear | ☐ Pass ☐ Fail: _________________ |
| No extra payment recorded | ☐ Pass ☐ Fail: _________________ |
| Cash drawer reduced by Rs 40 | ☐ Pass ☐ Fail: _________________ |

### Sales Return

| Check | Result / Notes |
| --- | --- |
| Lookup recent invoice by number | ☐ Pass ☐ Fail: _________________ |
| Return 1 loose unit for Rs 10 | ☐ Pass ☐ Fail: _________________ |
| Submit return | ☐ Pass ☐ Fail: _________________ |
| Approve return (manager role) | ☐ Pass ☐ Fail: _________________ |
| Complete refund with cash | ☐ Pass ☐ Fail: _________________ |
| Refund reference generated | ☐ Pass Ref: _______ |
| Stock increased by 1 unit | ☐ Pass ☐ Fail: _________________ |
| Refund reduces drawer cash | ☐ Pass ☐ Fail: _________________ |
| Repeated approval attempt rejected | ☐ Pass ☐ Fail: _________________ |

### Stock Adjustment

| Check | Result / Notes |
| --- | --- |
| Submit damaged stock decrease of 1 unit | ☐ Pass ☐ Fail: _________________ |
| Approve adjustment (manager role) | ☐ Pass ☐ Fail: _________________ |
| Stock decreased by 1 unit | ☐ Pass ☐ Fail: _________________ |
| Adjustment movement recorded (-1) | ☐ Pass ☐ Fail: _________________ |
| Repeated approval attempt rejected | ☐ Pass ☐ Fail: _________________ |

### Shift Close

| Check | Result / Notes |
| --- | --- |
| Expected cash hidden in blind count form | ☐ Pass ☐ Fail: _________________ |
| Enter counted cash: Rs 160 | ☐ Pass ☐ Fail: _________________ |
| Calculation: 100 (float) + 120 (sale) - 40 (supplier) - 10 (expense) - 10 (refund) = 160 | ☐ Pass ☐ Fail: _________________ |
| Close shift | ☐ Pass ☐ Fail: _________________ |
| Variance shows Rs 0 | ☐ Pass ☐ Fail: _________________ |
| Cannot void expense after shift closed | ☐ Pass ☐ Fail: _________________ |
| Closed drawer message clear | ☐ Pass ☐ Fail: _________________ |

### Daily Closing and Reports

| Check | Result / Notes |
| --- | --- |
| Daily Closing shows 1 completed invoice | ☐ Pass ☐ Fail: _________________ |
| Gross invoiced sales: Rs 120 | ☐ Pass ☐ Fail: _________________ |
| Cash sales: Rs 120 | ☐ Pass ☐ Fail: _________________ |
| Reports accessible | ☐ Pass ☐ Fail: _________________ |
| Sales report shows correct data | ☐ Pass ☐ Fail: _________________ |
| Refund report shows return | ☐ Pass ☐ Fail: _________________ |
| Final stock count correct (8 units) | ☐ Pass ☐ Fail: _________________ |
| Stock movement net totals correctly | ☐ Pass ☐ Fail: _________________ |

### Backup and Restore

| Check | Result / Notes |
| --- | --- |
| Today's automatic backup exists | ☐ Pass ☐ Fail: _________________ |
| Backup location accessible | ☐ Pass Path: _______ |
| Export backup to test folder/USB | ☐ Pass ☐ Fail: _________________ |
| Export file created successfully | ☐ Pass ☐ Fail: _________________ |
| Close and reopen app | ☐ Pass ☐ Fail: _________________ |
| All data persists after restart | ☐ Pass ☐ Fail: _________________ |
| Restore backup to disposable test location | ☐ Pass ☐ Fail: _________________ |
| Restored data matches original | ☐ Pass ☐ Fail: _________________ |
| Invoice data intact | ☐ Pass ☐ Fail: _________________ |
| Stock data intact | ☐ Pass ☐ Fail: _________________ |
| Drawer data intact | ☐ Pass ☐ Fail: _________________ |
| Migration marker intact | ☐ Pass ☐ Fail: _________________ |
| Seven-day retention verified | ☐ Pass ☐ Fail: _________________ |
| Missing backup close prompt works | ☐ Pass ☐ Fail: _________________ |

### Idle Lock Security

| Check | Result / Notes |
| --- | --- |
| Add items to cart but don't complete sale | ☐ Pass ☐ Fail: _________________ |
| Leave idle for 5 real minutes | ☐ Pass ☐ Fail: _________________ |
| App locks and returns to login | ☐ Pass ☐ Fail: _________________ |
| Unsaved cart cleared | ☐ Pass ☐ Fail: _________________ |
| Sign back in | ☐ Pass ☐ Fail: _________________ |
| Previous cart not restored | ☐ Pass ☐ Fail: _________________ |

### Localization and Appearance

| Check | Result / Notes |
| --- | --- |
| English UI displays correctly | ☐ Pass ☐ Fail: _________________ |
| Switch to Urdu language | ☐ Pass ☐ Fail: _________________ |
| Urdu labels display correctly | ☐ Pass ☐ Fail: _________________ |
| Urdu digits option works (U+06F0–06F9) | ☐ Pass ☐ Fail: _________________ |
| Mixed mode (Urdu labels, English data) works | ☐ Pass ☐ Fail: _________________ |
| Light theme readable | ☐ Pass ☐ Fail: _________________ |
| Dark theme readable | ☐ Pass ☐ Fail: _________________ |
| Theme toggle works instantly | ☐ Pass ☐ Fail: _________________ |

### Window Sizes and Keyboard

| Check | Result / Notes |
| --- | --- |
| Resize to 1024 × 600 minimum | ☐ Pass ☐ Fail: _________________ |
| All UI elements accessible at minimum size | ☐ Pass ☐ Fail: _________________ |
| No horizontal scroll required | ☐ Pass ☐ Fail: _________________ |
| Resize to 1280 × 800 default | ☐ Pass ☐ Fail: _________________ |
| Layout scales appropriately | ☐ Pass ☐ Fail: _________________ |
| Resize to larger desktop size (e.g., 1920 × 1080) | ☐ Pass ☐ Fail: _________________ |
| Layout remains usable | ☐ Pass ☐ Fail: _________________ |
| F2 focuses product search | ☐ Pass ☐ Fail: _________________ |
| F3 opens customer picker | ☐ Pass ☐ Fail: _________________ |
| F8/F9/F10 select payment methods | ☐ Pass ☐ Fail: _________________ |
| Ctrl+Enter completes sale | ☐ Pass ☐ Fail: _________________ |
| Tab navigation works logically | ☐ Pass ☐ Fail: _________________ |
| Focus indicators visible | ☐ Pass ☐ Fail: _________________ |
| Escape closes dialogs | ☐ Pass ☐ Fail: _________________ |

### Hardware Integration (if available)

| Check | Result / Notes |
| --- | --- |
| **Barcode Scanner**: Scan product barcode into POS search | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| Scanner + Enter adds item to cart | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| Multiple scans work smoothly | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| **Receipt Printer**: Print A4 invoice | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| Receipt Printer: Print 80mm thermal receipt | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| Header/footer text appears on printout | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| Patient/doctor names appear if entered | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| Controlled product DRAP number appears | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| Margins correct, text not cut off | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| Urdu text renders correctly on print | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| **Label Printer**: Print 75×35mm barcode label | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| Barcode scans correctly | ☐ Pass ☐ N/A ☐ Fail: _________________ |
| Label alignment correct | ☐ Pass ☐ N/A ☐ Fail: _________________ |

### Expiry Management

| Check | Result / Notes |
| --- | --- |
| Set expiry warning period to 14 days in settings | ☐ Pass ☐ Fail: _________________ |
| Create batch expiring in 10 days | ☐ Pass ☐ Fail: _________________ |
| Create batch expiring in 30 days | ☐ Pass ☐ Fail: _________________ |
| Create batch expired yesterday | ☐ Pass ☐ Fail: _________________ |
| Dashboard shows near-expiry warning for 10-day batch | ☐ Pass ☐ Fail: _________________ |
| POS shows near-expiry badge for 10-day batch | ☐ Pass ☐ Fail: _________________ |
| POS prevents sale of expired batch | ☐ Pass ☐ Fail: _________________ |
| 30-day batch not flagged as near-expiry | ☐ Pass ☐ Fail: _________________ |
| Near-expiry report shows correct batches | ☐ Pass ☐ Fail: _________________ |

## Critical Failures

Record any critical failures that prevent completion:

| Step | Error / Issue | Screenshot? | Database Intact? |
| --- | --- | --- | --- |
| ___________________ | ___________________ | ☐ Yes ☐ No | ☐ Yes ☐ No |
| ___________________ | ___________________ | ☐ Yes ☐ No | ☐ Yes ☐ No |
| ___________________ | ___________________ | ☐ Yes ☐ No | ☐ Yes ☐ No |

## Final Summary

**Total checks attempted**: _______  
**Passed**: _______  
**Failed**: _______  
**N/A (hardware not available)**: _______  
**Clean install status**: ☐ **PASS** ☐ **FAIL** ☐ **BLOCKED**

**Blocker summary** (if failed or blocked): 
_________________________________________________________________________________
_________________________________________________________________________________
_________________________________________________________________________________

**Next steps**:
_________________________________________________________________________________
_________________________________________________________________________________

**Operator signature**: _________________ **Date**: _________________

---

## Notes for Tester

- **Do not delete the database** to retry a failed test. Document the failure and investigate.
- **Take screenshots** of any errors or unexpected behavior.
- **Keep the test database** for analysis if issues are found.
- **Follow** [PHARMACY_OPERATIONS.md](PHARMACY_OPERATIONS.md) for backup and support procedures.
- **Update** [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md) with results when complete.

For any failure, record:
1. Exact step where it occurred
2. Complete error message text
3. Screenshot if applicable
4. Whether the database remains intact and usable
5. Whether the app can continue or must be restarted
