import psycopg2
import pandas as pd
import random
import numpy as np
import json
import os
import sys
from pathlib import Path
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Set UTF-8 encoding for print statements to handle Unicode characters
try:
    if sys.stdout.encoding != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8')
except (AttributeError, OSError):
    # reconfigure not available in some environments (e.g., Jupyter, IPython)
    pass

def get_ampm_jobs_sql():
    """
    Return a SQL query to retrieve all am/pm jobs from camp.job
    """
    
    sql = """
    SELECT j.id as job_id,
           j.code as job_code,
           j.name as job_name,
           j.min_staff_assigned,
           j.normal_staff_assigned,
           j.max_staff_assigned,
           j.job_description,
           j.priority
    FROM camp.job as j
    WHERE 1 = 1
        AND j.job_type = 'am/pm'
    ORDER BY j.priority DESC, j.name ASC;
    """
    return sql


def get_eligible_staff_sql(cur, session_id):
    """
    Build a SQL query that selects eligible staff for a given session_id.
    
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
    print('Retrieving eligible staff sql query...')
    
    sql = """
    SELECT
        CONCAT(s.first_name, ' ', s.last_name) AS staff_name,
        sts.session_id,
        s.id AS staff_id,
        r.id AS role_id,
        sts.group_id,
        s.field_lining_pref,
        s.years_at_camp,
        s.gender,
        s.physical_strength,
        s.extroverted_level
    FROM camp.staff_to_session AS sts
    INNER JOIN camp.staff AS s
        ON sts.staff_id = s.id
    INNER JOIN camp.role AS r
        ON sts.role_id = r.id
    WHERE 1 = 1
      AND sts.session_id = %(session_id)s
      AND r.id IN (1005, 1006)  -- JC's and Counselors
    ORDER BY sts.group_id ASC, sts.role_id ASC
    ;
    """
    
    params = {"session_id": session_id}
    
    # mogrify substitutes the parameter safely and returns a full SQL string
    query = cur.mogrify(sql, params).decode("utf-8")
    
    print('Eligible staff sql retrieved')
    return query


def load_ampm_job_config(directory: str, filename: str) -> dict:
    """
    Loads the AM/PM job configuration JSON and returns it.
    
    AM/PM job configuration JSON files should be located in the
    /config/{directory}/ directory.
    
    The directory parameter should be the full directory name, typically:
    ampmjob_inputs_session_{session_id}

    Parameters
    ----------
    directory : str
        Directory name under config/ (e.g., 'ampmjob_inputs_session_1012')
        JSON filename (e.g., 'ampmjob_1012.json')
    
    Returns
    -------
    dict
        Dictionary containing:
        - session_id
        - hardcoded_job_assignments (dict mapping job_id to list of staff_ids)
        - custom_job_assignments (dict mapping job_id to list of staff_ids)
        - staff_to_remove (list of staff_ids to exclude)
        - staff_to_add (list of dicts with staff details)
    """
    # Resolve the path to the config directory
    base_dir = Path(__file__).resolve().parents[1]  # Decathlon_Automation/
    file_path = base_dir / "config" / "ampmjob_inputs" / directory / filename
    
    print(f"\nLoading AM/PM job config from: {file_path}")
    
    if not file_path.exists():
        raise FileNotFoundError(f"Config file not found: {file_path}")
    
    with open(file_path, "r") as f:
        data = json.load(f)
    
    # Convert job_id keys to int for hardcoded_job_assignments
    if "hardcoded_job_assignments" in data:
        print('hardcoded_job_assignments detected in input. Reformatting JSON...')
        data["hardcoded_job_assignments"] = {
            int(k): [int(x) for x in v]
            for k, v in data["hardcoded_job_assignments"].items()
        }
    
    # Convert job_id keys to int for custom_job_assignments
    if "custom_job_assignments" in data:
        print('custom_job_assignments detected in input. Reformatting JSON...')
        data["custom_job_assignments"] = {
            int(k): [int(x) for x in v]
            for k, v in data["custom_job_assignments"].items()
        }
    
    print(f"Loaded config for session {data.get('session_id')}")
    return data


def is_staff_eligible_for_job(staff, job):
    """
    Check if a staff member is eligible for a specific job.
    
    Parameters
    ----------
    staff : dict
        Staff member dictionary with keys: staff_name, field_lining_preference, years_at_camp, gender
    job : dict
        Job dictionary with keys: job_id, job_code, job_name
    
    Returns
    -------
    bool
        True if staff is eligible for the job, False otherwise
    """
    # Field lining jobs require field lining preference
    field_lining_jobs = ['field_line_soccer', 'field_line_baseball', 'field_line_kickball', 
                        'field_lining', 'line_fields']  # Add all field lining job codes
    
    if job.get('job_code') in field_lining_jobs:
        # Check if staff has field lining preference
        field_pref = staff.get('field_lining_preference', '')
        if not field_pref or field_pref.lower() in ['no', 'n', 'false', '0', 'none', '']:
            return False
    
    # Jobs 1145 and 1141 require male staff
    male_only_jobs = [1145, 1141]
    if job.get('job_id') in male_only_jobs:
        staff_gender = staff.get('gender', '').lower()
        if staff_gender not in ['m', 'male']:
            return False
    
    return True


def assign_staff_to_ampm_jobs(df_staff, df_jobs, hardcoded_assignments=None, custom_assignments=None):
    """
    Assign staff to AM/PM jobs with special rules for eligibility and seniority.
    
    Strategy:
    1. Process hardcoded assignments first (using fixed job_ids with staff_ids)
    2. Process custom assignments (using variable job_ids with staff_ids)
    3. Sort jobs by priority (highest first)
    4. For each job, assign minimum required staff first
    5. Check field lining eligibility for field lining jobs
    6. Prioritize less senior staff for specific jobs
    7. Then try to reach normal staff level
    8. If extra staff remain, distribute randomly without exceeding max
    
    Parameters
    ----------
    df_staff : pd.DataFrame
        DataFrame with eligible staff (staff_id, staff_name, role_id, group_id, field_lining_preference, years_at_camp)
    df_jobs : pd.DataFrame
        DataFrame with AM/PM jobs (job_id, job_code, job_name, min/normal/max_staff_assigned, job_description)
    hardcoded_assignments : dict, optional
        Dictionary mapping job_id (int) to lists of staff_ids (int) for hardcoded assignments
    custom_assignments : dict, optional
        Dictionary mapping job_id (int) to lists of staff_ids (int) for custom assignments
    
    Returns
    -------
    pd.DataFrame
        Assignments with columns: staff_id, staff_name, job_id, job_code, job_name, job_description
    """
    print("\n" + "="*80)
    print("ASSIGNING STAFF TO AM/PM JOBS")
    print("="*80)
    
    # Convert to empty dicts if None
    if hardcoded_assignments is None:
        hardcoded_assignments = {}
    if custom_assignments is None:
        custom_assignments = {}
    
    # Create a list of available staff (shuffle for randomness)
    available_staff = df_staff.copy().to_dict('records')
    random.shuffle(available_staff)
    
    assignments = []
    job_staff_counts = {}  # Track how many staff assigned to each job
    
    # Initialize counts
    for _, job in df_jobs.iterrows():
        job_staff_counts[job['job_id']] = 0
    
    print(f"\nTotal staff available: {len(available_staff)}")
    print(f"Total jobs to fill: {len(df_jobs)}")
    
    # PHASE 0A: Process hardcoded assignments (job_id -> staff_ids)
    print("\n" + "-"*80)
    print("PHASE 0A: Processing hardcoded assignments")
    print("-"*80)
    
    for job_id, staff_ids in hardcoded_assignments.items():
        if not staff_ids:
            continue
            
        # Find the job
        job_match = df_jobs[df_jobs['job_id'] == job_id]
        if job_match.empty:
            print(f"  Warning: Job ID {job_id} not found")
            continue
        
        job = job_match.iloc[0]
        
        print(f"\n{job['job_name']} (ID: {job_id}) - Hardcoded: {len(staff_ids)} staff")
        
        for staff_id in staff_ids:
            # Find the staff member by ID
            staff_matches = [s for s in available_staff if s['staff_id'] == staff_id]
            
            if not staff_matches:
                print(f"  Warning: Staff ID {staff_id} not found or already assigned")
                continue
            
            staff = staff_matches[0]
            
            assignments.append({
                'staff_id': staff['staff_id'],
                'staff_name': staff['staff_name'],
                'job_id': job_id,
                'job_code': job['job_code'],
                'job_name': job['job_name'],
                'job_description': job['job_description']
            })
            
            available_staff.remove(staff)
            job_staff_counts[job_id] += 1
            print(f"  ✓ Assigned {staff['staff_name']} (ID: {staff_id})")
    
    print(f"\nStaff remaining after hardcoded assignments: {len(available_staff)}")
    
    # PHASE 0B: Process custom assignments (job_id -> staff_ids)
    print("\n" + "-"*80)
    print("PHASE 0B: Processing custom assignments")
    print("-"*80)
    
    for job_id, staff_ids in custom_assignments.items():
        if not staff_ids:
            continue
            
        # Find the job
        job_match = df_jobs[df_jobs['job_id'] == job_id]
        if job_match.empty:
            print(f"  Warning: Job ID {job_id} not found")
            continue
        
        job = job_match.iloc[0]
        
        print(f"\n{job['job_name']} (ID: {job_id}) - Custom: {len(staff_ids)} staff")
        
        for staff_id in staff_ids:
            # Find the staff member by ID
            staff_matches = [s for s in available_staff if s['staff_id'] == staff_id]
            
            if not staff_matches:
                print(f"  Warning: Staff ID {staff_id} not found or already assigned")
                continue
            
            staff = staff_matches[0]
            
            assignments.append({
                'staff_id': staff['staff_id'],
                'staff_name': staff['staff_name'],
                'job_id': job_id,
                'job_code': job['job_code'],
                'job_name': job['job_name'],
                'job_description': job['job_description']
            })
            
            available_staff.remove(staff)
            job_staff_counts[job_id] += 1
            print(f"  ✓ Assigned {staff['staff_name']} (ID: {staff_id})")
    
    print(f"\nStaff remaining after custom assignments: {len(available_staff)}")
    
    # PHASE 1: Assign minimum required staff to each job
    print("\n" + "-"*80)
    print("PHASE 1: Assigning minimum required staff")
    print("-"*80)
    
    # Define jobs that should prioritize less senior staff
    less_senior_jobs = ['large_whiffle', 'small_whiffle', 'camp_cleanup', 
                       'whiffle_ball_large', 'whiffle_ball_small']
    less_senior_job_ids = [1149, 1193]  # Jobs by ID that need less senior staff
    
    # Define jobs that need physically stronger staff
    physical_strength_jobs = [1145, 1141]
    
    # Define jobs that need more extroverted staff
    extroverted_jobs = [1105, 1113, 1117, 1101, 1189, 1093]
    
    for _, job in df_jobs.iterrows():
        current_count = job_staff_counts[job['job_id']]
        min_needed = job['min_staff_assigned'] - current_count  # Account for hardcoded assignments
        job_id = job['job_id']
        
        if min_needed <= 0:
            print(f"\n{job['job_name']} ({job['job_code']}) - Already has {current_count} staff (hardcoded)")
            continue
        
        print(f"\n{job['job_name']} ({job['job_code']}) - Min: {min_needed}")
        
        # Sort staff based on job requirements
        eligible_staff = [s for s in available_staff if is_staff_eligible_for_job(s, job)]
        
        # For jobs requiring physical strength, prioritize staff with higher physical_strength
        if job_id in physical_strength_jobs:
            eligible_staff.sort(key=lambda s: s.get('physical_strength', 0), reverse=True)
            print(f"  Prioritizing physically stronger staff for this job")
        # For jobs requiring extroversion, prioritize staff with higher extroverted_level
        elif job_id in extroverted_jobs:
            eligible_staff.sort(key=lambda s: s.get('extroverted_level', 0), reverse=True)
            print(f"  Prioritizing more extroverted staff for this job")
        # For less senior jobs, prioritize staff with fewer years at camp
        elif job.get('job_code') in less_senior_jobs or job_id in less_senior_job_ids:
            eligible_staff.sort(key=lambda s: s.get('years_at_camp', 999))
            print(f"  Prioritizing less senior staff for this job")
        
        assigned_count = 0
        staff_to_remove = []
        
        for staff in eligible_staff:
            if assigned_count >= min_needed:
                break
            
            assignments.append({
                'staff_id': staff['staff_id'],
                'staff_name': staff['staff_name'],
                'job_id': job_id,
                'job_code': job['job_code'],
                'job_name': job['job_name'],
                'job_description': job['job_description']
            })
            
            staff_to_remove.append(staff)
            assigned_count += 1
            job_staff_counts[job_id] += 1
        
        # Remove assigned staff from available pool
        for staff in staff_to_remove:
            available_staff.remove(staff)
        
        if assigned_count < min_needed:
            print(f"  ⚠️  Warning: Only assigned {assigned_count}/{min_needed} minimum staff (not enough eligible)")
        else:
            print(f"  Assigned {assigned_count}/{min_needed} minimum staff")
    
    print(f"\nStaff remaining after minimum assignments: {len(available_staff)}")
    
    # PHASE 2: Try to reach normal staff levels
    print("\n" + "-"*80)
    print("PHASE 2: Reaching normal staff levels")
    print("-"*80)
    
    for _, job in df_jobs.iterrows():
        normal_needed = job['normal_staff_assigned']
        job_id = job['job_id']
        current_count = job_staff_counts[job_id]
        
        additional_needed = normal_needed - current_count
        
        if additional_needed <= 0:
            continue
        
        print(f"\n{job['job_name']} ({job['job_code']}) - Need {additional_needed} more to reach normal ({normal_needed})")
        
        # Filter eligible staff for this job
        eligible_staff = [s for s in available_staff if is_staff_eligible_for_job(s, job)]
        
        # For jobs requiring physical strength, prioritize staff with higher physical_strength
        if job_id in physical_strength_jobs:
            eligible_staff.sort(key=lambda s: s.get('physical_strength', 0), reverse=True)
        # For jobs requiring extroversion, prioritize staff with higher extroverted_level
        elif job_id in extroverted_jobs:
            eligible_staff.sort(key=lambda s: s.get('extroverted_level', 0), reverse=True)
        # For less senior jobs, prioritize staff with fewer years at camp
        elif job.get('job_code') in less_senior_jobs or job_id in less_senior_job_ids:
            eligible_staff.sort(key=lambda s: s.get('years_at_camp', 999))
        
        assigned_count = 0
        staff_to_remove = []
        
        for staff in eligible_staff:
            if assigned_count >= additional_needed:
                break
            
            assignments.append({
                'staff_id': staff['staff_id'],
                'staff_name': staff['staff_name'],
                'job_id': job_id,
                'job_code': job['job_code'],
                'job_name': job['job_name'],
                'job_description': job['job_description']
            })
            
            staff_to_remove.append(staff)
            assigned_count += 1
            job_staff_counts[job_id] += 1
        
        # Remove assigned staff from available pool
        for staff in staff_to_remove:
            available_staff.remove(staff)
        
        print(f"  Assigned {assigned_count}/{additional_needed} additional staff (total now: {job_staff_counts[job_id]})")
    
    print(f"\nStaff remaining after normal assignments: {len(available_staff)}")
    
    # PHASE 3: Distribute remaining staff randomly without exceeding max
    if len(available_staff) > 0:
        print("\n" + "-"*80)
        print("PHASE 3: Distributing remaining staff randomly")
        print("-"*80)
        
        # Create a list of jobs that can accept more staff
        jobs_with_capacity = []
        for _, job in df_jobs.iterrows():
            job_id = job['job_id']
            current_count = job_staff_counts[job_id]
            max_allowed = job['max_staff_assigned']
            
            if current_count < max_allowed:
                capacity = max_allowed - current_count
                jobs_with_capacity.extend([job] * capacity)  # Add job once per available slot
        
        # Shuffle jobs for random distribution
        random.shuffle(jobs_with_capacity)
        
        print(f"Total capacity available: {len(jobs_with_capacity)} slots")
        
        for staff in available_staff[:]:  # Copy list to iterate
            if len(jobs_with_capacity) == 0:
                break
            
            # Assign to first available job
            job = jobs_with_capacity.pop(0)
            job_id = job['job_id']
            
            assignments.append({
                'staff_id': staff['staff_id'],
                'staff_name': staff['staff_name'],
                'job_id': job_id,
                'job_code': job['job_code'],
                'job_name': job['job_name'],
                'job_description': job['job_description']
            })
            
            job_staff_counts[job_id] += 1
            available_staff.remove(staff)
        
        print(f"Staff remaining after all assignments: {len(available_staff)}")
    
    # Summary
    print("\n" + "="*80)
    print("ASSIGNMENT SUMMARY")
    print("="*80)
    
    for _, job in df_jobs.iterrows():
        job_id = job['job_id']
        count = job_staff_counts[job_id]
        status = "✓" if count >= job['min_staff_assigned'] else "⚠️"
        
        print(f"{status} {job['job_name']} ({job['job_code']}): {count} staff "
              f"(min: {job['min_staff_assigned']}, normal: {job['normal_staff_assigned']}, max: {job['max_staff_assigned']})")
    
    if len(available_staff) > 0:
        print(f"\n⚠️  Warning: {len(available_staff)} staff could not be assigned (all jobs at capacity)")
    else:
        print(f"\n✓ All staff successfully assigned!")
    
    # Convert to DataFrame
    df_assignments = pd.DataFrame(assignments)
    
    # Sort by job name, then staff name
    df_assignments = df_assignments.sort_values(['job_name', 'staff_name']).reset_index(drop=True)
    
    return df_assignments


def build_ampm_job_assignments(conn, cur, session_id, directory=None, filename=None):
    """
    Master function to build AM/PM job assignments for a session.
    
    Loads configuration from JSON file. Can either auto-discover directory by session_id
    or use explicit directory and filename parameters.
    
    Parameters
    ----------
    conn : psycopg2.connection
        Active database connection
    cur : psycopg2.cursor
        Active database cursor
    session_id : int
        Session ID to process
    directory : str, optional
        Directory name under config/ampmjob_inputs/. If None, searches for directory
        containing session_id in its name (e.g., 'session_1012', 'test_1015')
    filename : str, optional
        JSON filename. If None, uses 'ampmjob_inputs.json'
    
    Returns
    -------
    pd.DataFrame
        Assignment dataframe with staff and job details
    """
    print("\n" + "="*80)
    print("AM/PM JOB ASSIGNMENT GENERATOR")
    print("="*80)
    print(f"Session ID: {session_id}")
    
    # Auto-discover directory if not provided
    if directory is None:
        base_dir = Path(__file__).resolve().parents[1]
        ampmjob_inputs_dir = base_dir / "config" / "ampmjob_inputs"

        # Search for directory with session_id in name
        matching_dirs = [d for d in ampmjob_inputs_dir.iterdir()
                         if d.is_dir() and str(session_id) in d.name]

        if not matching_dirs:
            raise FileNotFoundError(
                f"No directory found under {ampmjob_inputs_dir} with session_id '{session_id}' in its name. "
                f"Available directories: {[d.name for d in ampmjob_inputs_dir.iterdir() if d.is_dir()]}"
            )

        if len(matching_dirs) > 1:
            raise ValueError(
                f"Multiple directories found with session_id '{session_id}' in name: {[d.name for d in matching_dirs]}. "
                "Please ensure only one directory matches."
            )

        directory = matching_dirs[0].name
        print(f"\nFound input directory: {directory}")
    
    # Auto-discover filename if not provided
    if filename is None:
        base_dir = Path(__file__).resolve().parents[1]
        config_path = base_dir / "config" / "ampmjob_inputs" / directory
        
        # Try default filename first
        default_filename = "ampmjob_inputs.json"
        if (config_path / default_filename).exists():
            filename = default_filename
        else:
            # Look for any JSON file in the directory
            json_files = list(config_path.glob("*.json"))
            
            if not json_files:
                raise FileNotFoundError(
                    f"No JSON files found in {config_path}. "
                    f"Expected at least '{default_filename}' or another config file."
                )
            
            if len(json_files) == 1:
                filename = json_files[0].name
                print(f"  Using alternate config file: {filename}")
            else:
                raise ValueError(
                    f"Multiple JSON files found in {config_path}: {[f.name for f in json_files]}. "
                    f"Please specify which file to use with the 'filename' parameter."
                )
    
    # Load configuration from JSON
    print("\n" + "-"*80)
    print("Loading AM/PM job configuration...")
    print("-"*80)
    config = load_ampm_job_config(directory=directory, filename=filename)
    hardcoded_assignments = config.get('hardcoded_job_assignments', {})
    custom_assignments = config.get('custom_job_assignments', {})
    staff_to_remove = config.get('staff_to_remove', [])
    staff_to_add = config.get('staff_to_add', [])
    
    print(f"Loaded {len(hardcoded_assignments)} hardcoded job assignments")
    print(f"Loaded {len(custom_assignments)} custom job assignments")
    print(f"Loaded {len(staff_to_remove)} staff to remove")
    print(f"Loaded {len(staff_to_add)} staff to add")
    
    # Load jobs
    print("\n" + "-"*80)
    print("Loading AM/PM jobs...")
    print("-"*80)
    ampm_job_sql = get_ampm_jobs_sql()
    df_jobs = pd.read_sql(ampm_job_sql, conn)
    print(f"Found {len(df_jobs)} AM/PM jobs")
    
    # Load eligible staff
    print("\n" + "-"*80)
    print("Loading eligible staff...")
    print("-"*80)
    eligible_staff_sql = get_eligible_staff_sql(cur, session_id=session_id)
    df_staff = pd.read_sql(eligible_staff_sql, conn)
    print(f"Found {len(df_staff)} eligible staff")
    
    # Process staff_to_remove
    if staff_to_remove:
        print("\n" + "-"*80)
        print("Processing staff to remove...")
        print("-"*80)
        initial_count = len(df_staff)
        df_staff = df_staff[~df_staff['staff_id'].isin(staff_to_remove)]
        removed_count = initial_count - len(df_staff)
        print(f"Removed {removed_count} staff from eligible list")
        for staff_id in staff_to_remove:
            print(f"  - Removed staff ID: {staff_id}")
    
    # Process staff_to_add
    if staff_to_add:
        print("\n" + "-"*80)
        print("Processing staff to add...")
        print("-"*80)
        for staff_entry in staff_to_add:
            # Skip empty entries
            if not staff_entry or not staff_entry.get('staff_id'):
                continue
            
            staff_id = staff_entry['staff_id']
            name = staff_entry.get('name', f'Staff {staff_id}')
            gender = staff_entry.get('gender', 'M')
            custom_job = staff_entry.get('custom_job_assignment')
            
            # Create new staff entry
            new_staff = pd.DataFrame([{
                'staff_id': staff_id,
                'staff_name': name,
                'session_id': session_id,
                'role_id': 1005,  # Default to JC
                'group_id': None,
                'field_lining_pref': staff_entry.get('field_lining_pref', ''),
                'years_at_camp': staff_entry.get('years_at_camp', 0),
                'gender': gender,
                'physical_strength': staff_entry.get('physical_strength', 5),
                'extroverted_level': staff_entry.get('extroverted_level', 5)
            }])
            
            df_staff = pd.concat([df_staff, new_staff], ignore_index=True)
            
            print(f"  + Added staff: {name} (ID: {staff_id})")
            
            # If custom_job_assignment is provided, add to custom_assignments
            if custom_job:
                if custom_job not in custom_assignments:
                    custom_assignments[custom_job] = []
                custom_assignments[custom_job].append(staff_id)
                print(f"    → Assigned to custom job ID: {custom_job}")
        
        print(f"Total eligible staff after additions: {len(df_staff)}")
    
    # Assign staff to jobs with hardcoded and custom assignments
    df_assignments = assign_staff_to_ampm_jobs(
        df_staff, 
        df_jobs, 
        hardcoded_assignments=hardcoded_assignments,
        custom_assignments=custom_assignments
    )
    
    return df_assignments


def export_ampm_assignments(df_assignments, output_dir='exports'):
    """
    Export AM/PM job assignments to CSV and Google Sheets.
    
    Parameters
    ----------
    df_assignments : pd.DataFrame
        Assignment dataframe
    output_dir : str, optional
        Directory name to save CSV files (default: 'exports' in base directory)
    """
    print("\n" + "="*80)
    print("EXPORTING AM/PM JOB ASSIGNMENTS")
    print("="*80)
    
    # Get base directory
    base_dir = Path(__file__).resolve().parents[1]
    
    # Create exports directory
    output_dir = base_dir / output_dir
    output_dir.mkdir(exist_ok=True)
    
    # Prepare export dataframe with selected columns
    df_export = df_assignments[['staff_name', 'job_name', 'job_description']].copy()
    df_export.columns = ['Staff Name', 'Job', 'Instructions']
    
    # Export to CSV
    csv_path = output_dir / 'ampm_job_assignments.csv'
    df_export.to_csv(csv_path, index=False)
    print(f"\n✓ CSV exported to: {csv_path}")
    
    # Load credentials and upload to Google Sheets
    try:
        creds_file = base_dir / "config" / "credentials.json"
        
        with open(creds_file, 'r') as f:
            creds_data = json.load(f)
            spreadsheet_id = creds_data['google_sheets']['spreadsheet_id']
        
        print(f"\nUploading to Google Sheets...")
        
        # Upload to Google Sheets
        upload_to_google_sheets(
            csv_file=str(csv_path),
            spreadsheet_id=spreadsheet_id,
            sheet_name='AM/PM Jobs'
        )
        
        print(f"✓ Uploaded to Google Sheets tab: 'AM/PM Jobs'")
        
    except Exception as e:
        print(f"⚠️  Error uploading to Google Sheets: {e}")


def upload_to_google_sheets(csv_file, spreadsheet_id, sheet_name):
    """
    Upload CSV to Google Sheets.
    
    Parameters
    ----------
    csv_file : str
        Path to CSV file
    spreadsheet_id : str
        Google Sheets spreadsheet ID
    sheet_name : str
        Name of the sheet tab
    """
    # Load credentials
    base_dir = Path(__file__).resolve().parents[1]
    creds_file = base_dir / "config" / "credentials.json"
    
    with open(creds_file, 'r') as f:
        creds_data = json.load(f)
        service_account_info = creds_data['google_service_account']
    
    SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
    creds = Credentials.from_service_account_info(
        service_account_info, scopes=SCOPES)
    
    service = build('sheets', 'v4', credentials=creds)
    
    # Read CSV file
    df = pd.read_csv(csv_file)
    df = df.fillna('')
    
    # Convert DataFrame to list of lists for Google Sheets API
    values = [df.columns.tolist()] + df.values.tolist()
    
    # Try to clear existing data (create sheet if it doesn't exist)
    try:
        service.spreadsheets().values().clear(
            spreadsheetId=spreadsheet_id,
            range=f"{sheet_name}!A1:ZZ"
        ).execute()
    except HttpError:
        # Sheet might not exist, create it
        _create_sheet(service, spreadsheet_id, sheet_name)
    
    # Upload data
    body = {'values': values}
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_name}!A1",
        valueInputOption='RAW',
        body=body
    ).execute()
    
    # Apply basic formatting
    _format_ampm_sheet(service, spreadsheet_id, sheet_name, len(values), len(values[0]))


def _create_sheet(service, spreadsheet_id, sheet_name):
    """Create a new sheet tab if it doesn't exist."""
    request_body = {
        'requests': [{
            'addSheet': {
                'properties': {
                    'title': sheet_name
                }
            }
        }]
    }
    
    try:
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body=request_body
        ).execute()
    except HttpError:
        pass  # Sheet already exists


