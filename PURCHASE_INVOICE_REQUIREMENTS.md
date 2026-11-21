# Purchase Invoice Requirements - Based on Sample

## Overview

Your sample shows an **"Inspire POS" Purchase Invoice** screen for receiving inventory. This is different from Purchase Orders - it's for recording actual purchases/receipts of goods.

## Current Status

Your system has:
- ✅ Purchase Orders (PurchaseOrderFormView.vue)
- ✅ Purchase Order Receiving (PurchaseOrderReceiveView.vue)
- ❓ Purchase Invoice (needs verification/enhancement)

## Sample Analysis - What They Have

### 1. Header Section (Top)
```
┌─────────────────────────────────────────────────────────┐
│ Invoice No: 1                                           │
│ Bill #: 511409                                          │
│ Supplier: AL-HAMZA TRADER                               │
│ Payment: Cash [dropdown]                                │
│ Date: 29 Oct 26                                         │
│                                                         │
│ ITEM: [Search field]                                    │
└─────────────────────────────────────────────────────────┘
```

**Fields:**
- Invoice No (auto-generated)
- Bill # (supplier's bill number)
- Supplier (dropdown/search)
- Payment method (Cash/Credit/etc)
- Date (date picker)
- Item search bar

### 2. Entry Row (Quick Add)
```
┌──────┬───────────┬───────────┬────────────┬──────────┐
│ QTY  │ PUR.PRICE │ SALE PRICE│ Disc/Item %│ GST/ITEM │
├──────┼───────────┼───────────┼────────────┼──────────┤
│ [__] │ [_______] │ [_______] │ [________] │ [______] │
└──────┴───────────┴───────────┴────────────┴──────────┘
```

### 3. Items Table (Main Grid)
```
┌───┬──────────────────────┬─────┬──────┬─────────┬───────┬─────────┬────────┬──────────┬────────┬──────────┬────────┐
│Sr │ Description          │ Qty │Bonus │Pur Price│Disc % │Disc Amt │AdvTax% │AdvAmount │ Total  │Sale Price│Margin% │
├───┼──────────────────────┼─────┼──────┼─────────┼───────┼─────────┼────────┼──────────┼────────┼──────────┼────────┤
│ 1 │XINOXY 3G EYE OINTMT │  7  │  0   │  59.25  │   0   │  0.00   │   0    │   0      │414.75  │   190    │   69   │
│ 2 │BARILUBE 3.5GM OINT  │ 28  │  0   │  153    │   0   │  0.00   │   0    │   0      │4284    │   220    │   30   │
│ 3 │BLEPHABAR SOP 3.5GM  │ 48  │  0   │ 149.17  │   0   │  0.00   │   0    │   0      │7160.16 │   211    │   29   │
│...│                      │     │      │         │       │         │        │          │        │          │        │
└───┴──────────────────────┴─────┴──────┴─────────┴───────┴─────────┴────────┴──────────┴────────┴──────────┴────────┘
```

**Columns:**
1. **Sr** - Serial number (row number)
2. **Description** - Product name
3. **Qty** - Quantity purchased
4. **Bonus** - Free/bonus quantity
5. **Pur Price** - Purchase price per unit
6. **Disc %** - Discount percentage
7. **Disc Amt** - Discount amount (calculated)
8. **AdvTax%** - Advance tax percentage
9. **AdvAmount** - Advance tax amount (calculated)
10. **Total** - Line total
11. **Sale Price** - Retail sale price
12. **Margin %** - Profit margin (auto-calculated)

### 4. Footer Section
```
┌──────────────────────────────────────────────────────────┐
│ Items: 14        Item Disc: 0.00      GST: 0            │
│                                                          │
│ Invoice Advance Tax:                                     │
│   %: [0] [Calculate]                                     │
│                                                          │
│ Invoice Discount:                                        │
│   %: [0]    Flat: [0.00]                                │
│                                                          │
│ Payment: [0]                    Net Payable: 325524.98  │
│ Balance: [0]                                            │
└──────────────────────────────────────────────────────────┘
```

### 5. Action Buttons (Bottom)
```
┌────────┬──────────┬──────┬──────┬──────┬──────┬──────┬─────────────┬──────┐
│ First  │ Previous │ Next │ Last │ Print│ New  │ Edit │ Supplier    │ Exit │
│        │          │      │      │      │      │      │ Wise        │      │
└────────┴──────────┴──────┴──────┴──────┴──────┴──────┴─────────────┴──────┘
```

### 6. Additional Buttons (Right Side)
```
┌────────────────────┐
│ Calculate          │
│ Imported Item %    │
├────────────────────┤
│ Item History       │
├────────────────────┤
│ Pur Detail         │
├────────────────────┤
│ Sale Detail        │
└────────────────────┘
```

## Key Features to Implement

### 1. Real-time Calculations
- Line total = (Qty × Pur Price) - Disc Amt + AdvAmount
- Disc Amt = Pur Price × Qty × (Disc % / 100)
- AdvAmount = Line total × (AdvTax% / 100)
- Margin % = ((Sale Price - Pur Price) / Pur Price) × 100
- Net Payable = Sum of all line totals - Invoice Discount + Invoice Advance Tax

### 2. Bonus Quantity Tracking
- Bonus items (free goods from supplier)
- Don't affect purchase cost
- Added to stock like regular qty
- Tracked separately

### 3. Invoice-level Adjustments
- Invoice Advance Tax (applies to whole invoice)
- Invoice Discount (% or flat amount)
- Affects Net Payable

