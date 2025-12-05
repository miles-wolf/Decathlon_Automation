import sys
import os

# Go up one level from the current file path to find the project root
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Add project root to sys.path if not already there
if project_root not in sys.path:
    sys.path.append(project_root)

import pandas as pd
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# =============================================================================
# CONFIGURATION
# =============================================================================

# Path to your service account credentials JSON file
SERVICE_ACCOUNT_FILE = os.path.join(project_root, 'config', 'google_cloud_credentials.json')

# The ID of your Google Spreadsheet (from the URL)
SPREADSHEET_ID = '1WFWFo55mfQlyto-SBnAcFOqUIt_kyvaHdpcjamBzXb4'

# The name of the sheet tab you want to format
SHEET_NAME = 'Lunchtime Job Schedule'

# CSV file to upload
CSV_FILE = 'lunch_job_schedule_wide.csv'

# =============================================================================
# COLOR DEFINITIONS (Based on your schedule)
# =============================================================================

# Define colors in RGB format (0-1 scale)
COLORS = {
    # Green - Counselor Activity
    'CA': {'red': 0.7, 'green': 0.95, 'blue': 0.7},
    
    # Red - Card Trading
    'CT': {'red': 0.95, 'green': 0.5, 'blue': 0.5},
    
    # Orange - Tie Dye
    'TD': {'red': 1.0, 'green': 0.8, 'blue': 0.4},
}

# =============================================================================
# GOOGLE SHEETS API FUNCTIONS
# =============================================================================

def authenticate_google_sheets():
    """Authenticate with Google Sheets API using service account."""
    SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
    
    creds = Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    
    service = build('sheets', 'v4', credentials=creds)
    return service


def upload_csv_to_sheet(service, spreadsheet_id, sheet_name, csv_file):
    """Upload CSV data to Google Sheet."""
    # Read CSV file
    df = pd.read_csv(csv_file)
    
    # Replace NaN values with empty strings
    df = df.fillna('')
    
    # Convert DataFrame to list of lists for Google Sheets API
    values = [df.columns.tolist()] + df.values.tolist()
    
    # Clear existing data
    try:
        service.spreadsheets().values().clear(
            spreadsheetId=spreadsheet_id,
            range=f"{sheet_name}!A1:ZZ"
        ).execute()
    except HttpError:
        # Sheet might not exist, create it
        create_sheet(service, spreadsheet_id, sheet_name)
    
    # Upload data
    body = {'values': values}
    result = service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_name}!A1",
        valueInputOption='RAW',
        body=body
    ).execute()
    
    print(f"Uploaded {result.get('updatedCells')} cells to {sheet_name}")
    return len(values), len(values[0])


def create_sheet(service, spreadsheet_id, sheet_name):
    """Create a new sheet tab if it doesn't exist."""
    request_body = {
        'requests': [{
            'addSheet': {
                'properties': {
                    'title': sheet_name
                }
            }
        }]
    }
    
    try:
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body=request_body
        ).execute()
        print(f"Created new sheet: {sheet_name}")
    except HttpError as e:
        print(f"Sheet might already exist: {e}")


def get_sheet_id(service, spreadsheet_id, sheet_name):
    """Get the sheet ID for a given sheet name."""
    sheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = sheet_metadata.get('sheets', [])
    
    for sheet in sheets:
        if sheet['properties']['title'] == sheet_name:
            return sheet['properties']['sheetId']
    
    return None


def apply_conditional_formatting(service, spreadsheet_id, sheet_name, num_rows, num_cols):
    """Apply color coding based on cell values."""
    sheet_id = get_sheet_id(service, spreadsheet_id, sheet_name)
    
    if sheet_id is None:
        print(f"Could not find sheet: {sheet_name}")
        return
    
    # Get existing conditional format rules
    sheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = sheet_metadata.get('sheets', [])
    
    requests = []
    
    # First, delete all existing conditional formatting rules
    for sheet in sheets:
        if sheet['properties']['sheetId'] == sheet_id:
            existing_rules = sheet.get('conditionalFormats', [])
            for i in range(len(existing_rules)):
                requests.append({
                    'deleteConditionalFormatRule': {
                        'sheetId': sheet_id,
                        'index': 0  # Always delete the first rule until all are gone
                    }
                })
            break
    
    # Add conditional formatting rules for each activity type
    for activity, color in COLORS.items():
        requests.append({
            'addConditionalFormatRule': {
                'rule': {
                    'ranges': [{
                        'sheetId': sheet_id,
                        'startRowIndex': 1,  # Skip header row
                        'endRowIndex': num_rows,
                        'startColumnIndex': 0,
                        'endColumnIndex': num_cols
                    }],
                    'booleanRule': {
                        'condition': {
                            'type': 'TEXT_EQ',
                            'values': [{'userEnteredValue': activity}]
                        },
                        'format': {
                            'backgroundColor': color
                        }
                    }
                },
                'index': 0
            }
        })
    
    # Execute batch update
    if requests:
        body = {'requests': requests}
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body=body
        ).execute()
        print(f"Applied {len(requests)} conditional formatting rules")


