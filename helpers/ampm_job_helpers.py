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
        sts.group_id
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


def assign_staff_to_ampm_jobs(df_staff, df_jobs):
    """
    Randomly assign staff to AM/PM jobs, ensuring minimum requirements are met,
    targeting normal staff levels, and respecting maximum limits.
    
    Strategy:
    1. Sort jobs by priority (highest first)
    2. For each job, assign minimum required staff first
    3. Then try to reach normal staff level
    4. If extra staff remain, distribute randomly without exceeding max
    
    Parameters
    ----------
    df_staff : pd.DataFrame
        DataFrame with eligible staff (staff_id, staff_name, role_id, group_id)
    df_jobs : pd.DataFrame
        DataFrame with AM/PM jobs (job_id, job_code, job_name, min/normal/max_staff_assigned, job_description)
    
    Returns
    -------
    pd.DataFrame
        Assignments with columns: staff_id, staff_name, job_id, job_code, job_name, job_description
    """
    print("\n" + "="*80)
    print("ASSIGNING STAFF TO AM/PM JOBS")
    print("="*80)
    
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
    
    # PHASE 1: Assign minimum required staff to each job
    print("\n" + "-"*80)
    print("PHASE 1: Assigning minimum required staff")
    print("-"*80)
    
    for _, job in df_jobs.iterrows():
        min_needed = job['min_staff_assigned']
        job_id = job['job_id']
        
        print(f"\n{job['job_name']} ({job['job_code']}) - Min: {min_needed}")
        
        assigned_count = 0
        staff_to_remove = []
        
        for staff in available_staff:
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
        
        assigned_count = 0
        staff_to_remove = []
        
        for staff in available_staff:
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


def build_ampm_job_assignments(conn, cur, session_id):
    """
    Master function to build AM/PM job assignments for a session.
    
    Parameters
    ----------
    conn : psycopg2.connection
        Active database connection
    cur : psycopg2.cursor
        Active database cursor
    session_id : int
        Session ID to process
    
    Returns
    -------
    pd.DataFrame
        Assignment dataframe with staff and job details
    """
    print("\n" + "="*80)
    print("AM/PM JOB ASSIGNMENT GENERATOR")
    print("="*80)
    print(f"Session ID: {session_id}")
    
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
    
    # Assign staff to jobs
    df_assignments = assign_staff_to_ampm_jobs(df_staff, df_jobs)
    
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


