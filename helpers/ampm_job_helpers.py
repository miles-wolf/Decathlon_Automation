import psycopg2
import pandas as pd
import random
import numpy as np

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
        AND j.job_type = 'am/pm';
    ;
    """
    return sql

