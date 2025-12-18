// Using blueprint:javascript_database
import {
  users,
  staff,
  jobs,
  uploadedFiles,
  assignments,
  type User,
  type InsertUser,
  type Staff,
  type InsertStaff,
  type Job,
  type InsertJob,
  type UploadedFile,
  type InsertUploadedFile,
  type Assignment,
  type InsertAssignment,
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Staff methods
  createStaff(staff: InsertStaff): Promise<Staff>;
  getAllStaff(): Promise<Staff[]>;
  getStaffById(id: number): Promise<Staff | undefined>;
  deleteStaff(id: number): Promise<void>;
  deleteAllStaff(): Promise<void>;

  // Job methods
  createJob(job: InsertJob): Promise<Job>;
  getAllJobs(): Promise<Job[]>;
  getJobsByType(jobType: string): Promise<Job[]>;
  getJobById(id: number): Promise<Job | undefined>;
  deleteJob(id: number): Promise<void>;
  deleteAllJobs(): Promise<void>;

  // Uploaded file methods
  createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  getAllUploadedFiles(): Promise<UploadedFile[]>;
  getUploadedFilesByType(fileType: string): Promise<UploadedFile[]>;
  deleteUploadedFile(id: string): Promise<void>;

  // Assignment methods
  createAssignment(assignment: InsertAssignment): Promise<Assignment>;
  getAllAssignments(): Promise<Assignment[]>;
  getAssignmentsByType(assignmentType: string): Promise<Assignment[]>;
  deleteAssignmentsByTypeAndSession(assignmentType: string, sessionId: number): Promise<void>;
  deleteAssignment(id: number): Promise<void>;
  deleteAllAssignments(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Staff methods
  async createStaff(insertStaff: InsertStaff): Promise<Staff> {
    const [staffMember] = await db
      .insert(staff)
      .values(insertStaff)
      .returning();
    return staffMember;
  }

  async getAllStaff(): Promise<Staff[]> {
    return await db.select().from(staff);
  }

  async getStaffById(id: number): Promise<Staff | undefined> {
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, id));
    return staffMember || undefined;
  }

  async deleteStaff(id: number): Promise<void> {
    await db.delete(staff).where(eq(staff.id, id));
  }

  async deleteAllStaff(): Promise<void> {
    await db.delete(staff);
  }

  // Job methods
  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db.insert(jobs).values(insertJob).returning();
    return job;
  }

  async getAllJobs(): Promise<Job[]> {
    return await db.select().from(jobs);
  }

  async getJobsByType(jobType: string): Promise<Job[]> {
    return await db.select().from(jobs).where(eq(jobs.type, jobType));
  }

  async getJobById(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async deleteJob(id: number): Promise<void> {
    await db.delete(jobs).where(eq(jobs.id, id));
  }

  async deleteAllJobs(): Promise<void> {
    await db.delete(jobs);
  }

  // Uploaded file methods
  async createUploadedFile(
    insertFile: InsertUploadedFile
  ): Promise<UploadedFile> {
    const [file] = await db
      .insert(uploadedFiles)
      .values(insertFile)
      .returning();
    return file;
  }

  async getAllUploadedFiles(): Promise<UploadedFile[]> {
    return await db.select().from(uploadedFiles);
  }

  async getUploadedFilesByType(fileType: string): Promise<UploadedFile[]> {
    return await db
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.fileType, fileType));
  }

  async deleteUploadedFile(id: string): Promise<void> {
    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, id));
  }

  // Assignment methods
  async createAssignment(
    insertAssignment: InsertAssignment
  ): Promise<Assignment> {
    const [assignment] = await db
      .insert(assignments)
      .values(insertAssignment)
      .returning();
    return assignment;
  }

  async getAllAssignments(): Promise<Assignment[]> {
    return await db.select().from(assignments);
  }

  async getAssignmentsByType(assignmentType: string): Promise<Assignment[]> {
    return await db
      .select()
      .from(assignments)
      .where(eq(assignments.assignmentType, assignmentType));
  }

  async deleteAssignmentsByTypeAndSession(assignmentType: string, sessionId: number): Promise<void> {
    await db
      .delete(assignments)
      .where(
        and(
          eq(assignments.assignmentType, assignmentType),
          eq(assignments.sessionId, sessionId)
        )
      );
  }

  async deleteAssignment(id: number): Promise<void> {
    await db.delete(assignments).where(eq(assignments.id, id));
  }

  async deleteAllAssignments(): Promise<void> {
    await db.delete(assignments);
  }
}

export const storage = new DatabaseStorage();
