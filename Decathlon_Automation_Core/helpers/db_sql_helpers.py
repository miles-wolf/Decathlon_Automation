import psycopg2
import pandas as pd
import random
import numpy as np
import inspect

def get_roles_sql():
    #author kavin

    """
    Return a SQL query to retrieve all rows of roles from camp.role
    """
    
    sql = """
    SELECT r.id as role_id, 
           r.name,
           r.created_at
    FROM camp.role as r
    WHERE 1 = 1
    ;
    """
    return sql

def get_group_sql():
    #author kavin
    """
    Return a SQL query to retrieve all rows of groups from camp.group
    """
    sql = """
    SELECT g.id as group_id,
           g.group_number,
           g.created_at
    FROM camp.group as g
    WHERE 1 = 1
        --
    ;
    """
    return sql




def dfs_to_sql_ctes(cur, *dfs, **named_dfs):
    #author kavin
    """
    Convert multiple pandas DataFrames into multiple PostgreSQL CTEs using psycopg2 mogrify,
    automatically inferring DataFrame variable names from the caller's local scope.

    Usage:
        # auto infer names from variables df1, df2
        dfs_to_ctes_mogrify_auto(cur, df1, df2)

        # OR explicitly name some
        dfs_to_ctes_mogrify_auto(cur, staff=df_staff, jobs=df_jobs)

        # OR mix both
        dfs_to_ctes_mogrify_auto(cur, df_staff, jobs=df_jobs)

    Parameters
    ----------
    cur : psycopg2 cursor
        Cursor used to mogrify values.
    *dfs : list of pandas.DataFrame
        DataFrames whose CTE names will be auto-inferred.
    **named_dfs : dict
        Explicit CTE_name=DataFrame mappings.

    Returns
    -------
    str
        A SQL string starting with WITH ... containing all CTE blocks.
    """

    caller_locals = inspect.currentframe().f_back.f_locals
    cte_map = {}

    # 1. Add explicitly named DFs
    for cte_name, df in named_dfs.items():
        cte_map[cte_name] = df

    # 2. Infer names for positional DFs
    for df in dfs:
        inferred = None
        for var_name, var_val in caller_locals.items():
            if var_val is df:
                inferred = var_name
                break
        if inferred is None:
            raise ValueError("Unable to infer DataFrame name, pass explicitly.")
        cte_map[inferred] = df

    # 3. Build each CTE block
    cte_blocks = []

    for cte_name, df in cte_map.items():

        columns = ", ".join(df.columns)

        # Generate one placeholder per column
        placeholders = "(" + ", ".join(["%s"] * df.shape[1]) + ")"

        rows = [tuple(x) for x in df.to_numpy()]

        # mogrify each row correctly (no extra parentheses)
        values_sql_list = [
            cur.mogrify(placeholders, row).decode()
            for row in rows
        ]

        values_sql = ",\n        ".join(values_sql_list)

        cte_block = f"""
{cte_name} ({columns}) AS (
    VALUES
        {values_sql}
)"""

        cte_blocks.append(cte_block.strip())
        full_sql = "WITH\n" + ",\n\n".join(cte_blocks)
    return full_sql

