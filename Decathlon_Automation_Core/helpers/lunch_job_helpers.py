import psycopg2
import pandas as pd
import random
import numpy as np
from pathlib import Path
import json
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import sys

# Set UTF-8 encoding for print statements to handle Unicode characters
try:
    if sys.stdout.encoding != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8')
except (AttributeError, OSError):
    # reconfigure not available in some environments (e.g., Jupyter, IPython)
    pass

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
    print('lunch job sql retrieved')
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

    print('days sql retrieved')
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

    print('eligible staff sql retrieved')
    return query

def validate_and_fix_group_pattern_coverage(df_staff, context=""):
    """
    Validate that each group has at least one staff member assigned to each pattern (A and B).
    Automatically fixes groups missing coverage by swapping staff between patterns.
    
    Strategy:
    - If a group has only one role (counselors or JCs), split them in half
    - If a group has both roles, swap the minority role (JCs if counselors > JCs, else counselors)
    
    Parameters
    ----------
    df_staff : pd.DataFrame
        Staff dataframe with 'group_id', 'role_id', and 'actual_assignment' columns
    context : str, optional
        Context string for logging (e.g., "after initial assignment", "after hardcoded processing")
    
    Returns
    -------
    pd.DataFrame
        Updated staff dataframe with fixed pattern assignments
    """
    print(f"\nValidating group pattern coverage {context}...")
    
    df_staff = df_staff.copy()
    
    # Group by group_id and count patterns
    group_summary = df_staff.groupby('group_id')['actual_assignment'].agg([
        ('count_A', lambda x: (x == 'A').sum()),
        ('count_B', lambda x: (x == 'B').sum())
    ])
    
    missing_coverage = []
    
    for group_id, row in group_summary.iterrows():
        if row['count_A'] == 0:
            missing_coverage.append((group_id, 'A', row['count_A'], row['count_B']))
        if row['count_B'] == 0:
            missing_coverage.append((group_id, 'B', row['count_A'], row['count_B']))
    
    if missing_coverage:
        print(f"\n⚠️  WARNING: {len(missing_coverage)} group(s) missing pattern coverage {context}:")
        for group_id, pattern, count_a, count_b in missing_coverage:
            print(f"   Group {group_id}: Pattern {pattern} has 0 staff (A={count_a}, B={count_b})")
        
        print(f"\nAutomatically fixing pattern coverage...")
        
        # Get unique groups that need fixing
        groups_to_fix = list(set([g[0] for g in missing_coverage]))
        
        for group_id in groups_to_fix:
            group_staff = df_staff[df_staff['group_id'] == group_id].copy()
            
            # Skip if only 1 staff in group (can't split)
            if len(group_staff) == 1:
                print(f"\n  Group {group_id}: Only 1 staff member - skipping (cannot ensure both pattern coverage)")
                continue
            
            # Count staff by role
            counselors = group_staff[group_staff['role_id'] == 1005]
            jcs = group_staff[group_staff['role_id'] == 1006]
            
            current_pattern = group_staff['actual_assignment'].iloc[0]  # All same pattern
            opposite_pattern = 'B' if current_pattern == 'A' else 'A'
            
            print(f"\n  Group {group_id}: {len(counselors)} counselors, {len(jcs)} JCs (all in Pattern {current_pattern})")
            
            if len(counselors) > 0 and len(jcs) > 0:
                # Both roles present - swap the minority role
                if len(counselors) > len(jcs):
                    # Swap JCs
                    staff_to_swap = jcs
                    role_name = "JCs"
                else:
                    # Swap counselors
                    staff_to_swap = counselors
                    role_name = "counselors"
                
                print(f"    Strategy: Swap {len(staff_to_swap)} {role_name} to Pattern {opposite_pattern}")
                df_staff.loc[staff_to_swap.index, 'actual_assignment'] = opposite_pattern
                
            elif len(counselors) > 0:
                # Only counselors - split in half
                num_to_swap = len(counselors) // 2
                if num_to_swap == 0:
                    num_to_swap = 1  # At least swap one
                
                staff_to_swap = counselors.iloc[:num_to_swap]
                print(f"    Strategy: Split counselors - swap {num_to_swap}/{len(counselors)} to Pattern {opposite_pattern}")
                df_staff.loc[staff_to_swap.index, 'actual_assignment'] = opposite_pattern
                
            elif len(jcs) > 0:
                # Only JCs - split in half
                num_to_swap = len(jcs) // 2
                if num_to_swap == 0:
                    num_to_swap = 1  # At least swap one
                
                staff_to_swap = jcs.iloc[:num_to_swap]
                print(f"    Strategy: Split JCs - swap {num_to_swap}/{len(jcs)} to Pattern {opposite_pattern}")
                df_staff.loc[staff_to_swap.index, 'actual_assignment'] = opposite_pattern
        
        # Verify the fix worked
        print(f"\nVerifying fixes...")
        group_summary_after = df_staff.groupby('group_id')['actual_assignment'].agg([
            ('count_A', lambda x: (x == 'A').sum()),
            ('count_B', lambda x: (x == 'B').sum())
        ])
        
        still_missing = []
        for group_id, row in group_summary_after.iterrows():
            if row['count_A'] == 0 or row['count_B'] == 0:
                still_missing.append(group_id)
        
        if still_missing:
            print(f"⚠️  WARNING: {len(still_missing)} group(s) still missing coverage after fix: {still_missing}")
        else:
            print(f"✓ All groups now have coverage in both patterns A and B")
        
        return df_staff
    else:
        print(f"✓ All {len(group_summary)} groups have at least one staff in both patterns A and B")
        return df_staff


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
        
        # Step 3: Ensure minimum 2 staff per day, then balance
        MIN_STAFF_PER_DAY = 2
        
        if len(non_staff_game_tie_dye_days) == 2:
            day1, day2 = non_staff_game_tie_dye_days[0], non_staff_game_tie_dye_days[1]
            count1, count2 = len(tie_dye_assignments_by_day[day1]), len(tie_dye_assignments_by_day[day2])
            
            print(f"Initial assignments: {day1}={count1} staff, {day2}={count2} staff")
            
            # Check if any day has fewer than minimum required staff
            if count1 < MIN_STAFF_PER_DAY or count2 < MIN_STAFF_PER_DAY:
                print(f"⚠️  Minimum {MIN_STAFF_PER_DAY} staff required per day")
                
                # Identify which day needs more staff
                if count1 < MIN_STAFF_PER_DAY:
                    deficit_day = day1
                    source_day = day2
                    deficit = MIN_STAFF_PER_DAY - count1
                elif count2 < MIN_STAFF_PER_DAY:
                    deficit_day = day2
                    source_day = day1
                    deficit = MIN_STAFF_PER_DAY - count2
                
                print(f"  {deficit_day} needs {deficit} more staff (currently has {len(tie_dye_assignments_by_day[deficit_day])})")
                
                # Assign staff from source day to work BOTH days to meet minimum
                if len(tie_dye_assignments_by_day[source_day]) >= deficit:
                    # Assign first N staff from source day to work both days
                    staff_to_add = tie_dye_assignments_by_day[source_day][:deficit]
                    for staff_id in staff_to_add:
                        tie_dye_assignments_by_day[deficit_day].append(staff_id)
                        print(f"  Adding staff {staff_id} to {deficit_day} (will work both tie dye days)")
                else:
                    # Not enough staff total - assign ALL to both days
                    print(f"  ⚠️  Not enough tie dye staff total - assigning all {len(tie_dye_staff)} staff to both days")
                    for day in [day1, day2]:
                        tie_dye_assignments_by_day[day] = tie_dye_staff.copy()
                
                count1, count2 = len(tie_dye_assignments_by_day[day1]), len(tie_dye_assignments_by_day[day2])
                print(f"After minimum enforcement: {day1}={count1} staff, {day2}={count2} staff")
            
            # Now balance if there's still a significant imbalance (and both have minimum)
            if count1 >= MIN_STAFF_PER_DAY and count2 >= MIN_STAFF_PER_DAY and count1 != count2:
                larger_day = day1 if count1 > count2 else day2
                smaller_day = day2 if count1 > count2 else day1
                larger_pattern = tie_dye_day_patterns[larger_day]
                smaller_pattern = tie_dye_day_patterns[smaller_day]
                
                # Calculate how many to move (but don't go below minimum)
                larger_count = len(tie_dye_assignments_by_day[larger_day])
                smaller_count = len(tie_dye_assignments_by_day[smaller_day])
                max_can_move = larger_count - MIN_STAFF_PER_DAY
                num_to_move = min(abs(count1 - count2) // 2, max_can_move)
                
                if num_to_move > 0:
                    # Get staff from larger day (only those not assigned to both days)
                    staff_only_on_larger = [s for s in tie_dye_assignments_by_day[larger_day] 
                                           if s not in tie_dye_assignments_by_day[smaller_day]]
                    staff_to_move = staff_only_on_larger[:num_to_move]
                    
                    print(f"Balancing: Moving {num_to_move} staff from {larger_day} to {smaller_day}")
                    
                    # Move staff and flip entire group's patterns
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
        elif len(non_staff_game_tie_dye_days) == 1:
            # Only one tie dye day - ensure minimum staff
            day = non_staff_game_tie_dye_days[0]
            if len(tie_dye_assignments_by_day[day]) < MIN_STAFF_PER_DAY:
                print(f"⚠️  Only {len(tie_dye_assignments_by_day[day])} staff assigned to {day}, minimum {MIN_STAFF_PER_DAY} required")
                print(f"  Assigning all {len(tie_dye_staff)} tie dye staff to {day}")
                tie_dye_assignments_by_day[day] = tie_dye_staff.copy()
        
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
            
            # Determine which pattern should be working this day
            day_pattern_for_swap = 'A' if day.lower() in ['monday', 'wednesday'] else 'B'
            
            counselors_on_other_jobs = df_staff_clean[
                (df_staff_clean['staff_id'].isin(other_job_staff)) &
                (df_staff_clean['role_id'] == COUNSELOR_ROLE_ID) &
                (df_staff_clean['actual_assignment'] == day_pattern_for_swap)
            ]
            
            if len(counselors_on_other_jobs) == 0:
                print(f"   ERROR: No counselors with pattern {day_pattern_for_swap} available to swap on {day}")
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
        
        # If no jobs available but we have staff, use all jobs for assignment
        if len(remaining_jobs) == 0 and len(day_staff) > 0:
            print(f"  ⚠️  No remaining jobs, but {len(day_staff)} staff need assignments. Using all jobs...")
            # Use all jobs except truly excluded special jobs
            remaining_jobs = df_lunch_jobs[~df_lunch_jobs['job_id'].isin(jobs_to_exclude)].copy()
            print(f"  Now have {len(remaining_jobs)} jobs available for overflow assignment")
        
        # Debug: Check if all staff are getting assigned
        if len(remaining_jobs) > 0:
            total_job_slots = sum(int(job['normal_staff_assigned']) if pd.notna(job['normal_staff_assigned']) else 1 
                                 for _, job in remaining_jobs.iterrows())
            if len(day_staff) > total_job_slots:
                print(f"  ⚠️  WARNING: {len(day_staff) - total_job_slots} staff will need overflow assignments")
        
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
                    # Assign remaining staff as substitutes (SUB)
                    if not assigned_this_round:
                        print(f"  All overflow jobs at max capacity. Assigning {len(day_staff) - staff_idx} remaining staff as SUB...")
                        while staff_idx < len(day_staff):
                            staff = day_staff.iloc[staff_idx]
                            all_assignments.append({
                                'day_name': day,
                                'staff_id': staff['staff_id'],
                                'job_id': None,
                                'job_code': 'SUB',
                                'job_name': 'Substitute',
                                'assignment_type': 'substitute'
                            })
                            staff_idx += 1
                        break
                
                print(f"  After overflow assignments: {staff_idx} total staff assigned")
            else:
                # No overflow jobs available, assign remaining staff as substitutes
                print(f"  No overflow jobs defined. Assigning {len(day_staff) - staff_idx} remaining staff as SUB...")
                while staff_idx < len(day_staff):
                    staff = day_staff.iloc[staff_idx]
                    all_assignments.append({
                        'day_name': day,
                        'staff_id': staff['staff_id'],
                        'job_id': None,
                        'job_code': 'SUB',
                        'job_name': 'Substitute',
                        'assignment_type': 'substitute'
                    })
                    staff_idx += 1
        
        # Print summary
        print(f"  Final: {staff_idx}/{len(day_staff)} staff assigned to jobs")
        
        # Report unassigned staff if any
        if staff_idx < len(day_staff):
            unassigned_staff = day_staff.iloc[staff_idx:]
            print(f"  ⚠️  {len(unassigned_staff)} staff not assigned on {day}:")
            for _, staff in unassigned_staff.iterrows():
                print(f"     - {staff['staff_name']} (ID: {staff['staff_id']}, Pattern: {staff['actual_assignment']})")
    
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
    verbose=False,
    precomputed_staff_patterns=None,
    week_number=None
):
    """
    Master wrapper for generating lunch job assignments.
    This reproduces the exact pipeline from testing_lunch_jobs.py,
    while leveraging helper functions in lunch_job_helpers.py.

    Loads SQL internally, runs exception logic, A/B group pattern logic,
    hardcoded assignments, random assignments, merges/enriches output,
    and returns schedule format with staff as rows and days as columns.

    If debug=True, returns a dictionary of all intermediate DataFrames (including schedule format).
    If verbose=True, prints detailed assignment summaries and staffing checklists.
    
    Parameters
    ----------
    precomputed_staff_patterns : dict, optional
        Dictionary mapping staff_id to pattern ('A' or 'B'). When provided, these patterns
        will be used for staff with hardcoded assignments instead of random assignment.
        This is computed in multi-week scheduling to ensure consistency across weeks.
        If None, patterns are assigned randomly for all staff.
    week_number : int, optional
        Week number for labeling in multi-week schedules.
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
    
    # ----------------------------------------------------------------------
    # 3. PATTERN ASSIGNMENT - use precomputed patterns if available
    # ----------------------------------------------------------------------
    if precomputed_staff_patterns:
        # Use precomputed patterns (multi-week mode)
        print(f"\nUsing precomputed patterns for {len(precomputed_staff_patterns)} staff members")
        df_eligible_staff_with_exceptions['actual_assignment'] = df_eligible_staff_with_exceptions['staff_id'].apply(
            lambda sid: precomputed_staff_patterns.get(sid, None)
        )
        
        # For staff without precomputed patterns, assign based on group patterns
        df_group_patterns = assign_group_patterns(df_eligible_staff)
        df_eligible_staff_with_patterns = df_eligible_staff_with_exceptions.merge(
            df_group_patterns[["group_id", "base_pattern"]],
            on="group_id",
            how="left"
        )
        
        # Fill in missing patterns using group-based logic
        mask_missing = df_eligible_staff_with_patterns['actual_assignment'].isna()
        df_eligible_staff_with_patterns.loc[mask_missing, 'actual_assignment'] = (
            df_eligible_staff_with_patterns.loc[mask_missing].apply(
                lambda row: 
                    row["base_pattern"] 
                    if row["role_id"] == 1005 
                    else ("A" if row["base_pattern"] == "B" else "B"),
                axis=1
            )
        )
        
        df_eligible_staff_dirty = df_eligible_staff_with_patterns
    else:
        # Original logic - assign patterns from scratch (single-week mode)
        df_group_patterns = assign_group_patterns(df_eligible_staff)

        df_eligible_staff_patterns_and_exceptions = df_eligible_staff_with_exceptions.merge(
            df_group_patterns[["group_id", "base_pattern"]], #pattern lookup ,
            on="group_id",
            how="left"
        )

        # Check if we have precomputed patterns from multi-week global balancing
        if precomputed_staff_patterns:
            print("\n📌 Using precomputed patterns from global multi-week balancing...")
            # Use precomputed patterns directly
            df_eligible_staff_patterns_and_exceptions["actual_assignment"] = (
                df_eligible_staff_patterns_and_exceptions["staff_id"].map(precomputed_staff_patterns)
            )
            # For any staff not in precomputed dict (shouldn't happen, but safety check)
            missing_pattern = df_eligible_staff_patterns_and_exceptions["actual_assignment"].isna()
            if missing_pattern.any():
                print(f"⚠️  Warning: {missing_pattern.sum()} staff not in precomputed patterns, using fallback logic")
                df_eligible_staff_patterns_and_exceptions.loc[missing_pattern, "actual_assignment"] = (
                    df_eligible_staff_patterns_and_exceptions[missing_pattern].apply(
                        lambda row: 
                            row["base_pattern"] 
                            if row["role_id"] == 1005 
                            else 
                            ("A" if row["base_pattern"] == "B" else "B"),
                        axis=1
                    )
                )
        else:
            # Original logic: Counselors keep base pattern, JCs get flipped pattern
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

    # ----------------------------------------------------------------------
    # 4. EXCEPTION HANDLING - randomize within exception groups
    # ----------------------------------------------------------------------
    df_eligible_staff_only_exceptions = df_eligible_staff_dirty[~df_eligible_staff_dirty['pattern_exception']]

    df_eligible_staff_without_exceptions = df_eligible_staff_dirty[df_eligible_staff_dirty['pattern_exception']]
    
    
    # assign A/B for rows flagged as exceptions (only if not using precomputed patterns)
    df_exceptions = df_eligible_staff_only_exceptions.copy()

    if not precomputed_staff_patterns:
        # Only randomize exceptions if we don't have precomputed patterns
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

    # Validate and fix group pattern coverage after initial assignment
    df_eligible_staff_clean = validate_and_fix_group_pattern_coverage(df_eligible_staff_clean, context="after initial pattern assignment")

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
    # 5.5. BALANCE PATTERN DISTRIBUTION (avoid swapping hardcoded staff)
    # ----------------------------------------------------------------------
    # Collect all staff with hardcoded assignments
    hardcoded_staff_ids = []
    if pattern_based_jobs:
        for staff_list in pattern_based_jobs.values():
            hardcoded_staff_ids.extend(staff_list)
    if tie_dye_staff:
        hardcoded_staff_ids.extend(tie_dye_staff)
    if custom_job_assignments:
        if 'all_days' in custom_job_assignments:
            for staff_list in custom_job_assignments['all_days'].values():
                hardcoded_staff_ids.extend(staff_list)
        if 'specific_days' in custom_job_assignments:
            for assignment in custom_job_assignments['specific_days']:
                hardcoded_staff_ids.append(assignment[0])  # staff_id is first element
    
    # Remove duplicates
    hardcoded_staff_ids = list(set(hardcoded_staff_ids))
    
    # Validate and fix group pattern coverage after hardcoded assignments
    df_staff_balanced = validate_and_fix_group_pattern_coverage(df_staff_balanced, context="after hardcoded assignment processing")
    
    # Only balance patterns if we don't have precomputed patterns from multi-week planning
    if not precomputed_staff_patterns:
        print("\n🔄 Running per-week pattern balancing...")
        # Balance the pattern distribution (group-based)
        df_staff_balanced = balance_pattern_distribution(df_staff_balanced, hardcoded_staff_ids)
        
        # Balance patterns by role (counselors vs JCs) - lower priority
        df_staff_balanced = balance_role_patterns(df_staff_balanced, hardcoded_staff_ids)
    else:
        print("\n✓ Skipping per-week balancing - using consistent precomputed patterns from global planning")

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
    # 9. Transform to schedule format
    # ----------------------------------------------------------------------
    df_schedule = transform_to_schedule_format(df_final_assignments_enriched)
    
    # ----------------------------------------------------------------------
    # 10. Return (debug or normal)
    # ----------------------------------------------------------------------
    if debug:
        print('DEBUG output enabled')
        print('returning DEBUG dictionary output')
        return {
            "df_days": df_days,
            "df_lunch_job": df_lunch_job,
            "df_eligible_staff": df_eligible_staff, # original eligible staff from SQL
            "df_eligible_staff_agg":eligible_staff_agg, # aggregation used for exception detection
            "df_eligible_staff_dirty":df_eligible_staff_dirty, # eligible staff before cleaning, with pattern exception column
            "df_eligible_staff_clean":df_eligible_staff_clean, # eligible staff after cleaning, with final patterns
            "df_staff_balanced": df_staff_balanced, # balanced staff dataframe after pattern balancing
            "df_hardcoded_assignments": df_hardcoded_assignments, # hardcoded assignments dataframe
            "df_final_assignments": df_final_assignments, # all assignments before enrichment, 
            "df_final_assignments_enriched": df_final_assignments_enriched, # all assignments after enrichment, with staff details
            "df_schedule": df_schedule # final schedule format output
        }
    
    # Return both schedule and enriched assignments (needed for wide format)
    print('Returning schedule format and enriched assignments')
    return {
        "df_schedule": df_schedule,
        "df_final_assignments_enriched": df_final_assignments_enriched
    }

def transform_to_schedule_format(df_final_assignments_enriched):
    """
    Transform the assignments dataframe into a schedule format matching the CSV template.
    Groups counselors and junior counselors separately, splits by pattern A/B,
    with staff as rows and days as columns.
    
    Parameters:
    - df_final_assignments_enriched: dataframe with all assignments
    
    Returns:
    - df_schedule: transformed dataframe in schedule format
    """
    
    # Define day order for columns
    day_columns = ['M', 'T', 'W', 'TH', 'F']
    day_mapping = {
        'monday': 'M',
        'tuesday': 'T',
        'wednesday': 'W',
        'thursday': 'TH',
        'friday': 'F'
    }
    
    # Pivot the data: staff_name as rows, days as columns, job_code as values
    df_pivot = df_final_assignments_enriched.copy()
    df_pivot['day_abbrev'] = df_pivot['day_name'].str.lower().map(day_mapping)
    
    # Create pivot table
    pivot_table = df_pivot.pivot_table(
        index=['staff_name', 'role_id', 'actual_assignment'],
        columns='day_abbrev',
        values='job_code',
        aggfunc='first'
    ).reset_index()
    
    # Ensure all day columns exist (including Friday with no data)
    for day in day_columns:
        if day not in pivot_table.columns:
            pivot_table[day] = ''
    
    # Reorder columns
    pivot_table = pivot_table[['staff_name', 'role_id', 'actual_assignment'] + day_columns]
    
    # Separate counselors and junior counselors
    counselors = pivot_table[pivot_table['role_id'] == 1005].copy()
    junior_counselors = pivot_table[pivot_table['role_id'] == 1006].copy()
    
    # Split each by pattern A and B
    counselors_a = counselors[counselors['actual_assignment'] == 'A'].sort_values('staff_name')
    counselors_b = counselors[counselors['actual_assignment'] == 'B'].sort_values('staff_name')
    junior_counselors_a = junior_counselors[junior_counselors['actual_assignment'] == 'A'].sort_values('staff_name')
    junior_counselors_b = junior_counselors[junior_counselors['actual_assignment'] == 'B'].sort_values('staff_name')
    
    # Drop role_id and actual_assignment columns as they're just for sorting
    for df in [counselors_a, counselors_b, junior_counselors_a, junior_counselors_b]:
        df.drop(columns=['role_id', 'actual_assignment'], inplace=True)
    
    # Create section headers
    counselors_header = pd.DataFrame([['COUNSELORS: MONDAY/WEDNESDAY', '', '', '', '', '']], 
                                      columns=['staff_name'] + day_columns)
    counselors_b_header = pd.DataFrame([['COUNSELORS: TUESDAY/THURSDAY', '', '', '', '', '']], 
                                        columns=['staff_name'] + day_columns)
    jc_header = pd.DataFrame([['JUNIOR COUNSELORS: MONDAY/WEDNESDAY', '', '', '', '', '']], 
                              columns=['staff_name'] + day_columns)
    jc_b_header = pd.DataFrame([['JUNIOR COUNSELORS: TUESDAY/THURSDAY', '', '', '', '', '']], 
                                columns=['staff_name'] + day_columns)
    blank_row = pd.DataFrame([['', '', '', '', '', '']], 
                              columns=['staff_name'] + day_columns)
    
    # Combine all sections
    df_schedule = pd.concat([
        counselors_header,
        counselors_a,
        blank_row,
        counselors_b_header,
        counselors_b,
        blank_row,
        blank_row,
        jc_header,
        junior_counselors_a,
        blank_row,
        jc_b_header,
        junior_counselors_b
    ], ignore_index=True)
    
    # Replace NaN with empty strings
    df_schedule = df_schedule.fillna('')
    
    return df_schedule


def transform_to_multi_week_wide_format(all_week_assignments):
    """
    Transform multi-week assignments into a wide format where:
    - Each unique staff member has one row per week
    - Days from all weeks are columns (Week 1 M, Week 1 T, ..., Week 2 M, Week 2 T, ...)
    - Empty cells for weeks/days where staff are not assigned
    - Includes section headers for COUNSELORS: PATTERN A/B and JUNIOR COUNSELORS: PATTERN A/B
    
    Parameters
    ----------
    all_week_assignments : list of tuples
        List of (week_num, df_assignments) tuples where df_assignments has columns:
        ['staff_id', 'staff_name', 'role_id', 'group_id', 'day_name', 'job_code', 'actual_assignment']
    
    Returns
    -------
    pd.DataFrame
        Wide format with staff as rows and week-day combinations as columns
    """
    print("\n" + "="*80)
    print("CREATING MULTI-WEEK WIDE FORMAT")
    print("="*80)
    
    # Day mapping
    day_mapping = {
        'monday': 'M',
        'tuesday': 'T',
        'wednesday': 'W',
        'thursday': 'TH',
        'friday': 'F'
    }
    
    # Collect all unique staff across all weeks who have actual assignments
    all_staff = pd.DataFrame()
    staff_day_counts = {}  # Track which days each staff works: {staff_id: {'A': count, 'B': count}}
    
    for week_num, df_week in all_week_assignments:
        # Only include staff who have actual day assignments (day_name is not null/empty)
        df_week_filtered = df_week[df_week['day_name'].notna() & (df_week['day_name'] != '')]  
        
        # Count which pattern days each staff works (exclude Staff Game job 1100)
        for _, row in df_week_filtered.iterrows():
            staff_id = row['staff_id']
            job_id = row['job_id']
            day = row['day_name'].lower()
            
            # Skip Staff Game days - they don't count toward pattern determination
            if job_id == 1100:
                continue
            
            if staff_id not in staff_day_counts:
                staff_day_counts[staff_id] = {'A': 0, 'B': 0}
            
            # Count A days (Mon/Wed) and B days (Tue/Thu)
            if day in ['monday', 'wednesday']:
                staff_day_counts[staff_id]['A'] += 1
            elif day in ['tuesday', 'thursday']:
                staff_day_counts[staff_id]['B'] += 1
        
        # Get unique staff info
        staff_info = df_week_filtered[['staff_id', 'staff_name', 'role_id', 'group_id', 'actual_assignment']].drop_duplicates(subset=['staff_id'])
        
        if len(all_staff) == 0:
            all_staff = staff_info
        else:
            all_staff = pd.concat([all_staff, staff_info]).drop_duplicates(subset=['staff_id']).reset_index(drop=True)
    
    print(f"\nFound {len(all_staff)} unique staff members across all weeks (with assignments)")
    
    # Determine final pattern for each staff based on which days they worked most
    staff_patterns = {}
    for staff_id, counts in staff_day_counts.items():
        # Assign to pattern they worked more days on, or 'A' if tied
        if counts['A'] >= counts['B']:
            staff_patterns[staff_id] = 'A'
        else:
            staff_patterns[staff_id] = 'B'
    
    # Check for staff who have assignments but no pattern (worked only Staff Game days)
    staff_without_pattern = []
    for _, staff_row in all_staff.iterrows():
        if staff_row['staff_id'] not in staff_patterns:
            staff_without_pattern.append((staff_row['staff_id'], staff_row['staff_name']))
    
    if staff_without_pattern:
        print(f"\n⚠️  Warning: {len(staff_without_pattern)} staff have no pattern (only Staff Game assignments):")
        for staff_id, staff_name in staff_without_pattern:
            # Use their actual_assignment as fallback
            staff_patterns[staff_id] = all_staff[all_staff['staff_id'] == staff_id]['actual_assignment'].iloc[0]
            print(f"  {staff_name} (ID: {staff_id}) - using actual_assignment: {staff_patterns[staff_id]}")
    
    # Add pattern to all_staff
    all_staff['pattern'] = all_staff['staff_id'].map(staff_patterns)
    
    # Create the base dataframe with all staff
    result_df = all_staff.copy()
    
    # For each week, pivot and add columns
    for week_num, df_week in all_week_assignments:
        print(f"Processing Week {week_num}...")
        
        # Add day abbreviation
        df_week = df_week.copy()
        df_week['day_abbrev'] = df_week['day_name'].str.lower().map(day_mapping)
        
        # Filter out staff without actual day assignments (day_name is NaN or empty)
        df_week = df_week[df_week['day_abbrev'].notna()]
        
        # Pivot: staff as rows, days as columns, job_code as values
        week_pivot = df_week.pivot_table(
            index='staff_id',
            columns='day_abbrev',
            values='job_code',
            aggfunc='first'
        )
        
        # Rename columns to include week number
        week_pivot.columns = [f'Week {week_num} {col}' for col in week_pivot.columns]
        
        # Merge with result
        result_df = result_df.merge(week_pivot, left_on='staff_id', right_index=True, how='left')
    
    # Fill NaN with empty strings
    result_df = result_df.fillna('')
    
    # Reorder columns: staff info first, then week columns in order
    week_cols = [col for col in result_df.columns if col.startswith('Week ')]
    week_cols.sort(key=lambda x: (int(x.split()[1]), ['M', 'T', 'W', 'TH', 'F'].index(x.split()[2]) if x.split()[2] in ['M', 'T', 'W', 'TH', 'F'] else 999))
    
    # Rename columns to full day names with week numbers (e.g., "Monday 1", "Tuesday 1")
    day_full_names = {
        'M': 'Monday',
        'T': 'Tuesday',
        'W': 'Wednesday',
        'TH': 'Thursday',
        'F': 'Friday'
    }
    
    rename_map = {}
    for col in week_cols:
        parts = col.split()  # ['Week', '1', 'M']
        week_num = parts[1]
        day_abbrev = parts[2]
        full_day = day_full_names.get(day_abbrev, day_abbrev)
        rename_map[col] = f"{full_day} {week_num}"
    
    result_df = result_df.rename(columns=rename_map)
    renamed_week_cols = [rename_map[col] for col in week_cols]
    
    # Remove any duplicate staff_id rows (keep first occurrence)
    result_df = result_df.drop_duplicates(subset=['staff_id'], keep='first').reset_index(drop=True)
    
    # Remove staff who have NO assignments across ALL weeks (all day columns are empty)
    day_columns_only = [col for col in result_df.columns if col not in ['staff_id', 'staff_name', 'role_id', 'group_id', 'pattern']]
    has_any_assignment = result_df[day_columns_only].apply(lambda row: row.astype(str).str.strip().ne('').any(), axis=1)
    result_df = result_df[has_any_assignment].reset_index(drop=True)
    
    print(f"After filtering: {len(result_df)} staff with actual assignments")
    
    # Separate by role and pattern
    counselors = result_df[result_df['role_id'] == 1005].copy()
    junior_counselors = result_df[result_df['role_id'] == 1006].copy()
    
    counselors_a = counselors[counselors['pattern'] == 'A'].sort_values('staff_name')
    counselors_b = counselors[counselors['pattern'] == 'B'].sort_values('staff_name')
    junior_counselors_a = junior_counselors[junior_counselors['pattern'] == 'A'].sort_values('staff_name')
    junior_counselors_b = junior_counselors[junior_counselors['pattern'] == 'B'].sort_values('staff_name')
    
    # Drop unwanted columns from data rows
    cols_to_drop = ['staff_id', 'role_id', 'group_id', 'pattern']
    for df in [counselors_a, counselors_b, junior_counselors_a, junior_counselors_b]:
        df.drop(columns=cols_to_drop, inplace=True)
    
    # Prepare final column order (only staff_name and day columns)
    final_columns = ['staff_name'] + renamed_week_cols
    
    # Create section headers with all columns filled with empty strings
    empty_cols = {col: '' for col in final_columns}
    
    counselors_header = pd.DataFrame([{**empty_cols, 'staff_name': 'COUNSELORS: MONDAY/WEDNESDAY'}])
    counselors_b_header = pd.DataFrame([{**empty_cols, 'staff_name': 'COUNSELORS: TUESDAY/THURSDAY'}])
    jc_header = pd.DataFrame([{**empty_cols, 'staff_name': 'JUNIOR COUNSELORS: MONDAY/WEDNESDAY'}])
    jc_b_header = pd.DataFrame([{**empty_cols, 'staff_name': 'JUNIOR COUNSELORS: TUESDAY/THURSDAY'}])
    blank_row = pd.DataFrame([empty_cols])
    
    # Combine all sections
    final_df = pd.concat([
        counselors_header,
        counselors_a[final_columns],
        blank_row,
        counselors_b_header,
        counselors_b[final_columns],
        blank_row,
        blank_row,
        jc_header,
        junior_counselors_a[final_columns],
        blank_row,
        jc_b_header,
        junior_counselors_b[final_columns]
    ], ignore_index=True)
    
    print(f"\nWide format created with {len(final_df)} rows and {len(renamed_week_cols)} day columns")
    
    return final_df


def load_lunch_job_config(directory: str, filename: str) -> dict:
    ##author kavin
    """
    Loads the lunch job configuration JSON and returns it
    as a parent dictionary keyed by the original variable names.

    lunch job configuration JSON files should be located
    in the /config/lunchjob_inputs/{directory}/ directory.

    Parameters
    ----------
    directory : str
        Directory name under config/lunchjob_inputs/ (e.g., 'test_1012', 'session_1012')
    filename : str
        Name of the JSON file (example: 'lunchjob_week1.json')

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
    file = base_dir / "config" / "lunchjob_inputs" / directory / filename

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


