import psycopg2
import pandas as pd
import os
import json
import sys

def connect_to_postgres(db_name=None, db_user=None, db_password=None, db_host=None, db_port=None):
    """Connects to a PostgreSQL database and returns a connection object."""
    db_name = db_name or os.environ.get('PGDATABASE')
    db_user = db_user or os.environ.get('PGUSER')
    db_password = db_password or os.environ.get('PGPASSWORD')
    db_host = db_host or os.environ.get('PGHOST')
    db_port = db_port or os.environ.get('PGPORT', '5432')
    
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
        
        print("Successfully connected to the database.", file=sys.stderr)
        return conn, cur
    except psycopg2.OperationalError as e:
        print(f"Error connecting to the database: {e}", file=sys.stderr)
        return None, None
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        return None, None


def generate_ampm_job_sql(cur, session_id, days=None):
    """
    Build the SQL used to compute AM/PM job assignments.

    Parameters
    ----------
    cur : psycopg2 cursor
        Active cursor (used for mogrify).
    session_id : int
        The camp session number to filter eligible staff.
    days : list[str] | None
        Optional override for the days to schedule.

    Returns
    -------
    str
        The final SQL string with all parameters inlined via mogrify.
    """
    days = days or ["monday", "tuesday", "wednesday", "thursday", "friday"]

    prepared_sql = """
WITH days(day_name) AS (
    SELECT * 
    FROM unnest(%(days)s::text[])
),

jobs AS (
    SELECT j.id AS job_id,
           j.name AS job_name,
           j.code as job_code
    FROM jobs as j
    WHERE j.type = 'pm'
),

eligible_staff AS (
    SELECT CONCAT(s.first_name, ' ', s.last_name) AS staff_name,
           sess.session_number as session_id,
           s.id AS staff_id
    FROM staff AS s
    INNER JOIN staff_to_session AS sts ON s.id = sts.staff_id
    INNER JOIN sessions AS sess ON sess.id = sts.session_id
    WHERE sess.session_number = %(session_id)s
    GROUP BY 1,2,3
),

jobs_per_day AS (
    SELECT
        d.day_name,
        j.job_id,
        j.job_name,
        j.job_code,
        ROW_NUMBER() OVER (
            PARTITION BY d.day_name
            ORDER BY j.job_name
        ) AS job_rn
    FROM days AS d
    CROSS JOIN jobs AS j
),

staff_per_day AS (
    SELECT
        d.day_name,
        es.staff_id,
        es.staff_name,
        ROW_NUMBER() OVER (
            PARTITION BY d.day_name
            ORDER BY RANDOM()
        ) AS staff_rn
    FROM days AS d
    CROSS JOIN eligible_staff AS es
),

assignments AS (
    SELECT jpd.day_name AS day,
           jpd.job_id,
           jpd.job_name,
           jpd.job_code,
           spd.staff_id,
           spd.staff_name
    FROM staff_per_day AS spd
    INNER JOIN jobs_per_day AS jpd
        ON spd.staff_rn = jpd.job_rn
       AND spd.day_name = jpd.day_name
),

final AS (
    SELECT *
    FROM assignments
    ORDER BY ARRAY_POSITION(ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], day), job_code
)

SELECT *
FROM final;
"""

    params = {
        "session_id": session_id,
        "days": days,
    }
    return cur.mogrify(prepared_sql, params).decode("utf-8")


if __name__ == "__main__":
    conn, cur = connect_to_postgres()
    
    if not conn or not cur:
        print("Failed to connect to database", file=sys.stderr)
        exit(1)
    
    try:
        session_id = int(os.environ.get('SESSION_ID', '1'))
        days_json = os.environ.get('DAYS', '["monday", "tuesday", "wednesday", "thursday", "friday"]')
        
        days = json.loads(days_json)
        
        ampm_job_sql = generate_ampm_job_sql(cur, session_id=session_id, days=days)
        df = pd.read_sql(ampm_job_sql, conn)
        
        results = df.to_dict(orient='records')
        print(json.dumps(results))
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        cur.close()
        conn.close()
        exit(1)
