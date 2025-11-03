import psycopg2
import pandas as pd
import random
import numpy as np



def get_lunch_jobs_sql():

    sql = """
    select id as job_id,
           code as job_code,
           name as job_name,
           min_staff_assigned,
           normal_staff_assigned,
           max_staff_assigned,
           job_description,
           priority

    from camp.job
    where 1 = 1
        and job_type = 'lunch'
    ;
    """
    return sql


def get_days_sql(cur, days):
    """
    Build a SQL query that defines a 'days' CTE from a list of day names.

    Parameters
    ----------
    cur : psycopg2.cursor
        An active cursor object from an open psycopg2 connection.
    days : list[str]
        List of day names, e.g. ['monday', 'tuesday', 'wednesday'].

    Returns
    -------
    str
        A fully rendered SQL string with the parameter values safely substituted
        via mogrify(), ready for logging or execution.
    """
    sql = """
    WITH days(day_name) AS (
        SELECT *
        FROM unnest(%(days)s::text[])
    )
    SELECT *
    FROM days;
    """

    # psycopg2 mogrify safely interpolates parameters into SQL text
    query = cur.mogrify(sql, {"days": days}).decode("utf-8")
    return query

def get_eligible_staff_sql(cur, session_id):
    """
    Build a SQL query that selects eligible staff for a given session_id,
    safely interpolated using psycopg2.mogrify().

    Parameters
    ----------
    cur : psycopg2.cursor
        An active psycopg2 cursor object.
    session_id : int
        The session ID to filter by.

    Returns
    -------
    str
        A fully rendered SQL string with safe parameter substitution.
    """

    sql = """
    SELECT
        CONCAT(s.first_name, ' ', s.last_name) AS staff_name,
        sts.session_id,
        s.id AS staff_id,
        r.id AS role_id,
        sts.group_id
    FROM camp.staff_to_session AS sts
    INNER JOIN camp.staff AS s
        ON sts.staff_id = s.id
    INNER JOIN camp.role AS r
        ON sts.role_id = r.id
    WHERE 1 = 1
      AND sts.session_id = %(session_id)s
      AND r.id IN (1005, 1006)  -- JC's and Counselors
    --GROUP BY 1,2,3
    ;
    """

    params = {"session_id":session_id}

    # mogrify substitutes the parameter safely and returns a full SQL string
    query = cur.mogrify(sql, params).decode("utf-8")
    return query

def assign_group_patterns(df_eligible_staff):
    """
    Assign alternating group patterns (A/B/A/B...) to each distinct group_id.
    The starting pattern (A or B) is randomized per run.

    Parameters
    ----------
    df_eligible_staff : pd.DataFrame
        Must contain a 'group_id' column.

    Returns
    -------
    pd.DataFrame
        DataFrame with columns ['group_id', 'base_pattern'].
    """

    # Get distinct sorted group IDs
    unique_groups = (
        df_eligible_staff[['group_id']]
        .drop_duplicates()
        .sort_values('group_id')
        .reset_index(drop=True)
        .copy()
    )

    # Randomly choose starting pattern
    start_pattern = random.choice(['A', 'B'])

    # Create a numeric sequence 0, 1, 2, ... then assign A/B alternating
    unique_groups['base_pattern'] = np.where(
        (unique_groups.index % 2 == 0),
        start_pattern,
        np.where(start_pattern == 'A', 'B', 'A')
    )
    return unique_groups


def build_values_section_dicts(cur, rows, keys):
    """
    Build a VALUES (...) section from a list of dictionaries.
    
    cursor : psycopg2 cursor (used for mogrify)
    rows   : list of dicts, each dict must contain the keys in `keys`
    keys   : list of column names in order, e.g. ["staff_id", "job_id"]
    """
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

    # Build VALUES (pretty or compact is fine; using your existing helper)
    values_section = build_values_section_dicts(cur, assignments, ["staff_id", "job_id"])

    # Inline the days array safely
    # (We’ll let mogrify handle the array casting later via %(days)s::text[])
    prepared_sql = f"""
WITH hardcoded_assignments (staff_id,job_id) AS (
    VALUES
        {values_section}
),
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


# db_name = "postgres"
# user = "shop_analyst.ffnhexmowaiglsmmbycm"
# password = "infinity"
# host = "aws-0-us-west-1.pooler.supabase.com"
# port = "5432"

# conn,cur = connect_to_postgres(db_name,user,password,host,port)


# assignments = [
#     {"staff_id": 1141, "job_id": 1001},#staff_id 1141 assigned to Arts & Crafts
#     {"staff_id": 1177, "job_id": 1009},#staff_id 1205 assigned to Card Trading
#     {"staff_id": 1027, "job_id": 1021},#staff_id 1027 assigned to MULTI
# ]

# lunch_job_sql = generate_lunch_job_sql(cur, assignments, session_id=1015)
# #print(lunch_job_sql)

# df = pd.read_sql(lunch_job_sql,conn)