def balance_pattern_distribution(df_staff, hardcoded_staff_ids):
    """
    Balance the distribution of staff between patterns A and B by swapping entire groups.
    
    This function checks if the pattern distribution is imbalanced (difference > 2).
    If so, it swaps groups from the larger pattern to the smaller pattern, avoiding
    any staff with hardcoded assignments.
    
    Parameters
    ----------
    df_staff : pd.DataFrame
        Staff dataframe with 'staff_id', 'group_id', and 'actual_assignment' columns
    hardcoded_staff_ids : list
        List of staff IDs that have hardcoded assignments and should not be swapped
        
    Returns
    -------
    pd.DataFrame
        Updated staff dataframe with balanced pattern assignments
    """
    print("\n" + "="*80)
    print("BALANCING PATTERN DISTRIBUTION")
    print("="*80)
    
    df_staff = df_staff.copy()
    
    # Count staff in each pattern
    pattern_counts = df_staff['actual_assignment'].value_counts().to_dict()
    count_a = pattern_counts.get('A', 0)
    count_b = pattern_counts.get('B', 0)
    
    print(f"\nInitial pattern distribution:")
    print(f"  Pattern A: {count_a} staff")
    print(f"  Pattern B: {count_b} staff")
    print(f"  Difference: {abs(count_a - count_b)}")
    
    # Check if balancing is needed
    if abs(count_a - count_b) <= 2:
        print("\n✓ Pattern distribution is already balanced (difference ≤ 2)")
        return df_staff
    
    print(f"\n⚠️  Pattern imbalance detected (difference > 2). Starting rebalancing...")
    
    # Determine which pattern has more and which has fewer
    if count_a > count_b:
        larger_pattern = 'A'
        smaller_pattern = 'B'
    else:
        larger_pattern = 'B'
        smaller_pattern = 'A'
    
    print(f"  Moving groups from Pattern {larger_pattern} to Pattern {smaller_pattern}")
    
    # Get groups that can be swapped (no hardcoded staff)
    eligible_groups = df_staff[~df_staff['staff_id'].isin(hardcoded_staff_ids)].groupby('group_id')
    
    # Calculate group pattern composition
    group_patterns = []
    for group_id, group_df in eligible_groups:
        larger_count = (group_df['actual_assignment'] == larger_pattern).sum()
        smaller_count = (group_df['actual_assignment'] == smaller_pattern).sum()
        total = len(group_df)
        
        # Only consider groups that have staff in the larger pattern
        if larger_count > 0:
            # Priority: groups with more staff in larger pattern
            group_patterns.append({
                'group_id': group_id,
                'larger_count': larger_count,
                'smaller_count': smaller_count,
                'total': total,
                'net_swap': larger_count - smaller_count  # Net reduction in imbalance if swapped
            })
    
    # Sort groups by net_swap (descending) - groups that will reduce imbalance most
    group_patterns.sort(key=lambda x: x['net_swap'], reverse=True)
    
    # Swap groups until difference is ≤ 2
    swapped_groups = []
    current_diff = abs(count_a - count_b)
    
    for group_info in group_patterns:
        if current_diff <= 2:
            break
        
        group_id = group_info['group_id']
        net_swap = group_info['net_swap']
        
        # Check if this swap will help reduce the imbalance
        new_diff = abs(current_diff - 2 * net_swap)
        
        # Only swap if it improves or maintains the balance
        if new_diff < current_diff or (new_diff == current_diff and net_swap > 0):
            # Swap this group
            group_mask = (df_staff['group_id'] == group_id) & (~df_staff['staff_id'].isin(hardcoded_staff_ids))
            df_staff.loc[group_mask, 'actual_assignment'] = df_staff.loc[group_mask, 'actual_assignment'].apply(
                lambda x: smaller_pattern if x == larger_pattern else larger_pattern
            )
            
            swapped_groups.append({
                'group_id': group_id,
                'larger_to_smaller': group_info['larger_count'],
                'smaller_to_larger': group_info['smaller_count']
            })
            
            current_diff = new_diff
            print(f"  Swapped group {group_id}: {group_info['larger_count']} staff {larger_pattern}→{smaller_pattern}, "
                  f"{group_info['smaller_count']} staff {smaller_pattern}→{larger_pattern} (new diff: {current_diff})")
    
    # Final count
    final_pattern_counts = df_staff['actual_assignment'].value_counts().to_dict()
    final_count_a = final_pattern_counts.get('A', 0)
    final_count_b = final_pattern_counts.get('B', 0)
    final_diff = abs(final_count_a - final_count_b)
    
    print(f"\nFinal pattern distribution:")
    print(f"  Pattern A: {final_count_a} staff")
    print(f"  Pattern B: {final_count_b} staff")
    print(f"  Difference: {final_diff}")
    
    if swapped_groups:
        print(f"\n✓ Swapped {len(swapped_groups)} group(s) to achieve balance")
    else:
        print(f"\n⚠️  Could not improve balance further without affecting hardcoded staff")
    
    return df_staff


def balance_role_patterns(df_staff, hardcoded_staff_ids):
    """
    Balance pattern distribution separately for counselors and junior counselors.
    This is a lower priority balance that runs after group-based balancing.
    
    Parameters
    ----------
    df_staff : pd.DataFrame
        Staff dataframe with 'staff_id', 'role_id', 'group_id', and 'actual_assignment' columns
    hardcoded_staff_ids : list
        List of staff IDs that have hardcoded assignments and should not be swapped
        
    Returns
    -------
    pd.DataFrame
        Updated staff dataframe with balanced pattern assignments by role
    """
    print("\n" + "="*80)
    print("BALANCING PATTERNS BY ROLE (COUNSELORS & JUNIOR COUNSELORS)")
    print("="*80)
    
    df_staff = df_staff.copy()
    
    # Balance counselors (role_id 1005)
    counselors = df_staff[df_staff['role_id'] == 1005]
    c_pattern_counts = counselors['actual_assignment'].value_counts().to_dict()
    c_count_a = c_pattern_counts.get('A', 0)
    c_count_b = c_pattern_counts.get('B', 0)
    c_diff = abs(c_count_a - c_count_b)
    
    print(f"\nCounselors:")
    print(f"  Pattern A: {c_count_a}")
    print(f"  Pattern B: {c_count_b}")
    print(f"  Difference: {c_diff}")
    
    # Balance junior counselors (role_id 1006)
    jcs = df_staff[df_staff['role_id'] == 1006]
    jc_pattern_counts = jcs['actual_assignment'].value_counts().to_dict()
    jc_count_a = jc_pattern_counts.get('A', 0)
    jc_count_b = jc_pattern_counts.get('B', 0)
    jc_diff = abs(jc_count_a - jc_count_b)
    
    print(f"\nJunior Counselors:")
    print(f"  Pattern A: {jc_count_a}")
    print(f"  Pattern B: {jc_count_b}")
    print(f"  Difference: {jc_diff}")
    
    # Only rebalance if difference is significant (> 3) to avoid conflicts with other balancing
    if c_diff > 3:
        print(f"\n⚠️  Counselor pattern imbalance > 3. Attempting role-based rebalancing...")
        df_staff = _balance_single_role_patterns(df_staff, 1005, hardcoded_staff_ids, 'Counselors')
    else:
        print(f"\n✓ Counselor patterns sufficiently balanced (difference ≤ 3)")
    
    if jc_diff > 3:
        print(f"\n⚠️  Junior Counselor pattern imbalance > 3. Attempting role-based rebalancing...")
        df_staff = _balance_single_role_patterns(df_staff, 1006, hardcoded_staff_ids, 'Junior Counselors')
    else:
        print(f"\n✓ Junior Counselor patterns sufficiently balanced (difference ≤ 3)")
    
    return df_staff


def _balance_single_role_patterns(df_staff, role_id, hardcoded_staff_ids, role_name):
    """
    Helper function to balance patterns for a single role.
    """
    role_staff = df_staff[df_staff['role_id'] == role_id]
    pattern_counts = role_staff['actual_assignment'].value_counts().to_dict()
    count_a = pattern_counts.get('A', 0)
    count_b = pattern_counts.get('B', 0)
    
    if count_a > count_b:
        larger_pattern = 'A'
        smaller_pattern = 'B'
    else:
        larger_pattern = 'B'
        smaller_pattern = 'A'
    
    # Find non-hardcoded staff of this role in the larger pattern
    eligible_staff = role_staff[
        (role_staff['actual_assignment'] == larger_pattern) &
        (~role_staff['staff_id'].isin(hardcoded_staff_ids))
    ]
    
    # Calculate how many to swap
    current_diff = abs(count_a - count_b)
    num_to_swap = current_diff // 2
    
    if len(eligible_staff) < num_to_swap:
        print(f"  Only {len(eligible_staff)} eligible {role_name} to swap (need {num_to_swap})")
        num_to_swap = len(eligible_staff)
    
    if num_to_swap == 0:
        print(f"  No eligible {role_name} to swap")
        return df_staff
    
    # Swap the patterns for the selected staff
    staff_to_swap = eligible_staff.head(num_to_swap)['staff_id'].tolist()
    
    for staff_id in staff_to_swap:
        df_staff.loc[df_staff['staff_id'] == staff_id, 'actual_assignment'] = smaller_pattern
    
    # Report results
    final_role_staff = df_staff[df_staff['role_id'] == role_id]
    final_pattern_counts = final_role_staff['actual_assignment'].value_counts().to_dict()
    final_count_a = final_pattern_counts.get('A', 0)
    final_count_b = final_pattern_counts.get('B', 0)
    
    print(f"  Swapped {num_to_swap} {role_name} from {larger_pattern} to {smaller_pattern}")
    print(f"  New distribution - A: {final_count_a}, B: {final_count_b}, Diff: {abs(final_count_a - final_count_b)}")
    
    return df_staff


def balance_staff_patterns_across_weeks(configs, conn):
    """
    Analyzes ALL staff and ALL weeks together to assign optimal patterns (A/B) that work
    consistently across the entire session. This ensures each staff member has the same
    pattern in every week.
    
    Strategy:
    1. Load all staff info (roles, groups) from database
    2. Identify staff with hardcoded assignments (must respect their constraints)
    3. For non-hardcoded staff, analyze group/role composition across all weeks
    4. Balance patterns globally considering:
       - Overall pattern distribution (roughly equal A vs B)
       - Group balance (keep groups together when possible)
       - Role balance (counselors vs JCs roughly equal per pattern)
    
    Parameters
    ----------
    configs : list of dict
        List of config dictionaries, one per week
    conn : database connection
        Connection to fetch staff data
        
    Returns
    -------
    dict
        Dictionary mapping staff_id to their final pattern assignment ('A' or 'B')
        This pattern will be used consistently across ALL weeks.
    """
    print("\n" + "="*80)
    print("STEP 1: GLOBAL PATTERN BALANCING ACROSS ALL WEEKS")
    print("="*80)
    
    # Load all staff from database for the session
    session_id = configs[0]['session_id']
    
    # Get all potentially eligible staff (using same structure as get_eligible_staff_sql)
    sql = f"""
    SELECT
        CONCAT(s.first_name, ' ', s.last_name) AS staff_name,
        s.id AS staff_id,
        r.id AS role_id,
        sts.group_id
    FROM camp.staff_to_session AS sts
    INNER JOIN camp.staff AS s ON sts.staff_id = s.id
    INNER JOIN camp.role AS r ON sts.role_id = r.id
    WHERE sts.session_id = {session_id}
      AND r.id IN (1005, 1006)
    ORDER BY sts.group_id, r.id, staff_name
    """
    df_all_staff = pd.read_sql(sql, conn)
    print(f"\nTotal staff in session: {len(df_all_staff)}")
    
    # Track staff with hardcoded assignments across ANY week
    hardcoded_staff_ids = set()
    
    for week_idx, config in enumerate(configs):
        week_num = week_idx + 1
        
        # Collect staff from pattern_based_jobs
        if config.get("pattern_based_jobs"):
            for job_id, staff_list in config["pattern_based_jobs"].items():
                hardcoded_staff_ids.update(staff_list)
        
        # Collect staff from tie_dye_staff
        if config.get("tie_dye_staff"):
            hardcoded_staff_ids.update(config["tie_dye_staff"])
    
    print(f"Staff with hardcoded assignments: {len(hardcoded_staff_ids)}")
    
    # Separate hardcoded vs non-hardcoded staff
    df_hardcoded = df_all_staff[df_all_staff['staff_id'].isin(hardcoded_staff_ids)].copy()
    df_flexible = df_all_staff[~df_all_staff['staff_id'].isin(hardcoded_staff_ids)].copy()
    
    print(f"Flexible staff (can be assigned any pattern): {len(df_flexible)}")
    
    # Initialize pattern assignments dictionary
    pattern_assignments = {}
    
    # PHASE 1: Assign patterns to hardcoded staff (simple alternating for balance)
    print("\nPhase 1: Assigning patterns to hardcoded staff...")
    pattern_counts = {'A': 0, 'B': 0}
    
    for _, staff in df_hardcoded.iterrows():
        staff_id = staff['staff_id']
        # Assign to pattern with fewer staff
        if pattern_counts['A'] <= pattern_counts['B']:
            pattern_assignments[staff_id] = 'A'
            pattern_counts['A'] += 1
        else:
            pattern_assignments[staff_id] = 'B'
            pattern_counts['B'] += 1
    
    print(f"  Hardcoded staff assigned - A: {pattern_counts['A']}, B: {pattern_counts['B']}")
    
    # PHASE 2: Assign patterns to flexible staff using group-based balancing
    print("\nPhase 2: Assigning patterns to flexible staff...")
    print("  Strategy: Keep groups together, balance roles and overall numbers")
    
    # Group flexible staff by group_id
    flexible_groups = df_flexible.groupby('group_id')
    
    # Sort groups by size (larger groups first to ensure good distribution)
    group_sizes = df_flexible['group_id'].value_counts().to_dict()
    sorted_groups = sorted(group_sizes.items(), key=lambda x: x[1], reverse=True)
    
    for group_id, group_size in sorted_groups:
        group_staff = df_flexible[df_flexible['group_id'] == group_id]
        
        # Assign entire group to pattern with fewer total staff
        current_total_a = pattern_counts['A']
        current_total_b = pattern_counts['B']
        
        if current_total_a <= current_total_b:
            assigned_pattern = 'A'
            pattern_counts['A'] += len(group_staff)
        else:
            assigned_pattern = 'B'
            pattern_counts['B'] += len(group_staff)
        
        # Assign all staff in this group to the same pattern
        for _, staff in group_staff.iterrows():
            pattern_assignments[staff['staff_id']] = assigned_pattern
    
    print(f"  All staff assigned - A: {pattern_counts['A']}, B: {pattern_counts['B']}")
    
    # PHASE 3: Check role balance and adjust if needed
    print("\nPhase 3: Checking role balance...")
    df_all_staff['assigned_pattern'] = df_all_staff['staff_id'].map(pattern_assignments)
    
    # Count by role and pattern
    role_pattern_counts = df_all_staff.groupby(['role_id', 'assigned_pattern']).size().unstack(fill_value=0)
    print("\nRole-Pattern Distribution:")
    print(role_pattern_counts)
    
    # Calculate imbalance for each role
    for role_id in [1005, 1006]:
        role_name = "Counselors" if role_id == 1005 else "Junior Counselors"
        if role_id in role_pattern_counts.index:
            count_a = role_pattern_counts.loc[role_id, 'A'] if 'A' in role_pattern_counts.columns else 0
            count_b = role_pattern_counts.loc[role_id, 'B'] if 'B' in role_pattern_counts.columns else 0
            diff = abs(count_a - count_b)
            print(f"  {role_name}: A={count_a}, B={count_b}, Diff={diff}")
            
            # If imbalance > 3, try to swap some flexible staff
            if diff > 3:
                print(f"    ⚠️  High imbalance for {role_name}, attempting to rebalance...")
                # Find flexible staff of this role we can swap
                larger_pattern = 'A' if count_a > count_b else 'B'
                smaller_pattern = 'B' if larger_pattern == 'A' else 'A'
                
                swappable_staff = df_flexible[
                    (df_flexible['role_id'] == role_id) &
                    (df_flexible['staff_id'].map(pattern_assignments) == larger_pattern)
                ]
                
                num_to_swap = diff // 2
                if len(swappable_staff) >= num_to_swap:
                    staff_to_swap = swappable_staff.head(num_to_swap)
                    for _, staff in staff_to_swap.iterrows():
                        pattern_assignments[staff['staff_id']] = smaller_pattern
                        pattern_counts[larger_pattern] -= 1
                        pattern_counts[smaller_pattern] += 1
                    print(f"    ✓ Swapped {num_to_swap} {role_name} from {larger_pattern} to {smaller_pattern}")
    
    # Final summary
    print("\n" + "="*80)
    print("GLOBAL PATTERN ASSIGNMENT COMPLETE")
    print("="*80)
    print(f"Total staff assigned: {len(pattern_assignments)}")
    print(f"Pattern A: {pattern_counts['A']} staff")
    print(f"Pattern B: {pattern_counts['B']} staff")
    print(f"Difference: {abs(pattern_counts['A'] - pattern_counts['B'])}")
    print("\nThese patterns will be used consistently across ALL weeks.")
    
    return pattern_assignments
    
    print(f"\nPattern distribution:")
    print(f"  Pattern A: {len([p for p in pattern_assignments.values() if p == 'A'])} staff, {pattern_counts['A']} total assignments")
    print(f"  Pattern B: {len([p for p in pattern_assignments.values() if p == 'B'])} staff, {pattern_counts['B']} total assignments")
    
    return pattern_assignments


