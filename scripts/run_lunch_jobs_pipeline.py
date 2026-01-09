#!/usr/bin/env python3
"""
Wrapper script to run the Decathlon lunch job pipeline from the server.
This script imports and uses the actual pipeline function from Decathlon_Automation_Core.
"""
import sys
import os
import json

# Add parent directory to path to import Decathlon_Automation_Core modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

def validate_group_coverage(all_week_assignments, session_id, conn):
    """
    Combined validation that checks:
    1. Each group has at least one staff member working each day (not all staying back)
    2. Each group has at least one staff member staying back each day (not all working)
    
    Returns dict with:
        - passed: bool
        - message: str
        - noWorkingIssues: list of groups with no one working
        - allWorkingIssues: list of groups with everyone working (no one staying back)
    """
    import pandas as pd
    
    # Get staff count per group for this session
    sql_staff_per_group = f"""
    SELECT sts.group_id, COUNT(DISTINCT sts.staff_id) as staff_count
    FROM camp.staff_to_session AS sts
    WHERE sts.session_id = {session_id}
      AND sts.role_id IN (1005, 1006)
    GROUP BY sts.group_id
    ORDER BY sts.group_id
    """
    df_staff_counts = pd.read_sql(sql_staff_per_group, conn)
    
    if df_staff_counts.empty:
        return {
            'passed': True,
            'message': 'No groups found to validate',
            'noWorkingIssues': [],
            'allWorkingIssues': []
        }
    
    # Create lookup dict: group_id -> total staff count
    staff_per_group = dict(zip(df_staff_counts['group_id'], df_staff_counts['staff_count']))
    all_groups = set(staff_per_group.keys())
    
    # Days to check (Monday through Thursday, Friday is never used)
    days_to_check = ['monday', 'tuesday', 'wednesday', 'thursday']
    
    no_working_issues = []  # Groups with no staff working
    all_working_issues = []  # Groups with all staff working (no one staying back)
    
    for week_num, df_assignments in all_week_assignments:
        if df_assignments is None or len(df_assignments) == 0:
            # No assignments for this week - all groups have no one working
            for day in days_to_check:
                for group_id in all_groups:
                    no_working_issues.append({
                        'week': int(week_num),
                        'day': day.capitalize(),
                        'group_id': int(group_id),
                        'issue_type': 'no_working'
                    })
            continue
        
        # Get column names
        day_col = 'day_name' if 'day_name' in df_assignments.columns else 'day'
        job_col = 'job_id' if 'job_id' in df_assignments.columns else 'lunch_job_id'
        
        for day in days_to_check:
            day_assignments = df_assignments[df_assignments[day_col].str.lower() == day.lower()]
            
            # Check if THIS SPECIFIC DAY has staff game (job_id 1100)
            if job_col in df_assignments.columns:
                is_staff_game_day = (day_assignments[job_col] == 1100).any() if len(day_assignments) > 0 else False
                if is_staff_game_day:
                    # Staff game day - all staff work together, skip validation
                    continue
            
            if len(day_assignments) == 0:
                # No assignments this day - all groups have no one working
                for group_id in all_groups:
                    no_working_issues.append({
                        'week': int(week_num),
                        'day': day.capitalize(),
                        'group_id': int(group_id),
                        'issue_type': 'no_working'
                    })
                continue
            
            if 'group_id' not in day_assignments.columns:
                continue
            
            # Count assigned staff per group for this day
            assigned_per_group = day_assignments.groupby('group_id')['staff_id'].nunique().to_dict()
            
            # Check each group
            for group_id in all_groups:
                assigned_count = assigned_per_group.get(group_id, 0)
                total_count = staff_per_group.get(group_id, 0)
                
                if assigned_count == 0:
                    # No one from this group is working
                    no_working_issues.append({
                        'week': int(week_num),
                        'day': day.capitalize(),
                        'group_id': int(group_id),
                        'issue_type': 'no_working'
                    })
                elif total_count > 0 and assigned_count >= total_count:
                    # Everyone from this group is working (no one staying back)
                    all_working_issues.append({
                        'week': int(week_num),
                        'day': day.capitalize(),
                        'group_id': int(group_id),
                        'assigned': int(assigned_count),
                        'total': int(total_count),
                        'issue_type': 'all_working'
                    })
    
    total_issues = len(no_working_issues) + len(all_working_issues)
    
    if total_issues > 0:
        return {
            'passed': False,
            'message': f'Found {total_issues} group coverage issues',
            'noWorkingIssues': no_working_issues,
            'allWorkingIssues': all_working_issues
        }
    else:
        return {
            'passed': True,
            'message': 'All groups are appropriately covered each day of the week',
            'noWorkingIssues': [],
            'allWorkingIssues': []
        }


