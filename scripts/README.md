# Assignment Scripts Directory

This directory contains Python scripts for job assignment algorithms.

## How to Use

1. Place your Python assignment scripts in this directory
2. Your scripts should:
   - Read staff and job data from the PostgreSQL database
   - Perform assignment logic
   - Write assignment results back to the database

## Database Access

Your scripts have access to the database via environment variables:
- `DATABASE_URL` - Full PostgreSQL connection string
- `PGHOST` - Database host
- `PGPORT` - Database port
- `PGDATABASE` - Database name
- `PGUSER` - Database user
- `PGPASSWORD` - Database password
- `ASSIGNMENT_TYPE` - Type of assignment being run ("lunchtime", "am", or "pm")

## Example Script Structure

```python
import os
import psycopg2

# Connect to database
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

# Get assignment type
assignment_type = os.environ.get('ASSIGNMENT_TYPE', 'lunchtime')

# Read staff and jobs
cur.execute("SELECT * FROM staff")
staff = cur.fetchall()

cur.execute("SELECT * FROM jobs WHERE job_type = %s", (assignment_type,))
jobs = cur.fetchall()

# Your assignment logic here
# ...

# Write assignments back to database
for assignment in assignments:
    cur.execute(
        "INSERT INTO assignments (staff_id, job_id, assignment_type, assignment_date) VALUES (%s, %s, %s, NOW())",
        (assignment['staff_id'], assignment['job_id'], assignment_type)
    )

conn.commit()
cur.close()
conn.close()

print(f"Successfully created {len(assignments)} assignments")
```

## Notes

- Scripts must have a `.py` extension
- Only scripts in this directory can be executed for security reasons
- Use relative paths from this directory (e.g., `lunchtime_assignment.py`)
