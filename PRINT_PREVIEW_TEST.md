# Print Preview Testing (Without Physical Hardware)

**Date**: November 1, 2026  
**Status**: Preview validation - physical print pending  
**Scope**: Test print dialogs, PDF generation, content accuracy

---

## Test Environment

- **Browser**: Tauri webview (Chromium-based)
- **OS**: Windows 10/11
- **Test Mode**: `npm run tauri:dev`
- **Physical Printer**: ❌ Not available
- **Physical Scanner**: ❌ Not available

---

## A4 Invoice Print Preview

### Test Data Setup
- [ ] Create test sale with 3-5 line items
- [ ] Include pack and loose items
- [ ] Add line discounts
- [ ] Add invoice discount
- [ ] Include tax
- [ ] Add patient name and doctor name (prescription fields)
- [ ] Save customer information with sale

### Print Dialog Tests

| Check | Result | Notes |
|-------|--------|-------|
| Sales History → Select invoice → Print button | ☐ Pass ☐ Fail | |
| Print dialog opens | ☐ Pass ☐ Fail | |
| "A4 Invoice" option visible | ☐ Pass ☐ Fail | |
| Click A4 Invoice opens browser print dialog | ☐ Pass ☐ Fail | |
| Print preview renders correctly | ☐ Pass ☐ Fail | |
| Page size is A4 (210 × 297 mm) | ☐ Pass ☐ Fail | |

### Content Accuracy

| Element | Present? | Correct? | Notes |
|---------|----------|----------|-------|
| Pharmacy name (from settings) | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Pharmacy address | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Pharmacy phone | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Invoice number | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Invoice date/time | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Customer name | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Customer code | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Patient name (if entered) | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Doctor name (if entered) | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Cashier name | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Line items table | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Product names | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Quantities | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Pack/Loose indicator | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Unit prices | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Line discounts (if any) | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Line totals | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Subtotal | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Tax amount | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Tax rate displayed | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Invoice discount (if any) | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Total amount | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Payment method | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Amount received | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Change given | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Header text (from settings) | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Footer text (from settings) | ☐ Yes ☐ No | ☐ Yes ☐ No | |

### Layout and Formatting

| Check | Result | Notes |
|-------|--------|-------|
| Text is readable (not cut off) | ☐ Pass ☐ Fail | |
| Margins appropriate | ☐ Pass ☐ Fail | |
| Table columns aligned | ☐ Pass ☐ Fail | |
| Currency values formatted correctly | ☐ Pass ☐ Fail | |
| Date/time formatted correctly | ☐ Pass ☐ Fail | |
| No overlapping elements | ☐ Pass ☐ Fail | |
| Professional appearance | ☐ Pass ☐ Fail | |

### Controlled Substance Test

- [ ] Mark test product as controlled substance
- [ ] Set DRAP registration number in product
- [ ] Make sale with controlled product
- [ ] Print preview

| Check | Result | Notes |
|-------|--------|-------|
| DRAP number appears on invoice | ☐ Pass ☐ Fail | |
| Prescription fields (patient/doctor) prominently displayed | ☐ Pass ☐ Fail | |
| Warning or notice about controlled substance | ☐ Pass ☐ Fail | |

---

## 80mm Thermal Receipt Preview

### Print Dialog Tests

| Check | Result | Notes |
|-------|--------|-------|
| Sales History → Select invoice → Print button | ☐ Pass ☐ Fail | |
| "80mm Thermal" option visible | ☐ Pass ☐ Fail | |
| Click 80mm Thermal opens browser print dialog | ☐ Pass ☐ Fail | |
| Print preview renders correctly | ☐ Pass ☐ Fail | |
| Page width is ~80mm | ☐ Pass ☐ Fail | |
| Length adjusts to content | ☐ Pass ☐ Fail | |

### Content Accuracy (Same as A4)

| Element | Present? | Correct? | Notes |
|---------|----------|----------|-------|
| Pharmacy name | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Pharmacy contact info | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Invoice number | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Date/time | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Customer info (if any) | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Patient/doctor (if entered) | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Line items | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Quantities and prices | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Subtotal, tax, total | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Payment method | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Change given | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Header/footer text | ☐ Yes ☐ No | ☐ Yes ☐ No | |

