# Decathlon Automation

Automated lunch job and AM/PM job assignment system for camp staff scheduling and workload balancing.

---

## Overview

This project automates the assignment of lunch-time and AM/PM jobs for camp staff based on roles, groupings, A/B schedules, and custom rules. It replaces manual scheduling by using deterministic rules combined with intelligent randomization.

### Lunch-Time Jobs
- Pattern-based assignments (A/B rotation)
- Hardcoded staff/game/tie-dye assignments
- Randomized job balancing for fairness
- JSON-driven configuration
- Multi-week scheduling support

### AM/PM Jobs
- Random assignment based on job capacity (min/normal/max staff)
- Priority-based job filling
- Automatic staff distribution
- Google Sheets export with formatting

---

## Features

### Lunch Time Jobs
- ✅ A/B schedule balancing by staff group
- ✅ Hardcoded job overrides
- ✅ Staff game auto-assignment
- ✅ Tie dye pattern-day assignments
- ✅ Random lunch job balancing
- ✅ Multi-week consistency
- ✅ PostgreSQL/Supabase integration
- ✅ JSON configuration support
- ✅ Debug mode with step-by-step DataFrames

### AM/PM Jobs
- ✅ Random assignment respecting job capacity
- ✅ Minimum/normal/maximum staff per job
- ✅ Priority-based job filling
- ✅ CSV export to `exports/` folder
- ✅ Google Sheets integration

---

## Project Structure
```bash
Decathlon_Automation/
├── config/
│   ├── credentials.json          # Database and Google Sheets credentials
│   └── lunchjob_inputs/          # Weekly lunch job configurations
│       └── session_XXXX/
│           ├── week1.json
│           ├── week2.json
│           └── ...
├── connections/
│   └── db_connections.py         # Database connection utilities
├── helpers/
│   ├── lunch_job_helpers.py      # Lunch job assignment logic
│   └── ampm_job_helpers.py       # AM/PM job assignment logic
├── pipelines/
│   ├── lunch_job_pipelines.py    # Main lunch job pipeline
│   └── ampm_job_pipelines.py     # Main AM/PM job pipeline
├── exports/                       # Auto-generated exports
│   ├── lunch_job_schedule.csv
│   ├── lunch_job_schedule_wide.csv
│   └── ampm_job_assignments.csv
├── notebooks/                     # Development/testing notebooks
└── readme/                        # Documentation
```

---

## Requirements

**Python 3.9+**

**Required Python Libraries:**
```bash
pip install psycopg2-binary pandas numpy google-auth google-auth-oauthlib google-api-python-client
```

---

## Configuration

### 1. Credentials

Create `config/credentials.json`:

```json
{
  "google_service_account": {
    "type": "service_account",
    "project_id": "your-project-id",
    "private_key_id": "key-id",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    "client_email": "your-service-account@project.iam.gserviceaccount.com",
    "client_id": "client-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/...",
    "universe_domain": "googleapis.com"
  },
  "google_sheets": {
    "spreadsheet_id": "your-spreadsheet-id-from-url"
  },
  "database": {
    "db_name": "postgres",
    "user": "read_only_user",
    "password": "your_password",
    "host": "your_host",
    "port": "5432"
  }
}
```

### 2. Lunch Job Configuration

Create weekly JSON configuration files in `config/lunchjob_inputs/session_XXXX/`:

```bash
config/lunchjob_inputs/
├── test_1012/
│   ├── lunchjob_week1.json
│   ├── lunchjob_week2.json
└── session_1234/
    ├── week1.json
    ├── week2.json
    └── week3.json
```

**Example Week Configuration:**
```json
{
  "session_id": 1012,
  "pattern_based_jobs": {
    "1001": [101, 102],
    "1002": [103, 104]
  },
  "staff_game_days": ["monday", "wednesday"],
  "tie_dye_days": ["tuesday"],
  "tie_dye_staff": [105, 106],
  "staff_to_remove": [],
  "staff_to_add": [],
  "custom_job_assignments": {
    "all_days": {}
  },
  "debug": false,
  "verbose": false
}
```

---

## Usage

### Lunch Job Assignments

Run the lunch job pipeline:
```bash
python pipelines/lunch_job_pipelines.py
```

**Outputs:**
- `exports/lunch_job_schedule.csv` - Full session schedule (long format)
- `exports/lunch_job_schedule_wide.csv` - Multi-week schedule (staff as rows, days as columns)
- Google Sheets tab: "Lunchtime Job Schedule" (with color coding)

**Configuration:**
- Edit `SESSION_ID` in `lunch_job_pipelines.py`
- The pipeline automatically finds the matching configuration directory

### AM/PM Job Assignments

Run the AM/PM job pipeline:
```bash
python pipelines/ampm_job_pipelines.py
```

**Outputs:**
- `exports/ampm_job_assignments.csv` - Staff assignments with job instructions
- Google Sheets tab: "AM/PM Jobs"

**Configuration:**
- Edit `SESSION_ID` in `ampm_job_pipelines.py`
- No JSON configuration needed (uses database job definitions)

---

## Google Sheets Integration

### Setup

1. **Create Google Cloud Project** at [Google Cloud Console](https://console.cloud.google.com/)
2. **Enable Google Sheets API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API" and enable it
3. **Create Service Account**:
   - Go to "APIs & Services" > "Credentials"
   - Create Credentials > Service Account
   - Download the JSON key file
   - Copy the service account details to `config/credentials.json`
4. **Share Your Google Sheet**:
   - Open your Google Sheet
   - Click "Share"
   - Add the service account email (from credentials.json)
   - Give it "Editor" permissions
   - Copy the spreadsheet ID from the URL and add to `credentials.json`

### Features

**Lunch Job Schedule:**
- Color-coded job assignments (customizable in `lunch_job_helpers.py`)
- Merged header rows for section titles
- Frozen header row
- Auto-sized columns
- Clean borders and alignment

**AM/PM Jobs:**
- Wrapped text in instructions column
- Color-coded header
- Auto-sized columns
- Clean formatting

---

## Development

### Debug Mode

Enable debug mode in lunch job configurations:
```json
{
  "debug": true,
  "verbose": true
}
```

This returns all intermediate DataFrames for inspection.

### Adding Custom Logic

**Lunch Jobs:** Edit `helpers/lunch_job_helpers.py`
- Modify pattern assignment logic
- Add custom hardcoded rules
- Adjust balancing algorithms

**AM/PM Jobs:** Edit `helpers/ampm_job_helpers.py`
- Modify assignment strategy
- Add priority rules
- Implement partial session support (coming soon)

---

## Future Enhancements

- [ ] AM/PM partial session support (multiple staff per job slot)
- [ ] Advanced AM/PM assignment logic (skill-based, preference-based)
- [ ] Web interface for configuration
- [ ] Real-time schedule updates
- [ ] Email notifications

---

## Troubleshooting

**Database Connection Issues:**
- Verify credentials in `config/credentials.json`
- Check network access to database host
- Ensure read-only user has proper permissions

**Google Sheets Upload Fails:**
- Verify service account has Editor access to the sheet
- Check spreadsheet_id is correct
- Ensure Google Sheets API is enabled in Google Cloud Console

**Missing Exports:**
- The `exports/` folder is created automatically
- Check console output for error messages
- Verify write permissions in project directory

---

## Additional Documentation

See `readme/` folder for:
- `GOOGLE_SHEETS_SETUP.md` - Detailed Google Sheets API setup guide
- `README_OLD.md` - Original README for reference

---

## License

Internal use only - Decathlon Camp Staff Scheduling



