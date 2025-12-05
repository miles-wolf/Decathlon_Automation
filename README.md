# Decathlon Automation

Automated lunch job assignment system for camp staff scheduling and workload balancing.

---

## Overview

This project automates the assignment of lunch-time an am pm for camp staff based on roles, groupings, A/B schedules, and custom rules. It replaces manual scheduling by using deterministic rules combined with intelligent randomization.

For lunch-time jobs the system supports:
- Pattern-based assignments (A/B rotation)
- Hardcoded staff/game/tie-dye assignments
- Randomized job balancing for fairness
- JSON-driven configuration

For am-pm jobs the system supports:
- WORK IN PROGERSS

---

## Features
Lunch time jobs:

- ✅ A/B schedule balancing by staff group
- ✅ Hardcoded job overrides
- ✅ Staff game auto-assignment
- ✅ Tie dye pattern-day assignments
- ✅ Random lunch job balancing
- ✅ PostgreSQL/Supabase integration
- ✅ JSON configuration support
- ✅ Debug mode with step-by-step DataFrames

---

## Project Structure
```bash
Decathlon_Automation/
├── config/
├── connections/
├── helpers/
├── pipelines/
├── notebooks/
```
---

## Requirements
This Project requires:
Python 3.9+

The following python libraries:
- `psycopg2-binary`
- `pandas`
- `numpy`

---
## Configuration

### 1. Database Credentials

Create a JSON file in the following location:
config/readonly_creds.json


Example:

```json
{
  "db_name": "postgres",
  "user": "read_only_user",
  "password": "your_password",
  "host": "your_host",
  "port": "5432"
}
```
### 2. Lunch Job Configuration





Structure:

Config files are broken down by week and are located in

```bash
Decathlon_Automation/config/lunchjob_inputs/
├── test/
│   ├── week1.json
│   ├── week2.json
├── session100/
│   ├── week1.json
│   ├── week2.json
│   ├── week3.json
```


Example File:



