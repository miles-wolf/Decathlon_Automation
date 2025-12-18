import psycopg2
import pandas as pd
import os

def connect_to_postgres(db_name=None, db_user=None, db_password=None, db_host=None, db_port=None):
    """Connects to a PostgreSQL database and returns a connection object."""
    # Use environment variables if parameters not provided
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
        print(f"Error connecting to the database: {e}")
        return None, None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None, None


def build_values_section_dicts(cur, rows, keys):
    """
    Build a VALUES (...) section from a list of dictionaries.
    
    cursor : psycopg2 cursor (used for mogrify)
    rows   : list of dicts, each dict must contain the keys in `keys`
    keys   : list of column names in order, e.g. ["staff_id", "job_id"]
    """
    if not rows:
        return ""
    
    values_sql = b",".join(
        cur.mogrify(
            "(" + ",".join(["%s"] * len(keys)) + ")", 
            tuple(row[k] for k in keys)
        ) 
        for row in rows
    ).decode("utf-8")
    return values_sql

def generate_lunch_job_sql(cur, assignments, session_id, days=None):
    """
    Build the fully-rendered SQL used to compute lunch job assignments.

    Parameters
    ----------
    cur : psycopg2 cursor
        Active cursor (used for mogrify and for VALUES rendering).
    assignments : list[dict]
        Hardcoded job assignments, e.g. [{"staff_id":1141, "job_id":1001}, ...]
    session_id : int
        The camp session id to filter eligible staff.
    days : list[str] | None
        Optional override for the days to schedule (default: Mon–Thu).

    Returns
    -------
    str
        The final SQL string with all parameters inlined via mogrify.
    """
    days = days or ["monday", "tuesday", "wednesday", "thursday"]

    values_section = build_values_section_dicts(cur, assignments, ["staff_id", "job_id"])
    
    if not assignments:
        hardcoded_cte = """hardcoded_assignments (staff_id,job_id) AS (
    SELECT NULL::integer as staff_id, NULL::integer as job_id WHERE FALSE
),"""
    else:
        hardcoded_cte = f"""hardcoded_assignments (staff_id,job_id) AS (
    VALUES
        {values_section}
),"""

    prepared_sql = f"""
WITH {hardcoded_cte}
days(day_name) AS (
    SELECT * 
    FROM unnest(%(days)s::text[])
),

jobs AS (
    SELECT j.id AS lunch_job_id,
           j.name AS job_name,
           j.code as job_code
    FROM jobs as j
    WHERE j.type = 'lunchtime'
),
eligible_staff AS (
    SELECT CONCAT(s.first_name, ' ', s.last_name) AS staff_name,
           sess.session_number as session_id,
           s.id AS staff_id
    FROM staff AS s
    INNER JOIN staff_to_session AS sts ON s.id = sts.staff_id
    INNER JOIN sessions AS sess ON sess.id = sts.session_id
    WHERE 1 = 1
      AND sess.session_number = %(session_id)s
    GROUP BY 1,2,3
),
jobs_per_day AS (
    SELECT
        d.day_name,
        j.lunch_job_id,
        j.job_name,
        j.job_code,
        ROW_NUMBER() OVER (
            PARTITION BY d.day_name
            ORDER BY j.job_name DESC
        ) AS job_rn
    FROM days d
    CROSS JOIN jobs j
),
staff_per_day AS (
    SELECT
        d.day_name,
        es.staff_id,
        es.staff_name,
        ROW_NUMBER() OVER (
            PARTITION BY d.day_name
            ORDER BY random()
        ) AS staff_rn
    FROM days d
    CROSS JOIN eligible_staff es
),
not_random_assignments AS (
    SELECT jpd.day_name AS day,
           jpd.lunch_job_id,
           jpd.job_name,
           jpd.job_code,
           hc.staff_id
    FROM jobs_per_day AS jpd
    INNER JOIN hardcoded_assignments AS hc
        ON jpd.lunch_job_id = hc.job_id
),
random_assignments AS (
    SELECT jpd.day_name AS day,
           jpd.lunch_job_id,
           jpd.job_name,
           jpd.job_code,
           spd.staff_id
    FROM staff_per_day AS spd
    INNER JOIN jobs_per_day AS jpd
        ON spd.staff_rn = jpd.job_rn
       AND spd.day_name = jpd.day_name
    WHERE 1 = 1
      AND staff_id NOT IN (SELECT staff_id FROM hardcoded_assignments)
      AND jpd.lunch_job_id NOT IN (SELECT job_id FROM hardcoded_assignments)
),
combined_assignments AS (
    SELECT * FROM random_assignments
    UNION
    SELECT * FROM not_random_assignments
), 
final AS (
    SELECT ca.*, es.staff_name
    FROM combined_assignments AS ca
    LEFT JOIN eligible_staff AS es
        ON ca.staff_id = es.staff_id
    WHERE 1 = 1
    ORDER BY ARRAY_POSITION(ARRAY['monday', 'tuesday', 'wednesday', 'thursday'], day), job_code
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
    import json
    import sys
    
    conn, cur = connect_to_postgres()
    
    if not conn or not cur:
        print("Failed to connect to database", file=sys.stderr)
        exit(1)
    
    try:
        # Read parameters from environment variables
        session_id = int(os.environ.get('SESSION_ID', '1'))
        assignments_json = os.environ.get('ASSIGNMENTS', '[]')
        days_json = os.environ.get('DAYS', '["monday", "tuesday", "wednesday", "thursday"]')
        
        # Parse JSON parameters
        assignments = json.loads(assignments_json)
        days = json.loads(days_json)
        
        # Generate SQL and execute
        lunch_job_sql = generate_lunch_job_sql(cur, assignments, session_id=session_id, days=days)
        df = pd.read_sql(lunch_job_sql, conn)
        
        # Convert DataFrame to JSON and output
        results = df.to_dict(orient='records')
        print(json.dumps(results))
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        cur.close()
        conn.close()
        exit(1)
