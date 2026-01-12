import sys
import os

# Go up one level from the current file path to find the project root
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Add project root to sys.path if not already there
if project_root not in sys.path:
    sys.path.append(project_root)

print("Project root added to sys.path:", project_root)

import pandas as pd
from connections import db_connections as dbc
from helpers import ampm_job_helpers as apjh

# =============================================================================
# MAIN PIPELINE FUNCTION
# =============================================================================

def run_ampmjob_pipeline(session_id: int):
    """
    Run the AM/PM job pipeline with dynamic inputs.

    Args:
        session_id: Session ID to process - will find matching directory automatically

    Returns:
        DataFrame with AM/PM job assignments
    """
    print("Project root added to sys.path:", project_root)

    # Connect to database
    creds = dbc.load_db_read_creds()
    conn, cur = dbc.connect_to_postgres(
        creds['db_name'], creds['user'], creds['password'],
        creds['host'], creds['port']
    )

    # Generate AM/PM job assignments (loads config from JSON automatically)
    df_assignments = apjh.build_ampm_job_assignments(conn, cur, session_id=session_id)

    # Display assignments
    pd.set_option('display.max_rows', None)
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', None)
    print("\n" + "="*80)
    print("AM/PM JOB ASSIGNMENTS")
    print("="*80)
    print(df_assignments)

    # Export to CSV and Google Sheets
    apjh.export_ampm_assignments(df_assignments, session_id=session_id)

    print("\n" + "="*80)
    print("AM/PM JOB ASSIGNMENT COMPLETE")
    print("="*80)

    return df_assignments


# =============================================================================
# DIRECT EXECUTION (for running locally with hardcoded values)
# =============================================================================

if __name__ == "__main__":
    SESSION_ID = 1015  # Default session for direct execution
    run_ampmjob_pipeline(session_id=SESSION_ID)