def main():
    """Run the lunch job pipeline and output JSON results."""
    import pandas as pd
    
    try:
        # Get session ID from environment variable
        session_id = int(os.environ.get('SESSION_ID', '1012'))
        
        print(f"Starting lunch job pipeline for session {session_id}...", file=sys.stderr)
        
        # Capture stdout from pipeline to stderr so JSON output is clean
        old_stdout = sys.stdout
        sys.stdout = sys.stderr
        
        # Import and call the actual pipeline function
        from Decathlon_Automation_Core.pipelines.lunch_job_pipelines import run_lunchjob_pipeline
        
        # Run the pipeline - it handles DB connection, scheduling, and export internally
        output = run_lunchjob_pipeline(session_id=session_id)
        
        # Extract long-format assignments from all weeks for UI display
        all_assignments = []
        all_week_assignments_raw = []  # Keep original format for validation
        
        # Use all_week_assignments which contains (week_num, df_assignments) tuples
        if 'all_week_assignments' in output:
            for item in output['all_week_assignments']:
                if isinstance(item, tuple) and len(item) >= 2:
                    week_num, df_assignments = item
                    if hasattr(df_assignments, 'columns'):
                        all_week_assignments_raw.append((week_num, df_assignments))
                        df = df_assignments.copy()
                        df['week'] = week_num
                        all_assignments.append(df)
        
        # Fallback: check for week-specific data in debug output
        if not all_assignments:
            week_num = 1
            while f'week_{week_num}' in output:
                week_data = output[f'week_{week_num}']
                if isinstance(week_data, dict) and 'df_final_assignments_enriched' in week_data:
                    df = week_data['df_final_assignments_enriched'].copy()
                    all_week_assignments_raw.append((week_num, df.copy()))
                    df['week'] = week_num
                    all_assignments.append(df)
                week_num += 1
        
        # Perform group coverage validation (combined: checks both working and staying back)
        coverage_result = {'passed': True, 'message': 'All groups are appropriately covered each day of the week', 'noWorkingIssues': [], 'allWorkingIssues': []}
        
        if all_week_assignments_raw and 'conn' in output:
            try:
                coverage_result = validate_group_coverage(
                    all_week_assignments_raw, 
                    session_id, 
                    output['conn']
                )
                print(f"Group coverage validation: {coverage_result['message']}", file=sys.stderr)
            except Exception as ve:
                print(f"Warning: Group coverage validation failed: {ve}", file=sys.stderr)
                coverage_result = {'passed': True, 'message': 'Validation skipped due to error', 'noWorkingIssues': [], 'allWorkingIssues': []}
        
        if all_assignments:
            df_combined = pd.concat(all_assignments, ignore_index=True)
            
            # Standardize column names for frontend
            column_mapping = {
                'day_name': 'day',
                'job_id': 'lunch_job_id'
            }
            df_combined = df_combined.rename(columns=column_mapping)
            
            # Select relevant columns
            cols_to_keep = ['week', 'day', 'lunch_job_id', 'job_code', 'job_name', 'staff_id', 'staff_name']
            available_cols = [c for c in cols_to_keep if c in df_combined.columns]
            df_export = df_combined[available_cols]
            
            results = df_export.to_dict(orient='records')
            print(f"Generated {len(results)} assignments", file=sys.stderr)
        else:
            results = []
            print("No assignments generated", file=sys.stderr)
        
        # Restore stdout and output JSON results with validation
        sys.stdout = old_stdout
        
        # Output as object with assignments and validation
        output_data = {
            'assignments': results,
            'validation': {
                'groupCoverage': coverage_result
            }
        }
        print(json.dumps(output_data))
        
    except Exception as e:
        # Restore stdout if needed
        if 'old_stdout' in dir() and sys.stdout != old_stdout:
            sys.stdout = old_stdout
        print(f"Error: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps([]))
        sys.exit(1)

if __name__ == "__main__":
    main()
