# Lunch Job Session File Structure

## File Naming Convention

**New Format:** `lunchjob_session_{session_id}.json`
- Example: `lunchjob_session_1012.json`

**Location:** `config/lunchjob_inputs/run_{session_id}/`

## JSON Structure

```json
{
  "session_id": 1012,
  "week_1": {
    "pattern_based_jobs": {
        "1001": [1047, 1141],
        "1009": [1095, 1053]
    },
    "staff_game_days": [],
    "tie_dye_days": [],
    "tie_dye_staff": [],
    "staff_to_remove": [],
    "staff_to_add": [],
    "custom_job_assignments": {
      "all_days": {},
      "specific_days": []
    },
    "debug": false,
    "verbose": false
  },
  "week_2": {
    "pattern_based_jobs": {
        "1001": [1047, 1141],
        "1009": [1095, 1053]
    },
    "staff_game_days": [],
    "tie_dye_days": ["Tuesday", "Wednesday"],
    "tie_dye_staff": [],
    "staff_to_remove": [],
    "staff_to_add": [],
    "custom_job_assignments": {
      "all_days": {},
      "specific_days": []
    },
    "debug": false,
    "verbose": false
  },
  "week_3": {
    ...
  },
  "week_4": {
    ...
  }
}
```

## Key Points

- **Single file per session** instead of multiple files per week
- Top-level `session_id` field
- Each week is a separate key: `week_1`, `week_2`, `week_3`, etc.
- Week configuration structure **remains the same** as before
- All functionality preserved

## Migration from Old Format

**Old Format:**
- `lunchjob_week_1.json`
- `lunchjob_week_2.json`

**New Format:**
- Single `lunchjob_session_1012.json` containing all weeks

To migrate:
1. Create new `lunchjob_session_{id}.json` file
2. Add `"session_id": {id}` at top level
3. Move week_1.json content into `"week_1": {...}`
4. Move week_2.json content into `"week_2": {...}`
5. Continue for all weeks
