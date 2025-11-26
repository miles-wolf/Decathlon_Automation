import sys
import os

# Go up one level from the current file path to find the project root
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Add project root to sys.path if not already there
if project_root not in sys.path:
    sys.path.append(project_root)

# Confirm it's now in your search path
print("Project root added to sys.path:", project_root)

import pandas as pd
from connections import db_connections as dbc
from helpers import lunch_job_helpers as ljh

# =============================================================================
# CONFIGURATION
# =============================================================================
directory = 'test'  # Directory under config/lunchjob_inputs/ containing week JSON files

# =============================================================================
# MAIN EXECUTION
# =============================================================================

# Retrieve database credentials
creds = dbc.load_db_read_creds()

# Connect to database
conn, cur = dbc.connect_to_postgres(creds['db_name'], creds['user'], creds['password'], creds['host'], creds['port'])

# Generate multi-week schedule (automatically processes all JSON files in directory)
df_full_session = ljh.build_multi_week_schedule(conn, cur, directory)

# Display results
pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', None)
print("\n" + "="*80)
print("FULL SESSION LUNCH JOB SCHEDULE")
print("="*80)
print(df_full_session)

# Export to CSV
df_full_session.to_csv('lunch_job_schedule.csv', index=False)
print("\nFull session schedule exported to lunch_job_schedule.csv")




