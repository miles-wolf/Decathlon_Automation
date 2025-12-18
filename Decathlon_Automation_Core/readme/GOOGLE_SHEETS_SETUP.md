# Google Sheets Automatic Formatting

This script automatically uploads your lunch job schedule CSV to Google Sheets and applies color coding and formatting.

## Setup Instructions

### 1. Install Required Packages

```bash
pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client pandas
```

### 2. Set Up Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing one)
3. Enable the Google Sheets API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

### 3. Create Service Account Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details and click "Create"
4. Skip the optional permissions steps
5. Click on the newly created service account
6. Go to the "Keys" tab
7. Click "Add Key" > "Create New Key"
8. Choose "JSON" format
9. Save the downloaded JSON file securely
10. Update the `SERVICE_ACCOUNT_FILE` path in `format_google_sheets.py`

### 4. Share Your Google Sheet

1. Create or open your Google Sheet
2. Click "Share" button
3. Add the service account email (found in your JSON file, looks like `your-service-account@project-id.iam.gserviceaccount.com`)
4. Give it "Editor" permissions
5. Copy the Spreadsheet ID from the URL (the long string between `/d/` and `/edit`)
6. Update the `SPREADSHEET_ID` in `format_google_sheets.py`

### 5. Configure the Script

Edit `format_google_sheets.py` and update these variables:

```python
SERVICE_ACCOUNT_FILE = 'path/to/your/service-account-credentials.json'
SPREADSHEET_ID = 'your-spreadsheet-id-here'
SHEET_NAME = 'Lunchtime Job Schedule'  # Change if needed
CSV_FILE = 'lunch_job_schedule_wide.csv'  # Your CSV file
```

### 6. Customize Colors (Optional)

The script includes color definitions based on your schedule. You can modify the `COLORS` dictionary to adjust:

```python
COLORS = {
    'GAGA 1': {'red': 1.0, 'green': 0.8, 'blue': 0.4},  # Orange
    'CA': {'red': 0.7, 'green': 0.95, 'blue': 0.7},     # Light green
    'SUB': {'red': 0.95, 'green': 0.5, 'blue': 0.5},    # Red
    # Add more activities...
}
```

RGB values are on a 0-1 scale (not 0-255).

## Usage

### Run the Full Pipeline with Formatting

```bash
cd pipelines
python lunch_job_pipelines.py  # Generate the CSV
python format_google_sheets.py  # Upload and format in Google Sheets
```

### Or Run Just the Formatting

```bash
python format_google_sheets.py
```

## Features

The script will:
- ✓ Upload your CSV data to Google Sheets
- ✓ Apply color coding to activities (GAGA 1, CA, SUB, etc.)
- ✓ Add borders to all cells
- ✓ Center-align all content
- ✓ Format header row with bold text and gray background
- ✓ Freeze the header row
- ✓ Auto-resize columns to fit content

## Troubleshooting

**"File not found" error:**
- Make sure the path to your service account JSON file is correct
- Use absolute paths or paths relative to where you run the script

**"Permission denied" error:**
- Verify you shared the Google Sheet with the service account email
- Check that you gave "Editor" permissions

**"Sheet not found" error:**
- The script will create the sheet if it doesn't exist
- Make sure the `SHEET_NAME` matches your desired sheet tab name

**Colors not applying:**
- Check that activity names in your CSV match exactly (case-sensitive)
- Verify RGB values are between 0 and 1

## Integration with Existing Pipeline

You can integrate this into your existing pipeline by adding it to the end of `lunch_job_pipelines.py`:

```python
# At the end of lunch_job_pipelines.py
from pipelines import format_google_sheets

# After exporting to CSV
print("\nUploading to Google Sheets and applying formatting...")
format_google_sheets.main()
```
