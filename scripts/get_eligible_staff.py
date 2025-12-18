#!/usr/bin/env python3
"""
Script to fetch eligible staff from the Supabase database.
Outputs JSON to stdout for consumption by Node.js backend.
"""
import sys
import os
import json

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Decathlon_Automation_Core'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from connections import db_connections as dbc

def get_eligible_staff(session_id: int) -> list:
    """
    Fetch eligible staff for a given session from the database.
    
    Parameters
    ----------
    session_id : int
        The session ID to filter by
        
    Returns
    -------
    list
        List of dictionaries containing staff information
    """
    creds = dbc.load_db_read_creds()
    conn, cur = dbc.connect_to_postgres(
        creds['db_name'], 
        creds['user'], 
        creds['password'], 
        creds['host'], 
        creds['port']
    )
    
    if not conn:
        raise Exception("Failed to connect to database")
    
    try:
        sql = """
        SELECT
            CONCAT(s.first_name, ' ', s.last_name) AS staff_name,
            sts.session_id,
            s.id AS staff_id,
            r.id AS role_id,
            r.name AS role_name,
            sts.group_id
        FROM camp.staff_to_session AS sts
        INNER JOIN camp.staff AS s
            ON sts.staff_id = s.id
        INNER JOIN camp.role AS r
            ON sts.role_id = r.id
        WHERE 1 = 1
          AND sts.session_id = %s
          AND r.id IN (1005, 1006)
        ORDER BY sts.group_id ASC, sts.role_id ASC
        """
        
        cur.execute(sql, (session_id,))
        columns = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        
        staff_list = []
        for row in rows:
            staff_dict = dict(zip(columns, row))
            staff_list.append(staff_dict)
        
        return staff_list
    finally:
        conn.close()


def get_available_sessions() -> list:
    """
    Fetch all available session IDs from the database.
    
    Returns
    -------
    list
        List of dictionaries containing session information
    """
    creds = dbc.load_db_read_creds()
    conn, cur = dbc.connect_to_postgres(
        creds['db_name'], 
        creds['user'], 
        creds['password'], 
        creds['host'], 
        creds['port']
    )
    
    if not conn:
        raise Exception("Failed to connect to database")
    
    try:
        sql = """
        SELECT DISTINCT session_id
        FROM camp.staff_to_session
        ORDER BY session_id ASC
        """
        
        cur.execute(sql)
        rows = cur.fetchall()
        
        sessions = [{"session_id": row[0]} for row in rows]
        return sessions
    finally:
        conn.close()


def get_groups(session_id: int = None) -> list:
    """
    Fetch all groups, optionally filtered by session.
    
    Returns
    -------
    list
        List of dictionaries containing group information
    """
    creds = dbc.load_db_read_creds()
    conn, cur = dbc.connect_to_postgres(
        creds['db_name'], 
        creds['user'], 
        creds['password'], 
        creds['host'], 
        creds['port']
    )
    
    if not conn:
        raise Exception("Failed to connect to database")
    
    try:
        if session_id:
            sql = """
            SELECT DISTINCT g.id as group_id, g.name as group_name
            FROM camp.group AS g
            INNER JOIN camp.staff_to_session AS sts ON g.id = sts.group_id
            WHERE sts.session_id = %s
            ORDER BY g.id ASC
            """
            cur.execute(sql, (session_id,))
        else:
            sql = """
            SELECT id as group_id, name as group_name
            FROM camp.group
            ORDER BY id ASC
            """
            cur.execute(sql)
        
        columns = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        
        groups = [dict(zip(columns, row)) for row in rows]
        return groups
    finally:
        conn.close()


def get_lunch_jobs() -> list:
    """
    Fetch all lunch jobs from the database.
    
    Returns
    -------
    list
        List of dictionaries containing job information
    """
    creds = dbc.load_db_read_creds()
    conn, cur = dbc.connect_to_postgres(
        creds['db_name'], 
        creds['user'], 
        creds['password'], 
        creds['host'], 
        creds['port']
    )
    
    if not conn:
        raise Exception("Failed to connect to database")
    
    try:
        sql = """
        SELECT id as job_id,
               code as job_code,
               name as job_name,
               min_staff_assigned,
               normal_staff_assigned,
               max_staff_assigned,
               job_description,
               priority
        FROM camp.job
        WHERE job_type = 'lunch'
        ORDER BY priority DESC, name ASC
        """
        
        cur.execute(sql)
        columns = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        
        jobs = [dict(zip(columns, row)) for row in rows]
        return jobs
    finally:
        conn.close()


def get_ampm_jobs() -> list:
    """
    Fetch all AM/PM jobs from the database.
    
    Returns
    -------
    list
        List of dictionaries containing job information
    """
    creds = dbc.load_db_read_creds()
    conn, cur = dbc.connect_to_postgres(
        creds['db_name'], 
        creds['user'], 
        creds['password'], 
        creds['host'], 
        creds['port']
    )
    
    if not conn:
        raise Exception("Failed to connect to database")
    
    try:
        sql = """
        SELECT id as job_id,
               code as job_code,
               name as job_name,
               min_staff_assigned,
               normal_staff_assigned,
               max_staff_assigned,
               job_description,
               priority
        FROM camp.job
        WHERE job_type = 'am/pm'
        ORDER BY priority DESC, name ASC
        """
        
        cur.execute(sql)
        columns = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        
        jobs = [dict(zip(columns, row)) for row in rows]
        return jobs
    finally:
        conn.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Fetch data from Supabase database')
    parser.add_argument('action', choices=['eligible-staff', 'sessions', 'groups', 'lunch-jobs', 'ampm-jobs'],
                        help='Action to perform')
    parser.add_argument('--session-id', type=int, help='Session ID for filtering')
    
    args = parser.parse_args()
    
    # Suppress connection messages by redirecting stderr temporarily
    old_stdout = sys.stdout
    sys.stdout = sys.stderr
    
    try:
        if args.action == 'eligible-staff':
            if not args.session_id:
                print(json.dumps({"error": "session_id is required for eligible-staff"}), file=old_stdout)
                sys.exit(1)
            result = get_eligible_staff(args.session_id)
        elif args.action == 'sessions':
            result = get_available_sessions()
        elif args.action == 'groups':
            result = get_groups(args.session_id)
        elif args.action == 'lunch-jobs':
            result = get_lunch_jobs()
        elif args.action == 'ampm-jobs':
            result = get_ampm_jobs()
        else:
            result = {"error": f"Unknown action: {args.action}"}
        
        sys.stdout = old_stdout
        print(json.dumps(result))
    except Exception as e:
        sys.stdout = old_stdout
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
