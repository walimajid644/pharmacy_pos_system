# Catalog Import Testing

**Date**: November 1, 2026  
**Status**: Realistic sample testing - awaiting actual pharmacy data  
**Test File**: `sample-catalog-realistic.csv` (50 realistic pharmacy products)

---

## Test Environment

- **Application**: `npm run tauri:dev`
- **Test File**: 50-product realistic sample (included in repo)
- **Actual Pharmacy Data**: ❌ Not provided yet
- **Test Database**: Disposable fresh database

---

## Sample Dataset Details

**File**: `sample-catalog-realistic.csv`

**Statistics**:
- Total products: 50
- Categories: 15 (Analgesics, Antibiotics, Vitamins, Baby Care, etc.)
- Controlled substances: 9 products with DRAP numbers
- Pack sizes: 1-50 units
- Price range: Rs 8 - Rs 4,500
- Loose unit sales: 4 products enabled
- Tax exempt: 0 products
- Manufacturers: Mix of multinational and local

**Realistic Features**:
- Real brand names (Panadol, Augmentin, Brufen, etc.)
- Actual generic names (Paracetamol, Ibuprofen, etc.)
- Realistic EAN-13 barcodes (Pakistan prefix 896400)
- Appropriate pricing for Pakistan market
- Proper categorization
- Mix of prescription and OTC medications
- Medical supplies and devices included
- Baby care and supplements
- Dermatology and ENT products

---

## Test 1: Import Preview

### Steps
1. Launch application
2. Navigate to Catalog Import (Admin menu)
3. Select `sample-catalog-realistic.csv`
4. Click "Preview"

### Validation Checks

| Check | Result | Notes |
|-------|--------|-------|
| File uploads successfully | ☐ Pass ☐ Fail | |
| Preview shows all 50 products | ☐ Pass ☐ Fail | Count: _____ |
| Column mapping detected correctly | ☐ Pass ☐ Fail | |
| Preview table displays | ☐ Pass ☐ Fail | |
| Can scroll through all rows | ☐ Pass ☐ Fail | |
| No parsing errors shown | ☐ Pass ☐ Fail | |

### Content Validation

| Field | Validates? | Error Count | Sample Errors |
|-------|------------|-------------|---------------|
| Product names | ☐ Pass ☐ Fail | | |
| SKUs | ☐ Pass ☐ Fail | | |
| Barcodes | ☐ Pass ☐ Fail | | |
| Generic names | ☐ Pass ☐ Fail | | |
| Pack sizes | ☐ Pass ☐ Fail | | |
| Unit prices | ☐ Pass ☐ Fail | | |
| Wholesale prices | ☐ Pass ☐ Fail | | |
| Cost prices | ☐ Pass ☐ Fail | | |
| Categories | ☐ Pass ☐ Fail | | |
| Manufacturers | ☐ Pass ☐ Fail | | |
| Controlled substance flags | ☐ Pass ☐ Fail | | |
| DRAP numbers | ☐ Pass ☐ Fail | | |

### Validation Messages

| Check | Result | Notes |
|-------|--------|-------|
| Validation runs automatically | ☐ Pass ☐ Fail | |
| Validation results clear | ☐ Pass ☐ Fail | |
| Errors highlighted in red/orange | ☐ Pass ☐ Fail | |
| Warnings distinguished from errors | ☐ Pass ☐ Fail | |
| Row numbers shown for errors | ☐ Pass ☐ Fail | |
| Can export validation report | ☐ Pass ☐ Fail | |

---

## Test 2: Import Execution (Fresh Database)

### Prerequisites
- ☐ Fresh empty database
- ☐ No existing products
- ☐ Categories table empty or standard

### Steps
1. Preview validates successfully
2. Click "Import" or "Commit"
3. Confirm import
4. Wait for completion

### Performance

| Metric | Value | Acceptable? |
|--------|-------|-------------|
| Start time | ___:___ | |
| End time | ___:___ | |
| Total duration | _____ seconds | ☐ < 10s ☐ < 30s ☐ > 30s |
| Products per second | _____ | |

### Import Results

