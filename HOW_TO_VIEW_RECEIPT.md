# How to View the New Receipt Format

## ✅ YES! You Can See It in Settings

The new thermal receipt format is now available in the **Receipt Preview** section of Settings.

## Step-by-Step Guide

### 1. Open Settings
- Launch your Pharmacy POS application
- Look for the **Settings** option (usually a ⚙ gear icon)
- Click on **Settings**

### 2. Navigate to Receipt Tab
- In the Settings page, you'll see several tabs at the top:
  - Company Info
  - Tax & Currency
  - Inventory
  - **Receipt** ← Click this one
  - Appearance & Language

### 3. View the Preview
- Scroll down in the Receipt tab
- You'll see a section titled **"Receipt Preview"** / **"رسید کا نمونہ"**
- The preview shows a full thermal receipt with sample data

## What You'll See in the Preview

The preview displays a complete thermal receipt showing:

```
┌─────────────────────────────────┐
│ 21-Nov-2026  01:22 PM     ADMIN │
│                                 │
│ Payment Mode: Cash              │
│                                 │
│      BILL/CASH MEMO            │
│                                 │
│ Inv #: 55046                    │
│                                 │
│ Client Name:                    │
│ ITEM NAME                       │
│                                 │
│ ITEM NAME      QTY  RATE    AMT │
│ ─────────────────────────────── │
│ HUMULIN 70/30   1  1663.00 1663 │
│ TREVIAMET      30    32.50  975 │
│ TAB                             │
│ ZOPENT 40MG    30    38.75 1162 │
│                                 │
│ ─────────────────────────────── │
│ Items 7         Gross: 6,713.50 │
│ ─────────────────────────────── │
��                                 │
│        THANK YOU                │
│     for Visiting us.            │
│                                 │
│              Total:      6714   │
│                                 │
│ [Disclaimer text and footer]    │
└─────────────────────────────────┘
```

## Features You Can Preview

1. **Header Layout**: Date/time on left, cashier name on right
2. **Payment Method**: Shows how Cash/Credit displays
3. **Invoice Section**: "BILL/CASH MEMO" title and invoice number
4. **Client Name**: Customer name display
5. **Items Table**: 4-column layout with proper alignment
   - Item names (with batch numbers below)
   - Quantities (centered)
   - Unit rates (right-aligned)
   - Line totals (right-aligned)
6. **Summary Bar**: Items count and gross total
7. **Thank You Message**: Centered and bold
8. **Total Amount**: Large, prominent display
9. **Footer**: Disclaimer and developer info

## Customization

In the same Receipt Settings tab, above the preview, you can customize:

- **Receipt Header**: Custom text at the top (optional)
- **Receipt Footer**: Custom text at the bottom (optional)
- **Show DRAP**: Toggle DRAP registration numbers on/off

The preview automatically reflects these settings!

## When Will It Print This Way?

The new format will be used when:
- ✅ Completing any sale at the POS terminal
- ✅ Using the "Reprint receipt" button
- ✅ Reprinting from sales history
- ✅ Printing saved invoices

## Testing the Actual Print

### Method 1: Test with Last Receipt
1. Go to the POS terminal
2. Look for the "Reprint last" button
3. Click it to print your most recent sale in the new format

### Method 2: Complete a Test Sale
1. Go to POS terminal
2. Add a test item
3. Complete the sale
4. The receipt will print in the new format

### Method 3: Browser Print Preview
1. When printing, you can press **Ctrl+P** (Windows) or **Cmd+P** (Mac)
2. This shows the print preview before sending to printer
3. Verify the layout looks correct

## Troubleshooting

### Can't Find Settings?
- Look for a gear icon (⚙) in the navigation
- Or check the main menu for "Settings" or "ترتیبات"

### Can't See Receipt Tab?
- Make sure you're in Settings
- Look at the tabs near the top of the page
- It should be between "Inventory" and "Appearance & Language"

### Preview Not Showing?
- Scroll down in the Receipt tab
- The preview is below the header/footer input fields
- Look for "Receipt Preview" heading

## Technical Notes

- **Width**: 80mm (standard thermal paper)
- **Font**: Courier New monospace for clear printing
- **Format**: Optimized for thermal printers
- **Compatibility**: Works with all standard thermal printers

## Quick Access Path

```
Application Home
    └── Settings (⚙)
          └── Receipt Tab
                └── Receipt Preview Section ← You are here!
```

---

**Need Help?**
If the preview doesn't look right or you need adjustments, the styling can be modified in the source files mentioned in CHANGES_SUMMARY.md.