def build_multi_week_schedule(conn, cur, session_id):
    """
    Master wrapper function for generating lunch job assignments across multiple weeks.
    
    This function:
    1. Finds the directory under config/lunchjob_inputs/ that contains the session_id in its name
    2. Automatically discovers all JSON files in that directory
    3. Balances staff patterns across all weeks based on hardcoded assignments
    4. Generates weekly schedules with consistent pattern assignments
    5. Combines all weeks into a single output DataFrame
    
    Parameters
    ----------
    conn : psycopg2.connection
        Active database connection
    cur : psycopg2.cursor
        Active database cursor
    session_id : int
        Session ID to process. The function will search for a directory under
        config/lunchjob_inputs/ that contains this session_id in its name.
        (e.g., session_id=1012 will match directory 'test_1012' or 'session_1012')
    
    Returns
    -------
    dict
        Dictionary containing schedule DataFrames and optional debug data
    """
    print("\n" + "="*80)
    print("MULTI-WEEK LUNCH JOB SCHEDULE GENERATOR")
    print("="*80)
    
    # Find the directory containing this session_id
    base_dir = Path(__file__).resolve().parents[1]
    lunchjob_inputs_dir = base_dir / "config" / "lunchjob_inputs"
    
    # Search for directory with session_id in name
    matching_dirs = [d for d in lunchjob_inputs_dir.iterdir() 
                     if d.is_dir() and str(session_id) in d.name]
    
    if not matching_dirs:
        raise FileNotFoundError(
            f"No directory found under {lunchjob_inputs_dir} with session_id '{session_id}' in its name. "
            f"Available directories: {[d.name for d in lunchjob_inputs_dir.iterdir() if d.is_dir()]}"
        )
    
    if len(matching_dirs) > 1:
        raise ValueError(
            f"Multiple directories found with session_id '{session_id}' in name: {[d.name for d in matching_dirs]}. "
            "Please ensure only one directory matches."
        )
    
    input_dir = matching_dirs[0]
    directory = input_dir.name
    print(f"\nFound input directory: {directory}")
    
    if not input_dir.exists():
        raise FileNotFoundError(f"Directory not found: {input_dir}")
    
    # Find all JSON files in the directory that contain "week #" pattern in the filename
    # Week number can be indicated as "week1", "week_2", "week 3", etc.
    # Example filenames: "lunchjob_week1.json", "week 2 lunchjob.json"
    import re
    all_files = []
    for f in input_dir.glob("*.json"):
        match = re.search(r'week[\s_]*(\d+)', f.name.lower())
        if match:
            all_files.append((f, int(match.group(1))))
    
    if not all_files:
        raise FileNotFoundError(f"No JSON files with 'week #' pattern found in directory: {input_dir}")
    
    # Sort files by week number
    all_files.sort(key=lambda x: x[1])
    json_files = [f[0].name for f in all_files]
    
    print(f"\nFound {len(json_files)} week(s) to process:")
    for i, filename in enumerate(json_files, 1):
        print(f"  Week {i}: {filename}")
    
    # STEP 1: Load all configs
    print("\n" + "="*80)
    print("LOADING CONFIGURATIONS FOR ALL WEEKS")
    print("="*80)
    
    configs = []
    for i, filename in enumerate(json_files):
        print(f"\nLoading Week {i+1}: {filename}")
        config = load_lunch_job_config(directory=directory, filename=filename)
        configs.append(config)
    
    # Use session_id from first config (should be same across all weeks)
    session_id = configs[0]['session_id']
    
    # Check if ANY week has debug=True
    debug_any = any(config.get("debug", False) for config in configs)
    
    # Use verbose from first config
    verbose = configs[0].get("verbose", False)
    
    # STEP 1: Balance staff patterns globally across all weeks
    # This ensures each staff member has the same pattern in every week
    overall_staff_patterns = balance_staff_patterns_across_weeks(configs, conn)
    
    # STEP 3: Loop through each week and generate assignments
    print("\n" + "="*80)
    print("STEP 2: GENERATING WEEKLY SCHEDULES")
    print("="*80)
    
    all_week_schedules = []
    all_week_assignments = []  # Store enriched assignments for wide format
    all_debug_outputs = {}  # Store debug outputs per week (if any week has debug=True)
    
    for week_idx, config in enumerate(configs):
        week_num = week_idx + 1
        print("\n" + "="*80)
        print(f"PROCESSING WEEK {week_num}")
        print("="*80)
        
        # Extract config parameters for this week
        pattern_based_jobs = config["pattern_based_jobs"]
        staff_game_days = config["staff_game_days"]
        tie_dye_days = config["tie_dye_days"]
        tie_dye_staff = config["tie_dye_staff"]
        staff_to_remove = config["staff_to_remove"]
        staff_to_add = config["staff_to_add"]
        custom_job_assignments = config["custom_job_assignments"]
        
        # Check if THIS week has debug enabled
        week_debug = config.get("debug", False)
        
        output = build_lunch_job_assignments(
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
            debug=week_debug,
            verbose=verbose,
            precomputed_staff_patterns=overall_staff_patterns,
            week_number=week_num
        )
        
        # Handle both debug and normal output
        if week_debug:
            # Store the full debug dictionary for this week
            all_debug_outputs[f'week_{week_num}'] = output
            df_schedule = output["df_schedule"].copy()
            df_assignments = output["df_final_assignments_enriched"].copy()
        else:
            # Normal mode now returns both schedule and assignments
            df_schedule = output["df_schedule"].copy()
            df_assignments = output["df_final_assignments_enriched"].copy()
        
        # Add week identifier column
        if isinstance(df_schedule, pd.DataFrame):
            df_schedule.insert(0, 'Week', f'Week {week_num}')
        
        all_week_schedules.append(df_schedule)
        
        # Always store assignments for wide format
        all_week_assignments.append((week_num, df_assignments))
        
        print(f"\nWeek {week_num} schedule generated successfully")
    
    # STEP 4: Combine all weeks into single schedule
    print("\n" + "="*80)
    print("COMBINING ALL WEEKS INTO FINAL SCHEDULE")
    print("="*80)
    
    df_full_session = pd.concat(all_week_schedules, ignore_index=True)
    
    print(f"\nFull session schedule complete!")
    print(f"Total weeks: {len(json_files)}")
    print(f"Total rows: {len(df_full_session)}")
    
    # STEP 5: Create wide format (all weeks as columns) - ALWAYS generate this
    df_wide_format = None
    if len(all_week_assignments) > 0:
        df_wide_format = transform_to_multi_week_wide_format(all_week_assignments)
    
    # Return debug output if ANY week had debug=True
    if debug_any and len(all_debug_outputs) > 0:
        print(f'\nDEBUG output enabled for {len(all_debug_outputs)} week(s)')
        print('returning DEBUG dictionary with all intermediate DataFrames')
        all_debug_outputs['df_full_session'] = df_full_session
        all_debug_outputs['df_wide_format'] = df_wide_format
        all_debug_outputs['overall_staff_patterns'] = overall_staff_patterns
        all_debug_outputs['all_week_assignments'] = all_week_assignments
        return all_debug_outputs
    
    # Normal mode: return both formats and raw assignments for UI
    return {
        'df_full_session': df_full_session,
        'df_wide_format': df_wide_format,
        'all_week_assignments': all_week_assignments
    }