| Check | Result | Notes |
|-------|--------|-------|
| Import completes successfully | ☐ Pass ☐ Fail | |
| Success message shown | ☐ Pass ☐ Fail | |
| Import count correct (50 products) | ☐ Pass ☐ Fail | Count: _____ |
| No errors during import | ☐ Pass ☐ Fail | |
| Can navigate to Products screen | ☐ Pass ☐ Fail | |

### Data Verification

| Check | Result | Count/Value | Notes |
|-------|--------|-------------|-------|
| Products screen shows 50 items | ☐ Pass ☐ Fail | _____ | |
| All product names imported | ☐ Pass ☐ Fail | | |
| SKUs unique and correct | ☐ Pass ☐ Fail | | |
| Barcodes imported correctly | ☐ Pass ☐ Fail | | |
| Prices imported correctly | ☐ Pass ☐ Fail | | |
| Pack sizes correct | ☐ Pass ☐ Fail | | |
| Categories created/assigned | ☐ Pass ☐ Fail | _____ categories | |
| Manufacturers saved | ☐ Pass ☐ Fail | _____ manufacturers | |
| Controlled flags set correctly | ☐ Pass ☐ Fail | _____ controlled | |
| DRAP numbers saved | ☐ Pass ☐ Fail | | |
| Loose unit flags correct | ☐ Pass ☐ Fail | _____ loose-enabled | |

### Spot Check Products

Verify these specific products in detail:

**Panadol 500mg** (Row 1):
- Name: ☐ Correct ☐ Wrong
- SKU: PNDL500 ☐ Correct ☐ Wrong
- Barcode: 8964000495056 ☐ Correct ☐ Wrong
- Pack size: 10 ☐ Correct ☐ Wrong
- Unit price: Rs 15.00 ☐ Correct ☐ Wrong
- Loose unit: Yes ☐ Correct ☐ Wrong

**Augmentin 625mg** (Row 2):
- Controlled: Yes ☐ Correct ☐ Wrong
- DRAP: DRAP-12345 ☐ Correct ☐ Wrong
- Category: Antibiotics ☐ Correct ☐ Wrong

**Thermometer Digital** (Row 28):
- Price: Rs 350.00 ☐ Correct ☐ Wrong
- Category: Devices ☐ Correct ☐ Wrong

---

## Test 3: Duplicate Detection (Conflict Protection)

### Steps
1. After Test 2 completes
2. Import same file again
3. Observe behavior

### Conflict Handling

| Check | Result | Notes |
|-------|--------|-------|
| Duplicate detection runs | ☐ Pass ☐ Fail | |
| SKU conflicts detected | ☐ Pass ☐ Fail | Count: _____ |
| Barcode conflicts detected | ☐ Pass ☐ Fail | Count: _____ |
| Conflict resolution options shown | ☐ Pass ☐ Fail | |
| "Skip duplicates" option available | ☐ Pass ☐ Fail | |
| "Update existing" option available | ☐ Pass ☐ Fail | |
| "Create new" option available | ☐ Pass ☐ Fail | |
| Clear warning about overwrite | ☐ Pass ☐ Fail | |

### Skip Duplicates Test

| Check | Result | Notes |
|-------|--------|-------|
| Select "Skip duplicates" | ☐ Pass ☐ Fail | |
| Import completes | ☐ Pass ☐ Fail | |
| Zero new products added | ☐ Pass ☐ Fail | Count: _____ |
| Existing products unchanged | ☐ Pass ☐ Fail | |
| Success message accurate | ☐ Pass ☐ Fail | |

### Update Existing Test

1. Modify `sample-catalog-realistic.csv`
2. Change price of Panadol to Rs 18.00
3. Import with "Update existing"

| Check | Result | Notes |
|-------|--------|-------|
| Update option works | ☐ Pass ☐ Fail | |
| Panadol price updated to Rs 18.00 | ☐ Pass ☐ Fail | |
| Other fields preserved | ☐ Pass ☐ Fail | |
| No duplicate products created | ☐ Pass ☐ Fail | Still 50 total |

---

## Test 4: Opening Stock Import

