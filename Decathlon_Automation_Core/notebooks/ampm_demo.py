import os
import sys
import psycopg2
import pandas as pd

# Go up one level from the current notebook directory
project_root = os.path.abspath(os.path.join(os.getcwd(), '..'))

# Add project root to sys.path if not already there
if project_root not in sys.path:
    sys.path.append(project_root)

# Confirm it's now in your search path
print("Project root added to sys.path:", project_root)

# Now import from project modules
from connections import db_connections as dbc
from helpers import lunch_job_helpers as ljh
from helpers import ampm_job_helpers as apjh

creds = dbc.load_db_read_creds()

##connect to the db... this changed with the new struction
conn,cur = dbc.connect_to_postgres(creds['db_name'],creds['user'],creds['password'],creds['host'],creds['port'])

##
ampm_job_sql = apjh.get_ampm_jobs_sql()
df_ampm_job = pd.read_sql(ampm_job_sql,conn)