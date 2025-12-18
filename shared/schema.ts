import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, serial, smallint, boolean, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Using blueprint:javascript_database
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Grades table
export const grades = pgTable("grades", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGradeSchema = createInsertSchema(grades).omit({
  id: true,
  createdAt: true,
});

export type InsertGrade = z.infer<typeof insertGradeSchema>;
export type Grade = typeof grades.$inferSelect;

// Group table
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  groupNumber: numeric("group_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGroupSchema = createInsertSchema(groups).omit({
  id: true,
  createdAt: true,
});

export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groups.$inferSelect;

// Role table
export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
});

export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

// Session table
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  sessionNumber: integer("session_number").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Staff table - stores staff member information
export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  age: smallint("age"),
  gender: varchar("gender", { length: 50 }),
  yearsAtCamp: smallint("years_at_camp"),
  physicalStrength: smallint("physical_strength"),
  extrovertedLevel: smallint("extroverted_level"),
  fieldLiningPref: boolean("field_lining_pref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStaffSchema = createInsertSchema(staff).omit({
  id: true,
  createdAt: true,
});

export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staff.$inferSelect;

// Staff to Session mapping table
export const staffToSession = pgTable("staff_to_session", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  groupId: integer("group_id").references(() => groups.id, { onDelete: "set null" }),
  sessionId: integer("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  parentStaffId: integer("parent_staff_id").references(() => staff.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStaffToSessionSchema = createInsertSchema(staffToSession).omit({
  id: true,
  createdAt: true,
});

export type InsertStaffToSession = z.infer<typeof insertStaffToSessionSchema>;
export type StaffToSession = typeof staffToSession.$inferSelect;

// Jobs table - stores job definitions
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  minStaffAssigned: integer("min_staff_assigned"),
  normalStaffAssigned: integer("normal_staff_assigned"),
  maxStaffAssigned: integer("max_staff_assigned"),
  jobDescription: text("job_description"),
  priority: integer("priority"),
  type: varchar("type", { length: 50 }).notNull(), // 'lunchtime', 'am', 'pm'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
});

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// Uploaded files table - tracks file upload metadata
export const uploadedFiles = pgTable("uploaded_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // 'staff_list', 'job_list'
  originalName: text("original_name").notNull(),
  fileSize: integer("file_size").notNull(),
  recordCount: integer("record_count"), // number of records imported from the file
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  uploadedAt: true,
});

export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type UploadedFile = typeof uploadedFiles.$inferSelect;

// Assignments table - stores job assignment results
export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  day: varchar("day", { length: 20 }).notNull(), // 'monday', 'tuesday', etc.
  sessionId: integer("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  assignmentType: text("assignment_type").notNull(), // 'lunchtime', 'am', 'pm'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAssignmentSchema = createInsertSchema(assignments).omit({
  id: true,
  createdAt: true,
});

export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type Assignment = typeof assignments.$inferSelect;

// Uploaded Lists table - stores uploaded staff and job lists
export const uploadedLists = pgTable("uploaded_lists", {
  id: serial("id").primaryKey(),
  listType: varchar("list_type", { length: 50 }).notNull(), // 'staff', 'lunchtime_jobs', 'ampm_jobs'
  data: text("data").notNull(), // JSON string of the list data
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUploadedListSchema = createInsertSchema(uploadedLists).omit({
  id: true,
  uploadedAt: true,
});

export type InsertUploadedList = z.infer<typeof insertUploadedListSchema>;
export type UploadedList = typeof uploadedLists.$inferSelect;

// Assignment Runs table - tracks when assignment scripts were executed
export const assignmentRuns = pgTable("assignment_runs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  runType: varchar("run_type", { length: 50 }).notNull(), // 'lunchtime', 'ampm'
  weekNumber: integer("week_number"),
  status: varchar("status", { length: 20 }).notNull(), // 'success', 'failed', 'running'
  resultCount: integer("result_count"),
  configJson: text("config_json"), // JSON config used for the run
  outputLog: text("output_log"),
  errorLog: text("error_log"),
  googleSheetsUrl: text("google_sheets_url"),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAssignmentRunSchema = createInsertSchema(assignmentRuns).omit({
  id: true,
  executedAt: true,
});

export type InsertAssignmentRun = z.infer<typeof insertAssignmentRunSchema>;
export type AssignmentRun = typeof assignmentRuns.$inferSelect;
