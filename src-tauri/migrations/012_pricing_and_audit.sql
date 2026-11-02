ALTER TABLE products ADD COLUMN wholesale_price REAL CHECK(wholesale_price IS NULL OR (wholesale_price>=0 AND wholesale_price<=100000000));
ALTER TABLE sales_returns ADD COLUMN refunded_by TEXT REFERENCES users(id);
CREATE TABLE audit_events (
 id TEXT PRIMARY KEY, event_type TEXT NOT NULL, actor_id TEXT REFERENCES users(id), occurred_at TEXT NOT NULL,
 entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, reference TEXT NOT NULL, details TEXT NOT NULL,
 historical INTEGER NOT NULL DEFAULT 0 CHECK(historical IN (0,1))
);
CREATE INDEX idx_audit_events_date ON audit_events(occurred_at);
CREATE INDEX idx_audit_events_actor ON audit_events(actor_id,event_type);
INSERT INTO audit_events
SELECT 'old-adjustment-'||id,'adjustment_'||status,approved_by,COALESCE(approved_at,updated_at),'stock_adjustment',id,adjustment_number,reason,1 FROM stock_adjustments WHERE status IN ('approved','rejected');
INSERT INTO audit_events
SELECT 'old-return-'||id,'return_'||status,CASE WHEN status='refunded' THEN NULL ELSE approved_by END,updated_at,'sales_return',id,return_number,'Last known decision; earlier transition history is unavailable',1 FROM sales_returns WHERE status IN ('approved','rejected','refunded');
INSERT INTO audit_events
SELECT 'old-expense-'||id,'expense_void',voided_by,COALESCE(voided_at,created_at),'account_entry',id,number,COALESCE(void_reason,''),1 FROM account_entries WHERE kind='expense' AND status='void';
INSERT INTO audit_events
SELECT 'old-receipt-'||id,'customer_payment',recorded_by,created_at,'account_entry',id,number,printf('Rs %.2f via %s',amount_cents/100.0,method),1 FROM account_entries WHERE kind='receipt';
INSERT INTO audit_events
SELECT 'old-void-receipt-'||id,'customer_payment_void',voided_by,COALESCE(voided_at,created_at),'account_entry',id,number,COALESCE(void_reason,''),1 FROM account_entries WHERE kind='receipt' AND status='void';
INSERT INTO audit_events
SELECT 'old-ledger-'||id,kind,recorded_by,occurred_at,'customer_ledger',source_id,source_id,printf('Rs %.2f: ',amount_cents/100.0)||description,1 FROM customer_ledger WHERE kind IN ('credit_sale','credit_return');
INSERT INTO audit_events
SELECT 'old-shift-open-'||id,'shift_open',cashier_id,opened_at,'cashier_shift',id,id,printf('Opening cash Rs %.2f',opening_cash_cents/100.0),1 FROM cashier_shifts;
INSERT INTO audit_events
SELECT 'old-shift-close-'||id,'shift_close',closed_by,closed_at,'cashier_shift',id,id,printf('Counted Rs %.2f; variance Rs %.2f',counted_cash_cents/100.0,variance_cents/100.0),1 FROM cashier_shifts WHERE status='closed' AND closed_at IS NOT NULL;
INSERT INTO audit_events
SELECT 'old-supplier-'||id,'supplier_payment',recorded_by,paid_at,'supplier_payment',id,voucher_number,printf('Rs %.2f via %s',amount_cents/100.0,method),1 FROM supplier_payments;
INSERT INTO audit_events
SELECT 'old-hold-'||id,'quarantine',created_by,created_at,'batch_hold',id,id,quantity||' units: '||reason,1 FROM batch_holds;
INSERT INTO audit_events
SELECT 'old-hold-resolve-'||id,'quarantine_'||status,resolved_by,resolved_at,'batch_hold',id,id,COALESCE(resolution_notes,''),1 FROM batch_holds WHERE status<>'held' AND resolved_at IS NOT NULL;
CREATE TRIGGER audit_adjustment AFTER UPDATE OF status ON stock_adjustments WHEN NEW.status<>OLD.status
BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'adjustment_'||NEW.status,NEW.approved_by,NEW.updated_at,'stock_adjustment',NEW.id,NEW.adjustment_number,NEW.reason,0); END;
CREATE TRIGGER audit_return AFTER UPDATE OF status ON sales_returns WHEN NEW.status<>OLD.status
BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'return_'||NEW.status,CASE WHEN NEW.status='refunded' THEN NEW.refunded_by ELSE NEW.approved_by END,NEW.updated_at,'sales_return',NEW.id,NEW.return_number,NEW.return_reason,0); END;
CREATE TRIGGER audit_expense_void AFTER UPDATE OF status ON account_entries WHEN NEW.kind='expense' AND OLD.status='posted' AND NEW.status='void'
BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'expense_void',NEW.voided_by,NEW.voided_at,'account_entry',NEW.id,NEW.number,COALESCE(NEW.void_reason,''),0); END;
CREATE TRIGGER audit_ledger AFTER INSERT ON customer_ledger WHEN NEW.kind<>'opening'
BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),CASE NEW.kind WHEN 'payment' THEN 'customer_payment' WHEN 'void_payment' THEN 'customer_payment_void' ELSE NEW.kind END,NEW.recorded_by,NEW.occurred_at,'customer_ledger',NEW.source_id,COALESCE((SELECT number FROM account_entries WHERE id=NEW.source_id),(SELECT invoice_number FROM sales_invoices WHERE id=NEW.source_id),NEW.source_id),printf('Rs %.2f: ',NEW.amount_cents/100.0)||NEW.description,0); END;
CREATE TRIGGER audit_shift_open AFTER INSERT ON cashier_shifts
BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'shift_open',NEW.cashier_id,NEW.opened_at,'cashier_shift',NEW.id,NEW.id,printf('Opening cash Rs %.2f',NEW.opening_cash_cents/100.0),0); END;
CREATE TRIGGER audit_shift_close AFTER UPDATE OF status ON cashier_shifts WHEN OLD.status='open' AND NEW.status='closed'
BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'shift_close',NEW.closed_by,NEW.closed_at,'cashier_shift',NEW.id,NEW.id,printf('Counted Rs %.2f; variance Rs %.2f',NEW.counted_cash_cents/100.0,NEW.variance_cents/100.0),0); END;
CREATE TRIGGER audit_supplier_payment AFTER INSERT ON supplier_payments
BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'supplier_payment',NEW.recorded_by,NEW.paid_at,'supplier_payment',NEW.id,NEW.voucher_number,printf('Rs %.2f via %s',NEW.amount_cents/100.0,NEW.method),0); END;
CREATE TRIGGER audit_quarantine AFTER INSERT ON batch_holds
BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'quarantine',NEW.created_by,NEW.created_at,'batch_hold',NEW.id,NEW.id,NEW.quantity||' units: '||NEW.reason,0); END;
CREATE TRIGGER audit_quarantine_resolve AFTER UPDATE OF status ON batch_holds WHEN OLD.status='held' AND NEW.status<>'held'
BEGIN INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),'quarantine_'||NEW.status,NEW.resolved_by,NEW.resolved_at,'batch_hold',NEW.id,NEW.id,COALESCE(NEW.resolution_notes,''),0); END;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit history is read-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit history is read-only'); END;
