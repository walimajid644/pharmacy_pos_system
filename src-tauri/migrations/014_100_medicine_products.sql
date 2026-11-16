-- Historical filename retained for migration compatibility.
-- Imports 90 additional SAMPLE medicine products and 40 opening-stock batches.
-- Prices, DRAP identifiers and manufacturer associations are supplied sample data,
-- not verified regulatory or commercial records. Expiry dates are preserved.
-- The schema_migrations marker prevents repeat execution.

-- Required base lookups (also works when optional sample migration 002 was never run).
INSERT OR IGNORE INTO categories (id, name, description, is_active, created_at, updated_at)
VALUES 
    ('cat-1', 'Pain Relief', 'Pain and fever medications', 1, datetime('now'), datetime('now')),
    ('cat-2', 'Antibiotics', 'Bacterial infection treatment', 1, datetime('now'), datetime('now')),
    ('cat-3', 'Cardiovascular', 'Heart and blood pressure', 1, datetime('now'), datetime('now')),
    ('cat-4', 'Gastrointestinal', 'Digestive system medications', 1, datetime('now'), datetime('now')),
    ('cat-5', 'Vitamins', 'Supplements and vitamins', 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO manufacturers (id, name, description, is_active, created_at, updated_at)
VALUES 
    ('mfg-1', 'Getz Pharma', 'Leading Pakistani pharmaceutical company', 1, datetime('now'), datetime('now')),
    ('mfg-2', 'Searle', 'Multinational pharmaceutical company', 1, datetime('now'), datetime('now')),
    ('mfg-3', 'Abbott', 'Global healthcare company', 1, datetime('now'), datetime('now')),
    ('mfg-4', 'GSK', 'GlaxoSmithKline Pakistan', 1, datetime('now'), datetime('now')),
    ('mfg-5', 'Novartis', 'Swiss multinational pharmaceutical', 1, datetime('now'), datetime('now'));

-- Add more categories for diverse medicines
INSERT INTO categories (id, name, description, is_active, created_at, updated_at)
VALUES 
    ('cat-6', 'Respiratory', 'Respiratory and allergy medications', 1, datetime('now'), datetime('now')),
    ('cat-7', 'Diabetes', 'Diabetes management medications', 1, datetime('now'), datetime('now')),
    ('cat-8', 'Dermatology', 'Skin care and dermatological products', 1, datetime('now'), datetime('now')),
    ('cat-9', 'Ophthalmic', 'Eye care products', 1, datetime('now'), datetime('now')),
    ('cat-10', 'Mental Health', 'Antidepressants and anxiolytics', 1, datetime('now'), datetime('now')),
    ('cat-11', 'Hormones', 'Hormonal medications', 1, datetime('now'), datetime('now')),
    ('cat-12', 'Anti-inflammatory', 'Anti-inflammatory and immunosuppressants', 1, datetime('now'), datetime('now')),
    ('cat-13', 'Analgesics', 'Pain management medications', 1, datetime('now'), datetime('now')),
    ('cat-14', 'Antifungal', 'Antifungal medications', 1, datetime('now'), datetime('now')),
    ('cat-15', 'Antiviral', 'Antiviral medications', 1, datetime('now'), datetime('now'));

-- Add more manufacturers
INSERT INTO manufacturers (id, name, description, is_active, created_at, updated_at)
VALUES 
    ('mfg-6', 'Pfizer', 'Global pharmaceutical leader', 1, datetime('now'), datetime('now')),
    ('mfg-7', 'Sanofi', 'French multinational pharmaceutical', 1, datetime('now'), datetime('now')),
    ('mfg-8', 'Bayer', 'German pharmaceutical and life sciences', 1, datetime('now'), datetime('now')),
    ('mfg-9', 'Roche', 'Swiss multinational healthcare', 1, datetime('now'), datetime('now')),
    ('mfg-10', 'Merck', 'American multinational pharmaceutical', 1, datetime('now'), datetime('now')),
    ('mfg-11', 'Bosch Pharmaceuticals', 'Pakistani pharmaceutical company', 1, datetime('now'), datetime('now')),
    ('mfg-12', 'Hilton Pharma', 'Pakistani pharmaceutical manufacturer', 1, datetime('now'), datetime('now')),
    ('mfg-13', 'Martin Dow', 'Pakistani pharmaceutical company', 1, datetime('now'), datetime('now')),
    ('mfg-14', 'Ferozsons', 'Leading Pakistani pharma company', 1, datetime('now'), datetime('now')),
    ('mfg-15', 'AGP Pharma', 'Asian pharmaceutical manufacturer', 1, datetime('now'), datetime('now'));

-- 90 additional sample medicine products
INSERT INTO products (id, sku, name, generic_name, barcode, category_id, manufacturer_id, unit_price, cost_price, pack_size, sell_by_loose_unit, drap_registration_number, controlled_substance, reorder_level, is_active, created_at, updated_at)
VALUES 
    -- Pain Relief & Analgesics (11-20)
    ('prod-11', 'PONSTAN500', 'Ponstan 500mg', 'Mefenamic Acid', '8964000123461', 'cat-13', 'mfg-6', 6.50, 4.80, 20, 1, 'DRAP-10011', 0, 80, 1, datetime('now'), datetime('now')),
    ('prod-12', 'VOLTAREN50', 'Voltaren 50mg', 'Diclofenac Sodium', '8964000123462', 'cat-13', 'mfg-5', 9.00, 6.80, 20, 1, 'DRAP-10012', 0, 70, 1, datetime('now'), datetime('now')),
    ('prod-13', 'CATAFLAM50', 'Cataflam 50mg', 'Diclofenac Potassium', '8964000123463', 'cat-13', 'mfg-5', 8.50, 6.50, 20, 1, 'DRAP-10013', 0, 60, 1, datetime('now'), datetime('now')),
    ('prod-14', 'ARCOXIA90', 'Arcoxia 90mg', 'Etoricoxib', '8964000123464', 'cat-13', 'mfg-10', 18.00, 13.50, 10, 0, 'DRAP-10014', 0, 40, 1, datetime('now'), datetime('now')),
    ('prod-15', 'CELEBREX200', 'Celebrex 200mg', 'Celecoxib', '8964000123465', 'cat-13', 'mfg-6', 20.00, 15.00, 10, 0, 'DRAP-10015', 0, 35, 1, datetime('now'), datetime('now')),
    ('prod-16', 'ULTRACET', 'Ultracet Tablets', 'Tramadol+Paracetamol', '8964000123466', 'cat-13', 'mfg-2', 12.00, 9.00, 20, 0, 'DRAP-10016', 1, 50, 1, datetime('now'), datetime('now')),
    ('prod-17', 'NALGESIC', 'Nalgesic Tablets', 'Naproxen', '8964000123467', 'cat-13', 'mfg-1', 7.50, 5.60, 20, 1, 'DRAP-10017', 0, 60, 1, datetime('now'), datetime('now')),
    ('prod-18', 'ASPIRIN75', 'Disprin CV 75mg', 'Aspirin', '8964000123468', 'cat-3', 'mfg-2', 4.00, 3.00, 30, 1, 'DRAP-10018', 0, 100, 1, datetime('now'), datetime('now')),
    ('prod-19', 'TYLENOL500', 'Tylenol 500mg', 'Paracetamol', '8964000123469', 'cat-1', 'mfg-2', 3.00, 2.20, 10, 1, 'DRAP-10019', 0, 120, 1, datetime('now'), datetime('now')),
    ('prod-20', 'FELDENE20', 'Feldene 20mg', 'Piroxicam', '8964000123470', 'cat-13', 'mfg-6', 11.00, 8.30, 15, 0, 'DRAP-10020', 0, 40, 1, datetime('now'), datetime('now')),

    -- Antibiotics (21-30)
    ('prod-21', 'KLACID500', 'Klacid 500mg', 'Clarithromycin', '8964000123471', 'cat-2', 'mfg-3', 28.00, 21.00, 14, 0, 'DRAP-10021', 1, 30, 1, datetime('now'), datetime('now')),
    ('prod-22', 'CIPROXIN500', 'Ciproxin 500mg', 'Ciprofloxacin', '8964000123472', 'cat-2', 'mfg-8', 16.00, 12.00, 10, 0, 'DRAP-10022', 1, 40, 1, datetime('now'), datetime('now')),
    ('prod-23', 'ZINNAT250', 'Zinnat 250mg', 'Cefuroxime', '8964000123473', 'cat-2', 'mfg-4', 32.00, 24.00, 10, 0, 'DRAP-10023', 1, 25, 1, datetime('now'), datetime('now')),
    ('prod-24', 'FLAGYL400', 'Flagyl 400mg', 'Metronidazole', '8964000123474', 'cat-2', 'mfg-7', 8.00, 6.00, 15, 1, 'DRAP-10024', 1, 50, 1, datetime('now'), datetime('now')),
    ('prod-25', 'BACTRIM', 'Bactrim DS', 'Co-trimoxazole', '8964000123475', 'cat-2', 'mfg-9', 12.00, 9.00, 20, 0, 'DRAP-10025', 1, 40, 1, datetime('now'), datetime('now')),
    ('prod-26', 'LEVAQUIN500', 'Levaquin 500mg', 'Levofloxacin', '8964000123476', 'cat-2', 'mfg-2', 22.00, 16.50, 7, 0, 'DRAP-10026', 1, 30, 1, datetime('now'), datetime('now')),
    ('prod-27', 'SUPRAX400', 'Suprax 400mg', 'Cefixime', '8964000123477', 'cat-2', 'mfg-7', 35.00, 26.00, 5, 0, 'DRAP-10027', 1, 20, 1, datetime('now'), datetime('now')),
    ('prod-28', 'DALACIN300', 'Dalacin 300mg', 'Clindamycin', '8964000123478', 'cat-2', 'mfg-6', 26.00, 19.50, 16, 0, 'DRAP-10028', 1, 25, 1, datetime('now'), datetime('now')),
    ('prod-29', 'DOXYCYCLINE100', 'Doxycycline 100mg', 'Doxycycline', '8964000123479', 'cat-2', 'mfg-1', 10.00, 7.50, 10, 1, 'DRAP-10029', 1, 50, 1, datetime('now'), datetime('now')),
    ('prod-30', 'ERYTHROMYCIN250', 'Erythromycin 250mg', 'Erythromycin', '8964000123480', 'cat-2', 'mfg-3', 9.00, 6.80, 20, 1, 'DRAP-10030', 1, 45, 1, datetime('now'), datetime('now')),

    -- Cardiovascular (31-40)
    ('prod-31', 'NORVASC10', 'Norvasc 10mg', 'Amlodipine', '8964000123481', 'cat-3', 'mfg-6', 14.00, 10.50, 30, 0, 'DRAP-10031', 0, 50, 1, datetime('now'), datetime('now')),
    ('prod-32', 'COZAAR50', 'Cozaar 50mg', 'Losartan', '8964000123482', 'cat-3', 'mfg-10', 16.00, 12.00, 28, 0, 'DRAP-10032', 0, 45, 1, datetime('now'), datetime('now')),
    ('prod-33', 'DIOVAN80', 'Diovan 80mg', 'Valsartan', '8964000123483', 'cat-3', 'mfg-5', 18.00, 13.50, 28, 0, 'DRAP-10033', 0, 40, 1, datetime('now'), datetime('now')),
    ('prod-34', 'CRESTOR10', 'Crestor 10mg', 'Rosuvastatin', '8964000123484', 'cat-3', 'mfg-8', 24.00, 18.00, 30, 0, 'DRAP-10034', 0, 35, 1, datetime('now'), datetime('now')),
    ('prod-35', 'PLAVIX75', 'Plavix 75mg', 'Clopidogrel', '8964000123485', 'cat-3', 'mfg-7', 22.00, 16.50, 28, 0, 'DRAP-10035', 0, 40, 1, datetime('now'), datetime('now')),
    ('prod-36', 'LASIX40', 'Lasix 40mg', 'Furosemide', '8964000123486', 'cat-3', 'mfg-7', 6.00, 4.50, 30, 1, 'DRAP-10036', 0, 60, 1, datetime('now'), datetime('now')),
    ('prod-37', 'INDERAL10', 'Inderal 10mg', 'Propranolol', '8964000123487', 'cat-3', 'mfg-1', 5.00, 3.80, 30, 1, 'DRAP-10037', 0, 70, 1, datetime('now'), datetime('now')),
    ('prod-38', 'VASOTEC10', 'Vasotec 10mg', 'Enalapril', '8964000123488', 'cat-3', 'mfg-10', 11.00, 8.30, 30, 0, 'DRAP-10038', 0, 50, 1, datetime('now'), datetime('now')),
    ('prod-39', 'CARDIZEM60', 'Cardizem 60mg', 'Diltiazem', '8964000123489', 'cat-3', 'mfg-8', 13.00, 9.80, 30, 0, 'DRAP-10039', 0, 45, 1, datetime('now'), datetime('now')),
    ('prod-40', 'DIGOXIN', 'Digoxin 0.25mg', 'Digoxin', '8964000123490', 'cat-3', 'mfg-4', 8.00, 6.00, 30, 1, 'DRAP-10040', 0, 50, 1, datetime('now'), datetime('now')),

    -- Gastrointestinal (41-50)
    ('prod-41', 'NEXIUM40', 'Nexium 40mg', 'Esomeprazole', '8964000123491', 'cat-4', 'mfg-8', 15.00, 11.30, 14, 1, 'DRAP-10041', 0, 60, 1, datetime('now'), datetime('now')),
    ('prod-42', 'LOSEC20', 'Losec 20mg', 'Omeprazole', '8964000123492', 'cat-4', 'mfg-8', 10.00, 7.50, 14, 1, 'DRAP-10042', 0, 70, 1, datetime('now'), datetime('now')),
    ('prod-43', 'ZANTAC150', 'Zantac 150mg', 'Ranitidine', '8964000123493', 'cat-4', 'mfg-4', 7.00, 5.30, 20, 1, 'DRAP-10043', 0, 80, 1, datetime('now'), datetime('now')),
    ('prod-44', 'LIBRAX', 'Librax Capsules', 'Chlordiazepoxide+Clidinium', '8964000123494', 'cat-4', 'mfg-9', 12.00, 9.00, 20, 0, 'DRAP-10044', 1, 40, 1, datetime('now'), datetime('now')),
    ('prod-45', 'IMODIUM', 'Imodium 2mg', 'Loperamide', '8964000123495', 'cat-4', 'mfg-2', 8.00, 6.00, 10, 1, 'DRAP-10045', 0, 50, 1, datetime('now'), datetime('now')),
    ('prod-46', 'COLOFAC', 'Colofac 135mg', 'Mebeverine', '8964000123496', 'cat-4', 'mfg-3', 14.00, 10.50, 20, 0, 'DRAP-10046', 0, 40, 1, datetime('now'), datetime('now')),
    ('prod-47', 'DULCOLAX', 'Dulcolax 5mg', 'Bisacodyl', '8964000123497', 'cat-4', 'mfg-8', 6.00, 4.50, 30, 1, 'DRAP-10047', 0, 60, 1, datetime('now'), datetime('now')),
    ('prod-48', 'REGLAN10', 'Reglan 10mg', 'Metoclopramide', '8964000123498', 'cat-4', 'mfg-1', 5.50, 4.10, 30, 1, 'DRAP-10048', 0, 70, 1, datetime('now'), datetime('now')),
    ('prod-49', 'GAVISCON', 'Gaviscon Suspension', 'Alginate+Antacid', '8964000123499', 'cat-4', 'mfg-9', 180.00, 135.00, 1, 0, 'DRAP-10049', 0, 20, 1, datetime('now'), datetime('now')),
    ('prod-50', 'LACTULOSE', 'Lactulose Solution', 'Lactulose', '8964000123500', 'cat-4', 'mfg-3', 120.00, 90.00, 1, 0, 'DRAP-10050', 0, 25, 1, datetime('now'), datetime('now')),

    -- Respiratory (51-60)
    ('prod-51', 'VENTOLIN', 'Ventolin Inhaler', 'Salbutamol', '8964000123501', 'cat-6', 'mfg-4', 280.00, 210.00, 1, 0, 'DRAP-10051', 0, 30, 1, datetime('now'), datetime('now')),
    ('prod-52', 'SERETIDE', 'Seretide Inhaler', 'Salmeterol+Fluticasone', '8964000123502', 'cat-6', 'mfg-4', 850.00, 640.00, 1, 0, 'DRAP-10052', 0, 15, 1, datetime('now'), datetime('now')),
    ('prod-53', 'SYMBICORT', 'Symbicort Inhaler', 'Budesonide+Formoterol', '8964000123503', 'cat-6', 'mfg-8', 920.00, 690.00, 1, 0, 'DRAP-10053', 0, 15, 1, datetime('now'), datetime('now')),
    ('prod-54', 'MONTEK10', 'Montek 10mg', 'Montelukast', '8964000123504', 'cat-6', 'mfg-1', 18.00, 13.50, 10, 0, 'DRAP-10054', 0, 40, 1, datetime('now'), datetime('now')),
    ('prod-55', 'AVAMYS', 'Avamys Nasal Spray', 'Fluticasone Furoate', '8964000123505', 'cat-6', 'mfg-4', 650.00, 488.00, 1, 0, 'DRAP-10055', 0, 20, 1, datetime('now'), datetime('now')),
    ('prod-56', 'ZYRTEC10', 'Zyrtec 10mg', 'Cetirizine', '8964000123506', 'cat-6', 'mfg-2', 6.00, 4.50, 10, 1, 'DRAP-10056', 0, 80, 1, datetime('now'), datetime('now')),
    ('prod-57', 'ALLEGRA120', 'Allegra 120mg', 'Fexofenadine', '8964000123507', 'cat-6', 'mfg-7', 12.00, 9.00, 10, 0, 'DRAP-10057', 0, 50, 1, datetime('now'), datetime('now')),
    ('prod-58', 'BENADRYL', 'Benadryl Syrup', 'Diphenhydramine', '8964000123508', 'cat-6', 'mfg-2', 95.00, 71.00, 1, 0, 'DRAP-10058', 0, 30, 1, datetime('now'), datetime('now')),
    ('prod-59', 'MUCOLATOR', 'Mucolator 600mg', 'Acetylcysteine', '8964000123509', 'cat-6', 'mfg-11', 15.00, 11.30, 20, 0, 'DRAP-10059', 0, 40, 1, datetime('now'), datetime('now')),
    ('prod-60', 'AMBROXOL30', 'Ambroxol 30mg', 'Ambroxol', '8964000123510', 'cat-6', 'mfg-1', 5.00, 3.80, 20, 1, 'DRAP-10060', 0, 70, 1, datetime('now'), datetime('now')),

    -- Diabetes (61-70)
    ('prod-61', 'GLUCOPHAGE500', 'Glucophage 500mg', 'Metformin', '8964000123511', 'cat-7', 'mfg-10', 8.00, 6.00, 60, 1, 'DRAP-10061', 0, 100, 1, datetime('now'), datetime('now')),
    ('prod-62', 'GLUCOPHAGE850', 'Glucophage 850mg', 'Metformin', '8964000123512', 'cat-7', 'mfg-10', 10.00, 7.50, 60, 1, 'DRAP-10062', 0, 90, 1, datetime('now'), datetime('now')),
    ('prod-63', 'JANUVIA100', 'Januvia 100mg', 'Sitagliptin', '8964000123513', 'cat-7', 'mfg-10', 85.00, 64.00, 28, 0, 'DRAP-10063', 0, 25, 1, datetime('now'), datetime('now')),
    ('prod-64', 'GALVUSMET50', 'Galvus Met 50/500', 'Vildagliptin+Metformin', '8964000123514', 'cat-7', 'mfg-5', 45.00, 33.80, 30, 0, 'DRAP-10064', 0, 30, 1, datetime('now'), datetime('now')),
    ('prod-65', 'AMARYL2', 'Amaryl 2mg', 'Glimepiride', '8964000123515', 'cat-7', 'mfg-7', 16.00, 12.00, 30, 1, 'DRAP-10065', 0, 45, 1, datetime('now'), datetime('now')),
    ('prod-66', 'DIAMICRON60', 'Diamicron MR 60mg', 'Gliclazide', '8964000123516', 'cat-7', 'mfg-14', 22.00, 16.50, 30, 0, 'DRAP-10066', 0, 35, 1, datetime('now'), datetime('now')),
    ('prod-67', 'INVOKANA100', 'Invokana 100mg', 'Canagliflozin', '8964000123517', 'cat-7', 'mfg-2', 95.00, 71.00, 30, 0, 'DRAP-10067', 0, 20, 1, datetime('now'), datetime('now')),
    ('prod-68', 'LANTUS', 'Lantus Solostar', 'Insulin Glargine', '8964000123518', 'cat-7', 'mfg-7', 1850.00, 1388.00, 1, 0, 'DRAP-10068', 0, 10, 1, datetime('now'), datetime('now')),
    ('prod-69', 'NOVORAPID', 'NovoRapid FlexPen', 'Insulin Aspart', '8964000123519', 'cat-7', 'mfg-5', 1650.00, 1238.00, 1, 0, 'DRAP-10069', 0, 10, 1, datetime('now'), datetime('now')),
    ('prod-70', 'MIXTARD30', 'Mixtard 30 FlexPen', 'Insulin Mixtard', '8964000123520', 'cat-7', 'mfg-5', 1450.00, 1088.00, 1, 0, 'DRAP-10070', 0, 10, 1, datetime('now'), datetime('now')),

    -- Vitamins & Supplements (71-80)
    ('prod-71', 'CALTRATE600', 'Caltrate 600+D', 'Calcium+Vitamin D', '8964000123521', 'cat-5', 'mfg-6', 18.00, 13.50, 60, 0, 'DRAP-10071', 0, 40, 1, datetime('now'), datetime('now')),
    ('prod-72', 'CENTRUM', 'Centrum Multivitamin', 'Multivitamins', '8964000123522', 'cat-5', 'mfg-6', 22.00, 16.50, 30, 0, 'DRAP-10072', 0, 35, 1, datetime('now'), datetime('now')),
    ('prod-73', 'FOLICACID5', 'Folic Acid 5mg', 'Folic Acid', '8964000123523', 'cat-5', 'mfg-3', 3.00, 2.30, 30, 1, 'DRAP-10073', 0, 100, 1, datetime('now'), datetime('now')),
    ('prod-74', 'VITAMINB12', 'Vitamin B12 1000mcg', 'Cyanocobalamin', '8964000123524', 'cat-5', 'mfg-1', 12.00, 9.00, 30, 0, 'DRAP-10074', 0, 50, 1, datetime('now'), datetime('now')),
    ('prod-75', 'VITAMINE400', 'Vitamin E 400IU', 'Tocopherol', '8964000123525', 'cat-5', 'mfg-3', 15.00, 11.30, 30, 0, 'DRAP-10075', 0, 40, 1, datetime('now'), datetime('now')),
    ('prod-76', 'ZINCTABS', 'Zinc Tablets 50mg', 'Zinc Sulfate', '8964000123526', 'cat-5', 'mfg-11', 8.00, 6.00, 30, 1, 'DRAP-10076', 0, 60, 1, datetime('now'), datetime('now')),
    ('prod-77', 'IRONSUP', 'Ferrous Sulfate 200mg', 'Iron', '8964000123527', 'cat-5', 'mfg-3', 6.00, 4.50, 30, 1, 'DRAP-10077', 0, 70, 1, datetime('now'), datetime('now')),
    ('prod-78', 'OMEGACAP', 'Omega-3 1000mg', 'Fish Oil', '8964000123528', 'cat-5', 'mfg-8', 25.00, 18.80, 30, 0, 'DRAP-10078', 0, 35, 1, datetime('now'), datetime('now')),
    ('prod-79', 'VITD3', 'Vitamin D3 50000IU', 'Cholecalciferol', '8964000123529', 'cat-5', 'mfg-1', 20.00, 15.00, 4, 0, 'DRAP-10079', 0, 40, 1, datetime('now'), datetime('now')),
    ('prod-80', 'VITAMINC1000', 'Vitamin C 1000mg', 'Ascorbic Acid', '8964000123530', 'cat-5', 'mfg-8', 10.00, 7.50, 20, 0, 'DRAP-10080', 0, 50, 1, datetime('now'), datetime('now')),

    -- Dermatology (81-85)
    ('prod-81', 'BETNOVATE', 'Betnovate Cream', 'Betamethasone', '8964000123531', 'cat-8', 'mfg-4', 95.00, 71.00, 1, 0, 'DRAP-10081', 0, 30, 1, datetime('now'), datetime('now')),
    ('prod-82', 'FUCIDIN', 'Fucidin Cream', 'Fusidic Acid', '8964000123532', 'cat-8', 'mfg-13', 180.00, 135.00, 1, 0, 'DRAP-10082', 0, 25, 1, datetime('now'), datetime('now')),
    ('prod-83', 'EPIDUO', 'Epiduo Gel', 'Adapalene+Benzoyl Peroxide', '8964000123533', 'cat-8', 'mfg-14', 750.00, 563.00, 1, 0, 'DRAP-10083', 0, 15, 1, datetime('now'), datetime('now')),
    ('prod-84', 'ELIDEL', 'Elidel Cream', 'Pimecrolimus', '8964000123534', 'cat-8', 'mfg-5', 980.00, 735.00, 1, 0, 'DRAP-10084', 0, 10, 1, datetime('now'), datetime('now')),
    ('prod-85', 'NIZORAL', 'Nizoral Shampoo', 'Ketoconazole', '8964000123535', 'cat-8', 'mfg-2', 420.00, 315.00, 1, 0, 'DRAP-10085', 0, 20, 1, datetime('now'), datetime('now')),

    -- Ophthalmic (86-90)
    ('prod-86', 'ZYMAR', 'Zymar Eye Drops', 'Gatifloxacin', '8964000123536', 'cat-9', 'mfg-3', 180.00, 135.00, 1, 0, 'DRAP-10086', 0, 25, 1, datetime('now'), datetime('now')),
    ('prod-87', 'REFRESH', 'Refresh Tears', 'Artificial Tears', '8964000123537', 'cat-9', 'mfg-3', 210.00, 158.00, 1, 0, 'DRAP-10087', 0, 30, 1, datetime('now'), datetime('now')),
    ('prod-88', 'TIMOLOL', 'Timolol Eye Drops 0.5%', 'Timolol', '8964000123538', 'cat-9', 'mfg-10', 150.00, 113.00, 1, 0, 'DRAP-10088', 0, 25, 1, datetime('now'), datetime('now')),
    ('prod-89', 'MAXIDEX', 'Maxidex Eye Drops', 'Dexamethasone', '8964000123539', 'cat-9', 'mfg-5', 195.00, 146.00, 1, 0, 'DRAP-10089', 0, 20, 1, datetime('now'), datetime('now')),
    ('prod-90', 'TOBRADEX', 'Tobradex Eye Drops', 'Tobramycin+Dexamethasone', '8964000123540', 'cat-9', 'mfg-5', 280.00, 210.00, 1, 0, 'DRAP-10090', 0, 20, 1, datetime('now'), datetime('now')),

    -- Mental Health & Others (91-100)
    ('prod-91', 'LEXAPRO10', 'Lexapro 10mg', 'Escitalopram', '8964000123541', 'cat-10', 'mfg-12', 28.00, 21.00, 28, 0, 'DRAP-10091', 1, 30, 1, datetime('now'), datetime('now')),
    ('prod-92', 'XANAX0.5', 'Xanax 0.5mg', 'Alprazolam', '8964000123542', 'cat-10', 'mfg-6', 12.00, 9.00, 30, 1, 'DRAP-10092', 1, 40, 1, datetime('now'), datetime('now')),
    ('prod-93', 'ZOLOFT50', 'Zoloft 50mg', 'Sertraline', '8964000123543', 'cat-10', 'mfg-6', 32.00, 24.00, 30, 0, 'DRAP-10093', 1, 25, 1, datetime('now'), datetime('now')),
    ('prod-94', 'RIVOTRIL2', 'Rivotril 2mg', 'Clonazepam', '8964000123544', 'cat-10', 'mfg-9', 15.00, 11.30, 30, 1, 'DRAP-10094', 1, 35, 1, datetime('now'), datetime('now')),
    ('prod-95', 'LYRICA75', 'Lyrica 75mg', 'Pregabalin', '8964000123545', 'cat-10', 'mfg-6', 38.00, 28.50, 14, 0, 'DRAP-10095', 1, 25, 1, datetime('now'), datetime('now')),
    ('prod-96', 'DIFLUCAN150', 'Diflucan 150mg', 'Fluconazole', '8964000123546', 'cat-14', 'mfg-6', 65.00, 48.80, 1, 0, 'DRAP-10096', 0, 30, 1, datetime('now'), datetime('now')),
    ('prod-97', 'SPORANOX100', 'Sporanox 100mg', 'Itraconazole', '8964000123547', 'cat-14', 'mfg-2', 45.00, 33.80, 15, 0, 'DRAP-10097', 0, 25, 1, datetime('now'), datetime('now')),
    ('prod-98', 'ACYCLOVIR400', 'Acyclovir 400mg', 'Acyclovir', '8964000123548', 'cat-15', 'mfg-4', 18.00, 13.50, 25, 0, 'DRAP-10098', 0, 35, 1, datetime('now'), datetime('now')),
    ('prod-99', 'PREDNISONE5', 'Prednisone 5mg', 'Prednisone', '8964000123549', 'cat-12', 'mfg-6', 4.00, 3.00, 30, 1, 'DRAP-10099', 0, 80, 1, datetime('now'), datetime('now')),
    ('prod-100', 'MEDROL4', 'Medrol 4mg', 'Methylprednisolone', '8964000123550', 'cat-12', 'mfg-6', 8.00, 6.00, 30, 1, 'DRAP-10100', 0, 50, 1, datetime('now'), datetime('now'));

-- Product Batches for the new products (selected batches with varied expiry dates)
INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, cost_price_at_batch, received_date, created_at, updated_at)
VALUES 
    ('batch-101', 'prod-11', 'B1001-2024', '2026-09-30', 250, 4.80, '2024-10-15', datetime('now'), datetime('now')),
    ('batch-102', 'prod-12', 'B1002-2024', '2027-01-31', 180, 6.80, '2024-10-20', datetime('now'), datetime('now')),
    ('batch-103', 'prod-13', 'B1003-2024', '2026-11-30', 200, 6.50, '2024-10-18', datetime('now'), datetime('now')),
    ('batch-104', 'prod-14', 'B1004-2024', '2027-03-31', 120, 13.50, '2024-10-22', datetime('now'), datetime('now')),
    ('batch-105', 'prod-15', 'B1005-2024', '2027-02-28', 100, 15.00, '2024-10-25', datetime('now'), datetime('now')),
    
    ('batch-106', 'prod-21', 'B1021-2024', '2026-08-31', 90, 21.00, '2024-10-12', datetime('now'), datetime('now')),
    ('batch-107', 'prod-22', 'B1022-2024', '2027-04-30', 130, 12.00, '2024-10-16', datetime('now'), datetime('now')),
    ('batch-108', 'prod-23', 'B1023-2024', '2026-12-31', 75, 24.00, '2024-10-19', datetime('now'), datetime('now')),
    
    ('batch-109', 'prod-31', 'B1031-2024', '2027-06-30', 160, 10.50, '2024-10-10', datetime('now'), datetime('now')),
    ('batch-110', 'prod-32', 'B1032-2024', '2027-05-31', 140, 12.00, '2024-10-14', datetime('now'), datetime('now')),
    ('batch-111', 'prod-33', 'B1033-2024', '2027-07-31', 130, 13.50, '2024-10-17', datetime('now'), datetime('now')),
    ('batch-112', 'prod-34', 'B1034-2024', '2027-08-31', 110, 18.00, '2024-10-21', datetime('now'), datetime('now')),
    ('batch-113', 'prod-35', 'B1035-2024', '2027-09-30', 125, 16.50, '2024-10-23', datetime('now'), datetime('now')),
    
    ('batch-114', 'prod-41', 'B1041-2024', '2026-10-31', 190, 11.30, '2024-10-11', datetime('now'), datetime('now')),
    ('batch-115', 'prod-42', 'B1042-2024', '2026-11-30', 220, 7.50, '2024-10-13', datetime('now'), datetime('now')),
    ('batch-116', 'prod-43', 'B1043-2024', '2027-01-31', 240, 5.30, '2024-10-15', datetime('now'), datetime('now')),
    
    ('batch-117', 'prod-51', 'B1051-2024', '2026-06-30', 95, 210.00, '2024-10-08', datetime('now'), datetime('now')),
    ('batch-118', 'prod-52', 'B1052-2024', '2027-03-31', 45, 640.00, '2024-10-09', datetime('now'), datetime('now')),
    ('batch-119', 'prod-53', 'B1053-2024', '2027-04-30', 42, 690.00, '2024-10-10', datetime('now'), datetime('now')),
    ('batch-120', 'prod-54', 'B1054-2024', '2027-02-28', 135, 13.50, '2024-10-11', datetime('now'), datetime('now')),
    
    ('batch-121', 'prod-61', 'B1061-2024', '2027-12-31', 320, 6.00, '2024-10-05', datetime('now'), datetime('now')),
    ('batch-122', 'prod-62', 'B1062-2024', '2027-11-30', 280, 7.50, '2024-10-06', datetime('now'), datetime('now')),
    ('batch-123', 'prod-63', 'B1063-2024', '2026-09-30', 75, 64.00, '2024-10-07', datetime('now'), datetime('now')),
    ('batch-124', 'prod-64', 'B1064-2024', '2026-10-31', 95, 33.80, '2024-10-08', datetime('now'), datetime('now')),
    
    ('batch-125', 'prod-68', 'B1068-2024', '2025-08-31', 28, 1388.00, '2024-09-15', datetime('now'), datetime('now')),
    ('batch-126', 'prod-69', 'B1069-2024', '2025-09-30', 32, 1238.00, '2024-09-20', datetime('now'), datetime('now')),
    ('batch-127', 'prod-70', 'B1070-2024', '2025-10-31', 35, 1088.00, '2024-09-25', datetime('now'), datetime('now')),
    
    ('batch-128', 'prod-71', 'B1071-2024', '2027-06-30', 125, 13.50, '2024-10-12', datetime('now'), datetime('now')),
    ('batch-129', 'prod-72', 'B1072-2024', '2027-08-31', 110, 16.50, '2024-10-14', datetime('now'), datetime('now')),
    ('batch-130', 'prod-73', 'B1073-2024', '2028-01-31', 320, 2.30, '2024-10-16', datetime('now'), datetime('now')),
    
    ('batch-131', 'prod-81', 'B1081-2024', '2026-07-31', 85, 71.00, '2024-10-18', datetime('now'), datetime('now')),
    ('batch-132', 'prod-82', 'B1082-2024', '2026-08-31', 70, 135.00, '2024-10-19', datetime('now'), datetime('now')),
    
    ('batch-133', 'prod-86', 'B1086-2024', '2025-12-31', 75, 135.00, '2024-09-10', datetime('now'), datetime('now')),
    ('batch-134', 'prod-87', 'B1087-2024', '2026-05-31', 95, 158.00, '2024-09-12', datetime('now'), datetime('now')),
    
    ('batch-135', 'prod-91', 'B1091-2024', '2026-11-30', 85, 21.00, '2024-10-20', datetime('now'), datetime('now')),
    ('batch-136', 'prod-92', 'B1092-2024', '2027-01-31', 125, 9.00, '2024-10-22', datetime('now'), datetime('now')),
    ('batch-137', 'prod-93', 'B1093-2024', '2027-02-28', 95, 24.00, '2024-10-24', datetime('now'), datetime('now')),
    
    ('batch-138', 'prod-96', 'B1096-2024', '2026-09-30', 90, 48.80, '2024-10-26', datetime('now'), datetime('now')),
    ('batch-139', 'prod-98', 'B1098-2024', '2027-03-31', 110, 13.50, '2024-10-27', datetime('now'), datetime('now')),
    ('batch-140', 'prod-99', 'B1099-2024', '2027-12-31', 260, 3.00, '2024-10-28', datetime('now'), datetime('now'));

-- Every imported batch receives a traceable opening-stock movement.
-- No supplier purchase, payment or historical receipt is fabricated.
INSERT INTO stock_movements
 (id,product_id,batch_id,movement_type,quantity,reference_type,reference_id,reason,user_id,movement_date,created_at)
SELECT 'mov-014-' || b.id,b.product_id,b.id,'in',b.quantity_in_stock,
 'catalog_import','014_100_medicine_products',
 'Sample dataset opening stock; prices and regulatory identifiers unverified',
 (SELECT id FROM users WHERE role='admin' AND deleted_at IS NULL ORDER BY is_active DESC,created_at,id LIMIT 1),
 datetime('now'),datetime('now')
FROM product_batches b
WHERE b.id IN ('batch-101','batch-102','batch-103','batch-104','batch-105','batch-106','batch-107','batch-108','batch-109','batch-110','batch-111','batch-112','batch-113','batch-114','batch-115','batch-116','batch-117','batch-118','batch-119','batch-120','batch-121','batch-122','batch-123','batch-124','batch-125','batch-126','batch-127','batch-128','batch-129','batch-130','batch-131','batch-132','batch-133','batch-134','batch-135','batch-136','batch-137','batch-138','batch-139','batch-140');
