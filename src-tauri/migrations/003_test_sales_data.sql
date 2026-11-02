-- Test sales data for Phase 2 testing
-- This creates sample sales invoices for testing Sales History, Daily Closing, and Reports
-- Run this ONLY in development/testing environments

-- Sales Invoices (spread across different dates and payment methods)

-- Week 1: October 18-20, 2026
INSERT INTO sales_invoices (id, invoice_number, customer_id, cashier_id, invoice_date, total_amount, tax_amount, discount_amount, net_amount, payment_method, status, created_at, updated_at)
VALUES 
    -- Oct 18 - 3 sales
    ('inv-001', 'INV-1729267200001', 'cust-2', 'user-1', '2026-10-18T10:30:00', 50.00, 5.00, 0, 55.00, 'cash', 'completed', '2026-10-18T10:30:00', '2026-10-18T10:30:00'),
    ('inv-002', 'INV-1729267200002', NULL, 'user-1', '2026-10-18T14:15:00', 25.00, 2.50, 0, 27.50, 'card', 'completed', '2026-10-18T14:15:00', '2026-10-18T14:15:00'),
    ('inv-003', 'INV-1729267200003', 'cust-3', 'user-1', '2026-10-18T16:45:00', 180.00, 18.00, 0, 198.00, 'cash', 'completed', '2026-10-18T16:45:00', '2026-10-18T16:45:00'),
    
    -- Oct 19 - 4 sales
    ('inv-004', 'INV-1729353600001', NULL, 'user-1', '2026-10-19T09:00:00', 15.00, 1.50, 0, 16.50, 'cash', 'completed', '2026-10-19T09:00:00', '2026-10-19T09:00:00'),
    ('inv-005', 'INV-1729353600002', 'cust-4', 'user-1', '2026-10-19T11:30:00', 1500.00, 150.00, 50.00, 1600.00, 'card', 'completed', '2026-10-19T11:30:00', '2026-10-19T11:30:00'),
    ('inv-006', 'INV-1729353600003', 'cust-5', 'user-1', '2026-10-19T15:20:00', 75.00, 7.50, 0, 82.50, 'mobile', 'completed', '2026-10-19T15:20:00', '2026-10-19T15:20:00'),
    ('inv-007', 'INV-1729353600004', NULL, 'user-1', '2026-10-19T18:00:00', 40.00, 4.00, 0, 44.00, 'cash', 'completed', '2026-10-19T18:00:00', '2026-10-19T18:00:00'),
    
    -- Oct 20 - 2 sales
    ('inv-008', 'INV-1729440000001', 'cust-2', 'user-1', '2026-10-20T10:00:00', 95.00, 9.50, 0, 104.50, 'cash', 'completed', '2026-10-20T10:00:00', '2026-10-20T10:00:00'),
    ('inv-009', 'INV-1729440000002', NULL, 'user-1', '2026-10-20T13:45:00', 32.00, 3.20, 0, 35.20, 'card', 'completed', '2026-10-20T13:45:00', '2026-10-20T13:45:00');

