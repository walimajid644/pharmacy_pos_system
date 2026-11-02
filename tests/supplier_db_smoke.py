"""Check supplier CRUD against a migrated disposable DB without changing the source.

Usage: python tests/supplier_db_smoke.py <path-to-disposable-pharmacy.db>
"""

import sqlite3
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Pass a disposable pharmacy.db path")
    source_path = Path(sys.argv[1]).resolve()
    if not source_path.is_file() or "com.pharmacypos.codex." not in str(source_path):
        raise SystemExit("Refusing a database outside the isolated Codex test app")

    source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
    test_db = sqlite3.connect(":memory:")
    try:
        source.backup(test_db)
    finally:
        source.close()

    db = test_db
    code = "CODEX-SUPPLIER-SMOKE"
    supplier_id = "codex-supplier-smoke"
    db.execute(
        """INSERT INTO suppliers
        (id, supplier_code, name, payment_terms, credit_limit, is_active,
         created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))""",
        (supplier_id, code, "Supplier Smoke", 0, 0),
    )
    row = db.execute(
        "SELECT name, payment_terms, is_active FROM suppliers "
        "WHERE deleted_at IS NULL AND supplier_code LIKE ?",
        (f"%{code}%",),
    ).fetchone()
    assert row == ("Supplier Smoke", 0, 1), row

    db.execute(
        "UPDATE suppliers SET name = ?, payment_terms = ?, is_active = 0 "
        "WHERE id = ?",
        ("Supplier Smoke Edited", 15, supplier_id),
    )
    assert db.execute(
        "SELECT name, payment_terms, is_active FROM suppliers WHERE id = ?",
        (supplier_id,),
    ).fetchone() == ("Supplier Smoke Edited", 15, 0)

    db.execute("UPDATE suppliers SET is_active = 1 WHERE id = ?", (supplier_id,))
    assert db.execute(
        "SELECT is_active FROM suppliers WHERE id = ?", (supplier_id,)
    ).fetchone() == (1,)

    db.execute(
        "UPDATE suppliers SET deleted_at = datetime('now') WHERE id = ?",
        (supplier_id,),
    )
    assert db.execute(
        "SELECT COUNT(*) FROM suppliers WHERE id = ? AND deleted_at IS NULL",
        (supplier_id,),
    ).fetchone() == (0,)
    assert db.execute(
        "SELECT COUNT(*) FROM suppliers WHERE id = ? AND deleted_at IS NOT NULL",
        (supplier_id,),
    ).fetchone() == (1,)
    db.close()
    print("Supplier database smoke passed: create, search, edit, deactivate, reactivate, soft delete")


if __name__ == "__main__":
    main()
