CREATE TABLE commercial_documents (
 id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('estimate','preorder')),
 customer_id TEXT REFERENCES customers(id), customer_name TEXT NOT NULL,
 document_date TEXT NOT NULL, due_date TEXT, notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','cancelled','converted')),
 subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents >= 0),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 invoice_id TEXT UNIQUE REFERENCES sales_invoices(id)
);
CREATE TABLE commercial_document_items (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES commercial_documents(id) ON DELETE CASCADE,
 product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0),
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0), UNIQUE(document_id, product_id)
);
CREATE TABLE account_entries (
 id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('receipt','expense')),
 customer_id TEXT REFERENCES customers(id), category TEXT NOT NULL, description TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), method TEXT NOT NULL CHECK(method IN ('cash','bank','mobile')),
 reference TEXT NOT NULL DEFAULT '', entry_date TEXT NOT NULL,
 shift_id TEXT REFERENCES cashier_shifts(id), recorded_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')),
 void_reason TEXT, voided_by TEXT REFERENCES users(id), voided_at TEXT,
 CHECK((kind = 'receipt' AND customer_id IS NOT NULL) OR (kind = 'expense' AND customer_id IS NULL))
);
CREATE INDEX idx_account_entries_shift ON account_entries(shift_id, status);
CREATE INDEX idx_commercial_documents_kind ON commercial_documents(kind, status, document_date);
