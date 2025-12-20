# Camp Job Assignment Tools - Summary

## Overview
Two automated tools designed to optimize and streamline staff assignment for camp activities, replacing manual scheduling processes with intelligent, constraint-based automation.

---

## 1. AM/PM Job Assignment Tool

### Purpose
Automatically assigns counselors and junior counselors to morning and afternoon jobs (e.g., Field Lining, Equipment, Wake-Up, Tuck-In) for an entire camp session.

### Inputs
- **Session Configuration (JSON)**: Job requirements, hardcoded assignments, custom constraints, staff additions/removals
- **Database Data**: Staff roster with attributes (role, group, physical strength, experience, preferences)
- **Job Definitions**: Job requirements including min/max staff counts and priority levels

### Core Logic & Decision Making
1. **Load Staff Pool**: Retrieves all eligible counselors and junior counselors for the session
2. **Apply Manual Overrides**: Processes hardcoded assignments (staff who MUST be on specific jobs)
3. **Filter Eligible Staff**: Removes unavailable staff and applies custom constraints
4. **Smart Assignment Algorithm**:
   - Prioritizes high-priority jobs first
   - Balances workload across all staff members
   - Considers staff attributes (e.g., assigns physically strong staff to Field Lining)
   - Respects preferences when possible
   - Ensures fair distribution of desirable vs. less desirable jobs
5. **Validation**: Ensures all jobs meet minimum staffing requirements

### Outputs
- **CSV Export**: Complete assignment list (staff name, job, role, group)
- **Google Sheets Upload**: Formatted schedule with color coding and organized by job
- **Summary Statistics**: Staffing counts per job, validation confirmations

### Key Capabilities
- Handles 20+ different AM/PM jobs simultaneously
- Processes 50+ staff members in seconds
- Guarantees minimum staffing requirements are met
- Balances workload to prevent over-assignment
- Flexible override system for special circumstances
- Instant updates to Google Sheets for camp-wide visibility

---

## 2. Lunchtime Job Assignment Tool

### Purpose
Creates weekly lunch job schedules for counselors and junior counselors, managing complex multi-week rotations while ensuring critical jobs (like Counselor Activity) are properly staffed with the right role mix.

### Inputs
- **Session Configuration (JSON)**: Multi-week setup with pattern-based jobs (Monday/Wednesday vs. Tuesday/Thursday), custom assignments, staff pattern preferences
- **Database Data**: Staff roster, lunch jobs, role requirements, day definitions
- **Job Rules**: Normal staffing levels, pattern assignments (A-days vs. B-days), protected jobs

### Core Logic & Decision Making
1. **Multi-Week Processing**: Handles up to 4 weeks per session with independent configurations
2. **Pattern-Based Assignment**: 
   - Assigns staff to either A-pattern (Mon/Wed) or B-pattern (Tue/Thu)
   - Ensures consistency across weeks unless explicitly changed
3. **Critical Job Protection**:
   - **Counselor Activity**: Locks 1 counselor + 1 junior counselor per day (cannot be reassigned)
   - Excludes staff already assigned to protected jobs (Tie Dye, Arts & Crafts, Card Trading)
   - Fills remaining slots to reach normal staffing levels
4. **Intelligent Balancing**:
   - Tracks total assignments per staff member across all weeks
   - Prevents overloading while ensuring fair distribution
   - Respects both pattern preferences and custom constraints
5. **Special Job Handling**:
   - Staff Game: Auto-assigns all unassigned staff
   - Tie Dye: Ensures minimum 2 staff, adds more if needed
6. **Validation Loops**: Multiple checkpoints verify role mix requirements and staffing levels
   - Group coverage: ensures at least staff is assigned to each pattern for each group so there's always someone with the kids

### Outputs
- **Long-Format CSV**: Day-by-day schedule for database integration
- **Wide-Format CSV**: Week-by-week grid view (staff as rows, days as columns)
- **Google Sheets Upload**: Formatted schedule with:
  - Section headers (Counselors: Monday/Wednesday, etc.)
  - Color-coded job assignments (CA=green, TD=orange, CT=red)
  - Bold text for jobs, regular text for names
  - Friday placeholder columns as week separators
  - Abbreviated day headers (M, T, W, Th, F)

### Key Capabilities
- Processes 4+ weeks in a single run
- Manages 50+ staff across 10+ different lunch jobs
- Guarantees critical role coverage (counselor + JC on Counselor Activity)
- Prevents scheduling conflicts and over-assignment
- Maintains pattern consistency across weeks
- Generates production-ready schedules in under 30 seconds
- Automatic Google Sheets formatting for immediate distribution

---

## Technical Advantages

### Automation Benefits
- **Speed**: What takes hours manually happens in seconds
- **Accuracy**: Eliminates human error in counting and balancing
- **Consistency**: Applies the same fair logic every time
- **Flexibility**: Easy to adjust rules via JSON configuration files
- **Transparency**: Full audit trail of assignment decisions
- **Scalability**: Handles sessions of any size without additional effort

### Integration
- **Database-Connected**: Pulls live staff data from PostgreSQL
- **Google Sheets Integration**: Instant publishing with professional formatting
- **Version Control**: JSON configurations can be saved, shared, and versioned
- **Reproducible**: Same inputs always produce same outputs

### Maintenance
- **Self-Documenting**: Clear variable names and comprehensive logging
- **Modular Design**: Easy to update individual components
- **Error Handling**: Validates inputs and provides clear error messages
- **Extensible**: New jobs or rules can be added without rewriting core logic

---

## Business Value

**Time Savings**: Reduces hours of manual scheduling per session to under 5 minutes  
**Error Reduction**: Eliminates counting mistakes, missed assignments, and unfair distributions  
**Staff Satisfaction**: Fair, transparent assignment process builds trust  
**Operational Efficiency**: Camp directors can focus on camper experience instead of spreadsheets  
**Adaptability**: Quick adjustments for last-minute changes (staff callouts, job additions)  

---

## Requirements
- Python 3.x environment
- PostgreSQL database connection
- Google Sheets API access (service account)
- JSON configuration files (templates provided)
