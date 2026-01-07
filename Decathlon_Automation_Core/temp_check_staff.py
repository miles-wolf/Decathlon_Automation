from connections import db_connections as dbc

creds = dbc.load_db_read_creds()
conn, cur = dbc.connect_to_postgres(creds['db_name'], creds['user'], creds['password'], creds['host'], creds['port'])

cur.execute("SELECT id, CONCAT(first_name, ' ', last_name) as name FROM camp.staff WHERE id IN (1033, 1143, 1029, 1021) ORDER BY id")
results = cur.fetchall()

print("\nStaff ID to Name mapping:")
for row in results:
    print(f"{row[0]}: {row[1]}")
