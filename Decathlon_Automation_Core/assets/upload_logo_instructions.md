# Logo Setup Instructions

Since service accounts can't upload to Google Drive, you need to host the logo at a public URL.

## Option 1: Upload to Imgur (Easiest)

1. Go to https://imgur.com/upload
2. Upload `decathlon_logo.png`
3. Right-click the uploaded image → "Copy image address"
4. You'll get a URL like: `https://i.imgur.com/xxxxxxx.png`

## Option 2: Upload to GitHub (Best for projects)

1. Go to your GitHub repository (or create a new one)
2. Create an `assets` folder
3. Upload `decathlon_logo.png` to the assets folder
4. Click on the uploaded image
5. Click "Raw" button
6. Copy the URL (like: `https://raw.githubusercontent.com/username/repo/main/assets/decathlon_logo.png`)

## Option 3: Upload to Google Drive (Manual sharing)

1. Upload `decathlon_logo.png` to Google Drive
2. Right-click → Share → "Anyone with the link can view"
3. Copy the sharing link (format: `https://drive.google.com/file/d/FILE_ID/view`)
4. Convert to direct link format: `https://drive.google.com/uc?id=FILE_ID`

## Configure the Logo URL

After uploading, add the URL to your `credentials.json`:

```json
{
  "google_service_account": { ... },
  "google_sheets": { ... },
  "logo_url": "YOUR_PUBLIC_LOGO_URL_HERE"
}
```

**OR** set as an environment variable:
```bash
DECATHLON_LOGO_URL=YOUR_PUBLIC_LOGO_URL_HERE
```

## Test It

Run your pipeline again:
```bash
python scripts/run_ampm_jobs_pipeline.py
```

The logo should now appear in the bottom-left corner!
