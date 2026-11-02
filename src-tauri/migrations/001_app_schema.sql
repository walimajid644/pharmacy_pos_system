
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'manager', 'cashier', 'accountant')),
    is_active INTEGER NOT NULL DEFAULT 1,
    last_login TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- Manufacturers table
CREATE TABLE IF NOT EXISTS manufacturers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_manufacturers_name ON manufacturers(name);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    generic_name TEXT,
    barcode TEXT,
    category_id TEXT,
    manufacturer_id TEXT,
    unit_price REAL NOT NULL,
    cost_price REAL NOT NULL,
    pack_size INTEGER NOT NULL DEFAULT 1,
    sell_by_loose_unit INTEGER NOT NULL DEFAULT 0,
    drap_registration_number TEXT,
    controlled_substance INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 10,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id)
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- Product batches table
CREATE TABLE IF NOT EXISTS product_batches (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    batch_number TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    quantity_in_stock INTEGER NOT NULL,
    cost_price_at_batch REAL NOT NULL,
    received_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON product_batches(expiry_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_unique ON product_batches(product_id, batch_number);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    customer_code TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone_number TEXT,
    address TEXT,
    customer_type TEXT NOT NULL CHECK(customer_type IN ('retail', 'wholesale')),
    credit_limit REAL NOT NULL DEFAULT 0,
    current_balance REAL NOT NULL DEFAULT 0,
    loyalty_points INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(last_name, first_name);

-- Sales invoices table
CREATE TABLE IF NOT EXISTS sales_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    customer_id TEXT,
    cashier_id TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    total_amount REAL NOT NULL,
    tax_amount REAL NOT NULL,
    discount_amount REAL NOT NULL,
    net_amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('completed', 'pending', 'cancelled')),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (cashier_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_number ON sales_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON sales_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON sales_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_cashier ON sales_invoices(cashier_id);

-- Sales invoice items table
CREATE TABLE IF NOT EXISTS sales_invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    sale_quantity INTEGER,
    is_loose_sale INTEGER NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL,
    discount_percent REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON sales_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON sales_invoice_items(product_id);

-- Stock movements table (audit log)
CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('in', 'out', 'adjustment', 'return')),
    quantity INTEGER NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    reason TEXT,
    user_id TEXT NOT NULL,
    movement_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_batch ON stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements(movement_date);

-- App settings table
CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    company_address TEXT,
    company_phone TEXT,
    tax_rate REAL NOT NULL DEFAULT 0,
    currency_symbol TEXT NOT NULL DEFAULT 'Rs',
    low_stock_threshold INTEGER NOT NULL DEFAULT 10,
    near_expiry_days INTEGER NOT NULL DEFAULT 60,
    receipt_header TEXT,
    receipt_footer TEXT,
    show_drap INTEGER NOT NULL DEFAULT 1,
    theme TEXT NOT NULL DEFAULT 'light',
    printer_config TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Insert default admin user (password: admin123, bcrypt hashed)
-- Hash generated with bcrypt 10 rounds
INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin',
    '$2b$10$HQ7l1TORz9fOTS.z8LgCF.z6cyelNU./qRveBuFGIyQhUy6ORutX2',
    'System Administrator',
    'admin',
    1,
    datetime('now'),
    datetime('now')
);
