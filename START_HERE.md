# Start Here

Pharmacy POS is a Windows desktop application - **version 0.1.0 release candidate**.

## Current Status (November 1, 2026)

⚠️ **NOT READY FOR PRODUCTION USE**

- ✅ **Code**: Complete
- ✅ **Automated Tests**: Passing (77 Rust + 52 browser)
- ❌ **Manual Testing**: Not done
- ❌ **Clean Install**: Not tested
- ❌ **FBR Integration**: Sandbox only (production not implemented)

## Quick Navigation

### 👤 For Different Roles

**Developers**:
- [SETUP.md](SETUP.md) - Development environment setup
- [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) - Contributing guidelines
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Schema reference

**Testers**:
- [RELEASE_GATE_STATUS.md](RELEASE_GATE_STATUS.md) - R1-R7 test status
- [R2_FRESH_DB_E2E_TEST.md](R2_FRESH_DB_E2E_TEST.md) - Fresh DB test plan (20 checkpoints)
- [PRINT_PREVIEW_TEST.md](PRINT_PREVIEW_TEST.md) - Print testing
- [CATALOG_IMPORT_TEST.md](CATALOG_IMPORT_TEST.md) - Import testing
- [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md) - Complete status

**Pharmacy Staff** (after release):
- [PHARMACY_OPERATIONS.md](PHARMACY_OPERATIONS.md) - Daily procedures
- [POS_QUICK_GUIDE.md](POS_QUICK_GUIDE.md) - Cashier reference
- [POS_KEYBOARD_REFERENCE.md](POS_KEYBOARD_REFERENCE.md) - All shortcuts

**Release Reviewers**:
- [README.md](README.md) - Feature overview and status
- [RELEASE_NOTES.md](RELEASE_NOTES.md) - Version history
- [READY_TO_SHIP.md](READY_TO_SHIP.md) - Readiness assessment
- [FBR_INTEGRATION_STATUS.md](FBR_INTEGRATION_STATUS.md) - FBR status and blockers

### 📋 Key Features

**Core Operations**:
- Point of Sale with instant barcode search (50% faster as of Nov 1)
- Pack and loose unit sales with strip confirmation
- Cash drawer shifts with blind close
- Supplier payments and ledger
- Customer credit/Udhar with limits
- Sales returns with refunds
- Stock adjustments and expiry actions

**Advanced**:
- Controlled substance tracking (patient/doctor/DRAP)
- Catalog import (CSV/XLSX)
- Invoice and thermal receipt printing
- Barcode label printing
- Daily backups (7-day retention)
- Digital receipts (SMS/WhatsApp drafts)
- Bilingual (English/Urdu/Mixed)
- Light/dark themes

### 📊 What's Working vs What's Not

| Area | Status | Notes |
|------|--------|-------|
| Feature Code | ✅ Complete | All Phase 1-3 features implemented |
| Automated Tests | ✅ Passing | 77 Rust + 52 browser tests |
| Builds | ✅ Success | Frontend + Tauri + Installer |
| Manual E2E | ❌ Not Done | No signed-in workflow testing |
| Clean Install | ❌ Not Done | No clean PC available |
| Physical Hardware | ❌ Not Tested | No printer/scanner |
| FBR Production | ❌ Not Done | Sandbox spike only |

### 🚀 Next Steps

**If You Want to Test** (Recommended):
1. Read [IMMEDIATE_WORK_READY.md](IMMEDIATE_WORK_READY.md)
2. Start with [R2_FRESH_DB_E2E_TEST.md](R2_FRESH_DB_E2E_TEST.md) (~4-6 hours)
3. Then [R3 Upgraded DB test](NEXT_STEPS_CHECKLIST.md#3-test-the-running-desktop-app) (~2-3 hours)

**If You Want to Develop**:
1. Read [SETUP.md](SETUP.md)
2. Run `npm ci` then `npm run tauri:dev`
3. See [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)

**If You Want to Deploy** (Not Recommended Yet):
1. Complete R2 and R3 testing first
2. See [READY_TO_SHIP.md](READY_TO_SHIP.md) for full checklist
3. Note: Requires ~11-13 hours of testing before production use

### ⚠️ Important Warnings

1. **Do NOT use with real pharmacy data** until R2 and R3 E2E tests pass
2. **Initial admin password**: `admin` / `admin` (forced change on first login)
3. **Installer is unsigned**: Windows will show security warning
4. **No FBR production integration**: Cannot fiscally report sales
5. **Urdu translation ~70% complete**: Some messages still in English

### 📞 Getting Help

**For Development Issues**:
- Check [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)
- Review [TESTING_README.md](TESTING_README.md)

**For Testing Questions**:
- See [RELEASE_GATE_STATUS.md](RELEASE_GATE_STATUS.md)
- Follow test plans in respective MD files

**For Deployment Planning**:
- Read [READY_TO_SHIP.md](READY_TO_SHIP.md)
- Review [PHARMACY_OPERATIONS.md](PHARMACY_OPERATIONS.md)

### 📝 Quick Facts

- **Version**: 0.1.0 Release Candidate
- **Build Date**: November 1, 2026
- **Platform**: Windows x64 only
- **Database**: Local SQLite
- **Minimum Resolution**: 1024×600
- **Languages**: English, Urdu, Mixed
- **License**: See LICENSE file

---

**Version**: 0.1.0 RC  
**Status**: Code complete, testing incomplete  
**Updated**: November 1, 2026
