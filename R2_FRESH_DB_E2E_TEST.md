# R2 - Fresh Database End-to-End Test

**Date**: _______________  
**Tester**: _______________  
**Environment**: Development PC, `npm run tauri:dev`  
**Database**: Fresh disposable database (delete existing first)  
**Duration**: Estimated 4-6 hours

---

## Purpose

Execute complete counter-day workflow on fresh database to verify:
- All implemented features work in running application
- Integration between modules functions correctly
- Data flows properly through transactions
- UI is usable at 1024×600 resolution
- Bilingual and theme support works
- No critical blockers exist

**This is NOT a clean install test** (that's R1 - requires clean machine)

---

## Prerequisites

### Setup
- [ ] Close any running instances of the app
- [ ] Delete existing database: `%APPDATA%\com.pharmacypos.app\pharmacy.db`
- [ ] Launch `npm run tauri:dev` from `pharmacy-pos` directory
- [ ] Confirm fresh database created
- [ ] Have notepad ready for recording failures

### Environment Check
- [ ] Windows version: _____________
- [ ] Node version: `node --version` → _____________
- [ ] Screen resolution: _____________ (test at 1024×600 later)
- [ ] Time started: _____:_____

---

## Test Execution

### ✅ Checkpoint 1: Admin Password Change

**Steps**:
1. Application launches and shows login screen
2. Default credentials: username `admin`, password `admin`
3. Sign in

| Check | Result | Notes |
|-------|--------|-------|
| Login screen appears | ☐ Pass ☐ Fail | |
| Default credentials work | ☐ Pass ☐ Fail | |
| Forced to change password | ☐ Pass ☐ Fail | |
| Password requirements shown | ☐ Pass ☐ Fail | |
| Cannot bypass password change | ☐ Pass ☐ Fail | |
| New password accepted | ☐ Pass ☐ Fail | New password: _________ (record for test) |
| Redirected to dashboard | ☐ Pass ☐ Fail | |
| Sign out button works | ☐ Pass ☐ Fail | |
| Sign back in with new password | ☐ Pass ☐ Fail | |

**Failures**: _______________________________________________________________

---

### ✅ Checkpoint 2: Create Test Data

#### 2.1 Create Supplier

Navigate to: Suppliers → Add Supplier

**Data**:
- Name: Test Medical Supplies
- Code: TMS001
- Contact Person: Ahmed Khan
- Phone: 0300-1234567
- Payment Terms: 30 days

| Check | Result | Notes |
|-------|--------|-------|
| Supplier form opens | ☐ Pass ☐ Fail | |
| All fields accessible | ☐ Pass ☐ Fail | |
| Saves successfully | ☐ Pass ☐ Fail | |
| Appears in supplier list | ☐ Pass ☐ Fail | |
| Can edit supplier | ☐ Pass ☐ Fail | |

#### 2.2 Create Product #1 (Pack + Loose)

Navigate to: Products → Add Product

**Data**:
- Name: Test Paracetamol 500mg
- SKU: TPARA500
- Barcode: 1234567890123
- Generic: Paracetamol
- Pack Size: 10
- Unit Price: Rs 20.00
- Wholesale Price: Rs 16.00
- Cost Price: Rs 12.00
- Category: Analgesics
- Manufacturer: Test Pharma
- Sell by Loose Unit: ✅ YES
- Reorder Level: 50
- Controlled Substance: ❌ NO

| Check | Result | Notes |
|-------|--------|-------|
| Product form opens | ☐ Pass ☐ Fail | |
| All fields save correctly | ☐ Pass ☐ Fail | |
| Loose unit checkbox works | ☐ Pass ☐ Fail | |
| Category created automatically | ☐ Pass ☐ Fail | |
| Appears in products list | ☐ Pass ☐ Fail | |

#### 2.3 Create Batch for Product #1

From Products screen → Click product → Add Batch

**Data**:
- Batch Number: BATCH001
- Expiry Date: (2 months from today)
- Quantity: 100 units
- Cost Price: Rs 12.00

| Check | Result | Notes |
|-------|--------|-------|
| Batch form opens | ☐ Pass ☐ Fail | |
| Date picker works | ☐ Pass ☐ Fail | |
| Batch saves | ☐ Pass ☐ Fail | |
| Stock shows 100 units | ☐ Pass ☐ Fail | |
| Batch visible in product detail | ☐ Pass ☐ Fail | |

#### 2.4 Create Product #2 (Controlled Substance)

**Data**:
- Name: Test Antibiotic 500mg
- SKU: TANTB500
- Barcode: 9876543210987
- Pack Size: 14
- Unit Price: Rs 150.00
- Wholesale Price: Rs 130.00
- Cost Price: Rs 100.00
- Category: Antibiotics
- Controlled Substance: ✅ YES
- DRAP Registration: TEST-DRAP-123
- Sell by Loose Unit: ❌ NO

Create batch: BATCH002, Expiry: 3 months from today, Quantity: 50 units

| Check | Result | Notes |
|-------|--------|-------|
| Controlled checkbox works | ☐ Pass ☐ Fail | |
| DRAP field appears when checked | ☐ Pass ☐ Fail | |
| Product and batch created | ☐ Pass ☐ Fail | |
| Stock shows correctly | ☐ Pass ☐ Fail | |

#### 2.5 Create Customer

Navigate to: Customers → Add Customer

**Data**:
- First Name: Muhammad
- Last Name: Ali
- Customer Code: CUST001
- Phone: 0321-9876543
- Customer Type: Retail
- Credit Limit: Rs 5,000.00

| Check | Result | Notes |
|-------|--------|-------|
| Customer form opens | ☐ Pass ☐ Fail | |
| All fields save | ☐ Pass ☐ Fail | |
| Appears in customers list | ☐ Pass ☐ Fail | |
| Credit limit saved | ☐ Pass ☐ Fail | |

**Test Data Complete**: ☐ Yes ☐ No

---

### ✅ Checkpoint 3: Open Cashier Shift

Navigate to: Shifts → Open Shift

**Data**:
- Opening Float: Rs 1,000.00

| Check | Result | Notes |
|-------|--------|-------|
| Shift form opens | ☐ Pass ☐ Fail | |
| Float field accepts amount | ☐ Pass ☐ Fail | |
| Shift opens successfully | ☐ Pass ☐ Fail | |
| Shift status shows "open" in POS header | ☐ Pass ☐ Fail | |
| Cannot open second shift | ☐ Pass ☐ Fail | |
| Shift shows in Shifts list | ☐ Pass ☐ Fail | |

**Shift Open**: ☐ Yes ☐ No  
**Time**: _____:_____

---

### ✅ Checkpoint 4: POS Sale - Pack Item

Navigate to: POS (F1 or Dashboard → New Sale)

#### 4.1 Search and Add Pack

**Steps**:
1. Type "Test Para" in search
2. OR Type barcode: 1234567890123
3. Press Enter

| Check | Result | Notes |
|-------|--------|-------|
| Search field auto-focused | ☐ Pass ☐ Fail | |
| Product found by name | ☐ Pass ☐ Fail | |
| Product found by barcode | ☐ Pass ☐ Fail | |
| Barcode search is instant (< 200ms) | ☐ Pass ☐ Fail | |
| Enter adds pack to cart | ☐ Pass ☐ Fail | |
| Cart shows 1 pack | ☐ Pass ☐ Fail | |
| Quantity shows "1" | ☐ Pass ☐ Fail | |
| Badge shows "Pack · 10 units" | ☐ Pass ☐ Fail | |
| Line total: Rs 200.00 (20×10) | ☐ Pass ☐ Fail | |
| Batch number shown | ☐ Pass ☐ Fail | |
| Expiry date shown | ☐ Pass ☐ Fail | |

#### 4.2 Complete Pack Sale

**Steps**:
1. Payment method: Cash (F8)
2. Cash received: Rs 200.00 (or leave blank for exact)
3. Complete Sale (Ctrl+Enter)

| Check | Result | Notes |
|-------|--------|-------|
| Payment method selects (F8 works) | ☐ Pass ☐ Fail | |
| Cash field works | ☐ Pass ☐ Fail | |
| Change calculated: Rs 0.00 | ☐ Pass ☐ Fail | |
| Ctrl+Enter completes sale | ☐ Pass ☐ Fail | |
| Success message appears | ☐ Pass ☐ Fail | |
| Invoice number generated | ☐ Pass ☐ Fail | Invoice #: _________ |
| Cart clears | ☐ Pass ☐ Fail | |
| Search field refocused | ☐ Pass ☐ Fail | |
| Last invoice shows in POS header | ☐ Pass ☐ Fail | |

**Pack Sale Complete**: ☐ Yes ☐ Fail

---

### ✅ Checkpoint 5: POS Sale - Loose Unit with Strip Confirm

#### 5.1 Add Loose Unit

**Steps**:
1. Search "Test Para" again
2. Press Shift+Enter

| Check | Result | Notes |
|-------|--------|-------|
| Product found | ☐ Pass ☐ Fail | |
| Shift+Enter triggers loose sale | ☐ Pass ☐ Fail | |
| Strip confirmation dialog appears | ☐ Pass ☐ Fail | |
| Dialog shows batch number | ☐ Pass ☐ Fail | |
| Dialog shows expiry date | ☐ Pass ☐ Fail | |
| Can cancel (Esc or Cancel button) | ☐ Pass ☐ Fail | |

#### 5.2 Decline Strip Break

**Steps**:
1. Click Cancel or press Esc

| Check | Result | Notes |
|-------|--------|-------|
| Dialog closes | ☐ Pass ☐ Fail | |
| Nothing added to cart | ☐ Pass ☐ Fail | |
| No toast error | ☐ Pass ☐ Fail | |

#### 5.3 Accept Strip Break

**Steps**:
1. Search again, Shift+Enter
2. Click OK on confirmation

| Check | Result | Notes |
|-------|--------|-------|
| Confirmation dialog appears again | ☐ Pass ☐ Fail | |
| Click OK | ☐ Pass ☐ Fail | |
| Loose unit added to cart | ☐ Pass ☐ Fail | |
| Quantity shows "1" | ☐ Pass ☐ Fail | |
| Badge shows "Loose unit" | ☐ Pass ☐ Fail | |
| Badge shows "Strip opening confirmed" | ☐ Pass ☐ Fail | |
| Line total: Rs 20.00 (1 unit) | ☐ Pass ☐ Fail | |

#### 5.4 Complete Loose Sale

**Steps**:
1. Payment: Cash
2. Received: Rs 20.00
3. Complete

| Check | Result | Notes |
|-------|--------|-------|
| Sale completes | ☐ Pass ☐ Fail | |
| Invoice generated | ☐ Pass ☐ Fail | Invoice #: _________ |
| Cart clears | ☐ Pass ☐ Fail | |

**Loose Sale Complete**: ☐ Yes ☐ Fail

---

### ✅ Checkpoint 6: POS Sale - Controlled Substance with Rx Fields

#### 6.1 Add Controlled Product

**Steps**:
1. Search "Test Antibiotic" or barcode 9876543210987
2. Press Enter (pack)

| Check | Result | Notes |
|-------|--------|-------|
| Product found | ☐ Pass ☐ Fail | |
| Added to cart | ☐ Pass ☐ Fail | |
| Line total: Rs 2,100.00 (150×14) | ☐ Pass ☐ Fail | |

#### 6.2 Enter Prescription Details

**Data**:
- Patient Name: Fatima Ahmed
- Prescribing Doctor: Dr. Hassan Ali

| Check | Result | Notes |
|-------|--------|-------|
| Patient name field visible | ☐ Pass ☐ Fail | |
| Doctor name field visible | ☐ Pass ☐ Fail | |
| Fields accept text | ☐ Pass ☐ Fail | |
| Warning about controlled product shown | ☐ Pass ☐ Fail | |

#### 6.3 Complete Rx Sale

**Steps**:
1. Payment: Cash
2. Received: Rs 2,100.00
3. Complete

| Check | Result | Notes |
|-------|--------|-------|
| Sale completes | ☐ Pass ☐ Fail | |
| Invoice generated | ☐ Pass ☐ Fail | Invoice #: _________ |
| Patient/doctor saved with invoice | ☐ Pass ☐ Fail | (verify in Sales History) |

**Rx Sale Complete**: ☐ Yes ☐ Fail

---

### ✅ Checkpoint 7: Credit/Udhar Sale

#### 7.1 Select Registered Customer

**Steps**:
1. In POS, press F3 or click customer field
2. Type "Muhammad Ali" or "CUST001"
3. Select customer from list

| Check | Result | Notes |
|-------|--------|-------|
| Customer picker opens (F3 works) | ☐ Pass ☐ Fail | |
| Search finds customer | ☐ Pass ☐ Fail | |
| Arrow keys navigate | ☐ Pass ☐ Fail | |
| Enter selects customer | ☐ Pass ☐ Fail | |
| Customer name appears in field | ☐ Pass ☐ Fail | |
| Credit limit shown | ☐ Pass ☐ Fail | Limit: _________ |

#### 7.2 Make Credit Sale

**Steps**:
1. Add Test Para pack to cart (Rs 200)
2. Select payment method: Credit/Udhar
3. Complete sale

| Check | Result | Notes |
|-------|--------|-------|
| Credit button visible | ☐ Pass ☐ Fail | |
| Credit within limit | ☐ Pass ☐ Fail | |
| Current balance shows | ☐ Pass ☐ Fail | |
| After-sale balance calculated | ☐ Pass ☐ Fail | |
| Sale completes | ☐ Pass ☐ Fail | |
| Invoice shows "Credit" payment | ☐ Pass ☐ Fail | Invoice #: _________ |
| Customer balance updated | ☐ Pass ☐ Fail | (verify in Customers) |

#### 7.3 Test Credit Limit

**Steps**:
1. Try to make Rs 6,000 sale (exceeds Rs 5,000 limit)

| Check | Result | Notes |
|-------|--------|-------|
| Warning appears | ☐ Pass ☐ Fail | |
| Sale blocked | ☐ Pass ☐ Fail | |
| Clear message about limit | ☐ Pass ☐ Fail | |

**Credit Sale Complete**: ☐ Yes ☐ Fail

---

### ✅ Checkpoint 8: Reprint + Digital Receipt

#### 8.1 Reprint Last Receipt

**Steps**:
1. In POS header, click "Reprint last" button

| Check | Result | Notes |
|-------|--------|-------|
| Print dialog opens immediately | ☐ Pass ☐ Fail | |
| Shows last invoice | ☐ Pass ☐ Fail | |
| All invoice details present | ☐ Pass ☐ Fail | |
| Can choose A4 or 80mm | ☐ Pass ☐ Fail | |

#### 8.2 SMS/WhatsApp Draft

**Steps**:
1. Navigate to Sales History
2. Select most recent invoice
3. Click "Digital Receipt" or SMS icon

| Check | Result | Notes |
|-------|--------|-------|
| Digital receipt dialog opens | ☐ Pass ☐ Fail | |
| SMS text shown | ☐ Pass ☐ Fail | |
| Contains invoice number | ☐ Pass ☐ Fail | |
| Contains amount | ☐ Pass ☐ Fail | |
| Contains pharmacy name | ☐ Pass ☐ Fail | |
| Copy button works | ☐ Pass ☐ Fail | |
| WhatsApp link shown (if customer has phone) | ☐ Pass ☐ Fail | |
| WhatsApp link format correct (Pakistan +92) | ☐ Pass ☐ Fail | |

**Reprint/Digital Receipt**: ☐ Pass ☐ Fail

---

### ✅ Checkpoint 9: Receive Purchase Order

#### 9.1 Create Purchase Order

Navigate to: Purchase Orders → New Purchase Order

**Data**:
- Supplier: Test Medical Supplies
- Expected Date: Tomorrow
- Add Product: Test Para, Quantity: 50, Cost: Rs 12.00
- Order Discount: Rs 0
- Shipping: Rs 0

| Check | Result | Notes |
|-------|--------|-------|
| PO form opens | ☐ Pass ☐ Fail | |
| Supplier dropdown works | ☐ Pass ☐ Fail | |
| Product search works | ☐ Pass ☐ Fail | |
| Line total calculates: Rs 600.00 | ☐ Pass ☐ Fail | |
| Can save as draft | ☐ Pass ☐ Fail | PO#: _________ |
| Status shows "Draft" | ☐ Pass ☐ Fail | |

#### 9.2 Send Purchase Order

**Steps**:
1. Open the PO
2. Click "Send" button

| Check | Result | Notes |
|-------|--------|-------|
| Send button visible | ☐ Pass ☐ Fail | |
| Confirmation prompt | ☐ Pass ☐ Fail | |
| Status changes to "Sent" | ☐ Pass ☐ Fail | |
| Cannot edit after sending | ☐ Pass ☐ Fail | |

#### 9.3 Receive Stock

**Steps**:
1. Click "Receive" button
2. Batch Number: BATCH003
3. Expiry: 6 months from now
4. Received Quantity: 50
5. Complete receipt

| Check | Result | Notes |
|-------|--------|-------|
| Receive dialog opens | ☐ Pass ☐ Fail | |
| Batch fields present | ☐ Pass ☐ Fail | |
| Quantity defaults to ordered amount | ☐ Pass ☐ Fail | |
| Receipt completes | ☐ Pass ☐ Fail | |
| PO status changes to "Received" | ☐ Pass ☐ Fail | |
| Stock increased by 50 | ☐ Pass ☐ Fail | New stock: _________ |
| Stock movement recorded | ☐ Pass ☐ Fail | Type: "Purchase Receipt" |
| Supplier ledger shows Rs 600 payable | ☐ Pass ☐ Fail | |

**PO Received**: ☐ Yes ☐ Fail

---

### ✅ Checkpoint 10: Supplier Payment

Navigate to: Supplier Ledger (Suppliers menu)

#### 10.1 Partial Payment

**Steps**:
1. Select Test Medical Supplies
2. Click "Record Payment"
3. Amount: Rs 400.00
4. Payment Method: Cash
5. Save

| Check | Result | Notes |
|-------|--------|-------|
| Payment dialog opens | ☐ Pass ☐ Fail | |
| Outstanding shown: Rs 600.00 | ☐ Pass ☐ Fail | |
| Payment methods available | ☐ Pass ☐ Fail | |
| Payment records | ☐ Pass ☐ Fail | |
| Outstanding now: Rs 200.00 | ☐ Pass ☐ Fail | |
| Cash drawer reduced by Rs 400 | ☐ Pass ☐ Fail | (verify later in shift close) |
| Payment voucher printable | ☐ Pass ☐ Fail | |

#### 10.2 Overpayment Rejection

**Steps**:
1. Try to pay Rs 200.01 (Rs 0.01 over outstanding)

| Check | Result | Notes |
|-------|--------|-------|
| Overpayment blocked | ☐ Pass ☐ Fail | |
| Clear error message | ☐ Pass ☐ Fail | |
| No payment recorded | ☐ Pass ☐ Fail | |
| Outstanding unchanged: Rs 200.00 | ☐ Pass ☐ Fail | |

#### 10.3 Final Payment

**Steps**:
1. Pay remaining Rs 200.00
2. Payment Method: Cash

| Check | Result | Notes |
|-------|--------|-------|
| Final payment records | ☐ Pass ☐ Fail | |
| Outstanding now: Rs 0.00 | ☐ Pass ☐ Fail | |
| PO shows "Paid" status | ☐ Pass ☐ Fail | |
| Payment history visible | ☐ Pass ☐ Fail | |

**Supplier Payments**: ☐ Pass ☐ Fail

---

### ✅ Checkpoint 11: Stock Adjustment

Navigate to: Stock Adjustments → New Adjustment

#### 11.1 Create Adjustment

**Data**:
- Product: Test Para
- Batch: BATCH001
- Adjustment Type: Damaged
- Quantity: 5 (decrease)
- Notes: Testing stock adjustment

| Check | Result | Notes |
|-------|--------|-------|
| Adjustment form opens | ☐ Pass ☐ Fail | |
| Product search works | ☐ Pass ☐ Fail | |
| Batch dropdown shows batches | ☐ Pass ☐ Fail | |
| Adjustment types available | ☐ Pass ☐ Fail | |
| Can add multiple lines | ☐ Pass ☐ Fail | |
| Saves as "Pending" | ☐ Pass ☐ Fail | Adjustment #: _________ |

#### 11.2 Approve Adjustment

**Steps**:
1. Open the adjustment
2. Click "Approve" (requires manager role)

| Check | Result | Notes |
|-------|--------|-------|
| Approve button visible | ☐ Pass ☐ Fail | |
| Confirmation prompt | ☐ Pass ☐ Fail | |
| Status changes to "Approved" | ☐ Pass ☐ Fail | |
| Stock decreased by 5 | ☐ Pass ☐ Fail | New stock: _________ |
| Stock movement recorded | ☐ Pass ☐ Fail | Type: "Adjustment - Damaged" |
| Cannot approve twice | ☐ Pass ☐ Fail | |

**Stock Adjustment**: ☐ Pass ☐ Fail

---

### ✅ Checkpoint 12: Sales Return

Navigate to: Sales Returns → New Return

#### 12.1 Lookup Invoice

**Steps**:
1. Enter invoice number from Checkpoint 4 (pack sale)
2. Load invoice

| Check | Result | Notes |
|-------|--------|-------|
| Invoice lookup works | ☐ Pass ☐ Fail | |
| Invoice loads with line items | ☐ Pass ☐ Fail | |
| Customer info shown | ☐ Pass ☐ Fail | |
| Can select items to return | ☐ Pass ☐ Fail | |

#### 12.2 Create Partial Return

**Data**:
- Return 1 pack (10 units) of Test Para
- Reason: Customer request
- Restockable: Yes

| Check | Result | Notes |
|-------|--------|-------|
| Can select quantity to return | ☐ Pass ☐ Fail | |
| Refund amount calculated | ☐ Pass ☐ Fail | Amount: Rs 200.00 |
| Restockable checkbox works | ☐ Pass ☐ Fail | |
| Reason field available | ☐ Pass ☐ Fail | |
| Return submits | ☐ Pass ☐ Fail | Return #: _________ |
| Status: "Pending Approval" | ☐ Pass ☐ Fail | |

#### 12.3 Approve Return

**Steps**:
1. Open the return
2. Click "Approve" (requires manager role)

| Check | Result | Notes |
|-------|--------|-------|
| Approve button visible | ☐ Pass ☐ Fail | |
| Confirmation shown | ☐ Pass ☐ Fail | |
| Status changes to "Approved" | ☐ Pass ☐ Fail | |
| Cannot approve twice | ☐ Pass ☐ Fail | |

#### 12.4 Complete Refund

**Steps**:
1. Click "Refund" button
2. Refund Method: Cash
3. Confirm

| Check | Result | Notes |
|-------|--------|-------|
| Refund dialog opens | ☐ Pass ☐ Fail | |
| Refund amount shown: Rs 200.00 | ☐ Pass ☐ Fail | |
| Refund methods available | ☐ Pass ☐ Fail | |
| Refund completes | ☐ Pass ☐ Fail | |
| Status changes to "Refunded" | ☐ Pass ☐ Fail | |
| Refund reference generated | ☐ Pass ☐ Fail | Ref: _________ |
| Stock increased by 10 | ☐ Pass ☐ Fail | (restockable) |
| Stock movement recorded | ☐ Pass ☐ Fail | Type: "Sales Return" |
| Cash drawer reduced by Rs 200 | ☐ Pass ☐ Fail | (verify in shift) |
| Return receipt printable | ☐ Pass ☐ Fail | |

**Sales Return**: ☐ Pass ☐ Fail

---

### ✅ Checkpoint 13: Near-Expiry Action

**Note**: If no products near expiry, create test batch expiring in 2 weeks

Navigate to: Expiry Actions or Dashboard → Near Expiry panel

#### 13.1 View Near-Expiry Items

| Check | Result | Notes |
|-------|--------|-------|
| Near-expiry report accessible | ☐ Pass ☐ Fail | |
| Shows batches expiring soon | ☐ Pass ☐ Fail | Count: _____ |
| Expiry date highlighted | ☐ Pass ☐ Fail | |
| Days until expiry shown | ☐ Pass ☐ Fail | |
| Stock quantity shown | ☐ Pass ☐ Fail | |

#### 13.2 Quarantine Action

**Steps**:
1. Select a near-expiry batch
2. Click "Quarantine" or similar action
3. Enter reason

| Check | Result | Notes |
|-------|--------|-------|
| Quarantine action available | ☐ Pass ☐ Fail | |
| Reason field present | ☐ Pass ☐ Fail | |
| Action records | ☐ Pass ☐ Fail | |
| Batch marked/flagged | ☐ Pass ☐ Fail | |
| Audit trail created | ☐ Pass ☐ Fail | |

**Expiry Actions**: ☐ Pass ☐ Fail

---

### ✅ Checkpoint 14: Daily Closing + Reports

Navigate to: Daily Closing

#### 14.1 Daily Closing

| Check | Result | Notes |
|-------|--------|-------|
| Closing form shows today's date | ☐ Pass ☐ Fail | |
| Shows completed invoices count | ☐ Pass ☐ Fail | Count: _____ |
| Shows gross sales amount | ☐ Pass ☐ Fail | Amount: _________ |
| Shows cash/card/mobile breakdown | ☐ Pass ☐ Fail | |
| Shows returns/refunds | ☐ Pass ☐ Fail | |
| Notes field available | ☐ Pass ☐ Fail | |
| Can save closing | ☐ Pass ☐ Fail | |
| Closing saved to history | ☐ Pass ☐ Fail | |

#### 14.2 Reports Access

Navigate to: Reports menu

| Report | Accessible? | Data Shows? | Notes |
|--------|-------------|-------------|-------|
| Sales Report | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Product Sales | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Customer Sales | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Cashier Performance | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Stock Report | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Near Expiry Report | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Controlled Sales | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Audit Log | ☐ Yes ☐ No | ☐ Yes ☐ No | |

**Daily Closing + Reports**: ☐ Pass ☐ Fail

---

### ✅ Checkpoint 15: Backup Export/Restore

Navigate to: Settings → Backup or Backup menu

#### 15.1 Auto Backup Check

| Check | Result | Notes |
|-------|--------|-------|
| Today's backup exists | ☐ Pass ☐ Fail | |
| Backup location accessible | ☐ Pass ☐ Fail | Path: _________ |
| Backup file size reasonable | ☐ Pass ☐ Fail | Size: _________ KB |

#### 15.2 Manual Export

**Steps**:
1. Click "Export Backup"
2. Choose test folder (e.g., Desktop/test-backup)
3. Export

| Check | Result | Notes |
|-------|--------|-------|
| Export dialog opens | ☐ Pass ☐ Fail | |
| Can select destination | ☐ Pass ☐ Fail | |
| Export completes | ☐ Pass ☐ Fail | |
| File created at destination | ☐ Pass ☐ Fail | Filename: _________ |
| File is SQLite database | ☐ Pass ☐ Fail | |

#### 15.3 Restore Test (Advanced)

**Warning**: This will replace current database!

**Steps**:
1. Close application
2. Rename current database (backup)
3. Copy exported backup to app data folder
4. Reopen application

| Check | Result | Notes |
|-------|--------|-------|
| Application starts | ☐ Pass ☐ Fail | |
| All data present | ☐ Pass ☐ Fail | |
| Can sign in | ☐ Pass ☐ Fail | |
| Products visible | ☐ Pass ☐ Fail | |
| Customers visible | ☐ Pass ☐ Fail | |
| Sales history intact | ☐ Pass ☐ Fail | |
| Shift data intact | ☐ Pass ☐ Fail | |

**Backup/Restore**: ☐ Pass ☐ Fail

---

### ✅ Checkpoint 16: Idle Lock

**Steps**:
1. Add items to cart (don't complete sale)
2. Wait 5 real minutes without any interaction

| Check | Result | Notes |
|-------|--------|-------|
| Timer working (wait 5 min) | ☐ Pass ☐ Fail | |
| App locks after 5 minutes | ☐ Pass ☐ Fail | |
| Returns to login screen | ☐ Pass ☐ Fail | |
| Unsaved cart cleared | ☐ Pass ☐ Fail | |
| Sign back in works | ☐ Pass ☐ Fail | |
| Previous cart NOT restored | ☐ Pass ☐ Fail | |
| Dashboard loads normally | ☐ Pass ☐ Fail | |

**Idle Lock**: ☐ Pass ☐ Fail

---

### ✅ Checkpoint 17: Close Cashier Shift

Navigate to: Shifts → Close Shift

#### 17.1 Blind Count

| Check | Result | Notes |
|-------|--------|-------|
| Close shift form opens | ☐ Pass ☐ Fail | |
| Expected cash hidden initially | ☐ Pass ☐ Fail | |
| Counted cash field present | ☐ Pass ☐ Fail | |

#### 17.2 Calculate Expected

**Expected Cash Calculation**:
- Opening float: Rs 1,000
- + Cash sales: Rs _____ (from sales history)
- - Supplier payments: Rs 600 (Rs 400 + Rs 200)
- - Cash refunds: Rs 200 (from sales return)
- = Expected: Rs _____

**Steps**:
1. Enter counted cash: _____ (use expected amount for this test)
2. Click "Close Shift"

| Check | Result | Notes |
|-------|--------|-------|
| Variance calculated | ☐ Pass ☐ Fail | Variance: Rs _____ |
| Shift closes successfully | ☐ Pass ☐ Fail | |
| Status changes to "Closed" | ☐ Pass ☐ Fail | |
| Cannot void/edit after close | ☐ Pass ☐ Fail | |
| Shift visible in history | ☐ Pass ☐ Fail | |

**Shift Close**: ☐ Pass ☐ Fail

---

### ✅ Checkpoint 18: Localization - Urdu

Navigate to: Settings → Appearance → Language

#### 18.1 Switch to Urdu

**Steps**:
1. Change language to Urdu (اردو)
2. Navigate to various screens

| Screen | Urdu Labels? | Readable? | Notes |
|--------|--------------|-----------|-------|
| Dashboard | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| POS | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Products | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Customers | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Sales History | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Settings | ☐ Yes ☐ No | ☐ Yes ☐ No | |

#### 18.2 Urdu Digits

**Steps**:
1. Enable Urdu digits in settings
2. Check numbers display

| Check | Result | Notes |
|-------|--------|-------|
| Urdu digit option works | ☐ Pass ☐ Fail | |
| Numbers show as U+06F0–06F9 | ☐ Pass ☐ Fail | |
| Prices formatted correctly | ☐ Pass ☐ Fail | |
| Invoices use Urdu digits | ☐ Pass ☐ Fail | |

#### 18.3 Mixed Mode

**Steps**:
1. Set Language: Mixed (اردو + English)
2. Check display

| Check | Result | Notes |
|-------|--------|-------|
| Labels in Urdu | ☐ Pass ☐ Fail | |
| Product names in English | ☐ Pass ☐ Fail | |
| Numbers readable | ☐ Pass ☐ Fail | |
| Invoices/barcodes in English | ☐ Pass ☐ Fail | |

**Urdu/Mixed Mode**: ☐ Pass ☐ Fail

---

### ✅ Checkpoint 19: Dark Theme

Navigate to: Settings → Appearance → Theme

#### 19.1 Switch to Dark

**Steps**:
1. Enable dark theme
2. Navigate all screens

| Check | Result | Notes |
|-------|--------|-------|
| Theme switches instantly | ☐ Pass ☐ Fail | |
| All text readable | ☐ Pass ☐ Fail | |
| No white background flashes | ☐ Pass ☐ Fail | |
| Buttons/inputs visible | ☐ Pass ☐ Fail | |
| Sufficient contrast | ☐ Pass ☐ Fail | |
| Tables readable | ☐ Pass ☐ Fail | |
| Dialogs properly styled | ☐ Pass ☐ Fail | |

**Dark Theme**: ☐ Pass ☐ Fail

---

### ✅ Checkpoint 20: Window Size 1024×600

#### 20.1 Resize to Minimum

**Steps**:
1. Resize window to 1024×600 (Tauri minimum)
2. Navigate all major screens

| Screen | Usable? | Scroll? | Clipping? | Notes |
|--------|---------|---------|-----------|-------|
| Dashboard | ☐ Yes ☐ No | ☐ Required ☐ No | ☐ Yes ☐ No | |
| POS | ☐ Yes ☐ No | ☐ Required ☐ No | ☐ Yes ☐ No | |
| Products | ☐ Yes ☐ No | ☐ Required ☐ No | ☐ Yes ☐ No | |
| Customers | ☐ Yes ☐ No | ☐ Required ☐ No | ☐ Yes ☐ No | |
| Sales History | ☐ Yes ☐ No | ☐ Required ☐ No | ☐ Yes ☐ No | |
| Reports | ☐ Yes ☐ No | ☐ Required ☐ No | ☐ Yes ☐ No | |
| Settings | ☐ Yes ☐ No | ☐ Required ☐ No | ☐ Yes ☐ No | |

| Check | Result | Notes |
|-------|--------|-------|
| All UI elements accessible | ☐ Pass ☐ Fail | |
| No horizontal overflow | ☐ Pass ☐ Fail | |
| Dialogs fit within window | ☐ Pass ☐ Fail | |
| Tables have contained scroll | ☐ Pass ☐ Fail | |
| Buttons not cut off | ☐ Pass ☐ Fail | |
| Text readable | ☐ Pass ☐ Fail | |

**1024×600 Usability**: ☐ Pass ☐ Fail

---

## Summary

### Test Completion

**Total Checkpoints**: 20  
**Completed**: _____ / 20  
**Passed**: _____  
**Failed**: _____  
**Blocked**: _____

**Duration**: _____:_____ to _____:_____ (_____ hours _____ minutes)

### Critical Failures

| Checkpoint | Issue | Can Continue? | Database Intact? |
|------------|-------|---------------|------------------|
| | | ☐ Yes ☐ No | ☐ Yes ☐ No |
| | | ☐ Yes ☐ No | ☐ Yes ☐ No |
| | | ☐ Yes ☐ No | ☐ Yes ☐ No |

### Overall Result

**R2 Fresh DB E2E Status**: ☐ **PASS** ☐ **FAIL** ☐ **BLOCKED**

**Ready for R3 (Upgraded DB test)?**: ☐ Yes ☐ No

**Blockers for release**:
1. _________________________________________________________________
2. _________________________________________________________________
3. _________________________________________________________________

### Notes

_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________

---

**Tester Signature**: _________________ **Date**: _________________

**Next Steps**:
- [ ] Fix critical failures
- [ ] Proceed to R3 (Upgraded DB E2E)
- [ ] Update NEXT_STEPS_CHECKLIST.md with results
