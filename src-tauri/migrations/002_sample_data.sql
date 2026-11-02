-- Sample data for testing (optional - can be deleted in production)
-- Run this after 001_initial_schema.sql

-- Note: As of Phase 3, user passwords are bcrypt hashed
-- Default admin password: admin123 (hash below)

-- Categories
INSERT INTO categories (id, name, description, is_active, created_at, updated_at)
VALUES 
    ('cat-1', 'Pain Relief', 'Pain and fever medications', 1, datetime('now'), datetime('now')),
    ('cat-2', 'Antibiotics', 'Bacterial infection treatment', 1, datetime('now'), datetime('now')),
    ('cat-3', 'Cardiovascular', 'Heart and blood pressure', 1, datetime('now'), datetime('now')),
    ('cat-4', 'Gastrointestinal', 'Digestive system medications', 1, datetime('now'), datetime('now')),
    ('cat-5', 'Vitamins', 'Supplements and vitamins', 1, datetime('now'), datetime('now'));

-- Manufacturers
INSERT INTO manufacturers (id, name, description, is_active, created_at, updated_at)
VALUES 
    ('mfg-1', 'Getz Pharma', 'Leading Pakistani pharmaceutical company', 1, datetime('now'), datetime('now')),
    ('mfg-2', 'Searle', 'Multinational pharmaceutical company', 1, datetime('now'), datetime('now')),
    ('mfg-3', 'Abbott', 'Global healthcare company', 1, datetime('now'), datetime('now')),
    ('mfg-4', 'GSK', 'GlaxoSmithKline Pakistan', 1, datetime('now'), datetime('now')),
    ('mfg-5', 'Novartis', 'Swiss multinational pharmaceutical', 1, datetime('now'), datetime('now'));

-- Products
INSERT INTO products (id, sku, name, generic_name, barcode, category_id, manufacturer_id, unit_price, cost_price, pack_size, sell_by_loose_unit, drap_registration_number, controlled_substance, reorder_level, is_active, created_at, updated_at)
VALUES 
    -- Pain Relief
    ('prod-1', 'PARA500', 'Panadol 500mg', 'Paracetamol', '8964000123451', 'cat-1', 'mfg-4', 2.50, 1.80, 10, 1, 'DRAP-123456', 0, 100, 1, datetime('now'), datetime('now')),
    ('prod-2', 'DISPRIN', 'Disprin Tablets', 'Aspirin', '8964000123452', 'cat-1', 'mfg-2', 3.00, 2.20, 12, 1, 'DRAP-123457', 0, 80, 1, datetime('now'), datetime('now')),
    ('prod-3', 'BRUFEN400', 'Brufen 400mg', 'Ibuprofen', '8964000123453', 'cat-1', 'mfg-3', 8.50, 6.50, 20, 1, 'DRAP-123458', 0, 60, 1, datetime('now'), datetime('now')),
    
    -- Antibiotics
    ('prod-4', 'AUGMENTIN625', 'Augmentin 625mg', 'Amoxicillin+Clavulanate', '8964000123454', 'cat-2', 'mfg-4', 25.00, 18.00, 14, 0, 'DRAP-123459', 1, 40, 1, datetime('now'), datetime('now')),
    ('prod-5', 'ZITHROMAX', 'Zithromax 250mg', 'Azithromycin', '8964000123455', 'cat-2', 'mfg-5', 18.00, 13.50, 6, 0, 'DRAP-123460', 1, 30, 1, datetime('now'), datetime('now')),
    
    -- Cardiovascular
    ('prod-6', 'CONCOR5', 'Concor 5mg', 'Bisoprolol', '8964000123456', 'cat-3', 'mfg-1', 12.00, 9.00, 30, 0, 'DRAP-123461', 0, 50, 1, datetime('now'), datetime('now')),
    ('prod-7', 'LIPITOR20', 'Lipitor 20mg', 'Atorvastatin', '8964000123457', 'cat-3', 'mfg-5', 22.00, 16.50, 30, 0, 'DRAP-123462', 0, 40, 1, datetime('now'), datetime('now')),
    
    -- Gastrointestinal
    ('prod-8', 'RISEK20', 'Risek 20mg', 'Omeprazole', '8964000123458', 'cat-4', 'mfg-1', 8.00, 6.00, 14, 1, 'DRAP-123463', 0, 70, 1, datetime('now'), datetime('now')),
    ('prod-9', 'MOTILIUM', 'Motilium 10mg', 'Domperidone', '8964000123459', 'cat-4', 'mfg-2', 6.50, 4.80, 30, 1, 'DRAP-123464', 0, 60, 1, datetime('now'), datetime('now')),
    
    -- Vitamins
    ('prod-10', 'MULTIVIT', 'MultiVitamins', 'Multivitamin Complex', '8964000123460', 'cat-5', 'mfg-3', 15.00, 11.00, 30, 0, 'DRAP-123465', 0, 50, 1, datetime('now'), datetime('now'));

