CREATE TRIGGER IF NOT EXISTS validate_stock_adjustment
    BEFORE UPDATE OF status ON stock_adjustments
    WHEN NEW.status = 'approved' AND OLD.status = 'pending'
    BEGIN
      SELECT CASE WHEN NEW.approved_by IS NULL OR NOT EXISTS (
        SELECT 1 FROM stock_adjustment_items WHERE adjustment_id = NEW.id
      ) THEN RAISE(ABORT, 'Adjustment needs an approver and items') END;
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM stock_adjustment_items WHERE adjustment_id = NEW.id
        AND quantity_adjusted <= 0
      ) THEN RAISE(ABORT, 'Adjustment quantities must be positive') END;
      SELECT CASE WHEN NEW.adjustment_type = 'decrease' AND EXISTS (
        SELECT 1 FROM stock_adjustment_items sai
        JOIN product_batches pb ON pb.id = sai.batch_id
        WHERE sai.adjustment_id = NEW.id
        GROUP BY sai.batch_id
        HAVING SUM(sai.quantity_adjusted) > pb.quantity_in_stock
      ) THEN RAISE(ABORT, 'Insufficient batch stock') END;
    END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS apply_stock_adjustment
    AFTER UPDATE OF status ON stock_adjustments
    WHEN NEW.status = 'approved' AND OLD.status = 'pending'
    BEGIN
      UPDATE product_batches SET
        quantity_in_stock = quantity_in_stock +
          (CASE WHEN NEW.adjustment_type = 'increase' THEN 1 ELSE -1 END) *
          (SELECT SUM(quantity_adjusted) FROM stock_adjustment_items
           WHERE adjustment_id = NEW.id AND batch_id = product_batches.id),
        updated_at = datetime('now')
      WHERE id IN (SELECT batch_id FROM stock_adjustment_items WHERE adjustment_id = NEW.id);
      INSERT INTO stock_movements (id, product_id, batch_id, movement_type, quantity,
        reference_type, reference_id, reason, user_id, movement_date, created_at)
      SELECT lower(hex(randomblob(16))), product_id, batch_id, 'adjustment',
        quantity_adjusted * (CASE WHEN NEW.adjustment_type = 'increase' THEN 1 ELSE -1 END),
        'stock_adjustment', NEW.id, NEW.reason, NEW.approved_by, datetime('now'), datetime('now')
      FROM stock_adjustment_items WHERE adjustment_id = NEW.id;
    END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS validate_sales_refund
    BEFORE UPDATE OF status ON sales_returns
    WHEN NEW.status = 'refunded' AND OLD.status = 'approved'
    BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM sales_return_items WHERE return_id = NEW.id
      ) THEN RAISE(ABORT, 'Return has no items') END;
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM sales_return_items sri
        JOIN sales_invoice_items sii ON sii.id = sri.invoice_item_id
        WHERE sri.return_id = NEW.id AND (
          sri.quantity_returned <= 0 OR sii.invoice_id <> NEW.original_invoice_id OR
          sri.quantity_returned + COALESCE((
            SELECT SUM(prior.quantity_returned) FROM sales_return_items prior
            JOIN sales_returns previous_return ON previous_return.id = prior.return_id
            WHERE prior.invoice_item_id = sri.invoice_item_id
              AND previous_return.status = 'refunded'
          ), 0) > sii.quantity
        )
      ) THEN RAISE(ABORT, 'Return quantity exceeds sold quantity') END;
    END;
-- NEXT TRIGGER
CREATE TRIGGER IF NOT EXISTS apply_sales_refund
    AFTER UPDATE OF status ON sales_returns
    WHEN NEW.status = 'refunded' AND OLD.status = 'approved'
    BEGIN
      UPDATE product_batches SET
        quantity_in_stock = quantity_in_stock +
          (SELECT SUM(quantity_returned) FROM sales_return_items
           WHERE return_id = NEW.id AND batch_id = product_batches.id AND restock = 1),
        updated_at = datetime('now')
      WHERE id IN (SELECT batch_id FROM sales_return_items
                   WHERE return_id = NEW.id AND restock = 1);
      INSERT INTO stock_movements (id, product_id, batch_id, movement_type, quantity,
        reference_type, reference_id, reason, user_id, movement_date, created_at)
      SELECT lower(hex(randomblob(16))), product_id, batch_id, 'return', quantity_returned,
        'sales_return', NEW.id, NEW.return_reason, NEW.processed_by, datetime('now'), datetime('now')
      FROM sales_return_items WHERE return_id = NEW.id AND restock = 1;
    END;

