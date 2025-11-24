import psycopg2
import pandas as pd
import random
import numpy as np
from pathlib import Path
import json

def get_lunch_jobs_sql():
    ##code author kavin
    print('Retrieving lunch job sql query...')
    sql = """
    select id as job_id,
           code as job_code,
           name as job_name,
           min_staff_assigned,
           normal_staff_assigned,
           max_staff_assigned,
           job_description,
           priority

    from camp.job
    where 1 = 1
        and job_type = 'lunch'
    ;
    """
    print('lunch job sql retrieved ✅')
    return sql


def get_days_sql(cur, days):
    ##code author kavin

    print('Retrieving days sql query...')
    """
    Build a SQL query that defines a 'days' CTE from a list of day names.

    Parameters
    ----------
    cur : psycopg2.cursor
        An active cursor object from an open psycopg2 connection.
    days : list[str]
        List of day names, e.g. ['monday', 'tuesday', 'wednesday'].

    Returns
    -------
    str
        A fully rendered SQL string with the parameter values safely substituted
        via mogrify(), ready for logging or execution.
    """
    sql = """
    WITH days(day_name) AS (
        SELECT *
        FROM unnest(%(days)s::text[])
    )
    SELECT *
    FROM days;
    """
    # psycopg2 mogrify safely interpolates parameters into SQL text
    query = cur.mogrify(sql, {"days": days}).decode("utf-8")

    print('days sql retrieved ✅')
    return query

def get_eligible_staff_sql(cur, session_id):
    ##code author kavin
    """
    Build a SQL query that selects eligible staff for a given session_id,
    safely interpolated using psycopg2.mogrify().

    Parameters
    ----------
    cur : psycopg2.cursor
        An active psycopg2 cursor object.
    session_id : int
        The session ID to filter by.

    Returns
    -------
    str
        A fully rendered SQL string with safe parameter substitution.
    """
    print('Retrieving eligible staff sql query...')

    sql = """
    SELECT
        CONCAT(s.first_name, ' ', s.last_name) AS staff_name,
        sts.session_id,
        s.id AS staff_id,
        r.id AS role_id,
        sts.group_id
    FROM camp.staff_to_session AS sts
    INNER JOIN camp.staff AS s
        ON sts.staff_id = s.id
    INNER JOIN camp.role AS r
        ON sts.role_id = r.id
    WHERE 1 = 1
      AND sts.session_id = %(session_id)s
      AND r.id IN (1005, 1006)  -- JC's and Counselors
    ORDER BY sts.group_id ASC, sts.role_id ASC
    --GROUP BY 1,2,3
    ;
    """



    params = {"session_id":session_id}

    # mogrify substitutes the parameter safely and returns a full SQL string
    query = cur.mogrify(sql, params).decode("utf-8")

    print('eligible staff sql retrieved ✅')
    return query

def assign_group_patterns(df_eligible_staff):
    ##code author kavin
    """
    Assign alternating group patterns (A/B/A/B...) to each distinct group_id.
    The starting pattern (A or B) is randomized per run.

    Parameters
    ----------
    df_eligible_staff : pd.DataFrame
        Must contain a 'group_id' column.

    Returns
    -------
    pd.DataFrame
        DataFrame with columns ['group_id', 'base_pattern'].
    """
    # Get distinct sorted group IDs
    unique_groups = (
        df_eligible_staff[['group_id']]
        .drop_duplicates()
        .sort_values('group_id')
        .reset_index(drop=True)
        .copy()
    )

    # Randomly choose starting pattern
    start_pattern = random.choice(['A', 'B'])

    # Create a numeric sequence 0, 1, 2, ... then assign A/B alternating
    unique_groups['base_pattern'] = np.where(
        (unique_groups.index % 2 == 0),
        start_pattern,
        np.where(start_pattern == 'A', 'B', 'A')
    )
    return unique_groups


##section code author miles
def balance_schedule_for_job(df_staff_clean, staff_ids_for_job, job_name):
    ##code author miles
    """
    Ensures that staff assigned to a job (arts & crafts or card trading) have opposite A/B schedules.
    If not, switches one staff member and flips their entire group accordingly.
    
    Parameters:
    - df_staff_clean: the clean staff dataframe
    - staff_ids_for_job: list of staff_ids assigned to this job
    - job_name: name of the job for logging purposes
    
    Returns:
    - Updated df_staff_clean with balanced schedules
    """
    if len(staff_ids_for_job) < 2:
        return df_staff_clean
    
    # Get the first 2 staff members for this job
    staff_subset = df_staff_clean[df_staff_clean['staff_id'].isin(staff_ids_for_job[:2])]
    
    if len(staff_subset) < 2:
        return df_staff_clean
    
    assignments = staff_subset['actual_assignment'].values
    
    # Check if they're on opposite schedules
    if assignments[0] != assignments[1]:
        print(f"{job_name}: Staff already on opposite schedules")
        return df_staff_clean
    
    # They're on the same schedule, need to switch one
    staff_to_switch = staff_subset.iloc[1]  # Switch the second staff member
    switch_staff_id = staff_to_switch['staff_id']
    switch_group_id = staff_to_switch['group_id']
    old_assignment = staff_to_switch['actual_assignment']
    new_assignment = 'B' if old_assignment == 'A' else 'A'
    
    print(f"{job_name}: Switching staff {switch_staff_id} from {old_assignment} to {new_assignment}")
    
    # Flip all staff in the same group
    group_mask = df_staff_clean['group_id'] == switch_group_id
    df_staff_clean.loc[group_mask, 'actual_assignment'] = df_staff_clean.loc[group_mask, 'actual_assignment'].apply(
        lambda x: 'B' if x == 'A' else 'A'
    )
    
    return df_staff_clean