-- Product Batches (some with near expiry for testing warnings)
INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, cost_price_at_batch, received_date, created_at, updated_at)
VALUES 
    -- Panadol - good stock, far expiry
    ('batch-1', 'prod-1', 'B001-2024', '2026-12-31', 500, 1.80, '2024-10-01', datetime('now'), datetime('now')),
    
    -- Disprin - low stock warning
    ('batch-2', 'prod-2', 'B002-2024', '2026-11-30', 15, 2.20, '2024-09-15', datetime('now'), datetime('now')),
    
    -- Brufen - near expiry (60 days)
    ('batch-3', 'prod-3', 'B003-2024', '2024-12-25', 200, 6.50, '2024-08-01', datetime('now'), datetime('now')),
    
    -- Augmentin - good batch
    ('batch-4', 'prod-4', 'B004-2024', '2027-06-30', 120, 18.00, '2024-10-10', datetime('now'), datetime('now')),
    
    -- Zithromax - two batches (FEFO test)
    ('batch-5', 'prod-5', 'B005A-2024', '2025-03-31', 80, 13.50, '2024-09-01', datetime('now'), datetime('now')),
    ('batch-6', 'prod-5', 'B005B-2024', '2027-01-31', 100, 13.50, '2024-10-01', datetime('now'), datetime('now')),
    
    -- Concor
    ('batch-7', 'prod-6', 'B006-2024', '2026-08-31', 150, 9.00, '2024-10-05', datetime('now'), datetime('now')),
    
    -- Lipitor
    ('batch-8', 'prod-7', 'B007-2024', '2027-03-31', 90, 16.50, '2024-10-12', datetime('now'), datetime('now')),
    
    -- Risek - multiple batches
    ('batch-9', 'prod-8', 'B008A-2024', '2025-12-31', 200, 6.00, '2024-09-20', datetime('now'), datetime('now')),
    ('batch-10', 'prod-8', 'B008B-2024', '2026-06-30', 150, 6.00, '2024-10-01', datetime('now'), datetime('now')),
    
    -- Motilium
    ('batch-11', 'prod-9', 'B009-2024', '2026-10-31', 180, 4.80, '2024-10-08', datetime('now'), datetime('now')),
    
    -- MultiVitamins
    ('batch-12', 'prod-10', 'B010-2024', '2027-12-31', 100, 11.00, '2024-10-15', datetime('now'), datetime('now'));

-- Sample Customers
INSERT INTO customers (id, customer_code, first_name, last_name, phone_number, address, customer_type, credit_limit, current_balance, loyalty_points, is_active, created_at, updated_at)
VALUES 
    ('cust-1', 'C001', 'Walk-In', 'Customer', NULL, NULL, 'retail', 0, 0, 0, 1, datetime('now'), datetime('now')),
    ('cust-2', 'C002', 'Ahmed', 'Ali', '03001234567', 'House 123, Street 5, Lahore', 'retail', 5000, 0, 25, 1, datetime('now'), datetime('now')),
    ('cust-3', 'C003', 'Fatima', 'Khan', '03009876543', 'Apartment 4B, DHA, Karachi', 'retail', 10000, 1200, 48, 1, datetime('now'), datetime('now')),
    ('cust-4', 'C004', 'City Hospital', 'Pharmacy', '04235551234', 'Main Boulevard, Islamabad', 'wholesale', 100000, 25000, 0, 1, datetime('now'), datetime('now')),
    ('cust-5', 'C005', 'Sara', 'Mahmood', '03121234567', 'House 45, Gulberg, Lahore', 'retail', 3000, 0, 12, 1, datetime('now'), datetime('now'));

-- Note: You can delete this file or clear the data after testing
-- To clear: DELETE FROM products WHERE id LIKE 'prod-%';
