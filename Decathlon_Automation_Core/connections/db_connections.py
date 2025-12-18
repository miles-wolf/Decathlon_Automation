import psycopg2
import pandas as pd
from pathlib import Path
import json
import os

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
    except psycopg2.OperationalError as e:
        print(f"Error connecting to the database: {e}")
        return None, None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None, None
    

def load_db_read_creds() -> dict:
    """
    Load database credentials from environment variables first,
    falling back to 'credentials.json' from the project's /config directory.

    Environment variables (preferred for Replit/production):
    - SUPABASE_DB_HOST
    - SUPABASE_DB_USER
    - SUPABASE_DB_PASSWORD

    Returns
    -------
    dict
        Dictionary containing database credentials with keys:
        db_name, user, password, host, port
    """
    # First try environment variables (Replit secrets)
    if os.environ.get('SUPABASE_DB_HOST'):
        return {
            'db_name': 'postgres',
            'user': os.environ.get('SUPABASE_DB_USER', 'postgres'),
            'password': os.environ.get('SUPABASE_DB_PASSWORD', ''),
            'host': os.environ.get('SUPABASE_DB_HOST', ''),
            'port': '5432'
        }
    
    # Fallback to credentials.json for local development
    base_dir = Path(__file__).resolve().parents[1]  # Decathlon_Automation_Core/
    file = base_dir / "config" / "credentials.json"

    if not file.exists():
        raise FileNotFoundError(
            f"Config file not found: {file}\n"
            "Either set SUPABASE_DB_HOST, SUPABASE_DB_USER, SUPABASE_DB_PASSWORD environment variables, "
            "or create the credentials.json file."
        )

    with open(file, "r") as f:
        creds = json.load(f)

    return creds['database']