def process_hardcoded_assignments(pattern_based_jobs, staff_game_days, tie_dye_days, tie_dye_staff, 
                                  df_staff_clean, df_days, df_lunch_jobs, 
                                  staff_to_remove=None, staff_to_add=None, 
                                  custom_job_assignments=None):
    
    ##code author mostly miles but kavin put it into wrapper form

    """
    Process hardcoded assignments and handle special cases.
    
    Parameters:
    - pattern_based_jobs: dict with job_id as key, list of staff_ids as value
      Example: {1001: [staff1, staff2], 1002: [staff3, staff4]}  # Arts & Crafts and Card Trading
    - staff_game_days: list of day names where staff game occurs (all staff assigned automatically)
      Example: ['monday', 'thursday']
    - tie_dye_days: list of day names when tie dye occurs
      Example: ['tuesday', 'wednesday']
    - tie_dye_staff: list of staff_ids assigned to tie dye (they work their normal A/B pattern days)
      Example: [staff1, staff2, staff3]  # These staff work tie dye on days matching their A/B schedule
    - df_staff_clean: cleaned staff dataframe
    - df_days: days dataframe
    - df_lunch_jobs: lunch jobs dataframe
    - staff_to_remove: list of staff_ids to remove from eligible staff
      Example: [1001, 1002]
    - staff_to_add: list of dicts with staff info to add
      Example: [{'staff_id': 9001, 'staff_name': 'Placeholder Staff', 'group_id': 1, 'actual_assignment': 'A'}]
      If 'actual_assignment' is not provided, defaults to 'A'
    - custom_job_assignments: dict with assignment details for specific staff/job/day combinations
      Format: {'all_days': {job_id: [staff_ids]}, 'specific_days': [(staff_id, job_id, day_name), ...]}
      Example: {
          'all_days': {1005: [1001, 1002]},  # These staff work job 1005 on all their pattern days
          'specific_days': [(1003, 1010, 'monday'), (1004, 1010, 'tuesday')]  # Specific day assignments
      }
    
    Returns:
    - df_hardcoded: dataframe of hardcoded assignments
    - df_staff_clean: updated staff dataframe with balanced schedules
    """
    # Create a copy to avoid modifying original
    df_staff_clean = df_staff_clean.copy()

    print("\n" + "="*80)
    
    # Remove staff from eligible list
    if staff_to_remove:
        df_staff_clean = df_staff_clean[~df_staff_clean['staff_id'].isin(staff_to_remove)].copy()
        print(f"Removed {len(staff_to_remove)} staff from eligible list")

    
    # Add staff to eligible list
    if staff_to_add:
        for staff_dict in staff_to_add:
            # Set default pattern to 'A' if not specified
            if 'actual_assignment' not in staff_dict:
                staff_dict['actual_assignment'] = 'A'
            # Add any missing required columns with defaults
            if 'role_id' not in staff_dict:
                staff_dict['role_id'] = 1005  # Default to counselor
            if 'base_pattern' not in staff_dict:
                staff_dict['base_pattern'] = staff_dict['actual_assignment']
            if 'pattern_exception' not in staff_dict:
                staff_dict['pattern_exception'] = False
        
        df_new_staff = pd.DataFrame(staff_to_add)
        df_staff_clean = pd.concat([df_staff_clean, df_new_staff], ignore_index=True)
        print(f"Added {len(staff_to_add)} staff to eligible list")
    
    hardcoded_assignments = []
    
    # Validate that tie dye days and staff game days don't overlap
    if staff_game_days and tie_dye_days:
        overlapping_days = set(d.lower() for d in staff_game_days) & set(d.lower() for d in tie_dye_days)
        if overlapping_days:
            print(f"\n⚠️  WARNING: Tie Dye and Staff Game are scheduled on the same day(s): {', '.join(overlapping_days)}")
            print("Staff Game will take priority and Tie Dye will be skipped on these days.\n")
    
    # Process staff game days first - assign all staff to staff game
    if staff_game_days:
        for day in staff_game_days:
            for _, staff in df_staff_clean.iterrows():
                hardcoded_assignments.append({
                    'day_name': day,
                    'staff_id': staff['staff_id'],
                    'job_id': 1100,
                    'job_code': 'SG',
                    'job_name': 'Staff Game'
                })
    
    # Process pattern-based jobs (Arts & Crafts, Card Trading)
    # These staff work based on their A/B pattern assignment
    if pattern_based_jobs:
        # First, balance schedules for pattern-based jobs
        for job_id, staff_ids in pattern_based_jobs.items():
            if len(staff_ids) >= 2:
                job_info = df_lunch_jobs[df_lunch_jobs['job_id'] == job_id].iloc[0]
                df_staff_clean = balance_schedule_for_job(df_staff_clean, staff_ids, job_info['job_name'])
        
        # Now assign to days based on A/B pattern
        for job_id, staff_ids in pattern_based_jobs.items():
            job_info = df_lunch_jobs[df_lunch_jobs['job_id'] == job_id].iloc[0]
            
            for staff_id in staff_ids:
                staff_matches = df_staff_clean[df_staff_clean['staff_id'] == staff_id]
                if len(staff_matches) == 0:
                    print(f"Warning: Staff {staff_id} not found in eligible staff list (may have been removed)")
                    continue
                staff_row = staff_matches.iloc[0]
                staff_pattern = staff_row['actual_assignment']  # 'A' or 'B'
                
                # Assign to days matching their pattern
                for day in df_days['day_name'].unique():
                    if staff_game_days and day in staff_game_days:
                        continue  # Skip staff game days
                    
                    # Get the day's pattern (assuming df_days has a 'pattern' column or derive from day order)
                    # Pattern A works: Mon, Wed; Pattern B works: Tue, Thu
                    day_pattern = 'A' if day.lower() in ['monday', 'wednesday'] else 'B'
                    
                    if staff_pattern == day_pattern:
                        hardcoded_assignments.append({
                            'day_name': day,
                            'staff_id': staff_id,
                            'job_id': job_id,
                            'job_code': job_info['job_code'],
                            'job_name': job_info['job_name']
                        })
    
    ## section code author miles (tie dye assignment balancing and group flipping)
    # Process tie dye assignments (staff work on their A/B pattern days only)
    if tie_dye_days and tie_dye_staff:
        tie_dye_job_id = 1045  # Tie Dye job ID
        tie_dye_job_info = df_lunch_jobs[df_lunch_jobs['job_id'] == tie_dye_job_id].iloc[0]
        
        # Step 1: Determine which days tie dye is happening and assign patterns to those days
        tie_dye_day_patterns = {}
        non_staff_game_tie_dye_days = [day for day in tie_dye_days if not (staff_game_days and day in staff_game_days)]
        
        for day in non_staff_game_tie_dye_days:
            # Determine the pattern for this day (Mon/Wed: A, Tues/Thurs: B)
            day_pattern = 'A' if day.lower() in ['monday', 'wednesday'] else 'B'
            tie_dye_day_patterns[day] = day_pattern
        
        print(f"\nTie Dye Day Patterns: {tie_dye_day_patterns}")
        
        # Step 2: Assign staff to their corresponding day based on their pattern assignment
        tie_dye_assignments_by_day = {day: [] for day in non_staff_game_tie_dye_days}
        
        for staff_id in tie_dye_staff:
            staff_matches = df_staff_clean[df_staff_clean['staff_id'] == staff_id]
            if len(staff_matches) == 0:
                print(f"Warning: Staff {staff_id} not found in eligible staff list (may have been removed)")
                continue
            staff_row = staff_matches.iloc[0]
            staff_pattern = staff_row['actual_assignment']
            
            # Assign staff to days where their pattern matches
            for day, day_pattern in tie_dye_day_patterns.items():
                if staff_pattern == day_pattern:
                    tie_dye_assignments_by_day[day].append(staff_id)
        
        # Step 3: Balance the staff between the two tie dye days
        if len(non_staff_game_tie_dye_days) == 2:
            day1, day2 = non_staff_game_tie_dye_days[0], non_staff_game_tie_dye_days[1]
            count1, count2 = len(tie_dye_assignments_by_day[day1]), len(tie_dye_assignments_by_day[day2])
            
            print(f"Before balancing: {day1}={count1} staff, {day2}={count2} staff")
            
            # If not even, move staff from the larger group to the smaller
            if count1 != count2:
                larger_day = day1 if count1 > count2 else day2
                smaller_day = day2 if count1 > count2 else day1
                larger_pattern = tie_dye_day_patterns[larger_day]
                smaller_pattern = tie_dye_day_patterns[smaller_day]
                
                # Calculate how many to move
                num_to_move = abs(count1 - count2) // 2
                
                # Get staff from larger day
                staff_to_move = tie_dye_assignments_by_day[larger_day][:num_to_move]
                
                print(f"Moving {num_to_move} staff from {larger_day} to {smaller_day}")
                
                # Step 4: Move staff and flip entire group's patterns
                for staff_id in staff_to_move:
                    staff_row = df_staff_clean[df_staff_clean['staff_id'] == staff_id].iloc[0]
                    group_id = staff_row['group_id']
                    original_pattern = staff_row['actual_assignment']
                    
                    print(f"  Moving staff {staff_id} (group {group_id}, pattern {original_pattern}) from {larger_day} to {smaller_day}")
                    print(f"    Flipping entire group {group_id}: A <-> B")
                    
                    # Flip all staff in the same group (A becomes B, B becomes A)
                    group_mask = df_staff_clean['group_id'] == group_id
                    df_staff_clean.loc[group_mask, 'actual_assignment'] = df_staff_clean.loc[group_mask, 'actual_assignment'].apply(
                        lambda x: 'B' if x == 'A' else 'A'
                    )
                    df_staff_clean.loc[group_mask, 'pattern_exception'] = True
                    
                    # Update tie dye assignments - move the staff from larger day to smaller day
                    tie_dye_assignments_by_day[larger_day].remove(staff_id)
                    tie_dye_assignments_by_day[smaller_day].append(staff_id)
                
                count1, count2 = len(tie_dye_assignments_by_day[day1]), len(tie_dye_assignments_by_day[day2])
                print(f"After balancing: {day1}={count1} staff, {day2}={count2} staff")
        
        # Create the final assignments
        for day, staff_ids_on_day in tie_dye_assignments_by_day.items():
            for staff_id in staff_ids_on_day:
                hardcoded_assignments.append({
                    'day_name': day,
                    'staff_id': staff_id,
                    'job_id': tie_dye_job_id,
                    'job_code': tie_dye_job_info['job_code'],
                    'job_name': tie_dye_job_info['job_name']
                })
    
    # Process custom job assignments (fixed indentation - should be outside tie_dye block)
    if custom_job_assignments:
        # Handle 'all_days' assignments (staff work this job on all their pattern days)
        if 'all_days' in custom_job_assignments and custom_job_assignments['all_days']:
            for job_id, staff_ids in custom_job_assignments['all_days'].items():
                job_info = df_lunch_jobs[df_lunch_jobs['job_id'] == job_id].iloc[0]
                
                for staff_id in staff_ids:
                    staff_matches = df_staff_clean[df_staff_clean['staff_id'] == staff_id]
                    if len(staff_matches) == 0:
                        print(f"Warning: Staff {staff_id} not found in eligible staff list (may have been removed)")
                        continue
                    staff_row = staff_matches.iloc[0]
                    staff_pattern = staff_row['actual_assignment']
                    
                    # Assign to all days matching their pattern
                    for day in df_days['day_name'].unique():
                        if staff_game_days and day in staff_game_days:
                            continue  # Skip staff game days
                        
                        day_pattern = 'A' if day.lower() in ['monday', 'wednesday'] else 'B'
                        
                        if staff_pattern == day_pattern:
                            hardcoded_assignments.append({
                                'day_name': day,
                                'staff_id': staff_id,
                                'job_id': job_id,
                                'job_code': job_info['job_code'],
                                'job_name': job_info['job_name']
                            })
        
        # Handle 'specific_days' assignments (staff work specific job on specific day)
        if 'specific_days' in custom_job_assignments and custom_job_assignments['specific_days']:
            for staff_id, job_id, day_name in custom_job_assignments['specific_days']:
                job_info = df_lunch_jobs[df_lunch_jobs['job_id'] == job_id].iloc[0]
                
                hardcoded_assignments.append({
                    'day_name': day_name,
                    'staff_id': staff_id,
                    'job_id': job_id,
                    'job_code': job_info['job_code'],
                    'job_name': job_info['job_name']
                })
    
    # Create dataframe and check for duplicates
    df_hardcoded = pd.DataFrame(hardcoded_assignments)
    
    # Detect and warn about duplicate assignments (same staff, same day, multiple jobs)
    if len(df_hardcoded) > 0:
        duplicates = df_hardcoded.groupby(['day_name', 'staff_id']).size()
        duplicates = duplicates[duplicates > 1]
        
        if len(duplicates) > 0:
            print(f"\n⚠️  WARNING: Found {len(duplicates)} staff with multiple job assignments on the same day!")
            for (day, staff_id), count in duplicates.items():
                staff_jobs = df_hardcoded[(df_hardcoded['day_name'] == day) & (df_hardcoded['staff_id'] == staff_id)]
                job_names = staff_jobs['job_name'].tolist()
                print(f"   Staff {staff_id} on {day}: {count} jobs - {job_names}")
            
            # Remove duplicates - keep only the first assignment per staff per day
            print(f"\n   Removing duplicate assignments (keeping first assignment per staff per day)...")
            df_hardcoded = df_hardcoded.drop_duplicates(subset=['day_name', 'staff_id'], keep='first')
            print(f"   Reduced to {len(df_hardcoded)} unique assignments\n")
    
    return df_hardcoded, df_staff_clean

