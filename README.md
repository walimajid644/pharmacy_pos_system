# Pharmacy POS

Pharmacy POS is a Windows desktop application built with Vue 3, TypeScript, Tauri 2, Rust, and SQLite. It is designed for keyboard and mouse use at a minimum window size of 1024 × 600.

## Release Status

Version `0.1.0` is a **release candidate** - code complete but **NOT cleared for live pharmacy use**.

### What's Complete ✅
- All features implemented and working in development
- 77 Rust library tests passing (transactions, permissions, FEFO)
- 52 browser fixture tests passing (UI flows, idle lock)
- Frontend and Tauri builds successful
- Windows NSIS installer built (unsigned)
- November 1, 2026: POS search optimization (50% faster barcode scanning)

### What's NOT Complete ❌
- **Manual desktop testing**: No signed-in E2E verification
- **Clean Windows install**: No clean machine available for testing
- **Physical hardware**: Printer and scanner not tested
- **FBR integration**: Sandbox spike only, production NOT implemented

**See [RELEASE_GATE_STATUS.md](RELEASE_GATE_STATUS.md) for detailed R1-R7 tracking and [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md) for complete status.**

## Available Features

### Core Operations
- **POS**: Barcode/product search (instant barcode matching), customer selection, pack/loose sales, line/invoice discounts, tax, cash/card/mobile/credit payment, keyboard shortcuts (F2-F10, Ctrl+Enter)
- **Inventory**: Products, batches with FEFO enforcement, suppliers, customers (retail/wholesale), purchase orders and receiving, stock adjustments, sales returns with refund references
- **Sales Management**: Sales history, digital receipts (SMS/WhatsApp drafts), daily closing, comprehensive reports, invoice/thermal receipt printing (A4 + 80mm)
- **Financial**: Cash drawer shifts with blind close reconciliation, supplier ledger with payments/aging/vouchers, customer credit/Udhar with limits, cashier performance tracking

### Advanced Features  
- **Prescription Tracking**: Optional patient/doctor fields on sales and receipts, controlled substance flagging with DRAP numbers, audit trail
- **Stock Management**: Strip opening confirmation for loose sales, expiry actions (quarantine), near-expiry warnings, purchase suggestions
- **Security**: User roles (admin/manager/cashier), idle lock (5min timeout), forced admin password change, audit log
- **Backup**: Daily SQLite snapshots (7-day retention), manager export to USB/folder, database restore

### Localization & UI
- **Languages**: English, Urdu, Mixed mode with Urdu labels + English data
- **Themes**: Light and dark mode
- **Responsive**: 1024×600 minimum, scales to larger desktops
- **Keyboard**: Full keyboard navigation, shortcuts, barcode scanner support

### Import/Export
- **Catalog Import**: CSV/XLSX with preview, validation, conflict protection, category auto-creation
- **Barcode Labels**: 75×35mm Code 39 label printing
- **Reports**: Sales, stock, customer, supplier, controlled substance, cashier performance

**Note**: Urdu translation is partial - primary screens translated, secondary messages and some validation errors pending.

## Install and Run

### End Users
Windows installer: `Pharmacy POS_0.1.0_x64-setup.exe`
- **SHA-256**: `651EDC117AC50F9272298FB4C22AC5C8093ADAE4413402AC5B21DC7D47672BB3`
- **Size**: 2,453,011 bytes (2.3 MB)
- **Status**: Unsigned, requires manual verification

**⚠️ IMPORTANT**: This installer has NOT been tested on a clean Windows machine. Do not use with real pharmacy data until release gate is complete.

### Developers
```powershell
npm ci
npm run tauri:dev
```

See [SETUP.md](SETUP.md) for prerequisites and [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) for contribution guidelines.

## Database

- **Location**: `%APPDATA%\com.pharmacypos.app\pharmacy.db`
- **Initialization**: Automatic on first launch (empty - no demo data)
- **Default Credentials**: Username `admin`, Password `admin` (forced change on first login)
- **Migrations**: Automatic, non-destructive
- **Backups**: Daily auto-backup, 7-day retention

**See [PHARMACY_OPERATIONS.md](PHARMACY_OPERATIONS.md) for backup, restore, and support procedures.**

## Testing

