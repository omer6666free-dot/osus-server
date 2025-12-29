import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "branch_manager", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Employees table - stores employee information
 */
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // Reference to users table (optional for employees without app login)
  employeeCode: varchar("employeeCode", { length: 50 }).notNull().unique(),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  departmentId: int("departmentId"), // Reference to departments table
  jobTitleId: int("jobTitleId"), // Reference to job_titles table
  branchId: int("branchId"), // Reference to branches table
  position: varchar("position", { length: 100 }),
  jobTitle: mysqlEnum("jobTitle", ["office_employee", "customer_service", "supervisor", "manager"]).default("office_employee").notNull(),
  employeeType: mysqlEnum("employeeType", ["office", "field"]).default("office").notNull(), // مكتبي أو ميداني
  role: mysqlEnum("role", ["employee", "branch_manager", "admin"]).default("employee").notNull(),
  status: mysqlEnum("status", ["active", "inactive", "suspended"]).default("active").notNull(),
  // Biometric data references (stored as hashes/identifiers)
  faceDataId: varchar("faceDataId", { length: 255 }),
  fingerprintEnabled: boolean("fingerprintEnabled").default(false),
  // Device binding for security
  registeredDeviceId: varchar("registeredDeviceId", { length: 255 }), // معرف الجهاز المسجل
  deviceRegisteredAt: timestamp("deviceRegisteredAt"), // تاريخ تسجيل الجهاز
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

/**
 * Attendance records table - stores check-in and check-out records
 */
