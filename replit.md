# Decathlon Automation

## Overview

Decathlon Automation is a staff scheduling system for camp operations that automates lunch job and AM/PM job assignments. The system replaces manual scheduling by using deterministic rules, pattern-based rotations, and randomized balancing to ensure fair workload distribution among camp staff.

The project handles two main scheduling domains:
- **Lunch Jobs**: A/B rotation patterns, staff game assignments, tie-dye scheduling, and custom overrides
- **AM/PM Jobs**: Capacity-based job assignments with priority filling and min/normal/max staff constraints

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Pattern
The system follows a layered architecture with clear separation of concerns:

1. **Connections Layer** (`connections/`) - Database connectivity and credential management
2. **Helpers Layer** (`helpers/`) - SQL generation, business logic, and utility functions
3. **Pipelines Layer** (`pipelines/`) - Orchestration of data flows and job assignment processes
4. **Config Layer** (`config/`) - JSON-driven configuration for session-specific inputs

### Data Flow
- Configuration is loaded from JSON files organized by session ID
- Database queries retrieve staff, jobs, roles, and group information
- Helper functions apply business rules (A/B patterns, hardcoded assignments, random balancing)
- Pipelines coordinate the full workflow and produce final DataFrames
- Results export to CSV and optionally to Google Sheets with formatting

### Configuration Structure
Session-specific inputs are stored in directories like:
- `config/lunchjob_inputs/test_{session_id}/` - Weekly lunch job configs
- `config/ampmjob_inputs/session_{session_id}/` - AM/PM job configs

Each config supports:
- Pattern-based job assignments (staff rotation)
- Hardcoded overrides for specific staff-job pairs
- Staff additions/removals for the session
- Day-specific custom assignments

### Database Schema
The system uses PostgreSQL with a `camp` schema containing:
- `job` table - Job definitions with type (lunch/am-pm), capacity limits, priority
- `role` table - Staff role definitions
- `group` table - Staff grouping for A/B schedule balancing
- Session-based staff eligibility queries

### Debug Mode
The lunch job system supports a debug flag that returns intermediate DataFrames at each processing step for troubleshooting.

## External Dependencies

### Database
- **PostgreSQL** via Supabase - Primary data store for jobs, staff, roles, and groups
- **psycopg2** - Python PostgreSQL adapter for database connections
- Credentials stored in `config/credentials.json` (not committed to repo)

### Google Integration
- **Google Sheets API** - Export formatted schedules with color coding
- **google-auth** and **google-api-python-client** - Service account authentication
- Requires service account JSON credentials and spreadsheet sharing configuration

### Python Libraries
- **pandas** - DataFrame manipulation for schedule processing
- **numpy** - Numerical operations for randomization and balancing
- **random** - Fair job distribution algorithms

### Data Export
- CSV export to `exports/` folder for local storage
- Google Sheets integration for team visibility with automatic formatting