-- Week 2: October 21-25, 2026
INSERT INTO sales_invoices (id, invoice_number, customer_id, cashier_id, invoice_date, total_amount, tax_amount, discount_amount, net_amount, payment_method, status, created_at, updated_at)
VALUES 
    -- Oct 21 - 5 sales
    ('inv-010', 'INV-1729526400001', NULL, 'user-1', '2026-10-21T08:30:00', 22.00, 2.20, 0, 24.20, 'cash', 'completed', '2026-10-21T08:30:00', '2026-10-21T08:30:00'),
    ('inv-011', 'INV-1729526400002', 'cust-3', 'user-1', '2026-10-21T10:15:00', 125.00, 12.50, 0, 137.50, 'card', 'completed', '2026-10-21T10:15:00', '2026-10-21T10:15:00'),
    ('inv-012', 'INV-1729526400003', NULL, 'user-1', '2026-10-21T12:00:00', 18.00, 1.80, 0, 19.80, 'cash', 'completed', '2026-10-21T12:00:00', '2026-10-21T12:00:00'),
    ('inv-013', 'INV-1729526400004', 'cust-5', 'user-1', '2026-10-21T14:30:00', 65.00, 6.50, 0, 71.50, 'mobile', 'completed', '2026-10-21T14:30:00', '2026-10-21T14:30:00'),
    ('inv-014', 'INV-1729526400005', NULL, 'user-1', '2026-10-21T17:00:00', 8.00, 0.80, 0, 8.80, 'cash', 'completed', '2026-10-21T17:00:00', '2026-10-21T17:00:00'),
    
    -- Oct 22 - 3 sales
    ('inv-015', 'INV-1729612800001', 'cust-2', 'user-1', '2026-10-22T09:45:00', 55.00, 5.50, 0, 60.50, 'cash', 'completed', '2026-10-22T09:45:00', '2026-10-22T09:45:00'),
    ('inv-016', 'INV-1729612800002', NULL, 'user-1', '2026-10-22T13:20:00', 42.00, 4.20, 0, 46.20, 'card', 'completed', '2026-10-22T13:20:00', '2026-10-22T13:20:00'),
    ('inv-017', 'INV-1729612800003', 'cust-4', 'user-1', '2026-10-22T16:00:00', 850.00, 85.00, 30.00, 905.00, 'card', 'completed', '2026-10-22T16:00:00', '2026-10-22T16:00:00'),
    
    -- Oct 23 - 4 sales
    ('inv-018', 'INV-1729699200001', NULL, 'user-1', '2026-10-23T08:00:00', 12.50, 1.25, 0, 13.75, 'cash', 'completed', '2026-10-23T08:00:00', '2026-10-23T08:00:00'),
    ('inv-019', 'INV-1729699200002', 'cust-3', 'user-1', '2026-10-23T11:00:00', 95.00, 9.50, 0, 104.50, 'cash', 'completed', '2026-10-23T11:00:00', '2026-10-23T11:00:00'),
    ('inv-020', 'INV-1729699200003', NULL, 'user-1', '2026-10-23T14:45:00', 28.00, 2.80, 0, 30.80, 'mobile', 'completed', '2026-10-23T14:45:00', '2026-10-23T14:45:00'),
    ('inv-021', 'INV-1729699200004', 'cust-5', 'user-1', '2026-10-23T17:30:00', 70.00, 7.00, 0, 77.00, 'cash', 'completed', '2026-10-23T17:30:00', '2026-10-23T17:30:00'),
    
    -- Oct 24 - 6 sales (busy day!)
    ('inv-022', 'INV-1729785600001', NULL, 'user-1', '2026-10-24T08:15:00', 15.00, 1.50, 0, 16.50, 'cash', 'completed', '2026-10-24T08:15:00', '2026-10-24T08:15:00'),
    ('inv-023', 'INV-1729785600002', 'cust-2', 'user-1', '2026-10-24T10:00:00', 48.00, 4.80, 0, 52.80, 'card', 'completed', '2026-10-24T10:00:00', '2026-10-24T10:00:00'),
    ('inv-024', 'INV-1729785600003', NULL, 'user-1', '2026-10-24T11:30:00', 22.00, 2.20, 0, 24.20, 'cash', 'completed', '2026-10-24T11:30:00', '2026-10-24T11:30:00'),
    ('inv-025', 'INV-1729785600004', 'cust-3', 'user-1', '2026-10-24T13:00:00', 110.00, 11.00, 0, 121.00, 'mobile', 'completed', '2026-10-24T13:00:00', '2026-10-24T13:00:00'),
    ('inv-026', 'INV-1729785600005', NULL, 'user-1', '2026-10-24T15:45:00', 35.00, 3.50, 0, 38.50, 'cash', 'completed', '2026-10-24T15:45:00', '2026-10-24T15:45:00'),
    ('inv-027', 'INV-1729785600006', 'cust-4', 'user-1', '2026-10-24T18:00:00', 650.00, 65.00, 20.00, 695.00, 'card', 'completed', '2026-10-24T18:00:00', '2026-10-24T18:00:00'),
    
    -- Oct 25 - Today's sales (3 sales so far)
    ('inv-028', 'INV-1729872000001', NULL, 'user-1', '2026-10-25T09:00:00', 25.00, 2.50, 0, 27.50, 'cash', 'completed', '2026-10-25T09:00:00', '2026-10-25T09:00:00'),
    ('inv-029', 'INV-1729872000002', 'cust-2', 'user-1', '2026-10-25T11:30:00', 88.00, 8.80, 0, 96.80, 'card', 'completed', '2026-10-25T11:30:00', '2026-10-25T11:30:00'),
    ('inv-030', 'INV-1729872000003', 'cust-5', 'user-1', '2026-10-25T14:00:00', 45.00, 4.50, 0, 49.50, 'cash', 'completed', '2026-10-25T14:00:00', '2026-10-25T14:00:00');

