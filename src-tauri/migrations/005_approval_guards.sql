CREATE TRIGGER IF NOT EXISTS guard_adjustment_insert
BEFORE INSERT ON stock_adjustments
WHEN NEW.status != 'pending' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Adjustment must start pending'); END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS guard_adjustment_decision
BEFORE UPDATE OF status ON stock_adjustments
WHEN NEW.status != OLD.status
BEGIN
  SELECT CASE WHEN OLD.status != 'pending' OR NEW.status NOT IN ('approved', 'rejected')
    THEN RAISE(ABORT, 'Invalid adjustment transition') END;
  SELECT CASE WHEN NEW.approved_at IS NULL OR NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.approved_by AND is_active = 1
      AND deleted_at IS NULL AND role IN ('admin', 'manager')
  ) THEN RAISE(ABORT, 'Authorized approver required') END;
END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS guard_adjustment_final
BEFORE UPDATE ON stock_adjustments
WHEN NEW.status = OLD.status AND OLD.status != 'pending'
BEGIN SELECT RAISE(ABORT, 'Final adjustment cannot be edited'); END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS guard_adjustment_item_insert
BEFORE INSERT ON stock_adjustment_items
WHEN (SELECT status FROM stock_adjustments WHERE id = NEW.adjustment_id) != 'pending'
BEGIN SELECT RAISE(ABORT, 'Final adjustment items cannot be edited'); END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS guard_adjustment_item_update
BEFORE UPDATE ON stock_adjustment_items
WHEN (SELECT status FROM stock_adjustments WHERE id = OLD.adjustment_id) != 'pending'
BEGIN SELECT RAISE(ABORT, 'Final adjustment items cannot be edited'); END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS guard_adjustment_item_delete
BEFORE DELETE ON stock_adjustment_items
WHEN (SELECT status FROM stock_adjustments WHERE id = OLD.adjustment_id) != 'pending'
BEGIN SELECT RAISE(ABORT, 'Final adjustment items cannot be edited'); END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS guard_return_insert
BEFORE INSERT ON sales_returns
WHEN NEW.status != 'pending' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Return must start pending'); END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS guard_return_decision
BEFORE UPDATE OF status ON sales_returns
WHEN NEW.status != OLD.status
BEGIN
  SELECT CASE WHEN NOT (
    (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected')) OR
    (OLD.status = 'approved' AND NEW.status = 'refunded')
  ) THEN RAISE(ABORT, 'Invalid return transition') END;
  SELECT CASE WHEN NEW.approved_at IS NULL OR NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.approved_by AND is_active = 1
      AND deleted_at IS NULL AND role IN ('admin', 'manager')
  ) THEN RAISE(ABORT, 'Authorized approver required') END;
  SELECT CASE WHEN OLD.status = 'approved' AND NEW.approved_by != OLD.approved_by
    THEN RAISE(ABORT, 'Return approver cannot be changed') END;
END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS guard_return_final
BEFORE UPDATE ON sales_returns
WHEN NEW.status = OLD.status AND OLD.status != 'pending'
BEGIN SELECT RAISE(ABORT, 'Final return cannot be edited'); END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS guard_return_item_insert
BEFORE INSERT ON sales_return_items
WHEN (SELECT status FROM sales_returns WHERE id = NEW.return_id) != 'pending'
BEGIN SELECT RAISE(ABORT, 'Final return items cannot be edited'); END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS guard_return_item_update
BEFORE UPDATE ON sales_return_items
WHEN (SELECT status FROM sales_returns WHERE id = OLD.return_id) != 'pending'
BEGIN SELECT RAISE(ABORT, 'Final return items cannot be edited'); END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS guard_return_item_delete
BEFORE DELETE ON sales_return_items
WHEN (SELECT status FROM sales_returns WHERE id = OLD.return_id) != 'pending'
BEGIN SELECT RAISE(ABORT, 'Final return items cannot be edited'); END;
