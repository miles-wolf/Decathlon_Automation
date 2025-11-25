import sys
import os
import numpy as np
import random

# Go up one level from the current file path to find the project root
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Add project root to sys.path if not already there
if project_root not in sys.path:
    sys.path.append(project_root)

# Confirm it's now in your search path
print("Project root added to sys.path:", project_root)


import psycopg2
import pandas as pd
##import connections and helper functions
from connections import db_connections as dbc
from helpers import lunch_job_helpers as ljh


fn = 'lunchjob_inputs.example.json' ## json MUST BE IN Decathlon_Automation/config


config = ljh.load_lunch_job_config(filename = fn)

session_id = config['session_id']  
pattern_based_jobs = config["pattern_based_jobs"]
staff_game_days = config["staff_game_days"]
tie_dye_days = config["tie_dye_days"]
tie_dye_staff = config["tie_dye_staff"]
staff_to_remove = config["staff_to_remove"]
staff_to_add = config["staff_to_add"]
custom_job_assignments = config["custom_job_assignments"]
debug = config.get("debug", False)  # Default to False if not specified
verbose = config.get("verbose", False)  # Default to False if not specified


#retrieve db creds
creds = dbc.load_db_read_creds()

#connect to db
conn,cur = dbc.connect_to_postgres(creds['db_name'],creds['user'],creds['password'],creds['host'],creds['port'])


output = ljh.build_lunch_job_assignments(
    conn=conn,
    cur=cur,
    session_id=session_id,
    pattern_based_jobs=pattern_based_jobs,
    staff_game_days=staff_game_days,
    tie_dye_days=tie_dye_days,
    tie_dye_staff=tie_dye_staff,
    staff_to_remove=staff_to_remove,
    staff_to_add=staff_to_add,
    custom_job_assignments=custom_job_assignments,
    debug=debug,   # change to True to return ALL dataframes in a dictionary
    verbose=verbose  # Enable detailed assignment summaries
)


# Handle both debug and normal output
if debug:
    df_schedule = output["df_schedule"]
else:
    df_schedule = output

# View results in schedule format
# python files don't know the jupyter notebooks command "display" so we use print
pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', None)
print("\n" + "="*80)
print("LUNCH JOB SCHEDULE")
print("="*80)
print(df_schedule)

# Export to CSV
df_schedule.to_csv('lunch_job_schedule.csv', index=False)
print("\nSchedule exported to lunch_job_schedule.csv")