### Thermal Receipt Specific

| Check | Result | Notes |
|-------|--------|-------|
| Text fits within 80mm width | ☐ Pass ☐ Fail | |
| No horizontal scroll required | ☐ Pass ☐ Fail | |
| Font size readable | ☐ Pass ☐ Fail | |
| Compact layout | ☐ Pass ☐ Fail | |
| Appropriate line breaks | ☐ Pass ☐ Fail | |

---

## Reprint Last Receipt (POS)

| Check | Result | Notes |
|-------|--------|-------|
| Complete sale in POS | ☐ Pass ☐ Fail | |
| "Last invoice" shows invoice number in header | ☐ Pass ☐ Fail | |
| "Reprint last" button visible | ☐ Pass ☐ Fail | |
| Click "Reprint last" | ☐ Pass ☐ Fail | |
| Print dialog opens immediately | ☐ Pass ☐ Fail | |
| Same invoice content as original | ☐ Pass ☐ Fail | |
| No "duplicate" or "reprint" indicator needed | ☐ Pass ☐ Fail | |

---

## Return Receipt / Credit Note

### Setup
- [ ] Create sales return
- [ ] Approve return
- [ ] Mark as refunded
- [ ] Generate refund reference

### Print Tests

| Check | Result | Notes |
|-------|--------|-------|
| Sales Returns → Select return → Print | ☐ Pass ☐ Fail | |
| Print dialog opens | ☐ Pass ☐ Fail | |
| Receipt preview displays | ☐ Pass ☐ Fail | |

### Content

| Element | Present? | Correct? | Notes |
|---------|----------|----------|-------|
| "Credit Note" or "Return Receipt" title | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Original invoice number reference | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Return date | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Customer information | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Returned line items | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Returned quantities | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Refund amounts | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Total refund amount | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Refund method | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Refund reference number | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Approval signature/name | ☐ Yes ☐ No | ☐ Yes ☐ No | |

---

## Barcode Label Preview

### Setup
- [ ] Go to Products
- [ ] Select product with valid barcode
- [ ] Click "Print Labels" action

### Print Dialog

| Check | Result | Notes |
|-------|--------|-------|
| Label print dialog opens | ☐ Pass ☐ Fail | |
| Preview shows barcode | ☐ Pass ☐ Fail | |
| Label size ~75×35mm | ☐ Pass ☐ Fail | |
| Quantity selector works | ☐ Pass ☐ Fail | |

### Label Content

| Element | Present? | Correct? | Notes |
|---------|----------|----------|-------|
| Product name | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Code 39 barcode image | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Barcode text below image | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Price (if configured) | ☐ Yes ☐ No | ☐ Yes ☐ No | |
| Pack size (if applicable) | ☐ Yes ☐ No | ☐ Yes ☐ No | |

### Barcode Quality

| Check | Result | Notes |
|-------|--------|-------|
| Barcode bars are sharp | ☐ Pass ☐ Fail | |
| Sufficient contrast | ☐ Pass ☐ Fail | |
| No distortion or blur | ☐ Pass ☐ Fail | |
| Text readable | ☐ Pass ☐ Fail | |
| Margins appropriate | ☐ Pass ☐ Fail | |

---

## Localization Tests

### Urdu Language

- [ ] Switch to Urdu in settings
- [ ] Make a test sale
- [ ] Print invoice preview

| Check | Result | Notes |
|-------|--------|-------|
| Urdu labels display correctly | ☐ Pass ☐ Fail | |
| Urdu text not cut off | ☐ Pass ☐ Fail | |
| Mixed Urdu/English readable | ☐ Pass ☐ Fail | |
| RTL layout (if applicable) | ☐ Pass ☐ Fail | |
| Urdu digits (if enabled) | ☐ Pass ☐ Fail | |
| Product names (English) readable | ☐ Pass ☐ Fail | |
| Numbers formatted correctly | ☐ Pass ☐ Fail | |

---

## Settings Configuration Tests

### Header/Footer Customization

