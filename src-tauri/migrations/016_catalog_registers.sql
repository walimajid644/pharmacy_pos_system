CREATE TABLE shelf_locations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
    description TEXT CHECK(description IS NULL OR length(description) <= 1000),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE UNIQUE INDEX shelf_location_names ON shelf_locations(trim(name) COLLATE NOCASE) WHERE deleted_at IS NULL;

-- Turn saved free-text locations into reusable entries before linking products.
INSERT INTO shelf_locations(id,name,created_at,updated_at)
SELECT lower(hex(randomblob(16))),trim(shelf_location),datetime('now'),datetime('now')
FROM products WHERE trim(shelf_location) <> '' GROUP BY trim(shelf_location) COLLATE NOCASE;
ALTER TABLE products ADD COLUMN shelf_location_id TEXT REFERENCES shelf_locations(id);
UPDATE products SET shelf_location_id=(SELECT id FROM shelf_locations WHERE name=trim(products.shelf_location) COLLATE NOCASE)
WHERE trim(shelf_location) <> '';

CREATE TRIGGER product_shelf_insert_guard BEFORE INSERT ON products
WHEN trim(NEW.shelf_location) <> '' AND NOT EXISTS (
    SELECT 1 FROM shelf_locations WHERE name=trim(NEW.shelf_location) COLLATE NOCASE AND is_active=1 AND deleted_at IS NULL
)
BEGIN SELECT RAISE(ABORT,'Choose an active registered shelf/location'); END;
CREATE TRIGGER product_shelf_update_guard BEFORE UPDATE OF shelf_location ON products
WHEN trim(NEW.shelf_location) <> '' AND NOT EXISTS (
    SELECT 1 FROM shelf_locations WHERE name=trim(NEW.shelf_location) COLLATE NOCASE AND deleted_at IS NULL
    AND (is_active=1 OR id=OLD.shelf_location_id)
)
BEGIN SELECT RAISE(ABORT,'Choose an active registered shelf/location'); END;
CREATE TRIGGER product_shelf_insert_link AFTER INSERT ON products
BEGIN
    UPDATE products SET shelf_location_id=(SELECT id FROM shelf_locations WHERE name=trim(NEW.shelf_location) COLLATE NOCASE AND deleted_at IS NULL) WHERE id=NEW.id;
END;
CREATE TRIGGER product_shelf_update_link AFTER UPDATE OF shelf_location ON products
BEGIN
    UPDATE products SET shelf_location_id=(SELECT id FROM shelf_locations WHERE name=trim(NEW.shelf_location) COLLATE NOCASE AND deleted_at IS NULL) WHERE id=NEW.id;
END;
CREATE TRIGGER product_shelf_id_guard BEFORE UPDATE OF shelf_location_id ON products
WHEN coalesce(NEW.shelf_location_id,'') <> coalesce((SELECT id FROM shelf_locations WHERE name=trim(NEW.shelf_location) COLLATE NOCASE AND deleted_at IS NULL),'')
BEGIN SELECT RAISE(ABORT,'Shelf/location reference must match its name'); END;
