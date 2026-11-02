-- =====================================================
-- Phase 5: Advanced Inventory Features Migration
-- Purchase Orders, Stock Adjustments, Returns & Refunds
-- =====================================================

-- =====================================================
-- SUPPLIERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS suppliers (
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

CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(supplier_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

-- =====================================================
-- PURCHASE ORDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
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

CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date);

-- =====================================================
-- PURCHASE ORDER ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
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

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product ON purchase_order_items(product_id);

-- =====================================================
-- STOCK ADJUSTMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS stock_adjustments (
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

CREATE INDEX IF NOT EXISTS idx_adjustments_number ON stock_adjustments(adjustment_number);
CREATE INDEX IF NOT EXISTS idx_adjustments_status ON stock_adjustments(status);
CREATE INDEX IF NOT EXISTS idx_adjustments_date ON stock_adjustments(adjustment_date);

-- =====================================================
-- STOCK ADJUSTMENT ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS stock_adjustment_items (
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

CREATE INDEX IF NOT EXISTS idx_adjustment_items_adjustment ON stock_adjustment_items(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_items_product ON stock_adjustment_items(product_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_items_batch ON stock_adjustment_items(batch_id);

-- =====================================================
-- SALES RETURNS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS sales_returns (
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
    refund_reference TEXT UNIQUE,
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

CREATE INDEX IF NOT EXISTS idx_returns_number ON sales_returns(return_number);
CREATE INDEX IF NOT EXISTS idx_returns_invoice ON sales_returns(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON sales_returns(status);
CREATE INDEX IF NOT EXISTS idx_returns_date ON sales_returns(return_date);

-- =====================================================
-- SALES RETURN ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS sales_return_items (
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

CREATE INDEX IF NOT EXISTS idx_return_items_return ON sales_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_invoice_item ON sales_return_items(invoice_item_id);
CREATE INDEX IF NOT EXISTS idx_return_items_product ON sales_return_items(product_id);
CREATE INDEX IF NOT EXISTS idx_return_items_batch ON sales_return_items(batch_id);
