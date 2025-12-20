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
        
        # Use all_week_assignments which contains (week_num, df_assignments) tuples
        if 'all_week_assignments' in output:
            for item in output['all_week_assignments']:
                if isinstance(item, tuple) and len(item) >= 2:
                    week_num, df_assignments = item
                    if hasattr(df_assignments, 'columns'):
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
                    df['week'] = week_num
                    all_assignments.append(df)
                week_num += 1
        
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
        
        # Restore stdout and output JSON results
        sys.stdout = old_stdout
        print(json.dumps(results))
        
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