def export_and_upload_schedule(df_full_session, df_wide_format, 
                               sheet_name='Lunchtime Job Schedule',
                               output_dir='exports'):
    """
    Export schedule DataFrames to CSV and upload wide format to Google Sheets.
    Loads spreadsheet_id from environment variables or credentials.json.
    
    Parameters
    ----------
    df_full_session : pd.DataFrame
        Full session schedule (long format)
    df_wide_format : pd.DataFrame
        Wide format schedule with weeks as columns
    sheet_name : str
        Name of the sheet tab to upload to
    output_dir : str, optional
        Directory name or path to save CSV files (default: 'exports' in base directory)
        
    Returns
    -------
    dict
        Status of exports: {'csv_full': bool, 'csv_wide': bool, 'google_sheets': bool}
    """
    import os
    
    base_dir = Path(__file__).resolve().parents[1]
    
    # Load spreadsheet_id from environment or credentials file
    spreadsheet_id = os.environ.get('GOOGLE_SHEETS_SPREADSHEET_ID')
    
    if spreadsheet_id:
        print(f"\nLoaded Google Sheets spreadsheet ID from environment variables")
    else:
        # Fall back to credentials.json for local development
        creds_file = base_dir / "config" / "credentials.json"
        
        with open(creds_file, 'r') as f:
            creds_data = json.load(f)
            spreadsheet_id = creds_data['google_sheets']['spreadsheet_id']
        
        print(f"\nLoaded Google Sheets spreadsheet ID from credentials.json")
    
    # Create exports directory in base directory
    output_dir = base_dir / output_dir
    output_dir.mkdir(exist_ok=True)
    
    status = {'csv_full': False, 'csv_wide': False, 'google_sheets': False}
    
    # Export full session schedule to CSV
    try:
        csv_full_path = os.path.join(output_dir, 'lunch_job_schedule.csv')
        df_full_session.to_csv(csv_full_path, index=False)
        print(f"\nFull session schedule exported to {csv_full_path}")
        status['csv_full'] = True
    except Exception as e:
        print(f"Error exporting full session CSV: {e}")
    
    # Export and upload wide format
    if df_wide_format is not None:
        try:
            csv_wide_path = os.path.join(output_dir, 'lunch_job_schedule_wide.csv')
            df_wide_format.to_csv(csv_wide_path, index=False)
            print(f"Wide format schedule exported to {csv_wide_path}")
            print(f"Wide format: {len(df_wide_format)} rows × {len(df_wide_format.columns)} columns")
            status['csv_wide'] = True
            
            # Upload to Google Sheets
            print("\n" + "="*80)
            print("UPLOADING TO GOOGLE SHEETS")
            print("="*80)
            success = format_google_sheet(
                csv_file=csv_wide_path,
                spreadsheet_id=spreadsheet_id,
                sheet_name=sheet_name
            )
            status['google_sheets'] = success
            
        except Exception as e:
            print(f"Error with wide format export/upload: {e}")
    
    return status


def print_debug_info(debug_outputs):
    """
    Print information about available debug outputs.
    
    Parameters
    ----------
    debug_outputs : dict
        Dictionary containing debug data from build_multi_week_schedule
    """
    print("\n" + "="*80)
    print("DEBUG MODE - Available debug outputs")
    print("="*80)
    print(f"Available keys: {list(debug_outputs.keys())}")
    print("\nPer-week debug data available for each week (week_1, week_2, etc.)")
    print("Each week contains: df_days, df_lunch_job, df_eligible_staff, df_eligible_staff_agg,")
    print("  df_eligible_staff_dirty, df_eligible_staff_clean, df_staff_balanced,")
    print("  df_hardcoded_assignments, df_final_assignments, df_final_assignments_enriched, df_schedule")
    print("\nGlobal debug data: df_full_session, df_wide_format, overall_staff_patterns, all_week_assignments")


# =============================================================================
# GOOGLE SHEETS FORMATTING FUNCTIONS
# =============================================================================

def authenticate_google_sheets():
    """Authenticate with Google Sheets API using service account."""
    import os
    
    # Check for environment variables first
    private_key = os.environ.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
    
    if private_key:
        # Clean up private key - handle various formats
        private_key = private_key.strip('"').strip("'")
        private_key = private_key.replace('\\n', '\n')
        
        # Build service account info from environment variables
        service_account_info = {
            "type": "service_account",
            "project_id": os.environ.get('GOOGLE_SERVICE_ACCOUNT_PROJECT_ID', ''),
            "private_key_id": os.environ.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID', ''),
            "private_key": private_key,
            "client_email": os.environ.get('GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL', ''),
            "client_id": os.environ.get('GOOGLE_SERVICE_ACCOUNT_CLIENT_ID', ''),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"
        }
        print("Using Google credentials from environment variables")
    else:
        # Fall back to credentials.json for local development
        base_dir = Path(__file__).resolve().parents[1]
        creds_file = base_dir / "config" / "credentials.json"
        
        with open(creds_file, 'r') as f:
            creds_data = json.load(f)
            service_account_info = creds_data['google_service_account']
        print("Using Google credentials from credentials.json")
    
    SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
    creds = Credentials.from_service_account_info(
        service_account_info, scopes=SCOPES)
    
    service = build('sheets', 'v4', credentials=creds)
    return service


def upload_csv_to_sheet(service, spreadsheet_id, sheet_name, csv_file):
    """Upload CSV data to Google Sheet."""
    # Read CSV file
    df = pd.read_csv(csv_file)
    
    # Replace NaN values with empty strings
    df = df.fillna('')
    
    # Convert DataFrame to list of lists for Google Sheets API
    values = [df.columns.tolist()] + df.values.tolist()
    
    # Clear existing data
    try:
        service.spreadsheets().values().clear(
            spreadsheetId=spreadsheet_id,
            range=f"{sheet_name}!A1:ZZ"
        ).execute()
    except HttpError:
        # Sheet might not exist, create it
        create_sheet(service, spreadsheet_id, sheet_name)
    
    # Upload data
    body = {'values': values}
    result = service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_name}!A1",
        valueInputOption='RAW',
        body=body
    ).execute()
    
    print(f"Uploaded {result.get('updatedCells')} cells to {sheet_name}")
    return len(values), len(values[0])


def create_sheet(service, spreadsheet_id, sheet_name):
    """Create a new sheet tab if it doesn't exist."""
    request_body = {
        'requests': [{
            'addSheet': {
                'properties': {
                    'title': sheet_name
                }
            }
        }]
    }
    
    try:
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body=request_body
        ).execute()
        print(f"Created new sheet: {sheet_name}")
    except HttpError as e:
        print(f"Sheet might already exist: {e}")


def get_sheet_id(service, spreadsheet_id, sheet_name):
    """Get the sheet ID for a given sheet name."""
    sheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = sheet_metadata.get('sheets', [])
    
    for sheet in sheets:
        if sheet['properties']['title'] == sheet_name:
            return sheet['properties']['sheetId']
    
    return None


def apply_conditional_formatting(service, spreadsheet_id, sheet_name, num_rows, num_cols, colors):
    """Apply color coding based on cell values."""
    sheet_id = get_sheet_id(service, spreadsheet_id, sheet_name)
    
    if sheet_id is None:
        print(f"Could not find sheet: {sheet_name}")
        return
    
    # Get existing conditional format rules
    sheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = sheet_metadata.get('sheets', [])
    
    requests = []
    
    # First, delete all existing conditional formatting rules
    for sheet in sheets:
        if sheet['properties']['sheetId'] == sheet_id:
            existing_rules = sheet.get('conditionalFormats', [])
            for i in range(len(existing_rules)):
                requests.append({
                    'deleteConditionalFormatRule': {
                        'sheetId': sheet_id,
                        'index': 0  # Always delete the first rule until all are gone
                    }
                })
            break
    
    # Add conditional formatting rules for each activity type
    for activity, color in colors.items():
        requests.append({
            'addConditionalFormatRule': {
                'rule': {
                    'ranges': [{
                        'sheetId': sheet_id,
                        'startRowIndex': 1,  # Skip header row
                        'endRowIndex': num_rows,
                        'startColumnIndex': 0,
                        'endColumnIndex': num_cols
                    }],
                    'booleanRule': {
                        'condition': {
                            'type': 'TEXT_EQ',
                            'values': [{'userEnteredValue': activity}]
                        },
                        'format': {
                            'backgroundColor': color
                        }
                    }
                },
                'index': 0
            }
        })
    
    # Execute batch update
    if requests:
        body = {'requests': requests}
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body=body
        ).execute()
        print(f"Applied {len(requests)} conditional formatting rules")