### Test File with Stock
Create `sample-with-stock.csv` with additional columns:
- batch_number
- expiry_date
- quantity_in_stock
- cost_price_at_batch

### Steps
1. Fresh database or deleted products
2. Import file with opening stock data
3. Verify batches created

### Batch Import

| Check | Result | Notes |
|-------|--------|-------|
| Batch columns detected | ☐ Pass ☐ Fail | |
| Batches created automatically | ☐ Pass ☐ Fail | |
| Quantities correct | ☐ Pass ☐ Fail | |
| Expiry dates correct | ☐ Pass ☐ Fail | |
| Cost prices saved | ☐ Pass ☐ Fail | |
| Stock movements recorded | ☐ Pass ☐ Fail | Type: "opening stock" |

---

## Test 5: Error Scenarios

### Missing Required Fields

Create test file with missing data:
- Product with no name
- Product with no SKU
- Product with no pack size
- Product with no prices

| Check | Result | Notes |
|-------|--------|-------|
| Missing name detected | ☐ Pass ☐ Fail | |
| Missing SKU detected | ☐ Pass ☐ Fail | |
| Missing pack size detected | ☐ Pass ☐ Fail | |
| Missing price detected | ☐ Pass ☐ Fail | |
| Row number shown in error | ☐ Pass ☐ Fail | |
| Import blocked until fixed | ☐ Pass ☐ Fail | |
| Error message helpful | ☐ Pass ☐ Fail | |

### Invalid Data Types

Create test file with invalid data:
- Pack size: "abc" (non-numeric)
- Price: "free" (non-numeric)
- Controlled: "maybe" (not 0/1)
- Loose unit: "yes" (not 0/1/true/false)

| Check | Result | Notes |
|-------|--------|-------|
| Invalid pack size detected | ☐ Pass ☐ Fail | |
| Invalid price detected | ☐ Pass ☐ Fail | |
| Invalid boolean detected | ☐ Pass ☐ Fail | |
| Type conversion attempted | ☐ Pass ☐ Fail | |
| Error message specific | ☐ Pass ☐ Fail | |

### Boundary Values

Test edge cases:
- Pack size: 0, 1, 1000
- Price: 0.01, 99999.99
- Very long product name (500 characters)
- Product with all optional fields empty

| Check | Result | Notes |
|-------|--------|-------|
| Zero pack size rejected | ☐ Pass ☐ Fail | |
| Pack size 1 accepted | ☐ Pass ☐ Fail | |
| Large pack size accepted | ☐ Pass ☐ Fail | |
| Very low price accepted | ☐ Pass ☐ Fail | |
| Very high price accepted | ☐ Pass ☐ Fail | |
| Long name truncated/handled | ☐ Pass ☐ Fail | |
| Optional fields handle nulls | ☐ Pass ☐ Fail | |

---

## Test 6: Large Dataset Performance

**Note**: Requires creating larger test files

### Dataset Sizes to Test

| Size | File | Duration | Products/sec | Status |
|------|------|----------|--------------|--------|
| 50 products | `sample-catalog-realistic.csv` | ___s | ___ | ☐ Pass ☐ Fail |
| 100 products | Create test file | ___s | ___ | ☐ Pass ☐ Fail |
| 500 products | Create test file | ___s | ___ | ☐ Pass ☐ Fail |
| 1000 products | Create test file | ___s | ___ | ☐ Pass ☐ Fail |

### Performance Targets

- 50 products: < 10 seconds
- 100 products: < 20 seconds
- 500 products: < 60 seconds
- 1000 products: < 120 seconds

### UI Responsiveness

| Check | Result | Notes |
|-------|--------|-------|
| Progress indicator shows | ☐ Pass ☐ Fail | |
| Can cancel during import | ☐ Pass ☐ Fail | |
| UI doesn't freeze | ☐ Pass ☐ Fail | |
| Memory usage reasonable | ☐ Pass ☐ Fail | Peak: ___MB |

---

## Test 7: Category and Manufacturer Handling

### Auto-Creation Test

