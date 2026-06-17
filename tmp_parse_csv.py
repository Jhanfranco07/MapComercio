import csv

path = 'ambulantes_actualizado.csv'
with open(path, newline='', encoding='latin-1') as f:
    reader = csv.DictReader(f, delimiter=';')
    rows = list(reader)

print('headers:', reader.fieldnames)
print('total rows:', len(rows))
print('first row:', rows[0] if rows else 'NO ROWS')
