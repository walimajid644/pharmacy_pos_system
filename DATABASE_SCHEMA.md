# Database Schema

## Overview

SQLite database with 11 tables designed for:
- **Offline-first operation**
- **Future sync capability** (UUID keys, soft deletes)
- **Audit trail** (timestamps, stock movements)
- **Pakistan pharmacy requirements** (DRAP, pack/loose sales)

---

## Tables

### 1. users
**Purpose**: Staff authentication and role-based access

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| username | TEXT | UNIQUE, NOT NULL | Login username |
| password_hash | TEXT | NOT NULL | Hashed password (TODO: bcrypt) |
| full_name | TEXT | NOT NULL | Display name |
| role | TEXT | NOT NULL | admin/manager/cashier/accountant |
| is_active | INTEGER | NOT NULL, DEFAULT 1 | Account enabled |
| last_login | TEXT | | ISO 8601 timestamp |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |
| deleted_at | TEXT | | Soft delete timestamp |

**Indexes**: username, role

**Sample**:
```sql
INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
VALUES ('uuid-1', 'admin', 'admin123', 'System Admin', 'admin', 1, '2024-10-24', '2024-10-24');
```

---

### 2. categories
**Purpose**: Product categorization

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | Category name |
| description | TEXT | | Optional details |
| is_active | INTEGER | NOT NULL, DEFAULT 1 | |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |
| deleted_at | TEXT | | Soft delete |

**Indexes**: name

---

### 3. manufacturers
**Purpose**: Drug manufacturers/suppliers

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | Manufacturer name |
| description | TEXT | | Optional details |
| is_active | INTEGER | NOT NULL, DEFAULT 1 | |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |
| deleted_at | TEXT | | Soft delete |

**Indexes**: name

---

### 4. products
**Purpose**: Product master data

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| sku | TEXT | UNIQUE, NOT NULL | Stock Keeping Unit |
| name | TEXT | NOT NULL | Product name |
| generic_name | TEXT | | Generic/scientific name |
| barcode | TEXT | | For scanner |
| category_id | TEXT | FK categories(id) | |
| manufacturer_id | TEXT | FK manufacturers(id) | |
| unit_price | REAL | NOT NULL | Selling price per unit |
| cost_price | REAL | NOT NULL | Purchase cost per unit |
| pack_size | INTEGER | NOT NULL, DEFAULT 1 | Units per pack (e.g., 10 tablets) |
| sell_by_loose_unit | INTEGER | NOT NULL, DEFAULT 0 | Allow single-unit sales? |
| drap_registration_number | TEXT | | Pakistan drug authority |
| controlled_substance | INTEGER | NOT NULL, DEFAULT 0 | Requires tracking |
| reorder_level | INTEGER | NOT NULL, DEFAULT 10 | Low stock threshold |
| is_active | INTEGER | NOT NULL, DEFAULT 1 | |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |
| deleted_at | TEXT | | Soft delete |

**Indexes**: sku, name, barcode, category_id

**Example**:
- Product: Panadol 500mg
- Pack size: 10 (tablets per strip)
- Sell by loose: Yes (can sell 1-2 tablets)
- Unit price: Rs 2.50 per tablet

---

### 5. product_batches
**Purpose**: Batch-level stock tracking (FEFO - First Expiry First Out)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| product_id | TEXT | FK products(id), NOT NULL | |
| batch_number | TEXT | NOT NULL | Manufacturer batch code |
| expiry_date | TEXT | NOT NULL | ISO 8601 date |
| quantity_in_stock | INTEGER | NOT NULL | Current stock level |
| cost_price_at_batch | REAL | NOT NULL | Cost for this batch |
| received_date | TEXT | NOT NULL | When batch arrived |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |

**Indexes**: product_id, expiry_date  
**Unique**: (product_id, batch_number)

**Why batch tracking?**
- Different batches have different expiry dates
- FEFO selling strategy (sell earliest expiry first)
- Cost price may vary by batch
- Regulatory requirement for batch traceability

---

### 6. customers
**Purpose**: Customer records

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| customer_code | TEXT | UNIQUE, NOT NULL | Customer ID (C001, C002...) |
| first_name | TEXT | NOT NULL | |
| last_name | TEXT | NOT NULL | |
| phone_number | TEXT | | Contact number |
| address | TEXT | | Delivery address |
| customer_type | TEXT | NOT NULL | retail/wholesale |
| credit_limit | REAL | NOT NULL, DEFAULT 0 | Maximum credit allowed |
| current_balance | REAL | NOT NULL, DEFAULT 0 | Outstanding balance |
| loyalty_points | INTEGER | NOT NULL, DEFAULT 0 | Reward points |
| is_active | INTEGER | NOT NULL, DEFAULT 1 | |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |
| deleted_at | TEXT | | Soft delete |

**Indexes**: customer_code, phone_number, (last_name, first_name)

