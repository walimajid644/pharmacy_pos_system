# Phase 5: Advanced Features - Purchase Orders, Stock Adjustments, Returns

**Priority:** HIGH - Business Critical Features  
**Target:** Complete inventory management system  
**Timeline:** 3-4 days

---

## 🎯 Overview

These three feature sets complete the core inventory management cycle:
1. **Purchase Orders** - How stock enters the system
2. **Stock Adjustments** - Manual corrections and losses
3. **Returns & Refunds** - Customer returns and stock restoration

---

## 📋 Feature 1: Purchase Order Management

### Database Schema

```sql
-- Suppliers table
CREATE TABLE suppliers (
    id TEXT PRIMARY KEY,
    supplier_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone_number TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    country TEXT DEFAULT 'Pakistan',
    tax_registration TEXT,
    payment_terms INTEGER DEFAULT 30,
    credit_limit REAL DEFAULT 0,
    current_balance REAL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

-- Purchase orders table
CREATE TABLE purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT UNIQUE NOT NULL,
    supplier_id TEXT NOT NULL,
    order_date TEXT NOT NULL,
    expected_delivery_date TEXT,
    status TEXT NOT NULL CHECK(status IN ('draft', 'sent', 'partial', 'received', 'cancelled')),
    subtotal REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    shipping_cost REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL,
    received_date TEXT,
    received_by TEXT,
    notes TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (received_by) REFERENCES users(id)
);

-- Purchase order items table
CREATE TABLE purchase_order_items (
    id TEXT PRIMARY KEY,
    po_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER NOT NULL DEFAULT 0,
    unit_cost REAL NOT NULL,
    tax_rate REAL NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL,
    batch_number TEXT,
    expiry_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
```

### Views Needed

#### 1. SuppliersView.vue
- Supplier list with search
- Add/Edit supplier form
- Supplier details modal
- Current balance display
- Active/inactive toggle
- Bilingual labels

#### 2. PurchaseOrdersView.vue
- PO list with filters (status, supplier, date range)
- Status badges (draft, sent, partial, received, cancelled)
- Create PO button
- PO number display
- Supplier name
- Total amount
- Status workflow buttons

#### 3. PurchaseOrderFormView.vue
- Supplier selection
- Expected delivery date
- Product line items:
  - Product search/select
  - Quantity input
  - Unit cost
  - Discount
  - Line total calculation
- Subtotal, tax, discount, shipping
- Total calculation
- Save as draft or send
- Notes field

#### 4. PurchaseOrderReceiveView.vue
- PO details display
- Line items with:
  - Ordered quantity
  - Already received
  - Receive now input
  - Batch number input
  - Expiry date picker
- Partial receiving support
- Auto-create batches
- Update stock levels
- Mark as received/partial

---

## 📋 Feature 2: Stock Adjustments

### Database Schema

```sql
-- Stock adjustments table
CREATE TABLE stock_adjustments (
    id TEXT PRIMARY KEY,
    adjustment_number TEXT UNIQUE NOT NULL,
    adjustment_date TEXT NOT NULL,
    adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('increase', 'decrease')),
    reason TEXT NOT NULL CHECK(reason IN (
        'damaged', 'expired', 'stolen', 'lost', 'found', 
        'count_error', 'return_to_supplier', 'other'
    )),
    reason_notes TEXT,
    total_value REAL NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
    approved_by TEXT,
    approved_at TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Stock adjustment items table
CREATE TABLE stock_adjustment_items (
    id TEXT PRIMARY KEY,
    adjustment_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    quantity_adjusted INTEGER NOT NULL,
    unit_cost REAL NOT NULL,
    line_value REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (adjustment_id) REFERENCES stock_adjustments(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
);
```

### Views Needed

#### 1. StockAdjustmentsView.vue
- Adjustment list with filters
- Status badges (pending, approved, rejected)
- Create adjustment button
- Adjustment number
- Date, reason, value
- Approval workflow

#### 2. StockAdjustmentFormView.vue
- Adjustment type (increase/decrease)
- Reason dropdown:
  - Damaged
  - Expired
  - Stolen
  - Lost
  - Found
  - Count Error
  - Return to Supplier
  - Other
- Product + batch selection
- Quantity input (positive/negative)
- Automatic value calculation
- Multiple items support
- Total value display
- Notes field
- Submit for approval

#### 3. StockAdjustmentApprovalView.vue
- Pending adjustments list
- Review details
- Approve/Reject buttons
- Approval notes
- Audit trail

---

## 📋 Feature 3: Returns & Refunds

### Database Schema

```sql
-- Sales returns table
CREATE TABLE sales_returns (
    id TEXT PRIMARY KEY,
    return_number TEXT UNIQUE NOT NULL,
    original_invoice_id TEXT NOT NULL,
    return_date TEXT NOT NULL,
    return_reason TEXT NOT NULL CHECK(return_reason IN (
        'defective', 'wrong_item', 'expired', 'customer_changed_mind',
        'duplicate_purchase', 'other'
    )),
    reason_notes TEXT,
    subtotal REAL NOT NULL,
    tax_amount REAL NOT NULL,
    refund_amount REAL NOT NULL,
    refund_method TEXT NOT NULL CHECK(refund_method IN ('cash', 'card', 'credit_note')),
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'refunded', 'rejected')),
    processed_by TEXT NOT NULL,
    approved_by TEXT,
    approved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (original_invoice_id) REFERENCES sales_invoices(id),
    FOREIGN KEY (processed_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Sales return items table
CREATE TABLE sales_return_items (
    id TEXT PRIMARY KEY,
    return_id TEXT NOT NULL,
    invoice_item_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    quantity_returned INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    line_total REAL NOT NULL,
    restock INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (return_id) REFERENCES sales_returns(id),
    FOREIGN KEY (invoice_item_id) REFERENCES sales_invoice_items(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
);
```