export const attendanceRecords = mysqlTable("attendance_records", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD format
  checkInTime: timestamp("checkInTime"),
  checkOutTime: timestamp("checkOutTime"),
  checkInLatitude: decimal("checkInLatitude", { precision: 10, scale: 8 }),
  checkInLongitude: decimal("checkInLongitude", { precision: 11, scale: 8 }),
  checkOutLatitude: decimal("checkOutLatitude", { precision: 10, scale: 8 }),
  checkOutLongitude: decimal("checkOutLongitude", { precision: 11, scale: 8 }),
  checkInMethod: mysqlEnum("checkInMethod", ["face", "fingerprint", "eye"]),
  checkOutMethod: mysqlEnum("checkOutMethod", ["face", "fingerprint", "eye"]),
  status: mysqlEnum("status", ["present", "late", "absent", "half_day"]).default("present").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type InsertAttendanceRecord = typeof attendanceRecords.$inferInsert;

/**
 * Location tracking table - stores real-time location updates
 */
export const locationTracking = mysqlTable("location_tracking", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  accuracy: decimal("accuracy", { precision: 10, scale: 2 }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type LocationTracking = typeof locationTracking.$inferSelect;
export type InsertLocationTracking = typeof locationTracking.$inferInsert;

/**
 * Work schedule settings
 */
export const workSettings = mysqlTable("work_settings", {
  id: int("id").autoincrement().primaryKey(),
  workStartTime: varchar("workStartTime", { length: 5 }).default("08:00").notNull(), // HH:MM format
  workEndTime: varchar("workEndTime", { length: 5 }).default("17:00").notNull(),
  lateThresholdMinutes: int("lateThresholdMinutes").default(15).notNull(),
  workDays: varchar("workDays", { length: 20 }).default("1,2,3,4,5").notNull(), // 0=Sunday, 6=Saturday
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WorkSettings = typeof workSettings.$inferSelect;
export type InsertWorkSettings = typeof workSettings.$inferInsert;

/**
 * Work zones for geofencing - defines allowed check-in/out locations
 */
export const workZones = mysqlTable("work_zones", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  radiusMeters: int("radiusMeters").default(100).notNull(), // Allowed radius in meters
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WorkZone = typeof workZones.$inferSelect;
export type InsertWorkZone = typeof workZones.$inferInsert;

/**
 * Admin notifications - stores notifications for admin users
 */
export const adminNotifications = mysqlTable("admin_notifications", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["late", "absent", "outside_zone", "left_zone", "early_checkout", "system", "device_mismatch"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  employeeId: int("employeeId"), // Optional - related employee
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminNotification = typeof adminNotifications.$inferSelect;
export type InsertAdminNotification = typeof adminNotifications.$inferInsert;

/**
 * Job titles table - custom job titles
 */
export const jobTitles = mysqlTable("job_titles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type JobTitle = typeof jobTitles.$inferSelect;
export type InsertJobTitle = typeof jobTitles.$inferInsert;

/**
 * Departments table - company departments
 */
export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
  managerId: int("managerId"), // Optional - department manager (employee id)
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Department = typeof departments.$inferSelect;
export type InsertDepartment = typeof departments.$inferInsert;


/**
 * Branches table - company branches/locations
 */
export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(), // Branch code like "BR001"
  address: varchar("address", { length: 255 }),
  managerId: int("managerId"), // Branch manager (employee id)
  managerCode: varchar("managerCode", { length: 50 }), // Manager's employee code for login
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  radiusMeters: int("radiusMeters").default(100), // Geofencing radius for this branch
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Branch = typeof branches.$inferSelect;
export type InsertBranch = typeof branches.$inferInsert;


/**
 * Branch notifications table - stores notifications for branch managers
 */
export const branchNotifications = mysqlTable("branch_notifications", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  type: mysqlEnum("type", [
    "employee_added",
    "employee_check_in",
    "employee_check_out",
    "employee_late",
    "employee_absent",
    "employee_early_checkout",
    "employee_outside_zone",
    "general"
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  employeeId: int("employeeId"), // Related employee if applicable
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BranchNotification = typeof branchNotifications.$inferSelect;
export type InsertBranchNotification = typeof branchNotifications.$inferInsert;

/**
 * Field tasks table - tracks field employee missions (leave/return)
 * Schema matches actual database structure
 */
export const fieldTasks = mysqlTable("field_tasks", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD format
  taskDescription: text("taskDescription"),
  // Start of field task
  startTime: timestamp("startTime"),
  startLatitude: decimal("startLatitude", { precision: 10, scale: 8 }),
  startLongitude: decimal("startLongitude", { precision: 11, scale: 8 }),
  startMethod: mysqlEnum("startMethod", ["face", "fingerprint", "eye"]),
  // End of field task
  endTime: timestamp("endTime"),
  endLatitude: decimal("endLatitude", { precision: 10, scale: 8 }),
  endLongitude: decimal("endLongitude", { precision: 11, scale: 8 }),
  endMethod: mysqlEnum("endMethod", ["face", "fingerprint", "eye"]),
  // Status and metadata
  status: mysqlEnum("status", ["active", "completed", "cancelled"]).default("active").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type FieldTask = typeof fieldTasks.$inferSelect;
export type InsertFieldTask = typeof fieldTasks.$inferInsert;

/**
 * Attendance modifications log - tracks admin changes to attendance records
 */
export const attendanceModifications = mysqlTable("attendance_modifications", {
  id: int("id").autoincrement().primaryKey(),
  attendanceId: int("attendanceId").notNull(),
  modifiedBy: int("modifiedBy").notNull(), // Admin/Manager user ID
  modificationType: mysqlEnum("modificationType", ["edit", "add", "delete", "reset"]).notNull(),
  previousCheckIn: timestamp("previousCheckIn"),
  previousCheckOut: timestamp("previousCheckOut"),
  newCheckIn: timestamp("newCheckIn"),
  newCheckOut: timestamp("newCheckOut"),
  reason: text("reason").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AttendanceModification = typeof attendanceModifications.$inferSelect;
export type InsertAttendanceModification = typeof attendanceModifications.$inferInsert;


/**
 * Leave requests table - stores employee leave/vacation requests
 */
export const leaveRequests = mysqlTable("leave_requests", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  leaveType: mysqlEnum("leaveType", ["annual", "sick", "emergency", "unpaid"]).notNull(),
  startDate: varchar("startDate", { length: 10 }).notNull(), // YYYY-MM-DD format
  endDate: varchar("endDate", { length: 10 }).notNull(), // YYYY-MM-DD format
  totalDays: int("totalDays").notNull(),
  reason: text("reason").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"), // Manager who reviewed the request
  reviewedAt: timestamp("reviewedAt"),
  rejectionReason: text("rejectionReason"), // Reason for rejection if rejected
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = typeof leaveRequests.$inferInsert;

/**
 * Leave balance table - tracks employee leave balances
 */
export const leaveBalances = mysqlTable("leave_balances", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().unique(),
  annualBalance: int("annualBalance").default(21).notNull(), // Default 21 days annual leave
  sickBalance: int("sickBalance").default(10).notNull(), // Default 10 days sick leave
  emergencyBalance: int("emergencyBalance").default(5).notNull(), // Default 5 days emergency leave
  usedAnnual: int("usedAnnual").default(0).notNull(),
  usedSick: int("usedSick").default(0).notNull(),
  usedEmergency: int("usedEmergency").default(0).notNull(),
  year: int("year").notNull(), // Year for the balance
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type InsertLeaveBalance = typeof leaveBalances.$inferInsert;