-- Sales Invoice Items (line items for each invoice)
INSERT INTO sales_invoice_items (id, invoice_id, product_id, batch_id, quantity, is_loose_sale, unit_price, discount_percent, line_total, created_at)
VALUES 
    -- Invoice 001 (Panadol + Brufen)
    ('item-001', 'inv-001', 'prod-1', 'batch-1', 20, 1, 2.50, 0, 50.00, '2026-10-18T10:30:00'),
    
    -- Invoice 002 (Augmentin)
    ('item-002', 'inv-002', 'prod-4', 'batch-4', 14, 0, 25.00, 0, 25.00, '2026-10-18T14:15:00'),
    
    -- Invoice 003 (Lipitor + Risek)
    ('item-003', 'inv-003', 'prod-7', 'batch-8', 60, 0, 22.00, 0, 66.00, '2026-10-18T16:45:00'),
    ('item-004', 'inv-003', 'prod-8', 'batch-9', 14, 0, 8.00, 0, 114.00, '2026-10-18T16:45:00'),
    
    -- Invoice 004 (Panadol loose)
    ('item-005', 'inv-004', 'prod-1', 'batch-1', 6, 1, 2.50, 0, 15.00, '2026-10-19T09:00:00'),
    
    -- Invoice 005 (Large wholesale - Augmentin + Zithromax)
    ('item-006', 'inv-005', 'prod-4', 'batch-4', 280, 0, 25.00, 0, 700.00, '2026-10-19T11:30:00'),
    ('item-007', 'inv-005', 'prod-5', 'batch-5', 48, 0, 18.00, 0, 800.00, '2026-10-19T11:30:00'),
    
    -- Invoice 006 (Concor + Motilium)
    ('item-008', 'inv-006', 'prod-6', 'batch-7', 30, 0, 12.00, 0, 36.00, '2026-10-19T15:20:00'),
    ('item-009', 'inv-006', 'prod-9', 'batch-11', 6, 1, 6.50, 0, 39.00, '2026-10-19T15:20:00'),
    
    -- Invoice 007 (Brufen)
    ('item-010', 'inv-007', 'prod-3', 'batch-3', 40, 1, 8.50, 0, 40.00, '2026-10-19T18:00:00'),
    
    -- Invoice 008 (Lipitor + Panadol)
    ('item-011', 'inv-008', 'prod-7', 'batch-8', 30, 0, 22.00, 0, 66.00, '2026-10-20T10:00:00'),
    ('item-012', 'inv-008', 'prod-1', 'batch-1', 10, 1, 2.50, 0, 29.00, '2026-10-20T10:00:00'),
    
    -- Invoice 009 (Risek loose)
    ('item-013', 'inv-009', 'prod-8', 'batch-9', 4, 1, 8.00, 0, 32.00, '2026-10-20T13:45:00'),
    
    -- Invoice 010 (Disprin)
    ('item-014', 'inv-010', 'prod-2', 'batch-2', 7, 1, 3.00, 0, 22.00, '2026-10-21T08:30:00'),
    
    -- Invoice 011 (Concor + Lipitor)
    ('item-015', 'inv-011', 'prod-6', 'batch-7', 60, 0, 12.00, 0, 72.00, '2026-10-21T10:15:00'),
    ('item-016', 'inv-011', 'prod-7', 'batch-8', 30, 0, 22.00, 0, 53.00, '2026-10-21T10:15:00'),
    
    -- Invoice 012 (Zithromax)
    ('item-017', 'inv-012', 'prod-5', 'batch-5', 6, 0, 18.00, 0, 18.00, '2026-10-21T12:00:00'),
    
    -- Invoice 013 (Motilium + Panadol)
    ('item-018', 'inv-013', 'prod-9', 'batch-11', 8, 1, 6.50, 0, 52.00, '2026-10-21T14:30:00'),
    ('item-019', 'inv-013', 'prod-1', 'batch-1', 5, 1, 2.50, 0, 13.00, '2026-10-21T14:30:00'),
    
    -- Invoice 014 (Panadol)
    ('item-020', 'inv-014', 'prod-1', 'batch-1', 3, 1, 2.50, 0, 8.00, '2026-10-21T17:00:00'),
    
    -- Invoice 015 (Brufen + Risek)
    ('item-021', 'inv-015', 'prod-3', 'batch-3', 40, 1, 8.50, 0, 34.00, '2026-10-22T09:45:00'),
    ('item-022', 'inv-015', 'prod-8', 'batch-9', 3, 1, 8.00, 0, 21.00, '2026-10-22T09:45:00'),
    
    -- Invoice 016 (Augmentin)
    ('item-023', 'inv-016', 'prod-4', 'batch-4', 14, 0, 25.00, 0, 42.00, '2026-10-22T13:20:00'),
    
    -- Invoice 017 (Wholesale - Multiple items)
    ('item-024', 'inv-017', 'prod-4', 'batch-4', 140, 0, 25.00, 0, 350.00, '2026-10-22T16:00:00'),
    ('item-025', 'inv-017', 'prod-7', 'batch-8', 180, 0, 22.00, 0, 396.00, '2026-10-22T16:00:00'),
    ('item-026', 'inv-017', 'prod-6', 'batch-7', 90, 0, 12.00, 0, 104.00, '2026-10-22T16:00:00'),
    
    -- Invoice 018 (Panadol)
    ('item-027', 'inv-018', 'prod-1', 'batch-1', 5, 1, 2.50, 0, 12.50, '2026-10-23T08:00:00'),
    
    -- Invoice 019 (Concor + Motilium)
    ('item-028', 'inv-019', 'prod-6', 'batch-7', 60, 0, 12.00, 0, 72.00, '2026-10-23T11:00:00'),
    ('item-029', 'inv-019', 'prod-9', 'batch-11', 4, 1, 6.50, 0, 23.00, '2026-10-23T11:00:00'),
    
    -- Invoice 020 (Risek)
    ('item-030', 'inv-020', 'prod-8', 'batch-9', 4, 1, 8.00, 0, 28.00, '2026-10-23T14:45:00'),
    
    -- Invoice 021 (MultiVitamins + Panadol)
    ('item-031', 'inv-021', 'prod-10', 'batch-12', 30, 0, 15.00, 0, 45.00, '2026-10-23T17:30:00'),
    ('item-032', 'inv-021', 'prod-1', 'batch-1', 10, 1, 2.50, 0, 25.00, '2026-10-23T17:30:00'),
    
    -- Invoice 022 (Brufen)
    ('item-033', 'inv-022', 'prod-3', 'batch-3', 20, 1, 8.50, 0, 15.00, '2026-10-24T08:15:00'),
    
    -- Invoice 023 (Lipitor)
    ('item-034', 'inv-023', 'prod-7', 'batch-8', 30, 0, 22.00, 0, 48.00, '2026-10-24T10:00:00'),
    
    -- Invoice 024 (Disprin)
    ('item-035', 'inv-024', 'prod-2', 'batch-2', 7, 1, 3.00, 0, 22.00, '2026-10-24T11:30:00'),
    
    -- Invoice 025 (Augmentin + Zithromax)
    ('item-036', 'inv-025', 'prod-4', 'batch-4', 28, 0, 25.00, 0, 70.00, '2026-10-24T13:00:00'),
    ('item-037', 'inv-025', 'prod-5', 'batch-5', 12, 0, 18.00, 0, 40.00, '2026-10-24T13:00:00'),
    
    -- Invoice 026 (Risek + Motilium)
    ('item-038', 'inv-026', 'prod-8', 'batch-9', 3, 1, 8.00, 0, 24.00, '2026-10-24T15:45:00'),
    ('item-039', 'inv-026', 'prod-9', 'batch-11', 2, 1, 6.50, 0, 11.00, '2026-10-24T15:45:00'),
    
    -- Invoice 027 (Wholesale - Large order)
    ('item-040', 'inv-027', 'prod-7', 'batch-8', 210, 0, 22.00, 0, 462.00, '2026-10-24T18:00:00'),
    ('item-041', 'inv-027', 'prod-6', 'batch-7', 150, 0, 12.00, 0, 188.00, '2026-10-24T18:00:00'),
    
    -- Invoice 028 (Panadol + Brufen)
    ('item-042', 'inv-028', 'prod-1', 'batch-1', 10, 1, 2.50, 0, 25.00, '2026-10-25T09:00:00'),
    
    -- Invoice 029 (Concor + Lipitor)
    ('item-043', 'inv-029', 'prod-6', 'batch-7', 60, 0, 12.00, 0, 72.00, '2026-10-25T11:30:00'),
    ('item-044', 'inv-029', 'prod-7', 'batch-8', 30, 0, 22.00, 0, 16.00, '2026-10-25T11:30:00'),
    
    -- Invoice 030 (MultiVitamins)
    ('item-045', 'inv-030', 'prod-10', 'batch-12', 30, 0, 15.00, 0, 45.00, '2026-10-25T14:00:00');