---

### 7. sales_invoices
**Purpose**: Sales transaction headers

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| invoice_number | TEXT | UNIQUE, NOT NULL | INV-1234567890 |
| customer_id | TEXT | FK customers(id) | Nullable for walk-in |
| cashier_id | TEXT | FK users(id), NOT NULL | Who processed sale |
| invoice_date | TEXT | NOT NULL | ISO 8601 timestamp |
| total_amount | REAL | NOT NULL | Before tax & discount |
| tax_amount | REAL | NOT NULL | Sales tax/GST |
| discount_amount | REAL | NOT NULL | Invoice-level discount |
| net_amount | REAL | NOT NULL | Final amount paid |
| payment_method | TEXT | NOT NULL | cash/card/mobile |
| status | TEXT | NOT NULL | completed/pending/cancelled |
| notes | TEXT | | Optional remarks |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |

**Indexes**: invoice_number, invoice_date, customer_id, cashier_id

---

### 8. sales_invoice_items
**Purpose**: Line items for each sale

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| invoice_id | TEXT | FK sales_invoices(id), NOT NULL | |
| product_id | TEXT | FK products(id), NOT NULL | |
| batch_id | TEXT | FK product_batches(id), NOT NULL | Which batch sold |
| quantity | INTEGER | NOT NULL | Units sold |
| is_loose_sale | INTEGER | NOT NULL, DEFAULT 0 | Single unit vs pack |
| unit_price | REAL | NOT NULL | Price at time of sale |
| discount_percent | REAL | NOT NULL, DEFAULT 0 | Item-level discount |
| line_total | REAL | NOT NULL | Final line amount |
| created_at | TEXT | NOT NULL | |

**Indexes**: invoice_id, product_id

**Example**:
```
Product: Panadol (pack_size=10)
Quantity: 2
is_loose_sale: 0 → Sold 2 packs = 20 tablets
is_loose_sale: 1 → Sold 2 loose tablets
```

---

### 9. stock_movements
**Purpose**: Audit log of ALL stock changes (append-only)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| product_id | TEXT | FK products(id), NOT NULL | |
| batch_id | TEXT | FK product_batches(id), NOT NULL | |
| movement_type | TEXT | NOT NULL | in/out/adjustment/return |
| quantity | INTEGER | NOT NULL | Positive=in, Negative=out |
| reference_type | TEXT | | sale/purchase/adjustment |
| reference_id | TEXT | | invoice_id/PO_id/etc |
| reason | TEXT | | Optional explanation |
| user_id | TEXT | FK users(id), NOT NULL | Who made the change |
| movement_date | TEXT | NOT NULL | When it happened |
| created_at | TEXT | NOT NULL | |

**Indexes**: product_id, batch_id, movement_date

**⚠️ NEVER UPDATE OR DELETE** - This is an audit log!

**Example**:
```sql
-- Sale: -10 tablets
INSERT INTO stock_movements (id, product_id, batch_id, movement_type, quantity, reference_type, reference_id, user_id, movement_date, created_at)
VALUES ('uuid', 'prod-1', 'batch-1', 'out', -10, 'sale', 'inv-123', 'user-1', '2024-10-24', '2024-10-24');

-- Purchase: +500 tablets
INSERT INTO stock_movements (..., movement_type, quantity, reference_type, ...)
VALUES (..., 'in', 500, 'purchase', ...);
```

---

### 10. app_settings
**Purpose**: Application configuration

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID (single row) |
| company_name | TEXT | NOT NULL | Pharmacy name |
| company_address | TEXT | | For receipts |
| company_phone | TEXT | | Contact info |
| tax_rate | REAL | NOT NULL, DEFAULT 0 | Sales tax % |
| currency_symbol | TEXT | NOT NULL, DEFAULT 'Rs' | Currency |
| theme | TEXT | NOT NULL, DEFAULT 'light' | light/dark |
| printer_config | TEXT | | JSON for printer settings |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |

**Note**: Only ONE row in this table (singleton pattern)

---

## Relationships

```
users
  ↓ (cashier_id)
sales_invoices ← (customer_id) → customers
  ↓ (invoice_id)
sales_invoice_items → products → categories
  ↓                       ↓         manufacturers
product_batches           ↓
  ↓                       ↓
stock_movements ← (user_id) → users
```

---

## Key Patterns

### UUID Primary Keys
```typescript
import { generateUUID } from '@/lib/utils'
const id = generateUUID() // crypto.randomUUID()
```

**Why?** Future multi-location sync without ID conflicts.

### Soft Deletes
```sql
-- Mark as deleted
UPDATE products SET deleted_at = '2024-10-24T12:00:00Z' WHERE id = 'prod-1';

-- Always filter deleted records
SELECT * FROM products WHERE deleted_at IS NULL;
```

**Why?** Preserve audit trail, enable "undo", support sync.

