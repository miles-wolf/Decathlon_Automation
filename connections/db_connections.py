import psycopg2
import pandas as pd

def connect_to_postgres(db_name, db_user, db_password, db_host, db_port):
    """Connects to a PostgreSQL database and returns a connection object."""
    conn = None
    try:
        conn = psycopg2.connect(
            database=db_name,
            user=db_user,
            password=db_password,
            host=db_host,
            port=db_port
        )
        cur = conn.cursor()

        cur.execute("SELECT now();")

        cur.fetchall()
        
        print("Successfully connected to the database.")
        return conn,cur
    except OperationalError as e:
        print(f"Error connecting to the database: {e}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None

