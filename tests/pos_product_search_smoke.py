"""Run the POS lookup SQL against SQLite, including both search options."""
from pathlib import Path
import re
import sqlite3

source = Path('src/composables/usePosProductSearch.ts').read_text(encoding='utf-8')
query_template = re.search(r'`(SELECT \*, \(SELECT m\.name.*?LIMIT 50)`', source, re.S).group(1).replace('\\\\', '\\')
connection = sqlite3.connect(':memory:')
connection.execute('CREATE TABLE products (id TEXT, name TEXT, generic_name TEXT, sku TEXT, barcode TEXT, is_active INTEGER, deleted_at TEXT, manufacturer_id TEXT)')
connection.execute('CREATE TABLE manufacturers (id TEXT, name TEXT, deleted_at TEXT)')
connection.execute("INSERT INTO manufacturers VALUES ('brand', 'Test Pharma', NULL)")
for number in range(60, 0, -1):
    name = f"{'medicine' if number % 2 else 'Medicine'} {number:02}"
    if number == 30:
        name = ' ' + name + ' '
    connection.execute('INSERT INTO products VALUES (?,?,?,?,?,1,NULL,?)', (str(number), name, 'Eye drops', f'SKU-{number:02}', '' if number == 60 else f'BAR-{number:02}', 'brand'))
connection.execute("INSERT INTO products VALUES ('inactive','A inactive','','','',0,NULL,NULL)")
connection.execute("INSERT INTO products VALUES ('deleted','A deleted','','','',1,'deleted',NULL)")

def pattern(value):
    return '%' + re.sub(r'[\\%_]', lambda m: '\\' + m.group(), value) + '%'

def lookup(term, matching=False, generic=False):
    words = term.split() if matching else [term]
    column = 'generic_name' if generic else 'name'
    condition = ' AND '.join(f"{column} LIKE ? ESCAPE '\\'" for _ in words) or '1 = 1'
    query = query_template.replace('${textConditions}', condition)
    return connection.execute(query, [term, *map(pattern, words), pattern(term), term, term, term]).fetchall()

rows = lookup('')
assert len(rows) == 50
assert [row[0] for row in rows] == [str(number) for number in range(1, 51)]
assert rows[0][-1] == 'Test Pharma'
assert lookup('Medicine 60')[0][0] == '60'
assert lookup('BAR-55')[0][0] == '55'
assert not lookup('Eye drops')
assert len(lookup('Eye drops', generic=True)) == 50
assert len(lookup('drops Eye', matching=True, generic=True)) == 50
assert not lookup('drops Eye', generic=True)
assert not lookup('%')
assert not lookup('_')
assert not lookup('\\')
assert lookup('BAR-55', generic=True)[0][0] == '55'
assert lookup('60 Medicine', matching=True)[0][0] == '60'
assert not lookup('60 Medicine')
assert not lookup('nonexistent')
assert not lookup('%')
assert not lookup('_')
assert not lookup('\\')
assert len(lookup('M')) == 50
assert lookup('') == rows
connection.close()
print('POS search: bounded alphabetical browse, brand, barcode priority, word matching, generic mode and literal wildcard filtering passed')
