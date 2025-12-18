# Decathlon Sports Camp Director Tools

## Overview

This is an internal administrative tool for managing Decathlon Sports Camp operations. The application provides modular utilities for camp directors to handle staff management, job assignments, and scheduling through a clean, efficient interface. Built as a full-stack web application, it emphasizes functional clarity and streamlined workflows for administrative tasks.

The system is designed around a card-based navigation pattern where each tool functions independently, allowing for incremental feature expansion while maintaining simplicity and usability.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18+ with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and caching

**UI System**
- Shadcn UI component library (New York style variant) built on Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens
- Design philosophy: Linear-inspired minimalism emphasizing functional clarity over decoration
- Responsive approach: Desktop-first with tablet optimization
- Dark/light theme support with system preferences integration

**State Management**
- Client-side theme state managed via React Context (ThemeProvider)
- Server state cached and synchronized through TanStack Query
- Form state handled by React Hook Form with Zod validation

**Component Structure**
- Atomic design pattern with reusable UI components in `/client/src/components/ui`
- Page-level components in `/client/src/pages`
- Shared utilities in `/client/src/lib`
- Custom hooks in `/client/src/hooks`

### Backend Architecture

**Runtime & Framework**
- Node.js with Express.js for RESTful API endpoints
- TypeScript throughout for type safety
- ESM module system

**API Design**
- RESTful endpoints under `/api` namespace
- File upload handling via Multer (in-memory storage)
- CSV/Excel parsing for bulk data imports (csv-parse, xlsx libraries)
- Health check endpoint for monitoring

**Server Organization**
- Route registration in `server/routes.ts`
- Database abstraction layer in `server/storage.ts`
- Database connection management in `server/db.ts`
- Development-only Vite middleware integration

**Python Script Integration**
- Support for external Python scripts for job assignment algorithms
- Scripts access database via environment variables (no hardcoded credentials)
- Script execution managed through Node.js child processes
- Scripts located in `/scripts` directory
- Python automation modules in `/Decathlon_Automation_Core` (from GitHub repo)

**External Database Integration (Supabase)**
- External Supabase PostgreSQL database for eligible staff data (df_eligible_staff)
- Credentials loaded from environment variables via `db_connections.py`
- API endpoints for querying external database:
  - `GET /api/external-db/sessions` - Available session IDs
  - `GET /api/external-db/eligible-staff/:sessionId` - Eligible staff for session
  - `GET /api/external-db/lunch-jobs` - Lunch job definitions
  - `GET /api/external-db/ampm-jobs` - AM/PM job definitions

### Data Storage

**Database**
- PostgreSQL database accessed via Neon serverless driver
- Drizzle ORM for type-safe database queries and schema management
- Schema defined in `shared/schema.ts` with co-located Zod validation schemas

**Data Model**
- `users`: Authentication and user management
- `staff`: Staff member records (imported from CSV/Excel)
- `jobs`: Job definitions with type classification (lunchtime, AM, PM)
- `uploaded_files`: File upload tracking and metadata
- `assignments`: Staff-to-job assignment mappings with timestamps

**Schema Management**
- Drizzle Kit for migrations (output to `/migrations`)
- Push-based deployment workflow (`npm run db:push`)

### Authentication & Authorization

Currently structured for future implementation:
- User schema exists with username/password fields
- Session management infrastructure in place (connect-pg-simple for PostgreSQL sessions)
- No active authentication enforcement (to be implemented)

## External Dependencies

### Core Dependencies

**Database & ORM**
- `@neondatabase/serverless`: Neon PostgreSQL serverless driver with WebSocket support
- `drizzle-orm`: Type-safe ORM layer
- `drizzle-kit`: Schema migration toolkit
- `connect-pg-simple`: PostgreSQL session store

**File Processing**
- `multer`: Multipart form data handling for file uploads
- `csv-parse`: CSV file parsing
- `xlsx`: Excel file reading and writing

**Frontend Libraries**
- `@tanstack/react-query`: Server state management
- `@radix-ui/*`: 25+ headless UI component primitives
- `react-hook-form`: Form state management
- `@hookform/resolvers`: Form validation integration
- `zod`: Runtime type validation and schema definitions
- `wouter`: Lightweight routing
- `date-fns`: Date manipulation utilities

**UI Utilities**
- `tailwindcss`: Utility-first CSS framework
- `class-variance-authority`: Type-safe variant generation
- `clsx` & `tailwind-merge`: Conditional className merging
- `cmdk`: Command palette component
- `lucide-react`: Icon library

**Development Tools**
- `@replit/vite-plugin-*`: Replit-specific development enhancements
- `tsx`: TypeScript execution for development server
- `esbuild`: Production build bundling

### Environment Configuration

**Required Variables**
- `DATABASE_URL`: PostgreSQL connection string (Neon serverless)
- `NODE_ENV`: Environment mode (development/production)
- `SESSION_SECRET`: Session secret for authentication

**External Database (Supabase) Variables**
- `SUPABASE_DB_HOST`: Supabase PostgreSQL host
- `SUPABASE_DB_USER`: Supabase database user
- `SUPABASE_DB_PASSWORD`: Supabase database password

**Google Service Account Variables**
- `GOOGLE_SERVICE_ACCOUNT_PROJECT_ID`: GCP project ID
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID`: Private key ID
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: Private key (RSA format)
- `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL`: Service account email
- `GOOGLE_SERVICE_ACCOUNT_CLIENT_ID`: Client ID
- `GOOGLE_SHEETS_SPREADSHEET_ID`: Target Google Sheets spreadsheet ID

**Python Script Variables** (injected during execution)
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`: Database credentials
- `SESSION_ID`: Current session being processed
- `TIME_SLOT`: Job time slot (am/pm)
- `DAYS`: JSON array of days to process

### Build & Deployment

**Scripts**
- `dev`: Development server with hot reload
- `build`: Production build (Vite frontend + esbuild backend)
- `start`: Production server
- `check`: TypeScript type checking
- `db:push`: Push database schema changes

**Static Assets**
- Frontend builds to `dist/public`
- Backend bundles to `dist`
- Font loading from Google Fonts (Inter family)