import sys
import os

# Go up one level from the current file path to find the project root
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Add project root to sys.path if not already there
if project_root not in sys.path:
    sys.path.append(project_root)

import pandas as pd
from connections import db_connections as dbc
from helpers import lunch_job_helpers as ljh

# =============================================================================
# MAIN PIPELINE FUNCTION
# =============================================================================

def run_lunchjob_pipeline(session_id: int):
    """
    Run the lunch job pipeline with dynamic inputs.
    
    The input directory is automatically discovered based on session_id.
    Expects directory: config/lunchjob_inputs_session_{session_id}/
    
    Args:
        session_id: Session ID to process
    
    Returns:
        dict with 'df_full_session', 'df_wide_format', and debug outputs
    """
    print("Project root added to sys.path:", project_root)
    
    # Connect to database
    creds = dbc.load_db_read_creds()
    conn, cur = dbc.connect_to_postgres(
        creds['db_name'], creds['user'], creds['password'], 
        creds['host'], creds['port']
    )
    
    # Check if connection was successful
    if conn is None or cur is None:
        raise ConnectionError(
            "Failed to connect to the database. Please check:\n"
            "1. Database credentials are correct\n"
            "2. Database server is running and accessible\n"
            "3. Network connection is working"
        )
    
    # Generate multi-week schedule
    output = ljh.build_multi_week_schedule(
        conn, cur, 
        session_id=session_id
    )
    
    # Extract data
    df_full_session = output['df_full_session']
    df_wide_format = output['df_wide_format']
    
    # Display full schedule
    pd.set_option('display.max_rows', None)
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', None)
    print("\n" + "="*80)
    print("FULL SESSION LUNCH JOB SCHEDULE")
    print("="*80)
    print(df_full_session)
    
    # Export and upload
    ljh.export_and_upload_schedule(
        df_full_session=df_full_session,
        df_wide_format=df_wide_format,
        sheet_name='Lunchtime Job Schedule',
        session_id=session_id
    )
    
    # Show debug info if available
    if 'week_1' in output:
        ljh.print_debug_info(output)
    
    return output


# =============================================================================
# DIRECT EXECUTION (for running locally with hardcoded values)
# =============================================================================

if __name__ == "__main__":
    SESSION_ID = 1012  # Default session for direct execution
    run_lunchjob_pipeline(session_id=SESSION_ID)






