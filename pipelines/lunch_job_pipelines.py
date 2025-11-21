import sys
import os
import numpy as np
import random

# Go up one level from the current notebook directory
project_root = os.path.abspath(os.path.join(os.getcwd(), '..'))

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




#retrieve db creds
creds = dbc.load_db_read_creds()

#connect to db
conn,cur = dbc.connect_to_postgres(creds['db_name'],creds['user'],creds['password'],creds['host'],creds['port'])


debug_output = ljh.build_lunch_job_assignments(
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
    debug = True   # change to True to return ALL dataframes in a dictionary
   
)



df_final = debug_output["df_final_assignments_enriched"]

# View results
pd.set_option('display.max_rows', None)
display(df_final)


#config #uncomment to display config dictionary


#config



