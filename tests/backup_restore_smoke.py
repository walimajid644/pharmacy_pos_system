"""Prepare or verify an isolated Tauri database backup/restore test.

The source is the Codex fresh-test database. The backup-test identity is never
overwritten if it already exists. No production application directory is read.
"""

import os
import sqlite3
import sys
from pathlib import Path


root = Path(os.environ["APPDATA"])
source_path = root / "com.pharmacypos.codex.fresh" / "pharmacy.db"
test_dir = root / "com.pharmacypos.codex.backup"
test_path = test_dir / "pharmacy.db"
backup_path = test_dir / "pharmacy.smoke-backup.db"


def open_read_only(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)


def snapshot(path: Path) -> tuple[int, int, list[tuple[str, str]]]:
    with open_read_only(path) as db:
        assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        return (
            db.execute("SELECT COUNT(*) FROM users").fetchone()[0],
            db.execute("SELECT COUNT(*) FROM products").fetchone()[0],
            db.execute("SELECT customer_code, first_name FROM customers WHERE customer_code LIKE 'CODEX-BACKUP-%' ORDER BY customer_code").fetchall(),
        )


def prepare() -> None:
    if not source_path.is_file() or test_path.exists() or backup_path.exists():
        raise SystemExit("Fresh-test source missing or isolated backup-test target already exists")
    test_dir.mkdir(exist_ok=True)
    with open_read_only(source_path) as source, sqlite3.connect(test_path) as target:
        source.backup(target)
    with sqlite3.connect(test_path) as target:
        target.execute("INSERT INTO customers (id, customer_code, first_name, last_name, customer_type, created_at, updated_at) VALUES ('codex-backup-kept', 'CODEX-BACKUP-KEPT', 'Kept', 'Test', 'retail', datetime('now'), datetime('now'))")
    with sqlite3.connect(test_path) as target, sqlite3.connect(backup_path) as backup:
        target.backup(backup)
    with sqlite3.connect(test_path) as target:
        target.execute("INSERT INTO customers (id, customer_code, first_name, last_name, customer_type, created_at, updated_at) VALUES ('codex-backup-discarded', 'CODEX-BACKUP-DISCARDED', 'Discarded', 'Test', 'retail', datetime('now'), datetime('now'))")
    with open_read_only(backup_path) as backup, sqlite3.connect(test_path) as target:
        backup.backup(target)
    verify()
    print("Backup and restore completed in isolated test identity")


def verify() -> None:
    source_users, source_products, _ = snapshot(source_path)
    test_users, test_products, markers = snapshot(test_path)
    assert (test_users, test_products) == (source_users, source_products)
    assert markers == [("CODEX-BACKUP-KEPT", "Kept")], markers
    print(f"Integrity OK; users={test_users}; products={test_products}; restored marker preserved once")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"prepare", "verify"}:
        raise SystemExit("Use prepare or verify")
    if sys.argv[1] == "prepare":
        prepare()
    else:
        verify()
