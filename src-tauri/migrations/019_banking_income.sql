CREATE TABLE income_heads (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80), description TEXT,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE UNIQUE INDEX income_head_names ON income_heads(trim(name) COLLATE NOCASE) WHERE deleted_at IS NULL;
INSERT INTO income_heads(id,name,created_at,updated_at) SELECT lower(hex(randomblob(16))),value,datetime('now'),datetime('now') FROM json_each('["Other income","Bank interest","Service income","Rental income"]');
ALTER TABLE account_entries ADD COLUMN bank_account_id TEXT REFERENCES bank_accounts(id);
ALTER TABLE supplier_payments ADD COLUMN bank_account_id TEXT REFERENCES bank_accounts(id);
ALTER TABLE supplier_opening_payments ADD COLUMN bank_account_id TEXT REFERENCES bank_accounts(id);
ALTER TABLE supplier_payments ADD COLUMN bank_entry_date TEXT;
ALTER TABLE supplier_opening_payments ADD COLUMN bank_entry_date TEXT;
CREATE TABLE income_entries (
 id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, head_id TEXT NOT NULL REFERENCES income_heads(id), head_name TEXT NOT NULL,
 description TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents>0), method TEXT NOT NULL CHECK(method IN ('cash','bank','mobile')),
 bank_account_id TEXT REFERENCES bank_accounts(id), entry_date TEXT NOT NULL, reference TEXT NOT NULL,
 shift_id TEXT REFERENCES cashier_shifts(id), recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')), void_reason TEXT, voided_by TEXT REFERENCES users(id), voided_at TEXT,
 CHECK((method='bank' AND bank_account_id IS NOT NULL) OR (method<>'bank' AND bank_account_id IS NULL))
);
CREATE TABLE bank_transactions (
 id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('deposit','withdrawal','transfer')),
 account_id TEXT NOT NULL REFERENCES bank_accounts(id), to_account_id TEXT REFERENCES bank_accounts(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0), entry_date TEXT NOT NULL, reference TEXT NOT NULL, notes TEXT NOT NULL,
 shift_id TEXT REFERENCES cashier_shifts(id), recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')), void_reason TEXT, voided_by TEXT REFERENCES users(id), voided_at TEXT,
 CHECK((kind='transfer' AND to_account_id IS NOT NULL AND to_account_id<>account_id AND shift_id IS NULL) OR (kind<>'transfer' AND to_account_id IS NULL))
);
CREATE TABLE bank_reconciliations (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES bank_accounts(id), statement_date TEXT NOT NULL,
 statement_balance_cents INTEGER NOT NULL, book_balance_cents INTEGER NOT NULL, reference TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, UNIQUE(account_id,statement_date)
);
CREATE TABLE bank_clearances (
 entry_key TEXT PRIMARY KEY, reconciliation_id TEXT NOT NULL REFERENCES bank_reconciliations(id),
 account_id TEXT NOT NULL REFERENCES bank_accounts(id), amount_cents INTEGER NOT NULL
);
CREATE VIEW bank_ledger AS
SELECT 'opening:'||id AS entry_key,entity_id AS account_id,entry_date,reference AS number,notes AS description,amount_cents,'opening' AS source,id AS source_id FROM opening_balances WHERE kind='bank'
UNION ALL SELECT 'bank:'||id||':from',account_id,entry_date,number,kind||' · '||reference||' · '||notes,CASE WHEN kind='deposit' THEN amount_cents ELSE -amount_cents END,'bank',id FROM bank_transactions WHERE status='posted'
UNION ALL SELECT 'bank:'||id||':to',to_account_id,entry_date,number,'Transfer received · '||reference,amount_cents,'bank',id FROM bank_transactions WHERE status='posted' AND kind='transfer'
UNION ALL SELECT 'income:'||id,bank_account_id,entry_date,number,head_name||' · '||description,amount_cents,'income',id FROM income_entries WHERE method='bank' AND status='posted'
UNION ALL SELECT 'account:'||id,bank_account_id,entry_date,number,category||' · '||description,CASE WHEN kind='receipt' THEN amount_cents ELSE -amount_cents END,'account',id FROM account_entries WHERE method='bank' AND bank_account_id IS NOT NULL AND status='posted'
UNION ALL SELECT 'supplier:'||id,bank_account_id,COALESCE(bank_entry_date,substr(datetime(paid_at,'localtime'),1,10)),voucher_number,COALESCE(notes,'Supplier payment'),-amount_cents,'supplier',id FROM supplier_payments WHERE method='bank' AND bank_account_id IS NOT NULL
UNION ALL SELECT 'supplier_opening:'||id,bank_account_id,COALESCE(bank_entry_date,substr(datetime(paid_at,'localtime'),1,10)),voucher_number,COALESCE(notes,'Supplier opening payment'),-amount_cents,'supplier_opening',id FROM supplier_opening_payments WHERE method='bank' AND bank_account_id IS NOT NULL;
CREATE VIEW unassigned_bank_entries AS
SELECT 'account' AS source,id,number,entry_date,description,CASE WHEN kind='receipt' THEN amount_cents ELSE -amount_cents END AS amount_cents FROM account_entries WHERE method='bank' AND bank_account_id IS NULL AND status='posted'
UNION ALL SELECT 'supplier',id,voucher_number,COALESCE(bank_entry_date,substr(datetime(paid_at,'localtime'),1,10)),COALESCE(notes,'Supplier payment'),-amount_cents FROM supplier_payments WHERE method='bank' AND bank_account_id IS NULL
UNION ALL SELECT 'supplier_opening',id,voucher_number,COALESCE(bank_entry_date,substr(datetime(paid_at,'localtime'),1,10)),COALESCE(notes,'Supplier opening payment'),-amount_cents FROM supplier_opening_payments WHERE method='bank' AND bank_account_id IS NULL;
CREATE TRIGGER reconciled_bank_void BEFORE UPDATE OF status ON bank_transactions WHEN NEW.status<>OLD.status AND EXISTS(SELECT 1 FROM bank_clearances WHERE entry_key IN ('bank:'||NEW.id||':from','bank:'||NEW.id||':to')) BEGIN SELECT RAISE(ABORT,'Reconciled transfers or movements cannot be voided'); END;
CREATE TRIGGER reconciled_income_void BEFORE UPDATE OF status ON income_entries WHEN NEW.status<>OLD.status AND EXISTS(SELECT 1 FROM bank_clearances WHERE entry_key='income:'||NEW.id) BEGIN SELECT RAISE(ABORT,'Reconciled income cannot be voided'); END;
CREATE TRIGGER reconciled_account_void BEFORE UPDATE OF status ON account_entries WHEN NEW.status<>OLD.status AND EXISTS(SELECT 1 FROM bank_clearances WHERE entry_key='account:'||NEW.id) BEGIN SELECT RAISE(ABORT,'Reconciled vouchers cannot be voided'); END;
CREATE TRIGGER reconciliation_no_update BEFORE UPDATE ON bank_reconciliations BEGIN SELECT RAISE(ABORT,'Reconciliations are permanent'); END;
CREATE TRIGGER reconciliation_no_delete BEFORE DELETE ON bank_reconciliations BEGIN SELECT RAISE(ABORT,'Reconciliations are permanent'); END;
CREATE TRIGGER clearance_no_update BEFORE UPDATE ON bank_clearances BEGIN SELECT RAISE(ABORT,'Clearances are permanent'); END;
CREATE TRIGGER clearance_no_delete BEFORE DELETE ON bank_clearances BEGIN SELECT RAISE(ABORT,'Clearances are permanent'); END;
CREATE TRIGGER audit_income_insert AFTER INSERT ON income_entries BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'income_posted',NEW.recorded_by,NEW.created_at,'income',NEW.id,NEW.number,printf('Rs %.2f via %s · ',NEW.amount_cents/100.0,NEW.method)||NEW.head_name,0); END;
CREATE TRIGGER audit_income_void AFTER UPDATE OF status ON income_entries WHEN OLD.status='posted' AND NEW.status='void' BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'income_void',NEW.voided_by,NEW.voided_at,'income',NEW.id,NEW.number,NEW.void_reason,0); END;
CREATE TRIGGER audit_bank_insert AFTER INSERT ON bank_transactions BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'bank_posted',NEW.recorded_by,NEW.created_at,'bank_transaction',NEW.id,NEW.number,NEW.kind||printf(' Rs %.2f',NEW.amount_cents/100.0),0); END;
CREATE TRIGGER audit_bank_void AFTER UPDATE OF status ON bank_transactions WHEN OLD.status='posted' AND NEW.status='void' BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'bank_void',NEW.voided_by,NEW.voided_at,'bank_transaction',NEW.id,NEW.number,NEW.void_reason,0); END;
CREATE INDEX bank_transaction_accounts ON bank_transactions(account_id,entry_date);
CREATE INDEX income_entry_date ON income_entries(entry_date);
