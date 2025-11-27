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
output = ljh.build_multi_week_schedule(conn, cur, directory)

# Handle debug vs normal output
if isinstance(output, dict):
    # Debug mode - output contains all intermediate DataFrames
    print("\nDEBUG mode detected - saving all debug outputs")
    df_full_session = output['df_full_session']
    debug_outputs = output  # Keep full dictionary for inspection
else:
    # Normal mode - output is just the schedule DataFrame
    df_full_session = output

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

# If debug mode, save additional outputs
if isinstance(output, dict):
    print("\nDebug outputs available in 'debug_outputs' variable")
    print(f"Available keys: {list(output.keys())}")