### 4. Payment Tracking
- Payment amount field
- Balance calculation (Net Payable - Payment)
- Payment method (Cash/Credit/Bank/etc)

### 5. Navigation
- First/Previous/Next/Last buttons
- For browsing existing invoices
- Edit mode for past invoices

### 6. Additional Features
- Item History button (shows past purchases of selected item)
- Supplier Wise button (filter by supplier)
- Calculate button (recalculates all totals)
- Print functionality

## Comparison with Your Current System

### What You Have ✅
- Purchase Order creation
- Purchase Order receiving
- Supplier management
- Product catalog
- Basic pricing

### What Needs Enhancement 🔄

1. **Purchase Invoice Screen**
   - More detailed than current PO receiving
   - Real-time calculations
   - Bonus quantity field
   - Advance tax fields
   - Discount at item and invoice level
   - Margin % display

2. **Invoice Management**
   - Browse invoices (First/Prev/Next/Last)
   - Edit past invoices
   - Print invoices

3. **Calculations**
   - Item-level discount
   - Advance tax
   - Invoice-level discount
   - Automatic margin calculation

4. **Payment Integration**
   - Record payment with invoice
   - Track balance due
   - Multiple payment methods

## Recommended Implementation

### Option 1: Enhance Existing Receiving Screen
File: `PurchaseOrderReceiveView.vue`
- Add bonus quantity field
- Add discount % and amount
- Add advance tax fields
- Add sale price and margin display
- Add invoice-level adjustments
- Add payment fields

### Option 2: Create New Purchase Invoice Screen
File: `PurchaseInvoiceView.vue` (new)
- Completely new screen matching the sample
- Independent of Purchase Orders
- Direct purchase entry
- Full feature set from sample

## Layout Structure

```vue
<template>
  <div class="purchase-invoice-view">
    <!-- Header Section -->
    <div class="invoice-header">
      <div class="header-fields">
        <field>Invoice No</field>
        <field>Bill #</field>
        <field>Supplier</field>
        <field>Payment</field>
        <field>Date</field>
      </div>
      <div class="item-search">
        <input placeholder="ITEM" />
      </div>
    </div>

    <!-- Quick Entry Row -->
    <div class="quick-entry">
      <input placeholder="QTY" />
      <input placeholder="PUR. PRICE" />
      <input placeholder="SALE PRICE" />
      <input placeholder="Disc/Item %" />
      <input placeholder="GST/ITEM" />
      <button>Add ↓</button>
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th>Sr</th>
          <th>Description</th>
          <th>Qty</th>
          <th>Bonus</th>
          <th>Pur Price</th>
          <th>Disc %</th>
          <th>Disc Amt</th>
          <th>AdvTax%</th>
          <th>AdvAmount</th>
          <th>Total</th>
          <th>Sale Price</th>
          <th>Margin %</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in items" :key="index">
          <!-- Editable cells -->
        </tr>
      </tbody>
    </table>

    <!-- Footer Section -->
    <div class="invoice-footer">
      <div class="summary">
        Items: {{ itemCount }}
        Item Disc: {{ totalItemDisc }}
        GST: {{ totalGST }}
      </div>
      
      <div class="invoice-adjustments">
        <div>Invoice Advance Tax: %</div>
        <div>Invoice Discount: % / Flat</div>
      </div>
      
      <div class="payment-section">
        Payment: <input />
        Balance: <input readonly />
        Net Payable: {{ netPayable }}
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="action-buttons">
      <button>First</button>
      <button>Previous</button>
      <button>Next</button>
      <button>Last</button>
      <button>Print</button>
      <button>New</button>
      <button>Edit</button>
      <button>Save</button>
      <button>Exit</button>
    </div>
  </div>
</template>
```

## Database Schema Additions

### Purchase Invoices Table
```sql
CREATE TABLE purchase_invoices (
  id INTEGER PRIMARY KEY,
  invoice_number TEXT UNIQUE,
  supplier_bill_number TEXT,
  supplier_id INTEGER,
  purchase_date TEXT,
  payment_method TEXT,
  subtotal REAL,
  item_discount REAL,
  invoice_discount_percent REAL,
  invoice_discount_amount REAL,
  advance_tax_percent REAL,
  advance_tax_amount REAL,
  net_amount REAL,
  payment_amount REAL,
  balance REAL,
  status TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### Purchase Invoice Items Table
```sql
CREATE TABLE purchase_invoice_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER,
  product_id INTEGER,
  quantity INTEGER,
  bonus_quantity INTEGER,
  purchase_price REAL,
  sale_price REAL,
  discount_percent REAL,
  discount_amount REAL,
  advance_tax_percent REAL,
  advance_tax_amount REAL,
  line_total REAL,
  margin_percent REAL,
  batch_number TEXT,
  expiry_date TEXT,
  FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
```

## Summary

To match the sample, you need to:

1. ✅ Either enhance `PurchaseOrderReceiveView.vue`
2. ✅ Or create new `PurchaseInvoiceView.vue`
3. ✅ Add all the fields shown in sample
4. ✅ Implement real-time calculations
5. ✅ Add invoice navigation (First/Prev/Next/Last)
6. ✅ Add printing functionality
7. ✅ Integrate with inventory updates

**Would you like me to:**
- A) Enhance the existing Purchase Receive view to match this?
- B) Create a completely new Purchase Invoice screen?
- C) Show you how to implement specific features (calculations, bonus tracking, etc)?

Let me know which approach you prefer!
