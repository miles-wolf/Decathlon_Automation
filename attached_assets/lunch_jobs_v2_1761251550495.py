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
    except psycopg2.OperationalError as e:
        print(f"Error connecting to the database: {e}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None


def build_values_section_dicts(cur, rows, keys):
    """
    Build a VALUES (...) section from a list of dictionaries.
    
    cursor : psycopg2 cursor (used for mogrify)
    rows   : list of dicts, each dict must contain the keys in `keys`
    keys   : list of column names in order, e.g. ["staff_id", "job_id"]
    """
    if not rows:
        # Return empty string - we'll handle this in the calling function
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
    # default days if none provided
    days = days or ["monday", "tuesday", "wednesday", "thursday"]

    # Build VALUES (handle empty assignments case)
    values_section = build_values_section_dicts(cur, assignments, ["staff_id", "job_id"])
    
    # Handle empty assignments by creating a CTE that returns no rows
    if not assignments:
        hardcoded_cte = """hardcoded_assignments (staff_id,job_id) AS (
    SELECT NULL::integer as staff_id, NULL::integer as job_id WHERE FALSE
),"""
    else:
        hardcoded_cte = f"""hardcoded_assignments (staff_id,job_id) AS (
    VALUES
        {values_section}
),"""

    # Inline the days array safely
    # (We'll let mogrify handle the array casting later via %(days)s::text[])
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
    FROM camp.job as j
    WHERE j.job_type = 'lunch'
),
eligible_staff AS (
    SELECT CONCAT(s.first_name, ' ', s.last_name) AS staff_name,
           sts.session_id,
           s.id AS staff_id
    FROM camp.staff_to_session AS sts
    INNER JOIN camp.staff AS s
        ON sts.staff_id = s.id
    INNER JOIN camp.role AS r
        ON sts.role_id = r.id
    WHERE 1 = 1
      AND sts.session_id = %(session_id)s
      AND r.id IN (1005, 1006) -- JC's and Counselors
    GROUP BY 1,2,3
),
-- Rank jobs per day
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
-- Rank staff per day
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
    # Return the fully inlined SQL string (useful for logging or pd.read_sql)
    return cur.mogrify(prepared_sql, params).decode("utf-8")


db_name = "postgres"
user = "shop_analyst.ffnhexmowaiglsmmbycm"
password = "infinity"
host = "aws-0-us-west-1.pooler.supabase.com"
port = "5432"

conn,cur = connect_to_postgres(db_name,user,password,host,port)


assignments = [
    {"staff_id": 1141, "job_id": 1001},#staff_id 1141 assigned to Arts & Crafts
    {"staff_id": 1177, "job_id": 1009},#staff_id 1205 assigned to Card Trading
    {"staff_id": 1027, "job_id": 1021},#staff_id 1027 assigned to MULTI
]

lunch_job_sql = generate_lunch_job_sql(cur, assignments, session_id=1015)
#print(lunch_job_sql)

df = pd.read_sql(lunch_job_sql,conn)
print("dataframe successfully created")