- [ ] Go to Settings → Receipt Settings
- [ ] Enter custom header text
- [ ] Enter custom footer text
- [ ] Save settings
- [ ] Make test sale
- [ ] Print preview

| Check | Result | Notes |
|-------|--------|-------|
| Custom header appears on invoice | ☐ Pass ☐ Fail | |
| Custom footer appears on invoice | ☐ Pass ☐ Fail | |
| Text formatting preserved | ☐ Pass ☐ Fail | |
| Multi-line text handled | ☐ Pass ☐ Fail | |

---

## PDF Export Test

| Check | Result | Notes |
|-------|--------|-------|
| Print preview has "Save as PDF" option | ☐ Pass ☐ Fail | |
| Save invoice as PDF | ☐ Pass ☐ Fail | |
| PDF file created successfully | ☐ Pass ☐ Fail | |
| PDF opens correctly in reader | ☐ Pass ☐ Fail | |
| PDF content matches preview | ☐ Pass ☐ Fail | |
| PDF text is selectable | ☐ Pass ☐ Fail | |
| PDF prints correctly from reader | ☐ Pass ☐ Fail | |

---

## Scanner Simulation (Keyboard)

**Note**: Physical scanner not available, testing with keyboard

### Setup
- [ ] Add product with known barcode to catalog
- [ ] Open POS
- [ ] Focus on search field

### Keyboard Simulation

| Check | Result | Notes |
|-------|--------|-------|
| Type barcode exactly | ☐ Pass ☐ Fail | |
| Press Enter | ☐ Pass ☐ Fail | |
| Product found instantly (< 200ms) | ☐ Pass ☐ Fail | |
| Product added to cart | ☐ Pass ☐ Fail | |
| Search field clears | ☐ Pass ☐ Fail | |
| Ready for next scan | ☐ Pass ☐ Fail | |
| Multiple rapid scans work | ☐ Pass ☐ Fail | |

### Expected Scanner Behavior

| Requirement | Verified? | Notes |
|-------------|-----------|-------|
| Scanner sends barcode + Enter | ☐ Yes | Cannot test without scanner |
| No manual Enter needed | ☐ N/A | Will test with physical scanner |
| Fast enough for rapid scanning | ☐ Simulated | Real test pending |
| Works with keyboard wedge mode | ☐ N/A | Will test with physical scanner |

---

## Summary

**Tests Completed**: _____ / _____  
**Tests Passed**: _____  
**Tests Failed**: _____  
**Tests N/A (requires hardware)**: _____

### Critical Issues Found

| Issue | Severity | Screen/Component | Reproducible? |
|-------|----------|------------------|---------------|
| | ☐ Critical ☐ High ☐ Medium ☐ Low | | ☐ Yes ☐ No |
| | ☐ Critical ☐ High ☐ Medium ☐ Low | | ☐ Yes ☐ No |
| | ☐ Critical ☐ High ☐ Medium ☐ Low | | ☐ Yes ☐ No |

### Preview Validation Status

- **A4 Invoice Preview**: ☐ PASS ☐ FAIL ☐ NOT TESTED
- **80mm Thermal Preview**: ☐ PASS ☐ FAIL ☐ NOT TESTED
- **Return Receipt Preview**: ☐ PASS ☐ FAIL ☐ NOT TESTED
- **Barcode Label Preview**: ☐ PASS ☐ FAIL ☐ NOT TESTED
- **PDF Export**: ☐ PASS ☐ FAIL ☐ NOT TESTED
- **Urdu Localization**: ☐ PASS ☐ FAIL ☐ NOT TESTED
- **Scanner Simulation**: ☐ PASS ☐ FAIL ☐ NOT TESTED

### Physical Print Testing (Pending Hardware)

**Status**: ⏳ WAITING FOR HARDWARE

Required for complete R4 acceptance:
- [ ] Actual A4 invoice on paper
- [ ] Actual 80mm thermal receipt
- [ ] Barcode label on label printer
- [ ] Physical scanner + barcode scan-back test
- [ ] Verify margins, alignment, quality on real devices

**Estimated Time When Hardware Available**: 1 hour

---

**Tester**: _________________  
**Date**: _________________  
**Environment**: _________________  
**Notes**: _________________