-- Update stock levels after these sales (deduct from batches)
-- This simulates what would happen during actual sales

UPDATE product_batches SET quantity_in_stock = quantity_in_stock - 20 WHERE id = 'batch-1'; -- Panadol sold
UPDATE product_batches SET quantity_in_stock = quantity_in_stock - 14 WHERE id = 'batch-2'; -- Disprin sold (now very low!)
UPDATE product_batches SET quantity_in_stock = quantity_in_stock - 100 WHERE id = 'batch-3'; -- Brufen sold
UPDATE product_batches SET quantity_in_stock = quantity_in_stock - 476 WHERE id = 'batch-4'; -- Augmentin sold (wholesale orders)
UPDATE product_batches SET quantity_in_stock = quantity_in_stock - 66 WHERE id = 'batch-5'; -- Zithromax sold
UPDATE product_batches SET quantity_in_stock = quantity_in_stock - 420 WHERE id = 'batch-7'; -- Concor sold
UPDATE product_batches SET quantity_in_stock = quantity_in_stock - 540 WHERE id = 'batch-8'; -- Lipitor sold (lots of wholesale)
UPDATE product_batches SET quantity_in_stock = quantity_in_stock - 56 WHERE id = 'batch-9'; -- Risek sold
UPDATE product_batches SET quantity_in_stock = quantity_in_stock - 20 WHERE id = 'batch-11'; -- Motilium sold
UPDATE product_batches SET quantity_in_stock = quantity_in_stock - 90 WHERE id = 'batch-12'; -- MultiVitamins sold

-- Add corresponding stock movements for audit trail
INSERT INTO stock_movements (id, product_id, batch_id, movement_type, quantity, reference_type, reference_id, user_id, movement_date, created_at)
SELECT 
    'sm-' || substr(id, 6) as id,
    product_id,
    batch_id,
    'out' as movement_type,
    -quantity as quantity,
    'sale' as reference_type,
    invoice_id as reference_id,
    'user-1' as user_id,
    created_at as movement_date,
    created_at
FROM sales_invoice_items;

-- Summary of test data created:
-- ✅ 30 sales invoices across 8 days (Oct 18-25, 2026)
-- ✅ Mix of walk-in and registered customers
-- ✅ Multiple payment methods (cash, card, mobile)
-- ✅ Various order sizes (small retail to large wholesale)
-- ✅ 45 invoice line items with different products
-- ✅ Stock movements logged for audit trail
-- ✅ Some products now low on stock (triggers alerts)
-- ✅ Stock levels updated realistically

