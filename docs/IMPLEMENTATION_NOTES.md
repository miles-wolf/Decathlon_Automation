# Implementation Notes

## Overview

This document describes the implementation details for the Decathlon Sports Camp Director Tools web application. The system provides modular utilities for camp directors to manage staff job assignments for lunchtime and AM/PM shifts.

## Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack Query (React Query) for server state
- **UI Components**: Shadcn UI + Radix UI primitives
- **Styling**: Tailwind CSS

### Backend (Node.js + Express)
- **Runtime**: Node.js with Express.js
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Python Integration**: Child process spawning for assignment algorithms

### External Integrations
- **Supabase**: External PostgreSQL database for eligible staff data
- **Google Sheets**: Output destination for assignment results
- **Google Service Account**: Authentication for Sheets API

## Key Components

### 1. Credential Management

All credentials are loaded from environment variables. No hardcoded values or JSON credential files.

**File**: `Decathlon_Automation_Core/connections/db_connections.py`

```python
def load_db_read_creds():
    """Load Supabase database credentials from environment variables."""
    return {
        'host': os.environ.get('SUPABASE_DB_HOST'),
        'user': os.environ.get('SUPABASE_DB_USER'),
        'password': os.environ.get('SUPABASE_DB_PASSWORD'),
        'db_name': 'postgres',
        'port': '5432'
    }

def load_google_creds():
    """Load Google service account credentials from environment variables."""
    return {
        'type': 'service_account',
        'project_id': os.environ.get('GOOGLE_SERVICE_ACCOUNT_PROJECT_ID'),
        'private_key': os.environ.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'),
        # ... other fields
    }
```

### 2. External Database API Endpoints

**File**: `server/routes.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/external-db/sessions` | GET | Fetch available session IDs |
| `/api/external-db/eligible-staff/:sessionId` | GET | Fetch eligible staff for session |
| `/api/external-db/lunch-jobs` | GET | Fetch lunch job definitions |
| `/api/external-db/ampm-jobs` | GET | Fetch AM/PM job definitions |

These endpoints spawn the Python script `scripts/get_eligible_staff.py` which connects to Supabase.

### 3. Python Script Integration

**File**: `scripts/get_eligible_staff.py`

The script supports multiple actions:
- `sessions`: List available session IDs
- `eligible-staff`: Get staff for a specific session
- `lunch-jobs`: Get all lunch job definitions
- `ampm-jobs`: Get all AM/PM job definitions

Usage:
```bash
python3 scripts/get_eligible_staff.py sessions
python3 scripts/get_eligible_staff.py eligible-staff --session-id 1012
```

### 4. Lunchtime Job Assigner

**File**: `client/src/pages/LunchtimeJobs.tsx`

Features:
- Session selection from external database
- Multi-week configuration with tabs
- Staff Game Days selection
- Tie Dye Days selection
- Staff exclusion (remove from assignment pool)
- Add custom staff not in database
- JSON configuration download
- Google Sheets integration link

Configuration JSON structure:
```json
{
  "session_id": 1012,
  "pattern_based_jobs": {},
  "staff_game_days": ["thursday"],
  "tie_dye_days": [],
  "tie_dye_staff": [],
  "staff_to_remove": [1115, 1171],
  "staff_to_add": [
    {"staff_id": 9000, "staff_name": "John Doe", "group_id": 1000}
  ],
  "custom_job_assignments": {
    "all_days": {},
    "specific_days": []
  },
  "debug": false,
  "verbose": false
}
```

### 5. AM/PM Job Assigner

**File**: `client/src/pages/AMPMJobs.tsx`

Simplified interface for before/after camp job assignments:
- Session selection
- Single "Generate Assignments" button (no AM/PM toggle)
- CSV download
- Google Sheets link

### 6. Assignment History

**File**: `client/src/pages/History.tsx`

Tracks all assignment runs with:
- Timestamp
- Run type (lunchtime/ampm)
- Session
- Week number
- Status (success/failed/running)
- Result count
- Link to Google Sheets

**Database Table**: `assignment_runs`

### 7. File Manager

**File**: `client/src/pages/UploadLists.tsx`

Marked as "Coming Soon" - file upload functionality to be implemented.

## Environment Variables

### Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `SESSION_SECRET` | Session secret for authentication |

### Supabase (External Database)

| Variable | Description |
|----------|-------------|
| `SUPABASE_DB_HOST` | Supabase PostgreSQL host |
| `SUPABASE_DB_USER` | Database user |
| `SUPABASE_DB_PASSWORD` | Database password |

### Google Service Account

| Variable | Description |
|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_PROJECT_ID` | GCP project ID |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID` | Private key ID |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Private key (RSA format) |
| `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL` | Service account email |
| `GOOGLE_SERVICE_ACCOUNT_CLIENT_ID` | Client ID |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Target spreadsheet ID |

## Session Display Format

Sessions are displayed with a human-readable format:
- `1012` → "Session 1 - 2025"
- `1015` → "Session 2 - 2025"

## Database Schema

Key tables:
- `users`: Authentication
- `staff`: Staff member records
- `jobs`: Job definitions
- `assignments`: Staff-to-job mappings
- `assignment_runs`: History of script executions

## Testing

The application includes data-testid attributes on all interactive elements for automated testing:
- `button-back`: Back navigation
- `select-session`: Session dropdown
- `button-generate`: Generate assignments
- `tab-week-1`, `tab-week-2`: Week tabs
- etc.

## Future Enhancements

1. Connect Python pipelines for actual assignment generation
2. Real-time log streaming during script execution
3. File upload functionality for custom staff/job lists
4. Tabbed layout with Summary, Table Preview, and Logs views
