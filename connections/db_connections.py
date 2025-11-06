import psycopg2
import pandas as pd
from pathlib import Path
import json

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
    

def load_db_read_creds() -> dict:
    """
    Reads 'db_config.json' from the project's /config directory
    (relative to the Decathlon_Automation repo root)
    and returns its contents as a dictionary.

    Returns
    -------
    dict
        Dictionary containing database credentials.
    """
    # Resolve the path to the config directory regardless of where it's called from
    base_dir = Path(__file__).resolve().parents[1]  # Decathlon_Automation/
    file = base_dir / "config" / "readonly_creds.json"

    if not file.exists():
        raise FileNotFoundError(f"Config file not found: {file}")

    with open(file, "r") as f:
        creds = json.load(f)

    return creds