### Timestamps
```sql
-- On INSERT
created_at = datetime('now')
updated_at = datetime('now')

-- On UPDATE
updated_at = datetime('now')
```

**Format**: ISO 8601 UTC (e.g., `2024-10-24T12:00:00Z`)

### Stock Deduction (FEFO)
```typescript
// 1. Query batches sorted by expiry (earliest first)
const batches = await executeQuery(
  'SELECT * FROM product_batches WHERE product_id = ? ORDER BY expiry_date ASC',
  [productId]
)

// 2. Sell from earliest expiry batch
const batch = batches[0]

// 3. Deduct stock
await executeUpdate(
  'UPDATE product_batches SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?',
  [quantity, batch.id]
)

// 4. Log movement
await executeUpdate(
  'INSERT INTO stock_movements (...) VALUES (...)',
  [...]
)
```

---

## Sample Queries

### Get products with low stock
```sql
SELECT p.*, 
       SUM(pb.quantity_in_stock) as total_stock
FROM products p
LEFT JOIN product_batches pb ON p.id = pb.product_id
WHERE p.deleted_at IS NULL
GROUP BY p.id
HAVING total_stock < p.reorder_level
ORDER BY total_stock ASC;
```

### Get products near expiry (60 days)
```sql
SELECT p.name, pb.batch_number, pb.expiry_date, pb.quantity_in_stock
FROM product_batches pb
JOIN products p ON pb.product_id = p.id
WHERE pb.expiry_date <= date('now', '+60 days')
  AND pb.expiry_date > date('now')
  AND pb.quantity_in_stock > 0
  AND p.deleted_at IS NULL
ORDER BY pb.expiry_date ASC;
```

### Daily sales report
```sql
SELECT 
  DATE(invoice_date) as sale_date,
  COUNT(*) as invoice_count,
  SUM(net_amount) as total_sales,
  AVG(net_amount) as avg_invoice
FROM sales_invoices
WHERE status = 'completed'
  AND DATE(invoice_date) = DATE('now')
GROUP BY DATE(invoice_date);
```

### Top selling products (last 30 days)
```sql
SELECT 
  p.name,
  SUM(si.quantity) as units_sold,
  SUM(si.line_total) as revenue
FROM sales_invoice_items si
JOIN products p ON si.product_id = p.id
JOIN sales_invoices inv ON si.invoice_id = inv.id
WHERE inv.status = 'completed'
  AND inv.invoice_date >= date('now', '-30 days')
GROUP BY p.id
ORDER BY units_sold DESC
LIMIT 10;
```

---

## Migration Strategy

This document contains historical schema examples. The running desktop schema is defined by `src-tauri/migrations/001_app_schema.sql`, the additive migrations below, and `src-tauri/src/database_api.rs`. Use those files as the authority when checking a column or constraint.

### Desktop startup
- `001_app_schema.sql` creates a fresh desktop database. `001_initial_schema.sql` is a historical/test schema.
- `004_phase5_inventory.sql` adds suppliers, purchase orders, returns, and adjustments.
- `005_approval_guards.sql` and `006_inventory_triggers.sql` enforce approval and inventory rules.
- `007_desktop_operations.sql` adds cashier shifts, Rx sale fields, loose-strip events, and supplier payments.
- `008_supplier_drawer.sql` links cash supplier payments to cashier shifts.

`database_api::initialize` applies these upgrades at startup and records the numbered additive migrations in `schema_migrations`. The `002_*` and `003_test_sales_data.sql` files are samples or test data; a fresh desktop database does not seed demo products, customers, or suppliers.

---

## Database Location

**Windows**: `%APPDATA%\com.pharmacypos.app\pharmacy.db`

Full path example:
```
C:\Users\YourName\AppData\Roaming\com.pharmacypos.app\pharmacy.db
```

**Tools to inspect**:
- [DB Browser for SQLite](https://sqlitebrowser.org/)
- [DBeaver](https://dbeaver.io/)

---

## Backup Strategy

The desktop app creates a consistent SQLite snapshot in `%APPDATA%\com.pharmacypos.app\Backups` on startup, checks hourly, and keeps seven daily snapshots. The **Backups** screen lets a manager export an additional snapshot to an existing local or USB folder. See `PHARMACY_OPERATIONS.md` for the restore procedure; copying only a live `pharmacy.db` may omit uncheckpointed WAL data.

---

## Performance Optimization

### Indexes
Already created on:
- Foreign keys
- Search fields (name, SKU, barcode)
- Date fields (for reports)

### Query Tips
- Always use `WHERE deleted_at IS NULL`
- Use `LIMIT` on large result sets
- Use prepared statements (parameterized queries)
- Avoid `SELECT *` in production code

### Vacuum
Run periodically to reclaim space:
```sql
VACUUM;
```

---

**Questions?** See [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) for usage patterns.