def merge_header_rows(service, spreadsheet_id, sheet_name, num_rows, num_cols):
    """Merge cells for section headers (COUNSELORS/JUNIOR COUNSELORS rows)."""
    sheet_id = get_sheet_id(service, spreadsheet_id, sheet_name)
    
    if sheet_id is None:
        print(f"Could not find sheet: {sheet_name}")
        return
    
    # Read the data to find header rows
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_name}!A1:{chr(64 + num_cols)}{num_rows}"
    ).execute()
    values = result.get('values', [])
    
    requests = []
    
    # Find rows that contain header text
    for row_idx, row in enumerate(values):
        if row and ('COUNSELORS:' in str(row[0]) or 'JUNIOR COUNSELORS:' in str(row[0])):
            # Merge this row across all columns
            requests.append({
                'mergeCells': {
                    'range': {
                        'sheetId': sheet_id,
                        'startRowIndex': row_idx,
                        'endRowIndex': row_idx + 1,
                        'startColumnIndex': 0,
                        'endColumnIndex': num_cols
                    },
                    'mergeType': 'MERGE_ALL'
                }
            })
    
    if requests:
        body = {'requests': requests}
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body=body
        ).execute()
        print(f"Merged {len(requests)} header rows")


def apply_cell_formatting(service, spreadsheet_id, sheet_name, num_rows, num_cols):
    """Apply general formatting: borders, alignment, font size, etc."""
    sheet_id = get_sheet_id(service, spreadsheet_id, sheet_name)

    if sheet_id is None:
        print(f"Could not find sheet: {sheet_name}")
        return

    # Read the data to find section header rows
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_name}!A1:{chr(64 + num_cols)}{num_rows}"
    ).execute()
    values = result.get('values', [])
    
    # Find section header rows
    section_header_rows = []
    for row_idx, row in enumerate(values):
        if row and ('COUNSELORS:' in str(row[0]) or 'JUNIOR COUNSELORS:' in str(row[0])):
            section_header_rows.append(row_idx)

    requests = [
        # Format column header row (row 0) - Light grey background
        {
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 0,
                    'endRowIndex': 1,
                    'startColumnIndex': 0,
                    'endColumnIndex': num_cols
                },
                'cell': {
                    'userEnteredFormat': {
                        'backgroundColor': {'red': 0.85, 'green': 0.85, 'blue': 0.85},
                        'textFormat': {
                            'bold': True,
                            'fontSize': 10
                        },
                        'horizontalAlignment': 'CENTER',
                        'verticalAlignment': 'MIDDLE'
                    }
                },
                'fields': 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
        },
        # Center align all cells
        {
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 1,
                    'endRowIndex': num_rows,
                    'startColumnIndex': 0,
                    'endColumnIndex': num_cols
                },
                'cell': {
                    'userEnteredFormat': {
                        'horizontalAlignment': 'CENTER',
                        'verticalAlignment': 'MIDDLE',
                        'textFormat': {
                            'fontSize': 9
                        }
                    }
                },
                'fields': 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
            }
        },
        # Add borders to all cells
        {
            'updateBorders': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 0,
                    'endRowIndex': num_rows,
                    'startColumnIndex': 0,
                    'endColumnIndex': num_cols
                },
                'top': {
                    'style': 'SOLID',
                    'width': 1,
                    'color': {'red': 0, 'green': 0, 'blue': 0}
                },
                'bottom': {
                    'style': 'SOLID',
                    'width': 1,
                    'color': {'red': 0, 'green': 0, 'blue': 0}
                },
                'left': {
                    'style': 'SOLID',
                    'width': 1,
                    'color': {'red': 0, 'green': 0, 'blue': 0}
                },
                'right': {
                    'style': 'SOLID',
                    'width': 1,
                    'color': {'red': 0, 'green': 0, 'blue': 0}
                }
            }
        },
        # Set column width
        {
            'updateDimensionProperties': {
                'range': {
                    'sheetId': sheet_id,
                    'dimension': 'COLUMNS',
                    'startIndex': 0,
                    'endIndex': num_cols
                },
                'properties': {
                    'pixelSize': 150
                },
                'fields': 'pixelSize'
            }
        },
        # Freeze header row
        {
            'updateSheetProperties': {
                'properties': {
                    'sheetId': sheet_id,
                    'gridProperties': {
                        'frozenRowCount': 1
                    }
                },
                'fields': 'gridProperties.frozenRowCount'
            }
        }
    ]
    
    # Add formatting for section headers (COUNSELORS/JUNIOR COUNSELORS) - Light blue background
    for row_idx in section_header_rows:
        requests.append({
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': row_idx,
                    'endRowIndex': row_idx + 1,
                    'startColumnIndex': 0,
                    'endColumnIndex': num_cols
                },
                'cell': {
                    'userEnteredFormat': {
                        'backgroundColor': {'red': 0.67, 'green': 0.82, 'blue': 0.95},  # Light blue
                        'textFormat': {
                            'bold': True,
                            'fontSize': 11
                        },
                        'horizontalAlignment': 'CENTER',
                        'verticalAlignment': 'MIDDLE'
                    }
                },
                'fields': 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
        })

    body = {'requests': requests}
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body=body
    ).execute()
    print("Applied cell formatting (borders, alignment, header styling)")


def clear_sheet_formatting(service, spreadsheet_id, sheet_name):
    """
    Clear ALL previous formatting from a Google Sheet.
    This removes:
    - Conditional formatting rules
    - Merged cells
    - Background colors
    - Borders
    - Text formatting
    
    This is critical for preventing formatting issues when re-uploading data.
    
    Parameters
    ----------
    service : googleapiclient.discovery.Resource
        Authenticated Google Sheets API service
    spreadsheet_id : str
        The ID of the Google Spreadsheet
    sheet_name : str
        The name of the sheet tab to clear
    """
    print("Clearing previous formatting...")
    
    try:
        # Get sheet ID
        sheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        sheets = sheet_metadata.get('sheets', [])
        sheet_id = None
        
        for sheet in sheets:
            if sheet['properties']['title'] == sheet_name:
                sheet_id = sheet['properties']['sheetId']
                break
        
        if sheet_id is None:
            print(f"  Sheet '{sheet_name}' not found, skipping clear formatting")
            return
        
        requests = []
        
        # 1. Delete all conditional format rules
        requests.append({
            'deleteConditionalFormatRule': {
                'sheetId': sheet_id,
                'index': 0
            }
        })
        
        # 2. Unmerge all cells
        requests.append({
            'unmergeCells': {
                'range': {
                    'sheetId': sheet_id
                }
            }
        })
        
        # 3. Clear all cell formatting (backgrounds, borders, text formatting)
        requests.append({
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id
                },
                'cell': {
                    'userEnteredFormat': {}
                },
                'fields': 'userEnteredFormat'
            }
        })
        
        # Execute all clear operations
        # We need to execute them one at a time because some might fail (e.g., no conditional formats to delete)
        for request in requests:
            try:
                service.spreadsheets().batchUpdate(
                    spreadsheetId=spreadsheet_id,
                    body={'requests': [request]}
                ).execute()
            except Exception as e:
                # Ignore errors for clearing operations that don't apply
                # (e.g., trying to delete conditional formats when none exist)
                pass
        
        print("  ✓ Cleared all previous formatting")
        
    except Exception as e:
        print(f"  Warning: Could not clear all formatting: {e}")
        # Don't fail if clearing doesn't work - continue with upload


def format_google_sheet(csv_file, spreadsheet_id, sheet_name='Lunchtime Job Schedule'):
    """
    Upload CSV to Google Sheets and apply formatting.

    Parameters
    ----------
    csv_file : str
        Path to the CSV file to upload
    spreadsheet_id : str
        The ID of the Google Spreadsheet (from the URL)
    sheet_name : str, optional
        The name of the sheet tab (default: 'Lunchtime Job Schedule')
    """
    # Define colors in RGB format (0-1 scale)
    COLORS = {
        # Green - Counselor Activity
        'CA': {'red': 0.7, 'green': 0.95, 'blue': 0.7},
        # Red - Card Trading
        'CT': {'red': 0.95, 'green': 0.5, 'blue': 0.5},
        # Orange - Tie Dye
        'TD': {'red': 1.0, 'green': 0.8, 'blue': 0.4},
    }
    
    try:
        # Authenticate
        print("\nAuthenticating with Google Sheets API...")
        service = authenticate_google_sheets()
        
        # Clear previous formatting first (critical for preventing formatting issues)
        clear_sheet_formatting(service, spreadsheet_id, sheet_name)

        # Upload CSV data
        print("Uploading CSV data...")
        num_rows, num_cols = upload_csv_to_sheet(service, spreadsheet_id, sheet_name, csv_file)

        print("Merging header rows...")
        merge_header_rows(service, spreadsheet_id, sheet_name, num_rows, num_cols)
        
        # Apply formatting
        print("Applying cell formatting...")
        apply_cell_formatting(service, spreadsheet_id, sheet_name, num_rows, num_cols)
        
        # Apply color coding
        print("Applying color coding...")
        apply_conditional_formatting(service, spreadsheet_id, sheet_name, num_rows, num_cols, COLORS)
        
        print("\n✓ Successfully formatted Google Sheet!")
        print(f"View your sheet: https://docs.google.com/spreadsheets/d/{spreadsheet_id}")
        
        return True
        
    except Exception as e:
        print(f"Error formatting Google Sheet: {e}")
        return False