##section code author miles
def ensure_counselor_on_counselor_activity(df_all_assignments, df_staff_clean, df_lunch_jobs):
    """
    Ensures that Counselor Activity (job_id: 1077) has at least one counselor (role_id: 1005) 
    assigned on each day. If not, swaps a JC with a counselor from another job.
    
    Parameters:
    - df_all_assignments: dataframe of all assignments
    - df_staff_clean: cleaned staff dataframe with role information
    - df_lunch_jobs: lunch jobs dataframe
    
    Returns:
    - df_all_assignments: updated assignments with counselor requirement met
    """
    COUNSELOR_ACTIVITY_JOB_ID = 1077
    COUNSELOR_ROLE_ID = 1005
    JUNIOR_COUNSELOR_ROLE_ID = 1006
    
    # Check if counselor activity exists in assignments
    counselor_activity_assignments = df_all_assignments[
        df_all_assignments['job_id'] == COUNSELOR_ACTIVITY_JOB_ID
    ]
    
    if len(counselor_activity_assignments) == 0:
        return df_all_assignments  # No counselor activity assignments to check
    
    # Get unique days where counselor activity occurs
    ca_days = counselor_activity_assignments['day_name'].unique()
    
    for day in ca_days:
        # Get counselor activity assignments for this day
        day_ca_assignments = df_all_assignments[
            (df_all_assignments['day_name'] == day) & 
            (df_all_assignments['job_id'] == COUNSELOR_ACTIVITY_JOB_ID)
        ]
        
        # Get staff IDs assigned to counselor activity this day
        ca_staff_ids = day_ca_assignments['staff_id'].tolist()
        
        # Check roles of assigned staff
        ca_staff_roles = df_staff_clean[df_staff_clean['staff_id'].isin(ca_staff_ids)]
        counselor_count = len(ca_staff_roles[ca_staff_roles['role_id'] == COUNSELOR_ROLE_ID])
        
        if counselor_count == 0:
            print(f"\n⚠️  Warning: Counselor Activity on {day} has no counselors!")
            
            # Find a JC on counselor activity to swap
            jcs_on_ca = ca_staff_roles[ca_staff_roles['role_id'] == JUNIOR_COUNSELOR_ROLE_ID]
            
            if len(jcs_on_ca) == 0:
                print(f"   ERROR: No staff to swap on Counselor Activity for {day}")
                continue
            
            jc_to_swap = jcs_on_ca.iloc[0]
            jc_id = jc_to_swap['staff_id']
            jc_pattern = jc_to_swap['actual_assignment']
            
            # Find a counselor on a different job this day with the same pattern
            day_assignments = df_all_assignments[df_all_assignments['day_name'] == day]
            other_job_staff = day_assignments[day_assignments['job_id'] != COUNSELOR_ACTIVITY_JOB_ID]['staff_id'].tolist()
            
            counselors_on_other_jobs = df_staff_clean[
                (df_staff_clean['staff_id'].isin(other_job_staff)) &
                (df_staff_clean['role_id'] == COUNSELOR_ROLE_ID) &
                (df_staff_clean['actual_assignment'] == jc_pattern)
            ]
            
            if len(counselors_on_other_jobs) == 0:
                print(f"   ERROR: No counselors available to swap on {day}")
                continue
            
            counselor_to_swap = counselors_on_other_jobs.iloc[0]
            counselor_id = counselor_to_swap['staff_id']
            
            # Get the counselor's current job
            counselor_current_job = day_assignments[day_assignments['staff_id'] == counselor_id].iloc[0]
            counselor_job_id = counselor_current_job['job_id']
            counselor_job_name = counselor_current_job['job_name']
            
            print(f"   Swapping: JC {jc_id} (Counselor Activity) ↔ Counselor {counselor_id} ({counselor_job_name})")
            
            # Perform the swap
            # Update JC's job to counselor's job
            df_all_assignments.loc[
                (df_all_assignments['day_name'] == day) & 
                (df_all_assignments['staff_id'] == jc_id),
                ['job_id', 'job_code', 'job_name']
            ] = [counselor_job_id, counselor_current_job['job_code'], counselor_job_name]
            
            # Update counselor's job to counselor activity
            ca_job_info = df_lunch_jobs[df_lunch_jobs['job_id'] == COUNSELOR_ACTIVITY_JOB_ID].iloc[0]
            df_all_assignments.loc[
                (df_all_assignments['day_name'] == day) & 
                (df_all_assignments['staff_id'] == counselor_id),
                ['job_id', 'job_code', 'job_name']
            ] = [COUNSELOR_ACTIVITY_JOB_ID, ca_job_info['job_code'], ca_job_info['job_name']]
            
            print(f"   ✓ Fixed: Counselor Activity now has counselor {counselor_id}")
    
    return df_all_assignments


