#!/usr/bin/env python3
"""
Wrapper script to run the Decathlon AM/PM job pipeline from the server.
This script imports and uses the actual pipeline function from Decathlon_Automation_Core.
"""
import sys
import os
import json

# Add parent directory to path to import Decathlon_Automation_Core modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

def main():
    """Run the AM/PM job pipeline and output JSON results."""
    import pandas as pd
    
    try:
        # Get session ID from environment variable
        session_id = int(os.environ.get('SESSION_ID', '1012'))
        
        print(f"Starting AM/PM job pipeline for session {session_id}...", file=sys.stderr)
        
        # Capture stdout from pipeline to stderr so JSON output is clean
        old_stdout = sys.stdout
        sys.stdout = sys.stderr
        
        # Import and call the actual pipeline function
        from Decathlon_Automation_Core.pipelines.ampm_job_pipelines import run_ampmjob_pipeline
        
        # Run the pipeline - it handles DB connection, scheduling, and export internally
        df_assignments = run_ampmjob_pipeline(session_id=session_id)
        
        print(f"Generated {len(df_assignments)} assignments", file=sys.stderr)
        
        # Convert to JSON for output
        results = df_assignments.to_dict(orient='records')
        
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
