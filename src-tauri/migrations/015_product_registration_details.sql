-- Additive registration metadata; existing stock and prices are unchanged.
ALTER TABLE products ADD COLUMN shelf_location TEXT NOT NULL DEFAULT '' CHECK(length(shelf_location) <= 80);
ALTER TABLE products ADD COLUMN remarks TEXT NOT NULL DEFAULT '' CHECK(length(remarks) <= 1000);
ALTER TABLE products ADD COLUMN uom TEXT NOT NULL DEFAULT 'box' CHECK(uom IN ('box','strip','unit','bottle'));
ALTER TABLE products ADD COLUMN pack_type TEXT NOT NULL DEFAULT '' CHECK(length(pack_type) <= 40);
ALTER TABLE products ADD COLUMN ext_disc_percent REAL NOT NULL DEFAULT 0 CHECK(ext_disc_percent >= 0 AND ext_disc_percent <= 100);
ALTER TABLE products ADD COLUMN stm_level INTEGER NOT NULL DEFAULT 0 CHECK(typeof(stm_level) = 'integer' AND stm_level >= 0 AND stm_level <= 1000000000);
ALTER TABLE products ADD COLUMN maintain_batch INTEGER NOT NULL DEFAULT 0 CHECK(maintain_batch IN (0,1));
ALTER TABLE products ADD COLUMN fridge_item INTEGER NOT NULL DEFAULT 0 CHECK(fridge_item IN (0,1));
ALTER TABLE products ADD COLUMN registration_date TEXT CHECK(registration_date IS NULL OR (
    length(registration_date) = 10
    AND registration_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(registration_date, '+0 days') IS NOT NULL
    AND date(registration_date, '+0 days') = registration_date
));