| Check | Result | Notes |
|-------|--------|-------|
| New categories created automatically | ☐ Pass ☐ Fail | Count: _____ |
| Categories visible in category list | ☐ Pass ☐ Fail | |
| Manufacturers created automatically | ☐ Pass ☐ Fail | Count: _____ |
| Products linked to categories | ☐ Pass ☐ Fail | |
| Filter by category works | ☐ Pass ☐ Fail | |

### Case Sensitivity

Create test with:
- "Analgesics" (row 1)
- "analgesics" (row 2)
- "ANALGESICS" (row 3)

| Check | Result | Notes |
|-------|--------|-------|
| Case handling documented | ☐ Pass ☐ Fail | |
| Behavior consistent | ☐ Pass ☐ Fail | 1 or 3 categories? |
| No unexpected duplicates | ☐ Pass ☐ Fail | |

---

## Test 8: Rollback on Error

### Transaction Test

1. Create file with 10 valid + 1 invalid product (row 11)
2. Import

| Check | Result | Notes |
|-------|--------|-------|
| Import stops at invalid row | ☐ Pass ☐ Fail | |
| Error message shows row 11 | ☐ Pass ☐ Fail | |
| Zero products imported | ☐ Pass ☐ Fail | All-or-nothing |
| Database unchanged | ☐ Pass ☐ Fail | |
| No partial import | ☐ Pass ☐ Fail | |

---

## Test 9: Actual Pharmacy Data (When Available)

### Prerequisites
- ☐ Obtain actual pharmacy product list
- ☐ Review for sensitive data (remove if needed)
- ☐ Backup database before import

### Real Data Import

| Check | Result | Notes |
|-------|--------|-------|
| Pharmacy file format compatible | ☐ Pass ☐ Fail | |
| Column mapping works | ☐ Pass ☐ Fail | |
| All products validate | ☐ Pass ☐ Fail | Error count: _____ |
| Import completes successfully | ☐ Pass ☐ Fail | |
| Product count matches expectation | ☐ Pass ☐ Fail | Expected: _____ Actual: _____ |
| Existing business categories preserved | ☐ Pass ☐ Fail | |
| Price ranges realistic | ☐ Pass ☐ Fail | |
| Barcode scanner works with real products | ☐ Pass ☐ Fail | |

### Onboarding Time Measurement

**Start**: _____:_____  
**End**: _____:_____  
**Total Time**: _____ minutes

**Breakdown**:
- File preparation: _____ minutes
- Review and validation: _____ minutes
- Import execution: _____ minutes
- Verification: _____ minutes

**User Experience**:
- ☐ Easy - Non-technical user could do it
- ☐ Moderate - Needs brief training
- ☐ Difficult - Requires technical assistance

---

## Summary

### Realistic Sample (50 products)

**Status**: ☐ COMPLETE ☐ IN PROGRESS ☐ BLOCKED

- Tests completed: _____ / 9
- Tests passed: _____
- Tests failed: _____
- Blockers found: _____

### Actual Pharmacy Data

**Status**: ☐ COMPLETE ☐ PENDING (waiting on data)

- Real dataset provided: ☐ Yes ☐ No
- Real import tested: ☐ Yes ☐ No
- Onboarding time measured: ☐ Yes ☐ No

### Critical Issues

| Issue | Severity | Impact | Workaround? |
|-------|----------|--------|-------------|
| | ☐ Critical ☐ High ☐ Medium ☐ Low | | ☐ Yes ☐ No |
| | ☐ Critical ☐ High ☐ Medium ☐ Low | | ☐ Yes ☐ No |

### Recommendations

1. _________________________________________________________________
2. _________________________________________________________________
3. _________________________________________________________________

### Next Steps

- [ ] Fix any critical issues found
- [ ] Update import documentation
- [ ] Obtain actual pharmacy dataset
- [ ] Schedule real data import test
- [ ] Measure onboarding with actual user

---

**Tester**: _________________  
**Date**: _________________  
**Environment**: _________________  
**Test File**: sample-catalog-realistic.csv (50 products)  
**Actual Data Tested**: ☐ Yes ☐ No (pending)
