"""
Test script to verify page height settings work correctly with varying amounts of data.
Runs the AM/PM jobs pipeline multiple times with different staff configurations.
"""
import sys
import os
import json
from pathlib import Path

# Add project root to path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if project_root not in sys.path:
    sys.path.append(project_root)

from connections import db_connections as dbc
from helpers import ampm_job_helpers as apjh


def load_config(session_id):
    """Load the current config file for the session."""
    base_dir = Path(__file__).resolve().parents[1]
    ampmjob_inputs_dir = base_dir / "config" / "ampmjob_inputs"
    
    # Find directory with session_id
    matching_dirs = [d for d in ampmjob_inputs_dir.iterdir()
                     if d.is_dir() and str(session_id) in d.name]
    
    if not matching_dirs:
        raise FileNotFoundError(f"No directory found for session {session_id}")
    
    directory = matching_dirs[0]
    config_file = directory / "ampmjob_inputs.json"
    
    if not config_file.exists():
        raise FileNotFoundError(f"Config file not found: {config_file}")
    
    with open(config_file, 'r') as f:
        return json.load(f), config_file


def save_config(config, config_file):
    """Save the modified config back to file."""
    with open(config_file, 'w') as f:
        json.dump(config, f, indent=2)


def run_test_scenario(conn, cur, session_id, scenario_name, staff_to_remove):
    """Run pipeline with specific staff configuration."""
    print("\n" + "="*100)
    print(f"TEST SCENARIO: {scenario_name}")
    print("="*100)
    
    # Load and modify config
    config, config_file = load_config(session_id)
    original_remove_list = config.get('staff_to_remove', [])
    
    # Update staff_to_remove
    config['staff_to_remove'] = staff_to_remove
    save_config(config, config_file)
    
    print(f"Removing {len(staff_to_remove)} staff members")
    
    try:
        # Run the pipeline
        df_assignments = apjh.build_ampm_job_assignments(conn, cur, session_id=session_id)
        
        # Count rows that will be in the sheet
        num_assignments = len(df_assignments)
        num_sheet_rows = num_assignments + 2  # +1 for title, +1 for header
        
        print(f"\n{'─'*100}")
        print(f"RESULTS: {scenario_name}")
        print(f"{'─'*100}")
        print(f"Total assignments: {num_assignments}")
        print(f"Total sheet rows: {num_sheet_rows} (title + header + {num_assignments} data rows)")
        print(f"Staff removed: {len(staff_to_remove)}")
        
        # Provide analysis on how this fits on pages
        # Assuming FIRST_PAGE_HEIGHT_PX = 1165, SUBSEQUENT_PAGE_HEIGHT_PX = 1165
        # Title = 60px, Header = 40px, Data rows = variable (30-70px each)
        
        print(f"\nPage break analysis:")
        print(f"  - This scenario will help verify page breaks align correctly")
        print(f"  - Check Google Sheets Print Preview to confirm thick borders at page bottoms")
        
        return df_assignments
        
    finally:
        # Restore original config
        config['staff_to_remove'] = original_remove_list
        save_config(config, config_file)


def main():
    """Run all test scenarios."""
    session_id = 1015
    
    print("\n" + "="*100)
    print("PAGE HEIGHT TESTING - VARYING DATA VOLUMES")
    print("="*100)
    print(f"Session ID: {session_id}")
    print(f"\nThis script will run the AM/PM jobs pipeline with different staff configurations")
    print(f"to verify that page height settings (1165px) work correctly across various data volumes.")
    
    # Connect to database
    creds = dbc.load_db_read_creds()
    conn, cur = dbc.connect_to_postgres(
        creds['db_name'], creds['user'], creds['password'],
        creds['host'], creds['port']
    )
    
    try:
        # Load original config to get staff names
        config, _ = load_config(session_id)
        
        # Get eligible staff from database to create removal lists
        eligible_staff_sql = apjh.get_eligible_staff_sql(cur, session_id=session_id)
        import pandas as pd
        df_staff = pd.read_sql(eligible_staff_sql, conn)
        all_staff_ids = df_staff['staff_id'].tolist()
        
        print(f"\nFound {len(all_staff_ids)} eligible staff members")
        print(f"We'll create scenarios by removing different numbers of staff\n")
        
        # Test scenarios with different staff counts
        scenarios = [
            {
                'name': 'BASELINE - All Staff',
                'remove_count': 0,
                'description': 'Maximum data volume - all eligible staff assigned'
            },
            {
                'name': 'REDUCED - Remove 10 Staff',
                'remove_count': 10,
                'description': 'Medium-high data volume'
            },
            {
                'name': 'REDUCED - Remove 20 Staff',
                'remove_count': 20,
                'description': 'Medium data volume'
            },
            {
                'name': 'REDUCED - Remove 30 Staff',
                'remove_count': 30,
                'description': 'Medium-low data volume'
            },
            {
                'name': 'MINIMAL - Remove 40 Staff',
                'remove_count': 40,
                'description': 'Minimum data volume test'
            }
        ]
        
        results = []
        
        for scenario in scenarios:
            remove_count = scenario['remove_count']
            
            # Create removal list (take first N staff IDs)
            staff_to_remove = all_staff_ids[:remove_count] if remove_count > 0 else []
            
            try:
                df = run_test_scenario(
                    conn, cur, session_id,
                    scenario['name'],
                    staff_to_remove
                )
                
                results.append({
                    'scenario': scenario['name'],
                    'description': scenario['description'],
                    'staff_removed': remove_count,
                    'total_rows': len(df) + 2,  # +title +header
                    'assignments': len(df),
                    'status': '✓ Success'
                })
                
            except Exception as e:
                print(f"\n❌ ERROR in scenario '{scenario['name']}': {e}")
                results.append({
                    'scenario': scenario['name'],
                    'description': scenario['description'],
                    'staff_removed': remove_count,
                    'status': f'✗ Failed: {str(e)}'
                })
        
        # Print summary
        print("\n\n" + "="*100)
        print("TEST SUMMARY - PAGE HEIGHT VERIFICATION")
        print("="*100)
        
        for result in results:
            print(f"\n{result['scenario']}")
            print(f"  {result['description']}")
            print(f"  Staff removed: {result.get('staff_removed', 'N/A')}")
            if 'total_rows' in result:
                print(f"  Sheet rows: {result['total_rows']} ({result['assignments']} assignments)")
            print(f"  Status: {result['status']}")
        
        print("\n" + "="*100)
        print("NEXT STEPS:")
        print("="*100)
        print("1. Open the Google Sheets for each test run")
        print("2. Go to File → Print (or Ctrl+P)")
        print("3. Verify that thick borders appear at the bottom of each printed page")
        print("4. If borders are misaligned, adjust FIRST_PAGE_HEIGHT_PX and SUBSEQUENT_PAGE_HEIGHT_PX")
        print("5. The last run restored your original configuration")
        print("="*100)
        
    finally:
        conn.close()


if __name__ == "__main__":
    main()
