# 🍽️ Lunch Job Assignment Generator (PostgreSQL / psycopg2)

**Author:** Kavin Mudaliar  
**Last Updated:** October 20, 2025  

---

## 🧩 Overview

This script connects to a **PostgreSQL (Supabase)** database, builds a **fully parameterized SQL query** to generate lunch job assignments, executes it, and returns the results as a **pandas DataFrame**.

It’s designed for programmatic use — whether in Jupyter, a backend service, or as a foundation for an AI agent to dynamically generate and run queries.

---

## ⚙️ Core Functions

### 1. `connect_to_postgres()`
Establishes a PostgreSQL connection using `psycopg2`.

**Returns:**  
A tuple of `(connection, cursor)` objects used to execute SQL commands.

**Example:**
```python
conn, cur = connect_to_postgres(db_name, user, password, host, port)
```

---

### 2. `build_values_section_dicts()`
Builds the `VALUES (...)` section of a SQL query from a list of dictionaries.

Uses `cursor.mogrify()` for **safe parameter interpolation**, ensuring proper escaping and preventing SQL injection.

**Example:**
```python
assignments = [
    {"staff_id": 1141, "job_id": 1001},
    {"staff_id": 1177, "job_id": 1009}
]
values_section = build_values_section_dicts(cur, assignments, ["staff_id", "job_id"])
```

Result:
```sql
(1141,1001),
(1177,1009)
```

---

### 3. `generate_lunch_job_sql()`
Generates the final SQL string for the **lunch job assignment logic**.  
This query is built using multiple **CTEs (WITH clauses)** to:

- Define hardcoded manual job assignments  
- Create a weekday list (Mon–Thu by default)  
- Identify eligible staff  
- Randomly distribute jobs per day  
- Overlay manual assignments  
- Produce a final combined table of results  

Internally uses `cursor.mogrify()` to inline parameters such as `session_id` and `days`.

**Example:**
```python
sql_str = generate_lunch_job_sql(cur, assignments, session_id=1015)
```

---

## 🧠 How It Works

1. **Lines 184–189:**  
   Connect to the database using `connect_to_postgres()`.

2. **Lines 198–201:**  
   Generate the full SQL string using `generate_lunch_job_sql()`, execute it, and load the results into a pandas DataFrame.

**Example Output:**

| day      | lunch_job_id | job_name       | job_code | staff_id | staff_name |
|-----------|---------------|----------------|-----------|-----------|-------------|
| monday    | 1001          | Arts & Crafts  | AC        | 1141      | John Doe    |
| monday    | 1009          | Card Trading   | CT        | 1177      | Sarah Lee   |
| tuesday   | 1021          | MULTI          | ML        | 1027      | Alex Kim    |

---

## 🚀 Example Usage

```python
from lunch_jobs_v2 import connect_to_postgres, generate_lunch_job_sql
import pandas as pd

# Connect to the database
conn, cur = connect_to_postgres(
    db_name="postgres",
    db_user="shop_analyst.ffnhexmowaiglsmmbycm",
    db_password="infinity",
    db_host="aws-0-us-west-1.pooler.supabase.com",
    db_port="5432"
)

# Define manual job assignments
assignments = [
    {"staff_id": 1141, "job_id": 1001},
    {"staff_id": 1177, "job_id": 1009},
    {"staff_id": 1027, "job_id": 1021},
]

# Generate and run the SQL
sql_str = generate_lunch_job_sql(cur, assignments, session_id=1015)
df = pd.read_sql(sql_str, conn)

print(df.head())
```

---

## 🧱 Dependencies

Install the required packages before running the script:

```bash
pip install psycopg2-binary pandas
```

---

## 🔒 Security & Deployment Notes

⚠️ **Do NOT hardcode credentials** in production environments.

- Move credentials into **environment variables** or a `.env` file  
- Use **Supabase’s pooled port (6543)** for webapp deployments  
- Set `sslmode=require` for encrypted connections  
- Limit privileges to a least-access role (e.g., read-only or restricted schema)  
- Close cursors and connections after use

---

## 🧩 Recommended Extension (Optional)

If your friend or team intends to use this in a **webapp or API**, wrap the logic in a helper such as:

```python
def get_lunch_job_assignments(...):
    conn, cur = connect_to_postgres(...)
    sql_str = generate_lunch_job_sql(cur, assignments, session_id)
    df = pd.read_sql(sql_str, conn)
    return df
```

or return a JSON object instead of a DataFrame for frameworks like **FastAPI** or **Flask**.

This structure makes it easy for an AI agent or service to call dynamically and return structured results.

---

## 🧾 Summary

✅ Safe query building using `mogrify()`  
✅ Clean, modular structure  
✅ Easy integration with pandas or APIs  
✅ Ready for Supabase/Postgres environments  
✅ Extendable for webapp or backend usage  

---

## 📁 Project Structure

```
lunch_jobs_v2.py      # main script with all functions and example usage
README.md             # this documentation
```

---

## ✨ Credits
Developed by **Kavin Mudaliar**  
For internal use and demonstration of parameterized SQL construction with psycopg2.
