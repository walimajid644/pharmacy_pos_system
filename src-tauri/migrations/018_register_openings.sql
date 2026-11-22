CREATE TABLE expense_heads (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
 description TEXT, is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE UNIQUE INDEX expense_head_names ON expense_heads(trim(name) COLLATE NOCASE) WHERE deleted_at IS NULL;
INSERT INTO expense_heads(id,name,created_at,updated_at)
SELECT lower(hex(randomblob(16))),trim(category),datetime('now'),datetime('now')
FROM account_entries WHERE kind='expense' GROUP BY trim(category) COLLATE NOCASE;
INSERT INTO expense_heads(id,name,created_at,updated_at)
SELECT lower(hex(randomblob(16))),value,datetime('now'),datetime('now') FROM json_each('["Rent","Utilities","Salaries","Transport","Supplies","Maintenance","General","Other"]')
WHERE NOT EXISTS(SELECT 1 FROM expense_heads WHERE name=value COLLATE NOCASE);
ALTER TABLE account_entries ADD COLUMN expense_head_id TEXT REFERENCES expense_heads(id);
UPDATE account_entries SET expense_head_id=(SELECT id FROM expense_heads WHERE name=trim(category) COLLATE NOCASE) WHERE kind='expense';
CREATE TRIGGER expense_head_insert_guard BEFORE INSERT ON account_entries WHEN NEW.kind='expense'
AND NOT EXISTS(SELECT 1 FROM expense_heads WHERE name=trim(NEW.category) COLLATE NOCASE AND is_active=1 AND deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Choose an active expense head'); END;
CREATE TRIGGER expense_head_insert_link AFTER INSERT ON account_entries WHEN NEW.kind='expense'
BEGIN UPDATE account_entries SET expense_head_id=(SELECT id FROM expense_heads WHERE name=trim(NEW.category) COLLATE NOCASE AND deleted_at IS NULL) WHERE id=NEW.id; END;

CREATE TABLE bank_accounts (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 description TEXT, is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE UNIQUE INDEX bank_account_names ON bank_accounts(trim(name) COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE TABLE opening_balances (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('customer','supplier','bank')),
 entity_id TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN -10000000000 AND 10000000000),
 entry_date TEXT NOT NULL, reference TEXT NOT NULL, notes TEXT NOT NULL,
 recorded_by TEXT REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(kind,entity_id)
);
-- Preserve historical balances once. Never add them to current customer balances again.
INSERT INTO opening_balances(id,kind,entity_id,amount_cents,entry_date,reference,notes,recorded_by,created_at)
SELECT 'legacy-customer-'||customer_id,'customer',customer_id,SUM(amount_cents),substr(MIN(occurred_at),1,10),'Legacy opening','Historical age unknown',NULL,MIN(occurred_at)
FROM customer_ledger WHERE kind='opening' GROUP BY customer_id;
INSERT INTO opening_balances(id,kind,entity_id,amount_cents,entry_date,reference,notes,recorded_by,created_at)
SELECT 'legacy-supplier-'||id,'supplier',id,CAST(ROUND(current_balance*100) AS INTEGER),substr(created_at,1,10),'Legacy opening','Historical age unknown',NULL,datetime('now')
FROM suppliers WHERE ROUND(COALESCE(current_balance,0)*100)<>0;
CREATE TRIGGER opening_no_update BEFORE UPDATE ON opening_balances BEGIN SELECT RAISE(ABORT,'Opening balances are immutable'); END;
CREATE TRIGGER opening_no_delete BEFORE DELETE ON opening_balances BEGIN SELECT RAISE(ABORT,'Opening balances are immutable'); END;
CREATE TABLE supplier_opening_payments (
 id TEXT PRIMARY KEY, voucher_number TEXT NOT NULL UNIQUE,
 opening_id TEXT NOT NULL REFERENCES opening_balances(id), supplier_id TEXT NOT NULL REFERENCES suppliers(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0), method TEXT NOT NULL CHECK(method IN ('cash','bank','mobile')),
 reference TEXT, notes TEXT, paid_at TEXT NOT NULL, recorded_by TEXT NOT NULL REFERENCES users(id),
 shift_id TEXT REFERENCES cashier_shifts(id)
);
CREATE INDEX supplier_opening_payments_opening ON supplier_opening_payments(opening_id);
CREATE VIEW supplier_opening_outstanding AS
SELECT o.id,o.entity_id AS supplier_id,o.reference,o.entry_date,o.amount_cents,
COALESCE((SELECT SUM(p.amount_cents) FROM supplier_opening_payments p WHERE p.opening_id=o.id),0) AS paid_cents
FROM opening_balances o WHERE o.kind='supplier';
CREATE TRIGGER audit_supplier_opening_payment AFTER INSERT ON supplier_opening_payments
BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'supplier_opening_payment',NEW.recorded_by,NEW.paid_at,'supplier_opening_payment',NEW.id,NEW.voucher_number,printf('Rs %.2f via %s',NEW.amount_cents/100.0,NEW.method),0); END;

CREATE TRIGGER supplier_opening_archive_guard BEFORE UPDATE OF deleted_at ON suppliers
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND EXISTS(
 SELECT 1 FROM supplier_opening_outstanding WHERE supplier_id=NEW.id AND amount_cents-paid_cents<>0)
BEGIN SELECT RAISE(ABORT,'Settle the supplier opening balance before archiving'); END;