##section code author miles
def print_assignment_summary(df_hardcoded_assignments, df_all_assignments, df_days, df_lunch_jobs):
    """
    Print detailed summary of hardcoded assignments and job staffing checklist.
    
    Parameters:
    - df_hardcoded_assignments: dataframe of hardcoded assignments
    - df_all_assignments: dataframe of all assignments (hardcoded + random)
    - df_days: days dataframe
    - df_lunch_jobs: lunch jobs dataframe
    """
    # Print hardcoded assignments summary
    print(f"\n{'='*80}")
    print(f"HARDCODED ASSIGNMENTS: {len(df_hardcoded_assignments)} records")
    print(f"{'='*80}")
    
    if len(df_hardcoded_assignments) > 0:
        # Group by job and day to show summary
        hardcoded_summary = df_hardcoded_assignments.groupby(['job_name', 'day_name'])['staff_id'].count().reset_index()
        hardcoded_summary.columns = ['Job', 'Day', 'Staff Count']
        print("\nHardcoded Assignments by Job and Day:")
        for _, row in hardcoded_summary.iterrows():
            print(f"  {row['Job']:30s} | {row['Day']:10s} | {row['Staff Count']} staff")
        
        # Show staff details
        print("\nDetailed Staff Assignments:")
        
        # Sort days in order
        day_order = ['monday', 'tuesday', 'wednesday', 'thursday']
        days_present = [d for d in day_order if d in df_hardcoded_assignments['day_name'].str.lower().unique()]
        
        for day in days_present:
            day_assignments = df_hardcoded_assignments[df_hardcoded_assignments['day_name'].str.lower() == day]
            print(f"\n  {day.upper()}:")
            for job_name in day_assignments['job_name'].unique():
                job_staff = day_assignments[day_assignments['job_name'] == job_name]['staff_id'].tolist()
                
                # For Staff Game, just show count, not all IDs
                if job_name == 'Staff Game':
                    print(f"    {job_name:30s}: {len(job_staff)} staff (all staff assigned)")
                else:
                    print(f"    {job_name:30s}: {len(job_staff)} staff - IDs: {job_staff}")
    else:
        print("  No hardcoded assignments")
    
    print(f"\n{'='*80}\n")
    
    # Print job staffing checklist
    print(f"\n{'='*80}")
    print("JOB STAFFING CHECKLIST")
    print(f"{'='*80}")
    
    for day in df_days['day_name'].unique():
        day_assignments = df_all_assignments[df_all_assignments['day_name'] == day]
        
        # Skip staff game days (everyone is assigned to staff game)
        if len(day_assignments[day_assignments['job_id'] == 1100]) > 0:
            print(f"\n{day.upper()}: Staff Game (all staff assigned)")
            continue
        
        print(f"\n{day.upper()}:")
        
        # Get all jobs that appear on this day
        day_jobs = day_assignments.groupby(['job_id', 'job_name', 'assignment_type']).size().reset_index(name='count')
        
        # Get normal assignments per job
        normal_assignments = day_assignments[day_assignments['assignment_type'] == 'normal'].groupby('job_id').size().to_dict()
        overflow_assignments = day_assignments[day_assignments['assignment_type'] == 'overflow'].groupby('job_id').size().to_dict()
        hardcoded_assignments_day = day_assignments[day_assignments['assignment_type'] == 'hardcoded'].groupby('job_id').size().to_dict()
        
        # Merge with jobs info
        day_jobs_info = df_lunch_jobs.copy()
        
        for _, job in day_jobs_info.iterrows():
            job_id = job['job_id']
            job_name = job['job_name']
            normal_needed = int(job['normal_staff_assigned']) if pd.notna(job['normal_staff_assigned']) else 0
            
            # Skip excluded jobs that aren't in assignments
            if job_id not in day_assignments['job_id'].values:
                continue
            
            normal_count = normal_assignments.get(job_id, 0)
            overflow_count = overflow_assignments.get(job_id, 0)
            hardcoded_count = hardcoded_assignments_day.get(job_id, 0)
            total_count = normal_count + overflow_count + hardcoded_count
            
            # Determine status
            if hardcoded_count > 0:
                status = "✓ HARDCODED"
            elif normal_count >= normal_needed:
                status = "✓ COMPLETE"
            else:
                status = f"✗ SHORT ({normal_count}/{normal_needed})"
            
            print(f"  {job_name:30s} | {status:20s} | Normal: {normal_count}/{normal_needed}", end="")
            
            if overflow_count > 0:
                print(f" | Overflow: +{overflow_count}")
            else:
                print()
    
    print(f"\n{'='*80}\n")


