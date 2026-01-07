import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import multer from "multer";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { insertStaffSchema, insertJobSchema } from "@shared/schema";
import { spawn } from "child_process";
import path from "path";

// Configure multer for file uploads (store in memory)
const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ========== File Upload Endpoints ==========

  // Upload staff list (CSV or Excel)
  app.post("/api/files/upload/staff", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      let records: any[] = [];

      // Parse file based on type
      if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
        // Parse CSV
        const fileContent = file.buffer.toString("utf-8");
        records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } else if (
        file.mimetype ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.originalname.endsWith(".xlsx") ||
        file.originalname.endsWith(".xls")
      ) {
        // Parse Excel
        const workbook = XLSX.read(file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        records = XLSX.utils.sheet_to_json(worksheet);
      } else {
        return res.status(400).json({ error: "Unsupported file type. Please upload CSV or Excel files." });
      }

      // Validate all records first before deleting existing data
      const validatedRecords = [];
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
          const staffData = {
            firstName: record.first_name || record.firstName || "",
            lastName: record.last_name || record.lastName || "",
            age: record.age ? parseInt(record.age) : null,
            gender: record.gender || null,
            yearsAtCamp: record.years_at_camp || record.yearsAtCamp ? parseInt(record.years_at_camp || record.yearsAtCamp) : null,
            physicalStrength: record.physical_strength || record.physicalStrength ? parseInt(record.physical_strength || record.physicalStrength) : null,
            extrovertedLevel: record.extroverted_level || record.extrovertedLevel ? parseInt(record.extroverted_level || record.extrovertedLevel) : null,
            fieldLiningPref: (() => {
              const val = record.field_lining_pref ?? record.fieldLiningPref;
              if (val === null || val === undefined || val === '') return null;
              if (val === true || val === 'true' || val === 1 || val === '1') return true;
              if (val === false || val === 'false' || val === 0 || val === '0') return false;
              return null;
            })(),
          };
          // Validate
          const validated = insertStaffSchema.parse(staffData);
          validatedRecords.push(validated);
        } catch (error: any) {
          return res.status(400).json({ 
            error: `Validation failed for record ${i + 1}: ${error.message}`,
            record: record 
          });
        }
      }

      // Only delete and insert after all records are validated
      await storage.deleteAllStaff();

      // Insert validated staff records into database
      for (const validated of validatedRecords) {
        await storage.createStaff(validated);
      }

      // Track the uploaded file
      const uploadedFile = await storage.createUploadedFile({
        fileName: file.originalname,
        fileType: "staff_list",
        originalName: file.originalname,
        fileSize: file.size,
        recordCount: records.length,
      });

      res.json({
        success: true,
        message: `Successfully uploaded ${records.length} staff records`,
        file: uploadedFile,
      });
    } catch (error: any) {
      console.error("Error uploading staff list:", error);
      res.status(500).json({ error: error.message || "Failed to upload staff list" });
    }
  });

  // Upload job list (CSV or Excel)
  app.post("/api/files/upload/jobs", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      let records: any[] = [];

      // Parse file based on type
      if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
        // Parse CSV
        const fileContent = file.buffer.toString("utf-8");
        records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } else if (
        file.mimetype ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.originalname.endsWith(".xlsx") ||
        file.originalname.endsWith(".xls")
      ) {
        // Parse Excel
        const workbook = XLSX.read(file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        records = XLSX.utils.sheet_to_json(worksheet);
      } else {
        return res.status(400).json({ error: "Unsupported file type. Please upload CSV or Excel files." });
      }

      // Validate all records first before deleting existing data
      const validatedRecords = [];
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
          const jobData = {
            code: record.code || record.job_code || "",
            name: record.name || record.job_name || "",
            type: record.type || record.job_type || "lunchtime",
            minStaffAssigned: record.min_staff_assigned || record.minStaffAssigned ? parseInt(record.min_staff_assigned || record.minStaffAssigned) : null,
            normalStaffAssigned: record.normal_staff_assigned || record.normalStaffAssigned ? parseInt(record.normal_staff_assigned || record.normalStaffAssigned) : null,
            maxStaffAssigned: record.max_staff_assigned || record.maxStaffAssigned ? parseInt(record.max_staff_assigned || record.maxStaffAssigned) : null,
            jobDescription: record.job_description || record.description || null,
            priority: record.priority ? parseInt(record.priority) : null,
          };
          // Validate
          const validated = insertJobSchema.parse(jobData);
          validatedRecords.push(validated);
        } catch (error: any) {
          return res.status(400).json({ 
            error: `Validation failed for record ${i + 1}: ${error.message}`,
            record: record 
          });
        }
      }

      // Only delete and insert after all records are validated
      await storage.deleteAllJobs();

      // Insert validated job records into database
      for (const validated of validatedRecords) {
        await storage.createJob(validated);
      }

      // Track the uploaded file
      const uploadedFile = await storage.createUploadedFile({
        fileName: file.originalname,
        fileType: "job_list",
        originalName: file.originalname,
        fileSize: file.size,
        recordCount: records.length,
      });

      res.json({
        success: true,
        message: `Successfully uploaded ${records.length} job records`,
        file: uploadedFile,
      });
    } catch (error: any) {
      console.error("Error uploading job list:", error);
      res.status(500).json({ error: error.message || "Failed to upload job list" });
    }
  });

  // ========== File Management Endpoints ==========

  // Get all uploaded files
  app.get("/api/files", async (_req, res) => {
    try {
      const files = await storage.getAllUploadedFiles();
      res.json(files);
    } catch (error: any) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  // Get files by type
  app.get("/api/files/type/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const files = await storage.getUploadedFilesByType(type);
      res.json(files);
    } catch (error: any) {
      console.error("Error fetching files by type:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  // Delete uploaded file
  app.delete("/api/files/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteUploadedFile(id);
      res.json({ success: true, message: "File deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // ========== Staff & Job Data Endpoints ==========

  // Get all staff
  app.get("/api/staff", async (_req, res) => {
    try {
      const staff = await storage.getAllStaff();
      res.json(staff);
    } catch (error: any) {
      console.error("Error fetching staff:", error);
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  // Get all jobs
  app.get("/api/jobs", async (_req, res) => {
    try {
      const jobs = await storage.getAllJobs();
      res.json(jobs);
    } catch (error: any) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get jobs by type
  app.get("/api/jobs/type/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const jobs = await storage.getJobsByType(type);
      res.json(jobs);
    } catch (error: any) {
      console.error("Error fetching jobs by type:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // ========== Python Script Execution Endpoints ==========

  // Execute Python script for job assignments
  app.post("/api/execute/assignment", async (req, res) => {
    try {
      const { assignmentType, scriptPath } = req.body;

      if (!scriptPath) {
        return res.status(400).json({ error: "Script path is required" });
      }

      // Basic validation: check if path looks reasonable
      if (!scriptPath.endsWith(".py")) {
        return res.status(400).json({ 
          error: "Invalid script path. Path must end with .py",
          details: "Only Python files are allowed."
        });
      }

      // Import fs and path modules
      const fs = await import("fs");
      const path = await import("path");
      
      // Define allowed script directory (can be configured via environment variable)
      // Defaults to a 'scripts' directory in the project root
      const allowedScriptRoot = process.env.ALLOWED_SCRIPT_ROOT || path.join(process.cwd(), "scripts");
      
      // Resolve the full path to prevent directory traversal
      const resolvedScriptPath = path.resolve(allowedScriptRoot, scriptPath);
      
      // Ensure the resolved path is still within the allowed directory
      if (!resolvedScriptPath.startsWith(path.resolve(allowedScriptRoot))) {
        return res.status(403).json({ 
          error: "Access denied",
          details: `Scripts must be located in the allowed directory: ${allowedScriptRoot}`,
          hint: "Place your Python scripts in the 'scripts' directory or set ALLOWED_SCRIPT_ROOT environment variable"
        });
      }

      // Check if file exists
      if (!fs.existsSync(resolvedScriptPath)) {
        return res.status(404).json({ 
          error: "Script file not found",
          details: `The file '${scriptPath}' does not exist in ${allowedScriptRoot}`,
          allowedDirectory: allowedScriptRoot,
          hint: "Make sure your script is placed in the allowed directory"
        });
      }

      console.log(`Executing Python script: ${resolvedScriptPath} for ${assignmentType} assignments`);

      // Execute Python script with database connection as environment variables
      const python = spawn("python3", [resolvedScriptPath], {
        env: {
          ...process.env,
          ASSIGNMENT_TYPE: assignmentType,
        },
        timeout: 60000, // 60 second timeout
      });

      let output = "";
      let errorOutput = "";

      python.stdout.on("data", (data) => {
        const text = data.toString();
        output += text;
        console.log(`[Python stdout]: ${text}`);
      });

      python.stderr.on("data", (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error(`[Python stderr]: ${text}`);
      });

      python.on("close", async (code) => {
        console.log(`Python script exited with code ${code}`);
        
        if (code !== 0) {
          console.error("Python script error:", errorOutput);
          return res.status(500).json({
            error: "Script execution failed",
            details: errorOutput || "Script exited with non-zero code",
            exitCode: code,
            stdout: output,
            stderr: errorOutput,
          });
        }

        // Fetch assignments after script execution
        const assignments = await storage.getAssignmentsByType(assignmentType);
        
        res.json({
          success: true,
          message: "Script executed successfully",
          output: output,
          stderr: errorOutput,
          exitCode: code,
          assignmentsCount: assignments.length,
          assignments: assignments,
        });
      });

      python.on("error", (error) => {
        console.error("Failed to start Python process:", error);
        res.status(500).json({
          error: "Failed to start Python process",
          details: error.message,
          hint: "Make sure python3 is installed and accessible"
        });
      });
    } catch (error: any) {
      console.error("Error executing Python script:", error);
      res.status(500).json({ 
        error: error.message || "Failed to execute script",
        details: "An unexpected error occurred while trying to execute the script"
      });
    }
  });

  // ========== Lunch Jobs Generation Endpoint ==========
  
  app.post("/api/execute/lunch-jobs", async (req, res) => {
    try {
      const { sessionId, weekConfigs } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required" });
      }

      // Import fs and path modules
      const fs = await import("fs");
      const pathModule = await import("path");
      
      // Define script path - use the pipeline wrapper script
      const scriptPath = pathModule.resolve(process.cwd(), "scripts", "run_lunch_jobs_pipeline.py");
      
      // Ensure the script exists
      if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ 
          error: "Script not found",
          details: `The lunch jobs pipeline script was not found. Please ensure scripts/run_lunch_jobs_pipeline.py exists.`
        });
      }

      // Create the run directory for this session's input configs
      // Use `run_{sessionId}` directory in the lunchjob_inputs folder
      const inputsBaseDir = pathModule.resolve(process.cwd(), "Decathlon_Automation_Core", "config", "lunchjob_inputs");
      const runDir = pathModule.join(inputsBaseDir, `run_${sessionId}`);
      
      // Clear existing directory to avoid stale files from previous runs
      if (fs.existsSync(runDir)) {
        const existingFiles = fs.readdirSync(runDir);
        for (const file of existingFiles) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(pathModule.join(runDir, file));
          }
        }
        console.log(`Cleared ${existingFiles.filter((f: string) => f.endsWith('.json')).length} existing config file(s) from ${runDir}`);
      } else {
        fs.mkdirSync(runDir, { recursive: true });
      }
      
      // Create combined session JSON file with all weeks
      // Format: { session_id: number, week_1: {...}, week_2: {...}, ... }
      const combinedConfig: Record<string, any> = {
        session_id: parseInt(sessionId, 10)
      };
      
      if (weekConfigs && Array.isArray(weekConfigs) && weekConfigs.length > 0) {
        console.log(`Creating combined session config with ${weekConfigs.length} week(s)...`);
        
        for (let i = 0; i < weekConfigs.length; i++) {
          const weekNum = i + 1;
          combinedConfig[`week_${weekNum}`] = weekConfigs[i];
          console.log(`  Added: week_${weekNum}`);
        }
      } else {
        // Default to week 1 config if no weekConfigs provided
        console.log("No weekConfigs provided, creating default week 1 config");
        const defaultConfig = {
          staff_game_days: [],
          tie_dye_days: [],
          tie_dye_staff: [],
          pattern_based_jobs: [],
          staff_to_remove: [],
          staff_to_add: [],
          arts_and_crafts_staff: [],
          card_trading_staff: [],
          custom_job_assignments: { all_days: [], specific_days: [] },
          debug: false,
          verbose: false
        };
        combinedConfig["week_1"] = defaultConfig;
        console.log(`  Added default: week_1`);
      }
      
      // Write the combined session file
      const sessionFilename = `lunchjob_session_${sessionId}.json`;
      const configPath = pathModule.join(runDir, sessionFilename);
      fs.writeFileSync(configPath, JSON.stringify(combinedConfig, null, 2));
      console.log(`Written combined session config: ${sessionFilename}`);

      // Prepare environment variables for the Python script
      // The pipeline uses SUPABASE_DB_* credentials (already in process.env)
      const scriptEnv = {
        ...process.env,
        SESSION_ID: sessionId.toString(),
        LUNCHJOB_INPUTS_DIR: runDir,  // Pass the specific directory to use
        PYTHONPATH: process.cwd(),
      };

      console.log(`Executing lunch jobs pipeline for session ${sessionId}...`);
      console.log(`Using inputs from: ${runDir}`);

      // Execute Python script
      const python = spawn("python3", [scriptPath], {
        env: scriptEnv,
        cwd: process.cwd(),
        timeout: 120000, // 2 minute timeout for complex pipeline
      });

      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("close", (code) => {
        console.log(`Python script exited with code ${code}`);
        console.log("STDOUT:", stdout);
        console.log("STDERR:", stderr);

        if (code !== 0) {
          return res.status(500).json({
            error: "Script execution failed",
            exitCode: code,
            stdout: stdout,
            stderr: stderr,
            details: stderr || "The Python script encountered an error"
          });
        }

        // Try to parse the results from stdout
        try {
          // The Python script should output JSON
          const results = JSON.parse(stdout);
          res.json({ success: true, results });
        } catch (parseError) {
          // If not JSON, return raw output
          res.json({ 
            success: true, 
            message: "Script executed successfully",
            output: stdout,
            results: []
          });
        }
      });

      python.on("error", (error) => {
        console.error("Error spawning Python process:", error);
        res.status(500).json({
          error: "Failed to execute script",
          details: error.message
        });
      });

    } catch (error: any) {
      console.error("Error in lunch jobs execution:", error);
      res.status(500).json({ 
        error: error.message || "Failed to execute lunch jobs script",
        details: "An unexpected error occurred"
      });
    }
  });

  // ========== AM/PM Jobs Generation Endpoint ==========
  
  app.post("/api/execute/ampm-jobs", async (req, res) => {
    try {
      const { 
        sessionId, 
        hardcodedJobAssignments, 
        customJobAssignments,
        staffToRemove,
        staffToAdd
      } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required" });
      }

      // Import fs module
      const fs = await import("fs");
      const pathModule = await import("path");
      
      // Define script path - use the pipeline wrapper script
      const scriptPath = pathModule.resolve(process.cwd(), "scripts", "run_ampm_jobs_pipeline.py");
      
      // Ensure the script exists
      if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ 
          error: "Script not found",
          details: `The AM/PM jobs pipeline script was not found. Please ensure scripts/run_ampm_jobs_pipeline.py exists.`
        });
      }

      // Create the session directory for input configs
      const inputsBaseDir = pathModule.resolve(process.cwd(), "Decathlon_Automation_Core", "config", "ampmjob_inputs");
      const sessionDir = pathModule.join(inputsBaseDir, `session_${sessionId}`);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      
      // Write the input config JSON file with all UI selections
      const configData = {
        session_id: sessionId,
        hardcoded_job_assignments: hardcodedJobAssignments || {},
        custom_job_assignments: customJobAssignments || {},
        staff_to_remove: staffToRemove || [],
        staff_to_add: staffToAdd || []
      };
      
      const configPath = pathModule.join(sessionDir, "ampmjob_inputs.json");
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
      console.log(`Written AM/PM job config to: ${configPath}`);

      // Prepare environment variables for the Python script
      // The pipeline uses SUPABASE_DB_* credentials (already in process.env)
      const scriptEnv = {
        ...process.env,
        SESSION_ID: sessionId.toString(),
        PYTHONPATH: process.cwd(),
      };

      console.log(`Executing AM/PM jobs pipeline for session ${sessionId}...`);

      // Execute Python script
      const python = spawn("python3", [scriptPath], {
        env: scriptEnv,
        cwd: process.cwd(),
        timeout: 120000, // 2 minute timeout for complex pipeline
      });

      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("close", (code) => {
        console.log(`AM/PM Python script exited with code ${code}`);
        console.log("STDOUT:", stdout);
        console.log("STDERR:", stderr);

        if (code !== 0) {
          return res.status(500).json({
            error: "Script execution failed",
            exitCode: code,
            stdout: stdout,
            stderr: stderr,
            details: stderr || "The Python script encountered an error"
          });
        }

        // Try to parse the results from stdout
        try {
          // The Python script should output JSON
          const results = JSON.parse(stdout);
          res.json({ success: true, results });
        } catch (parseError) {
          // If not JSON, return raw output
          res.json({ 
            success: true, 
            message: "Script executed successfully",
            output: stdout,
            results: []
          });
        }
      });

      python.on("error", (error) => {
        console.error("Error spawning Python process:", error);
        res.status(500).json({
          error: "Failed to execute script",
          details: error.message
        });
      });

    } catch (error: any) {
      console.error("Error in AM/PM jobs execution:", error);
      res.status(500).json({ 
        error: error.message || "Failed to execute AM/PM jobs script",
        details: "An unexpected error occurred"
      });
    }
  });

  // Create individual assignment
  app.post("/api/assignments", async (req, res) => {
    try {
      const { assignments, insertAssignmentSchema } = await import("@shared/schema");
      const validated = insertAssignmentSchema.parse(req.body);
      const [assignment] = await db.insert(assignments).values(validated).returning();
      res.json(assignment);
    } catch (error: any) {
      console.error("Error creating assignment:", error);
      res.status(500).json({ error: error.message || "Failed to create assignment" });
    }
  });

  // ========== Session Endpoints ==========
  
  // Get all sessions
  app.get("/api/sessions", async (_req, res) => {
    try {
      const { sessions } = await import("@shared/schema");
      const allSessions = await db.select().from(sessions);
      res.json(allSessions);
    } catch (error: any) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // Create a session
  app.post("/api/sessions", async (req, res) => {
    try {
      const { sessions, insertSessionSchema } = await import("@shared/schema");
      const validated = insertSessionSchema.parse(req.body);
      const [session] = await db.insert(sessions).values(validated).returning();
      res.json(session);
    } catch (error: any) {
      console.error("Error creating session:", error);
      res.status(500).json({ error: error.message || "Failed to create session" });
    }
  });

  // ========== Assignment Endpoints ==========

  // Get all assignments
  app.get("/api/assignments", async (_req, res) => {
    try {
      const assignments = await storage.getAllAssignments();
      res.json(assignments);
    } catch (error: any) {
      console.error("Error fetching assignments:", error);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  // Get assignments by type
  app.get("/api/assignments/type/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const assignments = await storage.getAssignmentsByType(type);
      res.json(assignments);
    } catch (error: any) {
      console.error("Error fetching assignments by type:", error);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  // Delete assignments by type and session
  app.delete("/api/assignments/type/:type/session/:sessionId", async (req, res) => {
    try {
      const { type, sessionId } = req.params;
      await storage.deleteAssignmentsByTypeAndSession(type, parseInt(sessionId));
      res.json({ success: true, message: `Deleted ${type} assignments for session ${sessionId}` });
    } catch (error: any) {
      console.error("Error deleting assignments:", error);
      res.status(500).json({ error: "Failed to delete assignments" });
    }
  });

  // Delete all assignments
  app.delete("/api/assignments", async (_req, res) => {
    try {
      await storage.deleteAllAssignments();
      res.json({ success: true, message: "All assignments deleted" });
    } catch (error: any) {
      console.error("Error deleting assignments:", error);
      res.status(500).json({ error: "Failed to delete assignments" });
    }
  });

  // ========== Assignment Runs History Endpoints ==========

  // Get all assignment runs
  app.get("/api/assignment-runs", async (_req, res) => {
    try {
      const { assignmentRuns } = await import("@shared/schema");
      const { desc } = await import("drizzle-orm");
      const runs = await db.select().from(assignmentRuns).orderBy(desc(assignmentRuns.executedAt)).limit(50);
      res.json(runs);
    } catch (error: any) {
      console.error("Error fetching assignment runs:", error);
      res.status(500).json({ error: "Failed to fetch assignment runs" });
    }
  });

  // Create an assignment run
  app.post("/api/assignment-runs", async (req, res) => {
    try {
      const { assignmentRuns, insertAssignmentRunSchema } = await import("@shared/schema");
      const validated = insertAssignmentRunSchema.parse(req.body);
      const [run] = await db.insert(assignmentRuns).values(validated).returning();
      res.json(run);
    } catch (error: any) {
      console.error("Error creating assignment run:", error);
      res.status(500).json({ error: error.message || "Failed to create assignment run" });
    }
  });

  // Update an assignment run
  app.patch("/api/assignment-runs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { assignmentRuns } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [run] = await db.update(assignmentRuns)
        .set(req.body)
        .where(eq(assignmentRuns.id, parseInt(id)))
        .returning();
      res.json(run);
    } catch (error: any) {
      console.error("Error updating assignment run:", error);
      res.status(500).json({ error: error.message || "Failed to update assignment run" });
    }
  });

  // ========== Uploaded Lists Endpoints ==========

  // Upload a list (staff, lunchtime_jobs, ampm_jobs)
  app.post("/api/upload-list", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { listType } = req.body;
      if (!listType || !["staff", "lunchtime_jobs", "ampm_jobs"].includes(listType)) {
        return res.status(400).json({ error: "Invalid list type. Must be 'staff', 'lunchtime_jobs', or 'ampm_jobs'" });
      }

      const fileBuffer = req.file.buffer;
      const fileExt = req.file.originalname.split(".").pop()?.toLowerCase();

      let parsedData: any[] = [];

      if (fileExt === "csv") {
        // Parse CSV
        const { parse } = await import("csv-parse/sync");
        const csvContent = fileBuffer.toString("utf-8");
        parsedData = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } else if (fileExt === "xlsx" || fileExt === "xls") {
        // Parse Excel
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(fileBuffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        parsedData = XLSX.utils.sheet_to_json(worksheet);
      } else {
        return res.status(400).json({ error: "Unsupported file format. Please upload CSV or Excel file." });
      }

      // Store in database
      const { uploadedLists, insertUploadedListSchema, staff, jobs } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      // Delete existing list of this type
      await db.delete(uploadedLists).where(eq(uploadedLists.listType, listType));

      // Insert new list
      const [newList] = await db.insert(uploadedLists).values({
        listType,
        data: JSON.stringify(parsedData),
      }).returning();

      // Also add missing entries to database tables
      if (listType === "staff") {
        // Add staff to database if they don't exist
        for (const item of parsedData) {
          // Handle various column name formats
          // Try: "Staff First Name", "firstName", "first_name", "name"
          let firstName = (item['Staff First Name'] || item.firstName || item.first_name || '').toString().trim();
          let lastName = (item['Staff Last Name'] || item.lastName || item.last_name || '').toString().trim();
          
          // If we have a single "name" field, split it
          if (!firstName && !lastName) {
            const fullName = (item.name || item.Name || '').toString().trim();
            if (fullName) {
              const nameParts = fullName.split(/\s+/).filter((p: string) => p.length > 0);
              firstName = nameParts[0] || '';
              lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
            }
          }
          
          if (!firstName) continue; // Skip if no first name
          
          // Check if staff exists (case-insensitive match)
          const { sql } = await import("drizzle-orm");
          const existingStaff = await db.select().from(staff)
            .where(and(
              sql`LOWER(${staff.firstName}) = LOWER(${firstName})`,
              sql`LOWER(${staff.lastName}) = LOWER(${lastName})`
            ));
          
          if (existingStaff.length === 0) {
            // Add new staff
            await db.insert(staff).values({
              firstName,
              lastName,
            });
          }
        }
      } else if (listType === "lunchtime_jobs") {
        // Add lunchtime jobs to database if they don't exist
        for (const item of parsedData) {
          // Handle various column name formats
          // Try: "Job Code", "code", "Code"
          const code = (item['Job Code'] || item.code || item.Code || '').toString().trim();
          // Try: "Job Name", "name", "Name"
          const name = (item['Job Name'] || item.name || item.Name || '').toString().trim();
          
          if (!code || !name) continue; // Skip if missing required fields
          
          // Check if job exists (match by code, case-insensitive)
          const { sql } = await import("drizzle-orm");
          const existingJob = await db.select().from(jobs)
            .where(sql`LOWER(${jobs.code}) = LOWER(${code})`);
          
          if (existingJob.length === 0) {
            // Add new job with lunchtime type
            await db.insert(jobs).values({
              code,
              name,
              type: "lunchtime",
            });
          }
        }
      } else if (listType === "ampm_jobs") {
        // Add AM/PM jobs to database if they don't exist
        for (const item of parsedData) {
          // Handle various column formats
          // Try: "Job", "name", "Name"
          let name = (item.Job || item.job || item.name || item.Name || '').toString().trim();
          
          if (!name) continue; // Skip if no name
          
          // Generate code from name (uppercase, replace spaces with underscores)
          let code = (item.code || item.Code || '').toString().trim();
          if (!code) {
            // Auto-generate code from name
            code = name.toUpperCase().replace(/\s+/g, '_').substring(0, 20);
          }
          
          // Determine type (am/pm) from name or explicit field
          let type = (item.type || item.Type || '').toString().trim().toLowerCase();
          if (!type) {
            // Try to infer from job name
            const nameLower = name.toLowerCase();
            if (nameLower.startsWith('pm ') || nameLower.includes(' pm')) {
              type = 'pm';
            } else if (nameLower.startsWith('am ') || nameLower.includes(' am')) {
              type = 'am';
            } else {
              // Default to PM for pickup/dismissal jobs
              type = 'pm';
            }
          }
          
          // Validate type is either "am" or "pm"
          const validType = (type === "am" || type === "pm") ? type : "pm";
          
          // Check if job exists (match by code, case-insensitive)
          const { sql } = await import("drizzle-orm");
          const existingJob = await db.select().from(jobs)
            .where(sql`LOWER(${jobs.code}) = LOWER(${code})`);
          
          if (existingJob.length === 0) {
            // Add new job with specified type
            await db.insert(jobs).values({
              code,
              name,
              type: validType,
            });
          }
        }
      }

      res.json({
        success: true,
        message: `Uploaded ${parsedData.length} items`,
        listType,
        recordCount: parsedData.length,
      });
    } catch (error: any) {
      console.error("Error uploading list:", error);
      res.status(500).json({ error: error.message || "Failed to upload list" });
    }
  });

  // Get uploaded list by type
  app.get("/api/lists/:type", async (req, res) => {
    try {
      const { type } = req.params;
      if (!["staff", "lunchtime_jobs", "ampm_jobs"].includes(type)) {
        return res.status(400).json({ error: "Invalid list type" });
      }

      const { uploadedLists } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const results = await db.select().from(uploadedLists).where(eq(uploadedLists.listType, type));

      if (results.length === 0) {
        return res.json({ data: [], count: 0 });
      }

      const listData = JSON.parse(results[0].data);
      res.json({
        data: listData,
        count: listData.length,
        uploadedAt: results[0].uploadedAt,
      });
    } catch (error: any) {
      console.error("Error fetching list:", error);
      res.status(500).json({ error: "Failed to fetch list" });
    }
  });

  // ========== External Database (Supabase) Endpoints ==========
  
  // Simple in-memory cache for external database queries
  const externalDbCache: Record<string, { data: any; timestamp: number }> = {};
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  function getCachedData(key: string): any | null {
    const cached = externalDbCache[key];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    return null;
  }
  
  function setCachedData(key: string, data: any): void {
    externalDbCache[key] = { data, timestamp: Date.now() };
  }
  
  function clearCache(key?: string): void {
    if (key) {
      delete externalDbCache[key];
    } else {
      // Clear all cache entries
      Object.keys(externalDbCache).forEach(k => delete externalDbCache[k]);
    }
  }
  
  // Helper function to execute Python script and get JSON result
  async function executePythonScript(args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), "scripts", "get_eligible_staff.py");
      
      const python = spawn("python3", [scriptPath, ...args], {
        env: process.env,
        cwd: process.cwd(),
      });

      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Python script error:", stderr);
          reject(new Error(stderr || "Script execution failed"));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve(result);
          }
        } catch (parseError) {
          reject(new Error("Failed to parse script output"));
        }
      });

      python.on("error", (error) => {
        reject(error);
      });
    });
  }

  // Get available sessions from external database (cached)
  app.get("/api/external-db/sessions", async (_req, res) => {
    try {
      const cacheKey = "sessions";
      const cached = getCachedData(cacheKey);
      if (cached) {
        console.log("Returning cached sessions");
        return res.json(cached);
      }
      
      const sessions = await executePythonScript(["sessions"]);
      setCachedData(cacheKey, sessions);
      res.json(sessions);
    } catch (error: any) {
      console.error("Error fetching external sessions:", error);
      res.status(500).json({ error: error.message || "Failed to fetch sessions" });
    }
  });

  // Get eligible staff for a session from external database (cached per session)
  app.get("/api/external-db/eligible-staff/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const cacheKey = `eligible-staff-${sessionId}`;
      const cached = getCachedData(cacheKey);
      if (cached) {
        console.log(`Returning cached eligible staff for session ${sessionId}`);
        return res.json(cached);
      }
      
      const staff = await executePythonScript(["eligible-staff", "--session-id", sessionId]);
      setCachedData(cacheKey, staff);
      res.json(staff);
    } catch (error: any) {
      console.error("Error fetching eligible staff:", error);
      res.status(500).json({ error: error.message || "Failed to fetch eligible staff" });
    }
  });

  // Get groups from external database
  app.get("/api/external-db/groups", async (req, res) => {
    try {
      const { sessionId } = req.query;
      const args = ["groups"];
      if (sessionId) {
        args.push("--session-id", sessionId as string);
      }
      const groups = await executePythonScript(args);
      res.json(groups);
    } catch (error: any) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ error: error.message || "Failed to fetch groups" });
    }
  });

  // Get lunch jobs from external database (cached)
  app.get("/api/external-db/lunch-jobs", async (_req, res) => {
    try {
      const cacheKey = "lunch-jobs";
      const cached = getCachedData(cacheKey);
      if (cached) {
        console.log("Returning cached lunch jobs");
        return res.json(cached);
      }
      
      const jobs = await executePythonScript(["lunch-jobs"]);
      setCachedData(cacheKey, jobs);
      res.json(jobs);
    } catch (error: any) {
      console.error("Error fetching lunch jobs:", error);
      res.status(500).json({ error: error.message || "Failed to fetch lunch jobs" });
    }
  });

  // Get AM/PM jobs from external database (cached)
  app.get("/api/external-db/ampm-jobs", async (_req, res) => {
    try {
      const cacheKey = "ampm-jobs";
      const cached = getCachedData(cacheKey);
      if (cached) {
        console.log("Returning cached AM/PM jobs");
        return res.json(cached);
      }
      
      const jobs = await executePythonScript(["ampm-jobs"]);
      setCachedData(cacheKey, jobs);
      res.json(jobs);
    } catch (error: any) {
      console.error("Error fetching AM/PM jobs:", error);
      res.status(500).json({ error: error.message || "Failed to fetch AM/PM jobs" });
    }
  });
  
  // Warm up cache - pre-fetches all commonly used data
  app.post("/api/external-db/warm-cache", async (_req, res) => {
    console.log("Starting cache warm-up...");
    const results: Record<string, string> = {};
    
    try {
      // Fetch sessions
      if (!getCachedData("sessions")) {
        const sessions = await executePythonScript(["sessions"]);
        setCachedData("sessions", sessions);
        results.sessions = "fetched";
      } else {
        results.sessions = "cached";
      }
    } catch (error: any) {
      results.sessions = `error: ${error.message}`;
    }
    
    try {
      // Fetch lunch jobs
      if (!getCachedData("lunch-jobs")) {
        const lunchJobs = await executePythonScript(["lunch-jobs"]);
        setCachedData("lunch-jobs", lunchJobs);
        results.lunchJobs = "fetched";
      } else {
        results.lunchJobs = "cached";
      }
    } catch (error: any) {
      results.lunchJobs = `error: ${error.message}`;
    }
    
    try {
      // Fetch AM/PM jobs
      if (!getCachedData("ampm-jobs")) {
        const ampmJobs = await executePythonScript(["ampm-jobs"]);
        setCachedData("ampm-jobs", ampmJobs);
        results.ampmJobs = "fetched";
      } else {
        results.ampmJobs = "cached";
      }
    } catch (error: any) {
      results.ampmJobs = `error: ${error.message}`;
    }
    
    console.log("Cache warm-up complete:", results);
    res.json({ success: true, results });
  });
  
  // Clear cache and optionally re-fetch
  app.post("/api/external-db/refresh-cache", async (req, res) => {
    const { refetch = true } = req.body || {};
    
    console.log("Clearing external database cache...");
    clearCache();
    
    if (refetch) {
      // Trigger warm-up after clearing
      const results: Record<string, string> = {};
      
      try {
        const sessions = await executePythonScript(["sessions"]);
        setCachedData("sessions", sessions);
        results.sessions = "refreshed";
      } catch (error: any) {
        results.sessions = `error: ${error.message}`;
      }
      
      try {
        const lunchJobs = await executePythonScript(["lunch-jobs"]);
        setCachedData("lunch-jobs", lunchJobs);
        results.lunchJobs = "refreshed";
      } catch (error: any) {
        results.lunchJobs = `error: ${error.message}`;
      }
      
      try {
        const ampmJobs = await executePythonScript(["ampm-jobs"]);
        setCachedData("ampm-jobs", ampmJobs);
        results.ampmJobs = "refreshed";
      } catch (error: any) {
        results.ampmJobs = `error: ${error.message}`;
      }
      
      console.log("Cache refresh complete:", results);
      res.json({ success: true, cleared: true, refetched: true, results });
    } else {
      res.json({ success: true, cleared: true, refetched: false });
    }
  });
  
  // Get cache status
  app.get("/api/external-db/cache-status", async (_req, res) => {
    const now = Date.now();
    const status: Record<string, { cached: boolean; ageMs?: number; expiresInMs?: number }> = {};
    
    const keysToCheck = ["sessions", "lunch-jobs", "ampm-jobs"];
    
    for (const key of keysToCheck) {
      const cached = externalDbCache[key];
      if (cached && now - cached.timestamp < CACHE_TTL) {
        const ageMs = now - cached.timestamp;
        status[key] = {
          cached: true,
          ageMs,
          expiresInMs: CACHE_TTL - ageMs
        };
      } else {
        status[key] = { cached: false };
      }
    }
    
    res.json({ status, cacheTtlMs: CACHE_TTL });
  });

  // Get hardcoded job IDs - constant list for all sessions
  // These are the predefined jobs that can have hardcoded staff assignments
  app.get("/api/config/ampm-jobs/hardcoded/:sessionId", async (_req, res) => {
    // Constant list of hardcoded job IDs (same for all sessions)
    const hardcodedJobIds = [1101, 1105, 1113, 1117, 1173, 1177, 1181, 1189];
    res.json({ hardcodedJobIds });
  });

  const httpServer = createServer(app);
  return httpServer;
}
