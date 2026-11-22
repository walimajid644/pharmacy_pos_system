ALTER TABLE app_settings ADD COLUMN purchase_default_quantity INTEGER NOT NULL DEFAULT 1 CHECK(purchase_default_quantity BETWEEN 1 AND 1000000 AND purchase_default_quantity = CAST(purchase_default_quantity AS INTEGER));
ALTER TABLE app_settings ADD COLUMN purchase_default_tax REAL NOT NULL DEFAULT 17 CHECK(purchase_default_tax BETWEEN 0 AND 100);
ALTER TABLE app_settings ADD COLUMN purchase_default_discount REAL NOT NULL DEFAULT 0 CHECK(purchase_default_discount BETWEEN 0 AND 100);
ALTER TABLE app_settings ADD COLUMN purchase_show_tax INTEGER NOT NULL DEFAULT 1 CHECK(purchase_show_tax IN (0,1));
ALTER TABLE app_settings ADD COLUMN purchase_show_discount INTEGER NOT NULL DEFAULT 1 CHECK(purchase_show_discount IN (0,1));
ALTER TABLE app_settings ADD COLUMN purchase_fill_remaining INTEGER NOT NULL DEFAULT 1 CHECK(purchase_fill_remaining IN (0,1));
