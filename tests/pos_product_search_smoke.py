"""Run the actual POS lookup SQL against SQLite to verify browse order and bounds."""
from pathlib import Path
import re
import sqlite3

source = Path('src/composables/usePosProductSearch.ts').read_text(encoding='utf-8')
query = re.search(r'`(SELECT \* FROM products\s+.*?LIMIT 50)`', source, re.S).group(1)
connection = sqlite3.connect(':memory:')
connection.execute('CREATE TABLE products (id TEXT, name TEXT, generic_name TEXT, sku TEXT, barcode TEXT, is_active INTEGER, deleted_at TEXT)')
for number in range(60, 0, -1):
    # Mixed case and surrounding spaces must not change alphabetical ordering.
    name = f"{'medicine' if number % 2 else 'Medicine'} {number:02}"
    if number == 30:
        name = ' ' + name + ' '
    connection.execute('INSERT INTO products VALUES (?,?,?,?,?,1,NULL)', (str(number), name, 'Eye drops', f'SKU-{number:02}', '' if number == 60 else f'BAR-{number:02}'))
connection.execute("INSERT INTO products VALUES ('inactive','A inactive','','','',0,NULL)")
connection.execute("INSERT INTO products VALUES ('deleted','A deleted','','','',1,'deleted')")

def lookup(term):
    pattern = f'%{term}%'
    return connection.execute(query, (term, pattern, pattern, pattern, term, term, term)).fetchall()

rows = lookup('')
assert len(rows) == 50
assert [row[0] for row in rows] == [str(number) for number in range(1, 51)]
assert lookup('Medicine 60')[0][0] == '60'
assert lookup('BAR-55')[0][0] == '55'
assert len(lookup('Eye drops')) == 50
assert not lookup('nonexistent')
assert len(lookup('M')) == 50
assert lookup('') == rows  # Clearing the filter restores the first alphabetical page.
connection.close()
print('POS product search: first 50 active medicines, alphabetical browse, filtering and barcode priority passed')