def _get_sheet_id(service, spreadsheet_id, sheet_name):
    """Get the sheet ID for a given sheet name."""
    sheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = sheet_metadata.get('sheets', [])
    
    for sheet in sheets:
        if sheet['properties']['title'] == sheet_name:
            return sheet['properties']['sheetId']
    
    return None


def _format_ampm_sheet(service, spreadsheet_id, sheet_name, num_rows, num_cols):
    """Apply basic formatting to the AM/PM sheet."""
    sheet_id = _get_sheet_id(service, spreadsheet_id, sheet_name)
    
    if sheet_id is None:
        return
    
    requests = [
        # Format header row
        {
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 0,
                    'endRowIndex': 1,
                    'startColumnIndex': 0,
                    'endColumnIndex': num_cols
                },
                'cell': {
                    'userEnteredFormat': {
                        'backgroundColor': {'red': 0.2, 'green': 0.5, 'blue': 0.8},
                        'textFormat': {
                            'bold': True,
                            'fontSize': 14,
                            'foregroundColor': {'red': 1, 'green': 1, 'blue': 1}
                        },
                        'horizontalAlignment': 'CENTER',
                        'verticalAlignment': 'MIDDLE'
                    }
                },
                'fields': 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
        },
        # Format data rows
        {
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 1,
                    'endRowIndex': num_rows,
                    'startColumnIndex': 0,
                    'endColumnIndex': num_cols
                },
                'cell': {
                    'userEnteredFormat': {
                        'textFormat': {
                            'fontSize': 12
                        },
                        'verticalAlignment': 'TOP'
                    }
                },
                'fields': 'userEnteredFormat(textFormat,verticalAlignment)'
            }
        },
        # Add borders
        {
            'updateBorders': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 0,
                    'endRowIndex': num_rows,
                    'startColumnIndex': 0,
                    'endColumnIndex': num_cols
                },
                'top': {'style': 'SOLID', 'width': 1, 'color': {'red': 0, 'green': 0, 'blue': 0}},
                'bottom': {'style': 'SOLID', 'width': 1, 'color': {'red': 0, 'green': 0, 'blue': 0}},
                'left': {'style': 'SOLID', 'width': 1, 'color': {'red': 0, 'green': 0, 'blue': 0}},
                'right': {'style': 'SOLID', 'width': 1, 'color': {'red': 0, 'green': 0, 'blue': 0}}
            }
        },
        # Set column widths
        {
            'updateDimensionProperties': {
                'range': {
                    'sheetId': sheet_id,
                    'dimension': 'COLUMNS',
                    'startIndex': 0,
                    'endIndex': 1
                },
                'properties': {
                    'pixelSize': 200
                },
                'fields': 'pixelSize'
            }
        },
        {
            'updateDimensionProperties': {
                'range': {
                    'sheetId': sheet_id,
                    'dimension': 'COLUMNS',
                    'startIndex': 1,
                    'endIndex': 2
                },
                'properties': {
                    'pixelSize': 250
                },
                'fields': 'pixelSize'
            }
        },
        {
            'updateDimensionProperties': {
                'range': {
                    'sheetId': sheet_id,
                    'dimension': 'COLUMNS',
                    'startIndex': 2,
                    'endIndex': 3
                },
                'properties': {
                    'pixelSize': 800
                },
                'fields': 'pixelSize'
            }
        },
        # Wrap text in instructions column (column C, index 2)
        {
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 1,
                    'endRowIndex': num_rows,
                    'startColumnIndex': 2,
                    'endColumnIndex': 3
                },
                'cell': {
                    'userEnteredFormat': {
                        'wrapStrategy': 'WRAP'
                    }
                },
                'fields': 'userEnteredFormat.wrapStrategy'
            }
        },
        # Freeze header row
        {
            'updateSheetProperties': {
                'properties': {
                    'sheetId': sheet_id,
                    'gridProperties': {
                        'frozenRowCount': 1
                    }
                },
                'fields': 'gridProperties.frozenRowCount'
            }
        }
    ]
    
    body = {'requests': requests}
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body=body
    ).execute()


