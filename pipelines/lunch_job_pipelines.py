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
from helpers import lunch_job_helpers as ljh

# =============================================================================
# CONFIGURATION
# =============================================================================
SESSION_ID = 1012  # Session ID to process - will find matching directory automatically

# =============================================================================
# MAIN EXECUTION
# =============================================================================

# Connect to database
creds = dbc.load_db_read_creds()
conn, cur = dbc.connect_to_postgres(creds['db_name'], creds['user'], creds['password'], creds['host'], creds['port'])

# Generate multi-week schedule (finds directory by session_id)
output = ljh.build_multi_week_schedule(conn, cur, session_id=SESSION_ID)

# Extract data (works for both debug and normal mode)
df_full_session = output['df_full_session']
df_wide_format = output['df_wide_format']
debug_outputs = output if 'week_1' in output else None

# Display full schedule
pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', None)
print("\n" + "="*80)
print("FULL SESSION LUNCH JOB SCHEDULE")
print("="*80)
print(df_full_session)

# Export and upload (loads spreadsheet_id from credentials)
ljh.export_and_upload_schedule(
    df_full_session=df_full_session,
    df_wide_format=df_wide_format,
    sheet_name='Lunchtime Job Schedule'
)

# Show debug info if available
if debug_outputs is not None:
    ljh.print_debug_info(debug_outputs)