def assign_random_lunch_jobs(df_staff_clean, df_days, df_lunch_jobs, df_hardcoded):
    """
    Assign remaining staff to remaining jobs using normal_staff_assigned and priority-based overflow.
    
    Parameters:
    - df_staff_clean: cleaned staff dataframe with balanced schedules
    - df_days: days dataframe
    - df_lunch_jobs: lunch jobs dataframe (must have normal_staff_assigned, max_staff_assigned, priority columns)
    - df_hardcoded: hardcoded assignments dataframe
    
    Returns:
    - df_all_assignments: complete dataframe with all lunch job assignments
    """
    all_assignments = []
    
    # Get staff game days from hardcoded assignments
    staff_game_days = df_hardcoded[df_hardcoded['job_id'] == 1100]['day_name'].unique().tolist() if len(df_hardcoded) > 0 else []
    
    for day in df_days['day_name'].unique():
        print(f"\nProcessing {day}...")
        
        # If staff game day, all assignments already in hardcoded
        if day in staff_game_days:
            print(f"  {day} has staff game - all assignments already made")
            continue
        
        # Get hardcoded assignments for this day
        day_hardcoded = df_hardcoded[df_hardcoded['day_name'] == day] if len(df_hardcoded) > 0 else pd.DataFrame()
        
        # Get jobs and staff that are already assigned (hardcoded)
        assigned_job_ids = day_hardcoded['job_id'].tolist() if len(day_hardcoded) > 0 else []
        assigned_staff_ids = day_hardcoded['staff_id'].tolist() if len(day_hardcoded) > 0 else []
        
        # Exclude special jobs unless they're hardcoded
        # Job IDs to exclude: Staff Game (1100), Tie Dye (1045), Obstacle Course (1013), Tallying Scores (1041)
        excluded_job_ids = [1100, 1045, 1013, 1041]
        jobs_to_exclude = [jid for jid in excluded_job_ids if jid not in assigned_job_ids]
        
        # Get remaining jobs (exclude hardcoded jobs and special jobs)
        remaining_jobs = df_lunch_jobs[
            ~df_lunch_jobs['job_id'].isin(assigned_job_ids + jobs_to_exclude)
        ].copy()
        
        # Get remaining staff (exclude hardcoded staff)
        remaining_staff = df_staff_clean[~df_staff_clean['staff_id'].isin(assigned_staff_ids)].copy()
        
        # Determine which pattern works this day
        day_pattern = 'A' if day.lower() in ['monday', 'wednesday'] else 'B'
        
        # Filter staff for this day's pattern
        day_staff = remaining_staff[remaining_staff['actual_assignment'] == day_pattern].copy()
        
        # Shuffle staff randomly
        day_staff = day_staff.sample(frac=1).reset_index(drop=True)
        
        print(f"  {len(day_staff)} staff available (Pattern {day_pattern})")
        print(f"  {len(remaining_jobs)} jobs available")
        
        # Track assignments per job
        job_assignments = {job_id: 0 for job_id in remaining_jobs['job_id']}
        
        staff_idx = 0
        
        # Phase 1: Assign normal_staff_assigned for each job
        for _, job in remaining_jobs.iterrows():
            normal_staff = int(job['normal_staff_assigned']) if pd.notna(job['normal_staff_assigned']) else 1
            
            for _ in range(normal_staff):
                if staff_idx < len(day_staff):
                    staff = day_staff.iloc[staff_idx]
                    all_assignments.append({
                        'day_name': day,
                        'staff_id': staff['staff_id'],
                        'job_id': job['job_id'],
                        'job_code': job['job_code'],
                        'job_name': job['job_name'],
                        'assignment_type': 'normal'
                    })
                    job_assignments[job['job_id']] += 1
                    staff_idx += 1
        
        print(f"  After normal assignments: {staff_idx} staff assigned, {len(day_staff) - staff_idx} remaining")
        
        # Phase 2: If there are more staff, use priority-based overflow
        if staff_idx < len(day_staff):
            # Filter jobs that have priority values and can accept more staff
            overflow_jobs = remaining_jobs[
                pd.notna(remaining_jobs['priority']) & 
                pd.notna(remaining_jobs['max_staff_assigned'])
            ].copy()
            
            if len(overflow_jobs) > 0:
                # Sort by priority
                overflow_jobs = overflow_jobs.sort_values('priority').reset_index(drop=True)
                
                # Cycle through priorities until all staff are assigned
                while staff_idx < len(day_staff):
                    assigned_this_round = False
                    
                    for _, job in overflow_jobs.iterrows():
                        if staff_idx >= len(day_staff):
                            break
                        
                        current_count = job_assignments[job['job_id']]
                        max_staff = int(job['max_staff_assigned'])
                        
                        # Check if this job can accept more staff
                        if current_count < max_staff:
                            staff = day_staff.iloc[staff_idx]
                            all_assignments.append({
                                'day_name': day,
                                'staff_id': staff['staff_id'],
                                'job_id': job['job_id'],
                                'job_code': job['job_code'],
                                'job_name': job['job_name'],
                                'assignment_type': 'overflow'
                            })
                            job_assignments[job['job_id']] += 1
                            staff_idx += 1
                            assigned_this_round = True
                    
                    # If we couldn't assign anyone this round, all jobs are at max
                    if not assigned_this_round:
                        print(f"  Warning: {len(day_staff) - staff_idx} staff could not be assigned (all jobs at max)")
                        break
                
                print(f"  After overflow assignments: {staff_idx} total staff assigned")
            else:
                print(f"  Warning: No overflow jobs available. {len(day_staff) - staff_idx} staff unassigned")
        
        # Print summary
        print(f"  Final: {staff_idx}/{len(day_staff)} staff assigned to jobs")
    
    # Combine with hardcoded assignments
    df_all_assignments = pd.DataFrame(all_assignments)
    
    if len(df_hardcoded) > 0:
        df_hardcoded['assignment_type'] = 'hardcoded'
        df_all_assignments = pd.concat([df_hardcoded, df_all_assignments], ignore_index=True)
    
    # Validate and fix counselor activity assignments (job_id: 1077)
    df_all_assignments = ensure_counselor_on_counselor_activity(
        df_all_assignments, df_staff_clean, df_lunch_jobs
    )
    
    # Final validation: Check for any duplicate assignments (same staff, same day)
    if len(df_all_assignments) > 0:
        final_duplicates = df_all_assignments.groupby(['day_name', 'staff_id']).size()
        final_duplicates = final_duplicates[final_duplicates > 1]
        
        if len(final_duplicates) > 0:
            print(f"\n⚠️  CRITICAL WARNING: {len(final_duplicates)} staff have multiple assignments on the same day!")
            for (day, staff_id), count in final_duplicates.items():
                staff_jobs = df_all_assignments[(df_all_assignments['day_name'] == day) & (df_all_assignments['staff_id'] == staff_id)]
                job_names = staff_jobs['job_name'].tolist()
                print(f"   Staff {staff_id} on {day}: {count} jobs - {job_names}")
    
    return df_all_assignments