### Views Needed

#### 1. SalesReturnsView.vue
- Returns list with filters
- Status badges
- Create return button
- Return number
- Original invoice reference
- Refund amount
- Status

#### 2. SalesReturnFormView.vue
- Invoice lookup (by number)
- Display original invoice items
- Select items to return:
  - Quantity slider (1 to original qty)
  - Return reason per item
  - Restock checkbox
- Return reason dropdown
- Refund calculation
- Refund method selection
- Notes field

#### 3. SalesReturnApprovalView.vue
- Pending returns list
- Review details
- Original invoice link
- Approve/Reject buttons
- Process refund
- Restore stock

---

## 🗂️ File Structure

```
src/
├── views/
│   ├── suppliers/
│   │   ├── SuppliersView.vue
│   │   └── SupplierFormModal.vue
│   │
│   ├── purchase-orders/
│   │   ├── PurchaseOrdersView.vue
│   │   ├── PurchaseOrderFormView.vue
│   │   └── PurchaseOrderReceiveView.vue
│   │
│   ├── stock-adjustments/
│   │   ├── StockAdjustmentsView.vue
│   │   ├── StockAdjustmentFormView.vue
│   │   └── StockAdjustmentApprovalView.vue
│   │
│   └── returns/
│       ├── SalesReturnsView.vue
│       ├── SalesReturnFormView.vue
│       └── SalesReturnApprovalView.vue
│
├── lib/
│   └── types.ts (add new types)
│
└── router/
    └── index.ts (add new routes)
```

---

## 🚀 Implementation Plan

### Day 1: Database + Suppliers + Purchase Orders
1. Create database migration (new tables)
2. Add types to types.ts
3. Create SuppliersView.vue
4. Create PurchaseOrdersView.vue
5. Create PurchaseOrderFormView.vue
6. Test PO creation

### Day 2: PO Receiving + Stock Adjustments
1. Create PurchaseOrderReceiveView.vue
2. Implement batch auto-creation
3. Implement stock updates
4. Create StockAdjustmentsView.vue
5. Create StockAdjustmentFormView.vue
6. Implement approval workflow

### Day 3: Returns & Refunds
1. Create SalesReturnsView.vue
2. Create SalesReturnFormView.vue
3. Implement invoice lookup
4. Implement refund calculation
5. Implement stock restoration
6. Test return workflow

### Day 4: Integration + Testing
1. Add navigation links
2. Add i18n translations
3. Update dashboard with new metrics
4. Comprehensive testing
5. Documentation

---

## 🎨 UI/UX Considerations

All new views will use:
- ✅ BilingualText for all labels
- ✅ Theme-aware colors
- ✅ StatCards where appropriate
- ✅ Badge components for status
- ✅ Loading states
- ✅ Empty states
- ✅ Consistent design with Phase 4 work

---

## 📊 Success Criteria

### Purchase Orders
- [ ] Can create suppliers
- [ ] Can create PO with multiple items
- [ ] Can save as draft
- [ ] Can send to supplier
- [ ] Can receive items (full or partial)
- [ ] Batches auto-created on receive
- [ ] Stock levels update correctly
- [ ] PO status workflow works

### Stock Adjustments
- [ ] Can create adjustment
- [ ] Multiple adjustment reasons
- [ ] Approval workflow works
- [ ] Stock movements logged
- [ ] History viewable
- [ ] Audit trail complete

### Returns & Refunds
- [ ] Can lookup original invoice
- [ ] Can select items to return
- [ ] Partial returns supported
- [ ] Refund calculated correctly
- [ ] Stock restored if applicable
- [ ] Return invoice generated
- [ ] Audit trail complete

---

## 🔗 Integration Points

### With Existing Features
- **Products:** Select products for PO, adjustments, returns
- **Batches:** Auto-create on PO receive, select for adjustments
- **Users:** Created by, approved by tracking
- **Stock Movements:** Log all stock changes
- **Dashboard:** Add new metrics (pending POs, pending adjustments)

### New Navigation Items
```
Inventory (new dropdown)
  ├── Purchase Orders
  ├── Stock Adjustments
  └── Returns & Refunds

Suppliers (new top-level)
```

---

## 🎯 Priority Order

1. **Suppliers + Purchase Orders** (HIGHEST)
   - Essential for getting stock into system
   - Most requested feature
   - 40% of Phase 5

2. **Stock Adjustments** (HIGH)
   - Essential for accuracy
   - Handles losses/damages
   - 30% of Phase 5

3. **Returns & Refunds** (MEDIUM-HIGH)
   - Important for customer service
   - Stock restoration needed
   - 30% of Phase 5

---

**Let's start with Purchase Orders! Ready to begin?** 🚀
