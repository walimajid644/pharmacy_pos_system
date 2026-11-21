# Thermal Receipt Format

The thermal printer receipt has been updated to match the standard pharmacy POS format shown in your sample image.

## Receipt Layout

### Header Section
- **Date/Time** (left): e.g., `21-Nov-2026  01:22 PM`
- **Cashier/User** (right): e.g., `ADMIN`

### Payment Information
- **Payment Mode**: Cash / Credit / Card

### Invoice Section
- **Section Title**: `BILL/CASH MEMO` (centered)
- **Invoice Number**: `Inv #: 55046`

### Customer Information
- **Client Name**: Customer name or "Walk-in Customer"

### Items Table
| ITEM NAME | QTY | RATE | AMT |
|-----------|-----|------|-----|
| Product Name | 1 | 1663.00 | 1663.00 |
| Batch Number (below item) | | | |

- Item names wrap if needed
- Batch numbers shown in smaller text below item name
- Quantities centered
- Rates and amounts right-aligned with 2 decimal places

### Summary Section
- **Items Count**: `Items 7`
- **Gross Total**: `Gross: 6,713.50`

### Thank You Section
```
THANK YOU
for Visiting us.
```

### Total Section
- **Total**: Large, bold, right-aligned
- Example: `Total:  6714`

### Footer Section
Small disclaimer text:
```
Please ensure that medicines and other item tally with your
prescription/demand and is not expired and no claim / return /
exchange would be entertained after leaving counter.

Developed By IBS: (0304-5117454)
```

## Technical Details

- **Paper Width**: 80mm thermal paper
- **Font**: Courier New monospace (8-9pt)
- **Margins**: 2-3mm
- **Borders**: Dotted lines between items, solid lines for sections
- **Layout**: Single column, compact spacing

## Features

1. ✅ Compact thermal-optimized layout
2. ✅ Clear item table with proper alignment
3. ✅ Summary section with item count and gross
4. ✅ Professional thank you message
5. ✅ Footer with disclaimer and developer info
6. ✅ Date/time in standard format (DD-MMM-YYYY HH:MM AM/PM)
7. ✅ Payment method clearly displayed
8. ✅ Invoice number prominent

## Files Modified

- `pharmacy-pos/src/components/SavedSaleActions.vue`
  - Updated template with thermal receipt layout
  - Added `formatReceiptDateTime()` for proper date formatting
  - Added `formatAmount()` for consistent number formatting
  - Updated print styles to match thermal receipt format
  - Maintained existing reprint, SMS, and WhatsApp functionality

## Usage

The receipt will automatically print in this format when:
1. Completing a sale in the POS terminal
2. Using the "Reprint receipt" button in the saved sale actions
3. Printing from sales history

The thermal printer should be configured for 80mm paper width with proper margins set in the print dialog.
