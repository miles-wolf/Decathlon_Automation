# Adding the Decathlon Logo to Google Sheets

## Setup Instructions

To enable the logo feature in your AM/PM Jobs and Lunchtime Jobs Google Sheets, you need to save the logo image file:

### Step 1: Save the Logo Image

1. **Right-click** on the Decathlon Sports Club logo image shown in the chat
2. Select **"Save image as..."**
3. Save it with the filename: `decathlon_logo.png`
4. Save it to this directory: `Decathlon_Automation_Core/assets/decathlon_logo.png`

The full path should be:
```
c:\Users\mltsw\OneDrive\Desktop\Decathlon\Decathlon_Automation\Decathlon_Automation_Core\assets\decathlon_logo.png
```

### Step 2: Run Your Pipelines

Once the logo is saved, the next time you run either:
- **AM/PM Jobs Pipeline** (`run_ampm_jobs_pipeline.py`)
- **Lunchtime Jobs Pipeline** (`run_lunch_jobs_pipeline.py`)

The logo will automatically be added to the bottom-left corner of the generated Google Sheet.

## How It Works

The logo functionality has been added to both pipeline helpers:

1. **[ampm_job_helpers.py](../helpers/ampm_job_helpers.py)** - Adds logo to AM/PM Jobs sheet
2. **[lunch_job_helpers.py](../helpers/lunch_job_helpers.py)** - Adds logo to Lunchtime Jobs sheet

The logo will be:
- Positioned in the **bottom-left corner** of the sheet
- Placed **below all data and legend** content
- Automatically sized to **200 pixels tall**
- Uploaded to Google Drive and displayed using the `=IMAGE()` formula

## Troubleshooting

If the logo doesn't appear:

1. **Verify the file exists** at the correct path
2. **Check the filename** is exactly `decathlon_logo.png` (lowercase, with .png extension)
3. **Look for warning messages** in the pipeline output - they will indicate if the logo file wasn't found
4. **Check permissions** - ensure the Google service account has Drive access (the code will request this automatically)

The logo upload is designed to be **non-blocking**, meaning if it fails for any reason, your pipeline will still complete successfully - you'll just see a warning message.

## Technical Details

The logo is uploaded to Google Drive using the service account credentials (from environment variables or credentials.json), then embedded in the sheet using the Google Sheets `=IMAGE()` formula. This approach ensures:

- The logo appears properly in the sheet
- It scales correctly
- It can be viewed by anyone with access to the sheet
- It doesn't interfere with existing data or formatting