def merge_header_rows(service, spreadsheet_id, sheet_name, num_rows, num_cols):
    """Merge cells for section headers (COUNSELORS/JUNIOR COUNSELORS rows)."""
    sheet_id = get_sheet_id(service, spreadsheet_id, sheet_name)
    
    if sheet_id is None:
        print(f"Could not find sheet: {sheet_name}")
        return
    
    # Read the data to find header rows
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_name}!A1:{chr(64 + num_cols)}{num_rows}"
    ).execute()
    values = result.get('values', [])
    
    requests = []
    
    # Find rows that contain header text
    for row_idx, row in enumerate(values):
        if row and ('COUNSELORS:' in str(row[0]) or 'JUNIOR COUNSELORS:' in str(row[0])):
            # Merge this row across all columns
            requests.append({
                'mergeCells': {
                    'range': {
                        'sheetId': sheet_id,
                        'startRowIndex': row_idx,
                        'endRowIndex': row_idx + 1,
                        'startColumnIndex': 0,
                        'endColumnIndex': num_cols
                    },
                    'mergeType': 'MERGE_ALL'
                }
            })
    
    if requests:
        body = {'requests': requests}
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body=body
        ).execute()
        print(f"Merged {len(requests)} header rows")


def apply_cell_formatting(service, spreadsheet_id, sheet_name, num_rows, num_cols):
    """Apply general formatting: borders, alignment, font size, etc."""
    sheet_id = get_sheet_id(service, spreadsheet_id, sheet_name)
    
    if sheet_id is None:
        print(f"Could not find sheet: {sheet_name}")
        return
    
    requests = [
        # Format header row
        {
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 0,
                    'endRowIndex': 1,
                    'startColumnIndex': 0,
                    'endColumnIndex': num_cols
                },
                'cell': {
                    'userEnteredFormat': {
                        'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 0.9},
                        'textFormat': {
                            'bold': True,
                            'fontSize': 10
                        },
                        'horizontalAlignment': 'CENTER',
                        'verticalAlignment': 'MIDDLE'
                    }
                },
                'fields': 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
        },
        # Center align all cells
        {
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 1,
                    'endRowIndex': num_rows,
                    'startColumnIndex': 0,
                    'endColumnIndex': num_cols
                },
                'cell': {
                    'userEnteredFormat': {
                        'horizontalAlignment': 'CENTER',
                        'verticalAlignment': 'MIDDLE',
                        'textFormat': {
                            'fontSize': 9
                        }
                    }
                },
                'fields': 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
            }
        },
        # Add borders to all cells
        {
            'updateBorders': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 0,
                    'endRowIndex': num_rows,
                    'startColumnIndex': 0,
                    'endColumnIndex': num_cols
                },
                'top': {
                    'style': 'SOLID',
                    'width': 1,
                    'color': {'red': 0, 'green': 0, 'blue': 0}
                },
                'bottom': {
                    'style': 'SOLID',
                    'width': 1,
                    'color': {'red': 0, 'green': 0, 'blue': 0}
                },
                'left': {
                    'style': 'SOLID',
                    'width': 1,
                    'color': {'red': 0, 'green': 0, 'blue': 0}
                },
                'right': {
                    'style': 'SOLID',
                    'width': 1,
                    'color': {'red': 0, 'green': 0, 'blue': 0}
                }
            }
        },
        # Set column width
        {
            'updateDimensionProperties': {
                'range': {
                    'sheetId': sheet_id,
                    'dimension': 'COLUMNS',
                    'startIndex': 0,
                    'endIndex': num_cols
                },
                'properties': {
                    'pixelSize': 150
                },
                'fields': 'pixelSize'
            }
        },
        # Freeze header row
        {
            'updateSheetProperties': {
                'properties': {
                    'sheetId': sheet_id,
                    'gridProperties': {
                        'frozenRowCount': 1
                    }
                },
                'fields': 'gridProperties.frozenRowCount'
            }
        }
    ]
    
    body = {'requests': requests}
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body=body
    ).execute()
    print("Applied cell formatting (borders, alignment, header styling)")


# =============================================================================
# MAIN EXECUTION
# =============================================================================

def main():
    """Main function to upload and format the schedule."""
    try:
        # Authenticate
        print("Authenticating with Google Sheets API...")
        service = authenticate_google_sheets()
        
        # Upload CSV data
        print(f"Uploading data from {CSV_FILE}...")
        num_rows, num_cols = upload_csv_to_sheet(service, SPREADSHEET_ID, SHEET_NAME, CSV_FILE)
        
        # Merge header rows
        print("Merging header rows...")
        merge_header_rows(service, SPREADSHEET_ID, SHEET_NAME, num_rows, num_cols)
        
        # Apply formatting
        print("Applying cell formatting...")
        apply_cell_formatting(service, SPREADSHEET_ID, SHEET_NAME, num_rows, num_cols)
        
        # Apply color coding
        print("Applying color coding...")
        apply_conditional_formatting(service, SPREADSHEET_ID, SHEET_NAME, num_rows, num_cols)
        
        print("\n✓ Successfully formatted Google Sheet!")
        print(f"View your sheet: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}")
        
    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()