def build_lunch_job_assignments(
    conn,
    cur,
    session_id,
    pattern_based_jobs,
    staff_game_days,
    tie_dye_days,
    tie_dye_staff,
    staff_to_remove=None,
    staff_to_add=None,
    custom_job_assignments=None,
    debug=False,
    verbose=False
):
    """
    Master wrapper for generating lunch job assignments.
    This reproduces the exact pipeline from testing_lunch_jobs.py,
    while leveraging helper functions in lunch_job_helpers.py.

    Loads SQL internally, runs exception logic, A/B group pattern logic,
    hardcoded assignments, random assignments, merges/enriches output,
    and returns df_final_assignments_enriched.

    If debug=True, returns a dictionary of all intermediate DataFrames.
    If verbose=True, prints detailed assignment summaries and staffing checklists.
    """

    # ----------------------------------------------------------------------
    # 1. Load SQL → DataFrames
    # ----------------------------------------------------------------------
    # DAYS
    
    lunch_job_sql = get_lunch_jobs_sql()
    
    
    df_lunch_job = pd.read_sql(lunch_job_sql,conn)
    ###commented out to suppress output
    # df_lunch_job

    days = ["monday", "tuesday", "wednesday", "thursday"]
    days_sql = get_days_sql(cur, days)
    df_days = pd.read_sql(days_sql,conn)
    #df_days.head()


    eligible_staff_sql = get_eligible_staff_sql(cur, session_id = session_id)
    # potentially exclude noneligible staff here
    # sorted by group and role in sql
    df_eligible_staff = pd.read_sql(eligible_staff_sql,conn)


    # ----------------------------------------------------------------------
    # 2. Exception detection logic (same as testing_lunch_jobs.py)
    # ----------------------------------------------------------------------
    eligible_staff_agg = (
    df_eligible_staff
    .groupby("group_id")
    .agg(
        sum_of_counselors = ("role_id", lambda x: (x == 1005).sum()),
        sum_of_junior_counselors = ("role_id", lambda x: (x == 1006).sum())
    )
    .reset_index()
    .sort_values("group_id")
    )

       #Add the exception column "pattern_exception". This is true or false boolean columns
    eligible_staff_agg["pattern_exception"] = (
        ((eligible_staff_agg["sum_of_counselors"] == 1) & 
        (eligible_staff_agg["sum_of_junior_counselors"] == 2))
        |
        ((eligible_staff_agg["sum_of_counselors"] == 1) & 
        (eligible_staff_agg["sum_of_junior_counselors"] == 1))
    )

    df_eligible_staff_with_exceptions = df_eligible_staff.merge(
    eligible_staff_agg[["group_id", "pattern_exception"]], #exception lookup ,
    on="group_id",
    how="left"
     )
    df_group_patterns = assign_group_patterns(df_eligible_staff)
    #df_group_patterns.head()


    df_eligible_staff_patterns_and_exceptions = df_eligible_staff_with_exceptions.merge(
        df_group_patterns[["group_id", "base_pattern"]], #pattern lookup ,
        on="group_id",
        how="left"
    )


    df_eligible_staff_patterns_and_exceptions["actual_assignment"] = (
        df_eligible_staff_patterns_and_exceptions.apply(
            lambda row: 
                # Counselors (1005) → keep base pattern
                row["base_pattern"] 
                if row["role_id"] == 1005 
                else 
                # Junior Counselors (1006) → flip the pattern
                ("A" if row["base_pattern"] == "B" else "B"),
            axis=1
        )
    )



    df_eligible_staff_dirty = df_eligible_staff_patterns_and_exceptions

    df_eligible_staff_only_exceptions = df_eligible_staff_dirty[~df_eligible_staff_dirty['pattern_exception']]

    df_eligible_staff_without_exceptions = df_eligible_staff_dirty[df_eligible_staff_dirty['pattern_exception']]
    
    
    # assign A/B for rows flagged as exceptions
    df_exceptions = df_eligible_staff_only_exceptions.copy()

    df_exceptions['exception_assignment'] = None

    for gid, grp in df_exceptions.groupby('group_id'):
        idxs = grp.index.tolist()
        random.shuffle(idxs)
        n = len(idxs)
        # decide how many go to A (if odd, pick which side gets the extra at random)
        if n % 2 == 0:
            nA = n // 2
        else:
            nA = n // 2 + (1 if random.choice(['A', 'B']) == 'A' else 0)
        a_idxs = idxs[:nA]
        b_idxs = idxs[nA:]
        df_exceptions.loc[a_idxs, 'exception_assignment'] = 'A'
        df_exceptions.loc[b_idxs, 'exception_assignment'] = 'B'

    # Update actual_assignment for exception rows
    df_exceptions['actual_assignment'] = df_exceptions['exception_assignment']
    df_exceptions.drop(columns=["exception_assignment"], inplace=True)



    # Concatenate exceptions with non-exceptions
    df_eligible_staff_combined = pd.concat([df_eligible_staff_without_exceptions, df_exceptions], ignore_index=False)

    # Restore the original order from df_eligible_staff_dirty
    df_eligible_staff_clean = df_eligible_staff_combined.loc[df_eligible_staff_dirty.index].copy()

    # ----------------------------------------------------------------------
    # 5. HARD CODED ASSIGNMENTS (pattern jobs, staff game, tie dye, custom)
    # ----------------------------------------------------------------------
    df_hardcoded_assignments, df_staff_balanced = process_hardcoded_assignments(
    pattern_based_jobs,
    staff_game_days,
    tie_dye_days,
    tie_dye_staff,
    df_eligible_staff_clean, 
    df_days, 
    df_lunch_job,
    staff_to_remove=staff_to_remove,
    staff_to_add=staff_to_add,
    custom_job_assignments=custom_job_assignments
     )

    # ----------------------------------------------------------------------
    # 6. RANDOM ASSIGNMENTS
    # ----------------------------------------------------------------------
    df_final_assignments = assign_random_lunch_jobs(
    df_staff_balanced,
    df_days,
    df_lunch_job,
    df_hardcoded_assignments
    )
    
    # Print detailed summaries if verbose mode is enabled
    if verbose:
        print_assignment_summary(df_hardcoded_assignments, df_final_assignments, df_days, df_lunch_job)

    print(f"\n\nTotal assignments: {len(df_final_assignments)} records")

    # ----------------------------------------------------------------------
    # 7. Enrich with staff details
    # ----------------------------------------------------------------------
    df_final_assignments_enriched = df_final_assignments.merge(
        df_staff_balanced[
            ["staff_id", "staff_name", "group_id", "role_id", "actual_assignment"]
        ],
        on="staff_id",
        how="left"
    )

    # ----------------------------------------------------------------------
    # 8. Column ordering + sorting
    # ----------------------------------------------------------------------

    # Reorder columns for better readability
    column_order = [
        'day_name',
        'day_sort',
        'staff_id', 
        'staff_name',
        'role_id',
        'actual_assignment', 
        'group_id', 
        'job_id', 
        'job_code', 
        'job_name', 
        'assignment_type'
    ]

    # Only include columns that exist in the dataframe
    column_order = [col for col in column_order if col in df_final_assignments_enriched.columns]
    df_final_assignments_enriched = df_final_assignments_enriched[column_order]

    # Create a day order mapping for proper sorting
    day_order = {'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4}
    df_final_assignments_enriched['day_sort'] = df_final_assignments_enriched['day_name'].str.lower().map(day_order)

    # Sort by day order, then group, then staff name
    df_final_assignments_enriched = df_final_assignments_enriched.sort_values(
        by=['day_sort', 'group_id', 'staff_name']
    ).reset_index(drop=True)

    # ----------------------------------------------------------------------
    # 9. Return (debug or normal)
    # ----------------------------------------------------------------------
    if debug:
        print('DEBUG output enabled')
        print('returning DEBUG dictionary output')
        return {
            "df_days": df_days,
            "df_lunch_job": df_lunch_job,
            "df_eligible_staff": df_eligible_staff,
            "df_eligible_staff_agg":eligible_staff_agg,
            "df_eligible_staff_dirty":df_eligible_staff_dirty,
            "df_eligible_staff_clean":df_eligible_staff_clean,
            "df_staff_balanced": df_staff_balanced,
            "df_hardcoded_assignments": df_hardcoded_assignments,
            "df_final_assignments": df_final_assignments,
            "df_final_assignments_enriched": df_final_assignments_enriched
        }
       
    print('DEBUG is not enabled')
    print('returning final dataframe in tabular format')
    return df_final_assignments_enriched

def load_lunch_job_config(filename: str) -> dict:
    ##author kavin
    """
    Loads the lunch job configuration JSON and returns it
    as a parent dictionary keyed by the original variable names.

    lunch job configuration JSON file should be located
    from the /config directory.


    Parameters
    ----------
    filename : str
        Name of the JSON file (example: 'lunchjob_inputs.json')

    Returns
    -------
    dict
        Dictionary containing:
        - pattern_based_jobs
        - staff_game_days
        - tie_dye_days
        - tie_dye_staff
        - staff_to_remove
        - staff_to_add
        - custom_job_assignments
    """

# Resolve the path to the config directory regardless of where it's called from
    base_dir = Path(__file__).resolve().parents[1]  # Decathlon_Automation/
    file = base_dir / "config" / filename

    if not file.exists():
        raise FileNotFoundError(f"Config file not found: {file}")

    with open(file, "r") as f:
        data = json.load(f)

# Convert job_id keys back to int for pattern_based_jobs
    if "pattern_based_jobs" in data:
        print('pattern_based_jobs detected in input. reformatting json...')
        data["pattern_based_jobs"] = {

            int(k): [int(x) for x in v]
            for k, v in data["pattern_based_jobs"].items()
        }

    # Convert job_id keys back to int inside custom_job_assignments['all_days']
    if "custom_job_assignments" in data:
        if "all_days" in data["custom_job_assignments"]:
            print('custom_job_assignments detected in input. reformatting json...')
            data["custom_job_assignments"]["all_days"] = {
                int(k): [int(x) for x in v]
                for k, v in data["custom_job_assignments"]["all_days"].items()
            }


    return data