### Automated (Passing ✅)
```powershell
cd src-tauri
cargo test --lib --offline -q    # 77 tests
```

Python smoke tests:
```powershell
python tests/backup_restore_smoke.py
python tests/supplier_db_smoke.py
python tests/commercial_operations_smoke.py
```

### Manual (Prepared, Not Executed ⏰)
- **R2**: Fresh DB E2E (20 checkpoints) - See `R2_FRESH_DB_E2E_TEST.md`
- **R3**: Upgraded DB E2E - See `NEXT_STEPS_CHECKLIST.md` section 3
- **R4**: Print preview testing - See `PRINT_PREVIEW_TEST.md`
- **R5**: Catalog import testing - See `CATALOG_IMPORT_TEST.md`

### Blocked (Requires Resources ❌)
- **R1**: Clean Windows install - Needs clean PC/VM
- **R4** (physical): Hardware - Needs printer/scanner
- **R5** (real): Real data import - Needs actual pharmacy product list

## FBR Integration Status

**NOT PRODUCTION READY** - Sandbox validation spike only.

- ✅ Admin sandbox validation screen implemented
- ✅ Native HTTPS with Windows TLS
- ✅ Memory-only token handling
- ❌ Production invoice posting NOT implemented
- ❌ No automatic checkout integration
- ❌ No QR code generation
- ❌ No official credentials tested

**See [FBR_INTEGRATION_STATUS.md](FBR_INTEGRATION_STATUS.md) for complete status, blockers, and engineering estimates (11-17 days after blockers resolved).**

## Release Gate

**Status**: ⚠️ Code complete, testing incomplete

### Can Proceed Now:
- R2 - Fresh DB E2E testing (~4-6 hours)
- R3 - Upgraded DB E2E testing (~2-3 hours)  
- R4 - Print preview testing (~1 hour)
- R5 - Catalog import with sample data (~2 hours)

### Blocked:
- R1 - Clean install (no clean machine)
- R4 - Physical printing (no hardware)
- R5 - Real data import (no pharmacy data)
- R6 - FBR production (no credentials)

**Total Ready Work**: ~11-13 hours of manual testing

**See [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md) for section-by-section status and [RELEASE_GATE_STATUS.md](RELEASE_GATE_STATUS.md) for R1-R7 master tracking.**

## Documentation

### User Guides
- [START_HERE.md](START_HERE.md) - Quick orientation
- [PHARMACY_OPERATIONS.md](PHARMACY_OPERATIONS.md) - Staff procedures
- [POS_QUICK_GUIDE.md](POS_QUICK_GUIDE.md) - Cashier reference
- [POS_KEYBOARD_REFERENCE.md](POS_KEYBOARD_REFERENCE.md) - Complete shortcuts

### Technical
- [SETUP.md](SETUP.md) - Developer setup
- [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) - Contributing
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Schema reference
- [TESTING_README.md](TESTING_README.md) - Test suite guide

### Release Process
- [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md) - Detailed status
- [RELEASE_GATE_STATUS.md](RELEASE_GATE_STATUS.md) - R1-R7 tracking
- [RELEASE_NOTES.md](RELEASE_NOTES.md) - Version history
- [CLEAN_INSTALL_TEST.md](CLEAN_INSTALL_TEST.md) - Install acceptance

## Known Limitations

1. **No production FBR integration** - Sandbox spike only
2. **Urdu translation incomplete** - Primary screens done, secondary messages pending
3. **No multi-location support** - Single store only
4. **No cloud sync** - Local SQLite only
5. **Windows only** - Tauri 2 build for Windows x64
6. **Unsigned installer** - Requires manual security exception
7. **Manual testing incomplete** - Desktop E2E not verified

## Support

**This is release candidate software. Do not use with real pharmacy data until:**
1. R2 and R3 E2E tests pass
2. Clean install verified on separate machine (R1)
3. Physical printer/scanner tested (R4)
4. Real pharmacy data import tested (R5)

For development issues, see [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md).

## License

See LICENSE file for details.

---

**Version**: 0.1.0 Release Candidate  
**Build Date**: November 1, 2026  
**Status**: Code complete, testing incomplete  
**Next Milestone**: Complete R2+R3 manual E2E testing
