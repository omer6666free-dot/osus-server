import { eq, desc, and, sql, gte, lte, or, isNull, ne, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  employees, InsertEmployee, Employee,
  attendanceRecords, InsertAttendanceRecord, AttendanceRecord,
  locationTracking, InsertLocationTracking,
  workSettings, InsertWorkSettings,
  workZones, InsertWorkZone, WorkZone,
  adminNotifications, InsertAdminNotification, AdminNotification,
  jobTitles, InsertJobTitle, JobTitle,
  departments, InsertDepartment, Department,
  branches, InsertBranch, Branch,
  branchNotifications, InsertBranchNotification, BranchNotification,
  fieldTasks, InsertFieldTask, FieldTask,
  attendanceModifications, InsertAttendanceModification, AttendanceModification,
  LocationTracking,
  leaveRequests, InsertLeaveRequest, LeaveRequest,
  leaveBalances, InsertLeaveBalance, LeaveBalance
} from "./drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== EMPLOYEE FUNCTIONS ====================

export async function createEmployee(data: InsertEmployee): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(employees).values(data);
  return Number(result[0].insertId);
}

export async function getEmployeeByUserId(userId: number): Promise<Employee | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getEmployeeById(id: number): Promise<Employee | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getEmployeeByCode(employeeCode: string): Promise<Employee | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(employees).where(eq(employees.employeeCode, employeeCode)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllEmployees(): Promise<Employee[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(employees).orderBy(desc(employees.createdAt));
}

export async function getActiveEmployees(): Promise<Employee[]> {
  const db = await getDb();
  if (!db) return [];
  
  // استثناء المدراء (admin, branch_manager) من قائمة الموظفين النشطين للإحصائيات
  return db.select().from(employees).where(
    and(
      eq(employees.status, "active"),
      notInArray(employees.role, ["admin", "branch_manager"])
    )
  ).orderBy(employees.fullName);
}

// دالة للحصول على جميع الموظفين النشطين بما فيهم المدراء (للاستخدام في أماكن أخرى)
export async function getAllActiveEmployeesIncludingManagers(): Promise<Employee[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(employees).where(eq(employees.status, "active")).orderBy(employees.fullName);
}

export async function updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(employees).set(data).where(eq(employees.id, id));
}

export async function deleteEmployee(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(employees).where(eq(employees.id, id));
}

// Register device for employee
export async function registerEmployeeDevice(employeeId: number, deviceId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(employees).set({
    registeredDeviceId: deviceId,
    deviceRegisteredAt: new Date(),
  }).where(eq(employees.id, employeeId));
}

// Check if device is registered for employee
export async function checkEmployeeDevice(employeeId: number, deviceId: string): Promise<{ isRegistered: boolean; isMatch: boolean; registeredDeviceId: string | null }> {
  const db = await getDb();
  if (!db) return { isRegistered: false, isMatch: false, registeredDeviceId: null };
  
  const result = await db.select({
    registeredDeviceId: employees.registeredDeviceId,
  }).from(employees).where(eq(employees.id, employeeId)).limit(1);
  
  if (result.length === 0) {
    return { isRegistered: false, isMatch: false, registeredDeviceId: null };
  }
  
  const registeredDeviceId = result[0].registeredDeviceId;
  
  if (!registeredDeviceId) {
    // No device registered yet
    return { isRegistered: false, isMatch: false, registeredDeviceId: null };
  }
  
  // Device is registered, check if it matches
  return {
    isRegistered: true,
    isMatch: registeredDeviceId === deviceId,
    registeredDeviceId,
  };
}

// Clear employee device registration
export async function clearEmployeeDevice(employeeId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(employees).set({
    registeredDeviceId: null,
    deviceRegisteredAt: null,
  }).where(eq(employees.id, employeeId));
}

// Reset employee device (alias for clearEmployeeDevice)
export const resetEmployeeDevice = clearEmployeeDevice;

// ==================== ATTENDANCE FUNCTIONS ====================

export async function createAttendanceRecord(data: InsertAttendanceRecord): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(attendanceRecords).values(data);
  return Number(result[0].insertId);
}

export async function getTodayAttendance(employeeId: number): Promise<AttendanceRecord | null> {
  const db = await getDb();
  if (!db) return null;
  
  const today = new Date().toISOString().split('T')[0];
  const result = await db.select().from(attendanceRecords)
    .where(and(
      eq(attendanceRecords.employeeId, employeeId),
      eq(attendanceRecords.date, today)
    ))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function updateAttendanceRecord(id: number, data: Partial<InsertAttendanceRecord>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(attendanceRecords).set(data).where(eq(attendanceRecords.id, id));
}

export async function getEmployeeAttendanceHistory(employeeId: number, limit: number = 30): Promise<AttendanceRecord[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(attendanceRecords)
    .where(eq(attendanceRecords.employeeId, employeeId))
    .orderBy(desc(attendanceRecords.date))
    .limit(limit);
}

export async function getAllAttendanceByDate(date: string): Promise<(AttendanceRecord & { employeeName?: string })[]> {
  const db = await getDb();
  if (!db) return [];
  
  const records = await db.select().from(attendanceRecords)
    .where(eq(attendanceRecords.date, date))
    .orderBy(attendanceRecords.checkInTime);
  
  // Get employee names for each record
  const employeeIds = [...new Set(records.map(r => r.employeeId))];
  const employeeList = await Promise.all(
    employeeIds.map(id => getEmployeeById(id))
  );
  const employeeMap = new Map(employeeList.filter(Boolean).map(e => [e!.id, e!.fullName]));
  
  return records.map(r => ({
    ...r,
    employeeName: employeeMap.get(r.employeeId) || undefined
  }));
}

export async function getAttendanceStats(date: string) {
  const db = await getDb();
  if (!db) return { present: 0, late: 0, absent: 0, total: 0 };
  
  const records = await getAllAttendanceByDate(date);
  const allEmployees = await getActiveEmployees();
  
  // Debug logging
  console.log(`[Stats] Date: ${date}`);
  console.log(`[Stats] Total records: ${records.length}`);
  console.log(`[Stats] Records statuses:`, records.map(r => ({ id: r.id, status: r.status })));
  
  const present = records.filter(r => r.status === "present").length;
  const late = records.filter(r => r.status === "late").length;
  const checkedIn = records.length;
  const absent = allEmployees.length - checkedIn;
  
  console.log(`[Stats] Present: ${present}, Late: ${late}, Absent: ${absent}, Total: ${allEmployees.length}`);
  
  return {
    present,
    late,
    absent,
    total: allEmployees.length
  };
}

// ==================== LOCATION FUNCTIONS ====================

export async function saveLocation(data: InsertLocationTracking): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(locationTracking).values(data);
}

export async function getLatestLocations(): Promise<Array<{
  employeeId: number;
  latitude: string;
  longitude: string;
  timestamp: Date;
  fullName: string;
}>> {
  const db = await getDb();
  if (!db) return [];
  
  // Get latest location for each active employee
  const result = await db.execute(sql`
    SELECT lt.employeeId, lt.latitude, lt.longitude, lt.timestamp, e.fullName
    FROM location_tracking lt
    INNER JOIN (
      SELECT employeeId, MAX(timestamp) as maxTime
      FROM location_tracking
      WHERE timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR)
      GROUP BY employeeId
    ) latest ON lt.employeeId = latest.employeeId AND lt.timestamp = latest.maxTime
    INNER JOIN employees e ON lt.employeeId = e.id
    WHERE e.status = 'active'
  `);
  
  const rows = Array.isArray(result[0]) ? result[0] : [];
  return rows as any[];
}

// ==================== WORK SETTINGS FUNCTIONS ====================

export async function getWorkSettings() {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(workSettings).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateWorkSettings(data: Partial<InsertWorkSettings>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getWorkSettings();
  if (existing) {
    await db.update(workSettings).set(data).where(eq(workSettings.id, existing.id));
  } else {
    await db.insert(workSettings).values(data as InsertWorkSettings);
  }
}

// Initialize default work settings
export async function initializeWorkSettings(): Promise<void> {
  const existing = await getWorkSettings();
  if (!existing) {
    const db = await getDb();
    if (db) {
      await db.insert(workSettings).values({
        workStartTime: "08:00",
        workEndTime: "17:00",
        lateThresholdMinutes: 15,
        workDays: "0,1,2,3,4", // Sunday to Thursday (Middle East work week)
      });
    }
  }
}

// ==================== WORK ZONES (GEOFENCING) FUNCTIONS ====================

export async function createWorkZone(data: InsertWorkZone): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(workZones).values(data);
  return Number(result[0].insertId);
}

export async function getAllWorkZones(): Promise<WorkZone[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(workZones).orderBy(workZones.name);
}

export async function getActiveWorkZones(): Promise<WorkZone[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(workZones).where(eq(workZones.isActive, true));
}

export async function updateWorkZone(id: number, data: Partial<InsertWorkZone>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(workZones).set(data).where(eq(workZones.id, id));
}

export async function deleteWorkZone(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(workZones).where(eq(workZones.id, id));
}

// Check if a location is within any active work zone
export async function isLocationInWorkZone(latitude: number, longitude: number): Promise<{ inZone: boolean; zoneName?: string }> {
  const zones = await getActiveWorkZones();
  
  console.log(`[Geofence] Checking location: ${latitude}, ${longitude}`);
  console.log(`[Geofence] Active zones count: ${zones.length}`);
  
  for (const zone of zones) {
    const zoneLat = parseFloat(zone.latitude as unknown as string);
    const zoneLon = parseFloat(zone.longitude as unknown as string);
    const distance = calculateDistance(latitude, longitude, zoneLat, zoneLon);
    
    console.log(`[Geofence] Zone "${zone.name}": lat=${zoneLat}, lon=${zoneLon}, radius=${zone.radiusMeters}m, distance=${Math.round(distance)}m`);
    
    if (distance <= zone.radiusMeters) {
      console.log(`[Geofence] ✅ Employee is INSIDE zone "${zone.name}"`);
      return { inZone: true, zoneName: zone.name };
    }
  }
  
  console.log(`[Geofence] ❌ Employee is OUTSIDE all zones`);
  return { inZone: false };
}

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// ==================== ADMIN NOTIFICATIONS FUNCTIONS ====================

export async function createNotification(data: InsertAdminNotification): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(adminNotifications).values(data);
  return Number(result[0].insertId);
}

export async function getUnreadNotifications(): Promise<AdminNotification[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(adminNotifications)
    .where(eq(adminNotifications.isRead, false))
    .orderBy(desc(adminNotifications.createdAt))
    .limit(50);
}

export async function getAllNotifications(limit: number = 100): Promise<AdminNotification[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(adminNotifications)
    .orderBy(desc(adminNotifications.createdAt))
    .limit(limit);
}

export async function markNotificationAsRead(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(adminNotifications).set({ isRead: true }).where(eq(adminNotifications.id, id));
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(adminNotifications).set({ isRead: true }).where(eq(adminNotifications.isRead, false));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db.select({ count: sql<number>`COUNT(*)` })
    .from(adminNotifications)
    .where(eq(adminNotifications.isRead, false));
  
  return result[0]?.count || 0;
}

// Create notification for late arrival
export async function notifyLateArrival(employeeId: number, employeeName: string, checkInTime: Date): Promise<void> {
  await createNotification({
    type: "late",
    title: "تأخر في الحضور",
    message: `الموظف ${employeeName} سجل حضوره متأخراً في الساعة ${checkInTime.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`,
    employeeId,
  });
}

// Create notification for absence
export async function notifyAbsence(employeeId: number, employeeName: string): Promise<void> {
  await createNotification({
    type: "absent",
    title: "غياب موظف",
    message: `الموظف ${employeeName} لم يسجل حضوره اليوم`,
    employeeId,
  });
}

// Create notification for check-in outside work zone
export async function notifyOutsideZone(employeeId: number, employeeName: string): Promise<void> {
  await createNotification({
    type: "outside_zone",
    title: "تسجيل خارج نطاق العمل",
    message: `الموظف ${employeeName} سجل حضوره من خارج نطاق العمل المحدد`,
    employeeId,
  });
}

// Create notification when employee leaves work zone
export async function notifyLeftZone(employeeId: number, employeeName: string): Promise<void> {
  await createNotification({
    type: "left_zone",
    title: "مغادرة منطقة العمل",
    message: `الموظف ${employeeName} غادر منطقة العمل أثناء الدوام`,
    employeeId,
  });
}

// Create notification for early checkout (left more than 2 hours before end of work)
export async function notifyEarlyCheckout(employeeId: number, employeeName: string, checkOutTime: Date): Promise<void> {
  await createNotification({
    type: "early_checkout",
    title: "انصراف مبكر",
    message: `الموظف ${employeeName} انصرف مبكراً في الساعة ${checkOutTime.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`,
    employeeId,
  });
}


// ==================== JOB TITLES FUNCTIONS ====================

export async function createJobTitle(data: InsertJobTitle): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(jobTitles).values(data);
  return Number(result[0].insertId);
}

export async function getAllJobTitles(): Promise<JobTitle[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(jobTitles).orderBy(jobTitles.name);
}

export async function getActiveJobTitles(): Promise<JobTitle[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(jobTitles).where(eq(jobTitles.isActive, true)).orderBy(jobTitles.name);
}

export async function updateJobTitle(id: number, data: Partial<InsertJobTitle>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(jobTitles).set(data).where(eq(jobTitles.id, id));
}

export async function deleteJobTitle(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(jobTitles).where(eq(jobTitles.id, id));
}

// ==================== DEPARTMENTS FUNCTIONS ====================

export async function createDepartment(data: InsertDepartment): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(departments).values(data);
  return Number(result[0].insertId);
}

export async function getAllDepartments(): Promise<Department[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(departments).orderBy(departments.name);
}

export async function getActiveDepartments(): Promise<Department[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(departments).where(eq(departments.isActive, true)).orderBy(departments.name);
}

export async function getDepartmentById(id: number): Promise<Department | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(departments).where(eq(departments.id, id));
  return result[0] || null;
}

export async function updateDepartment(id: number, data: Partial<InsertDepartment>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(departments).set(data).where(eq(departments.id, id));
}

export async function deleteDepartment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(departments).where(eq(departments.id, id));
}

export async function getEmployeesByDepartment(departmentId: number): Promise<Employee[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(employees).where(eq(employees.departmentId, departmentId)).orderBy(employees.fullName);
}


// ==================== BRANCHES FUNCTIONS ====================

export async function createBranch(data: InsertBranch): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(branches).values(data);
  return Number(result[0].insertId);
}

export async function getAllBranches(): Promise<Branch[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(branches).orderBy(branches.name);
}

export async function getActiveBranches(): Promise<Branch[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(branches).where(eq(branches.isActive, true)).orderBy(branches.name);
}

export async function getBranchById(id: number): Promise<Branch | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(branches).where(eq(branches.id, id));
  return result[0] || null;
}

export async function getBranchByCode(code: string): Promise<Branch | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(branches).where(eq(branches.code, code));
  return result[0] || null;
}

export async function getBranchByManagerCode(managerCode: string): Promise<Branch | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(branches).where(eq(branches.managerCode, managerCode));
  return result[0] || null;
}

export async function updateBranch(id: number, data: Partial<InsertBranch>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(branches).set(data).where(eq(branches.id, id));
}

export async function deleteBranch(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(branches).where(eq(branches.id, id));
}

export async function getEmployeesByBranch(branchId: number): Promise<Employee[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(employees).where(eq(employees.branchId, branchId)).orderBy(employees.fullName);
}

export async function getActiveEmployeesByBranch(branchId: number): Promise<Employee[]> {
  const db = await getDb();
  if (!db) return [];
  
  // استثناء المدراء من إحصائيات الفرع
  return db.select().from(employees)
    .where(and(
      eq(employees.branchId, branchId),
      eq(employees.status, "active"),
      notInArray(employees.role, ["admin", "branch_manager"])
    ))
    .orderBy(employees.fullName);
}

export async function getAttendanceByBranch(branchId: number, date: string): Promise<AttendanceRecord[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Get employee IDs for this branch
  const branchEmployees = await getEmployeesByBranch(branchId);
  const employeeIds = branchEmployees.map(e => e.id);
  
  if (employeeIds.length === 0) return [];
  
  // Get attendance records for these employees
  const records = await db.select().from(attendanceRecords)
    .where(and(
      eq(attendanceRecords.date, date),
      sql`${attendanceRecords.employeeId} IN (${sql.join(employeeIds.map(id => sql`${id}`), sql`, `)})`
    ))
    .orderBy(desc(attendanceRecords.checkInTime));
  
  return records;
}

export async function getBranchStats(branchId: number, date: string): Promise<{
  total: number;
  present: number;
  late: number;
  absent: number;
  checkedOut: number;
}> {
  const db = await getDb();
  if (!db) return { total: 0, present: 0, late: 0, absent: 0, checkedOut: 0 };
  
  const branchEmployees = await getActiveEmployeesByBranch(branchId);
  const total = branchEmployees.length;
  
  if (total === 0) return { total: 0, present: 0, late: 0, absent: 0, checkedOut: 0 };
  
  const attendance = await getAttendanceByBranch(branchId, date);
  const checkedInIds = new Set(attendance.map(r => r.employeeId));
  
  const present = attendance.filter(r => r.status === "present").length;
  const late = attendance.filter(r => r.status === "late").length;
  const absent = total - checkedInIds.size;
  const checkedOut = attendance.filter(r => r.checkOutTime).length;
  
  return { total, present, late, absent, checkedOut };
}


// ==================== BRANCH NOTIFICATIONS FUNCTIONS ====================

export async function createBranchNotification(data: InsertBranchNotification): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(branchNotifications).values(data);
  return Number(result[0].insertId);
}

export async function getBranchNotifications(branchId: number, limit: number = 50): Promise<BranchNotification[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(branchNotifications)
    .where(eq(branchNotifications.branchId, branchId))
    .orderBy(desc(branchNotifications.createdAt))
    .limit(limit);
}

export async function getUnreadBranchNotifications(branchId: number): Promise<BranchNotification[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(branchNotifications)
    .where(and(
      eq(branchNotifications.branchId, branchId),
      eq(branchNotifications.isRead, false)
    ))
    .orderBy(desc(branchNotifications.createdAt));
}

export async function markBranchNotificationAsRead(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(branchNotifications)
    .set({ isRead: true })
    .where(eq(branchNotifications.id, id));
}

export async function markAllBranchNotificationsAsRead(branchId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(branchNotifications)
    .set({ isRead: true })
    .where(eq(branchNotifications.branchId, branchId));
}

export async function getUnreadBranchNotificationCount(branchId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(branchNotifications)
    .where(and(
      eq(branchNotifications.branchId, branchId),
      eq(branchNotifications.isRead, false)
    ));
  
  return result[0]?.count || 0;
}


// ==================== FIELD TASKS FUNCTIONS ====================

export async function createFieldTask(data: {
  employeeId: number;
  date: string;
  taskDescription?: string;
  startLatitude?: number;
  startLongitude?: number;
  startMethod?: "face" | "fingerprint" | "eye";
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Build insert data with only defined values
  const insertData: any = {
    employeeId: data.employeeId,
    date: data.date,
    status: "active",
    startTime: new Date(),
  };
  
  // Only add optional fields if they have actual values
  if (data.taskDescription && data.taskDescription.trim() !== "") {
    insertData.taskDescription = data.taskDescription;
  }
  if (data.startLatitude !== undefined && data.startLatitude !== null) {
    insertData.startLatitude = String(data.startLatitude);
  }
  if (data.startLongitude !== undefined && data.startLongitude !== null) {
    insertData.startLongitude = String(data.startLongitude);
  }
  if (data.startMethod) {
    insertData.startMethod = data.startMethod;
  }
  
  console.log("[createFieldTask] Inserting data:", JSON.stringify(insertData));
  
  const result = await db.insert(fieldTasks).values(insertData);
  return Number(result[0].insertId);
}

export async function getFieldTasksByEmployee(employeeId: number, date: string): Promise<FieldTask[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(fieldTasks)
    .where(and(
      eq(fieldTasks.employeeId, employeeId),
      eq(fieldTasks.date, date)
    ))
    .orderBy(desc(fieldTasks.startTime));
}

export async function getActiveFieldTask(employeeId: number): Promise<FieldTask | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(fieldTasks)
    .where(and(
      eq(fieldTasks.employeeId, employeeId),
      eq(fieldTasks.status, "active")
    ))
    .orderBy(desc(fieldTasks.startTime))
    .limit(1);
  
  return result[0] || null;
}

export async function completeFieldTask(taskId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(fieldTasks)
    .set({ status: "completed" })
    .where(eq(fieldTasks.id, taskId));
}

export async function getFieldTasksByBranch(branchId: number, date: string): Promise<FieldTask[]> {
  const db = await getDb();
  if (!db) return [];
  
  const branchEmployees = await getActiveEmployeesByBranch(branchId);
  const employeeIds = branchEmployees.map(e => e.id);
  
  if (employeeIds.length === 0) return [];
  
  return db.select().from(fieldTasks)
    .where(and(
      eq(fieldTasks.date, date),
      sql`${fieldTasks.employeeId} IN (${sql.join(employeeIds.map(id => sql`${id}`), sql`, `)})`
    ))
    .orderBy(desc(fieldTasks.startTime));
}

// ==================== ATTENDANCE MODIFICATIONS FUNCTIONS ====================

export async function createAttendanceModification(data: InsertAttendanceModification): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(attendanceModifications).values(data);
  return Number(result[0].insertId);
}

export async function getAttendanceModifications(attendanceId: number): Promise<AttendanceModification[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(attendanceModifications)
    .where(eq(attendanceModifications.attendanceId, attendanceId))
    .orderBy(desc(attendanceModifications.createdAt));
}

// Admin function to modify attendance record
export async function modifyAttendanceRecord(
  attendanceId: number,
  modifiedBy: number,
  newCheckIn: Date | null,
  newCheckOut: Date | null,
  reason: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get current record
  const current = await db.select().from(attendanceRecords)
    .where(eq(attendanceRecords.id, attendanceId))
    .limit(1);
  
  if (!current[0]) throw new Error("Attendance record not found");
  
  // Log the modification
  await createAttendanceModification({
    attendanceId,
    modifiedBy,
    modificationType: "edit",
    previousCheckIn: current[0].checkInTime,
    previousCheckOut: current[0].checkOutTime,
    newCheckIn,
    newCheckOut,
    reason,
  });
  
  // Update the record
  const updateData: Partial<AttendanceRecord> = {};
  if (newCheckIn !== undefined) updateData.checkInTime = newCheckIn;
  if (newCheckOut !== undefined) updateData.checkOutTime = newCheckOut;
  
  await db.update(attendanceRecords)
    .set(updateData)
    .where(eq(attendanceRecords.id, attendanceId));
}

// Admin function to add manual attendance record
export async function addManualAttendance(
  employeeId: number,
  date: string,
  checkInTime: Date | null,
  checkOutTime: Date | null,
  modifiedBy: number,
  reason: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Create the attendance record
  const result = await db.insert(attendanceRecords).values({
    employeeId,
    date,
    checkInTime,
    checkOutTime,
    status: "present",
    notes: `إضافة يدوية: ${reason}`,
  });
  
  const attendanceId = Number(result[0].insertId);
  
  // Log the modification
  await createAttendanceModification({
    attendanceId,
    modifiedBy,
    modificationType: "add",
    newCheckIn: checkInTime,
    newCheckOut: checkOutTime,
    reason,
  });
  
  return attendanceId;
}

// Admin function to reset attendance (allow re-check-in after check-out)
export async function resetAttendanceCheckOut(
  attendanceId: number,
  modifiedBy: number,
  reason: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get current record
  const current = await db.select().from(attendanceRecords)
    .where(eq(attendanceRecords.id, attendanceId))
    .limit(1);
  
  if (!current[0]) throw new Error("Attendance record not found");
  
  // Log the modification
  await createAttendanceModification({
    attendanceId,
    modifiedBy,
    modificationType: "reset",
    previousCheckIn: current[0].checkInTime,
    previousCheckOut: current[0].checkOutTime,
    newCheckIn: current[0].checkInTime,
    newCheckOut: null,
    reason,
  });
  
  // Reset check-out
  await db.update(attendanceRecords)
    .set({ checkOutTime: null })
    .where(eq(attendanceRecords.id, attendanceId));
}

// ==================== LOCATION TRACKING FUNCTIONS ====================

export async function saveLocationUpdate(data: InsertLocationTracking): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(locationTracking).values(data);
  return Number(result[0].insertId);
}

export async function getLatestLocation(employeeId: number): Promise<LocationTracking | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(locationTracking)
    .where(eq(locationTracking.employeeId, employeeId))
    .orderBy(desc(locationTracking.timestamp))
    .limit(1);
  
  return result[0] || null;
}

export async function getEmployeeLocationHistory(employeeId: number, startTime: Date, endTime: Date): Promise<LocationTracking[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(locationTracking)
    .where(and(
      eq(locationTracking.employeeId, employeeId),
      sql`${locationTracking.timestamp} >= ${startTime}`,
      sql`${locationTracking.timestamp} <= ${endTime}`
    ))
    .orderBy(locationTracking.timestamp);
}

export async function getActiveFieldEmployeesLocations(branchId?: number): Promise<Array<{
  employee: Employee;
  location: LocationTracking | null;
}>> {
  const db = await getDb();
  if (!db) return [];
  
  // Get today's date range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Get employees who checked in today (present employees)
  const todayAttendance = await db.select()
    .from(attendanceRecords)
    .where(and(
      sql`${attendanceRecords.checkInTime} >= ${today}`,
      sql`${attendanceRecords.checkInTime} < ${tomorrow}`,
      isNull(attendanceRecords.checkOutTime) // Still at work (not checked out)
    ));
  
  const presentEmployeeIds = todayAttendance.map(a => a.employeeId);
  
  if (presentEmployeeIds.length === 0) {
    return [];
  }
  
  // Get employee details
  let presentEmployees: Employee[];
  if (branchId) {
    presentEmployees = await db.select().from(employees)
      .where(and(
        eq(employees.status, "active"),
        eq(employees.branchId, branchId),
        sql`${employees.id} IN (${sql.join(presentEmployeeIds.map(id => sql`${id}`), sql`, `)})`
      ));
  } else {
    presentEmployees = await db.select().from(employees)
      .where(and(
        eq(employees.status, "active"),
        sql`${employees.id} IN (${sql.join(presentEmployeeIds.map(id => sql`${id}`), sql`, `)})`
      ));
  }
  
  // Get latest location for each employee
  // If no tracking location, use check-in location from attendance
  const results = await Promise.all(
    presentEmployees.map(async (emp) => {
      const trackingLocation = await getLatestLocation(emp.id);
      
      // If we have tracking location, use it
      if (trackingLocation) {
        return {
          employee: emp,
          location: trackingLocation,
        };
      }
      
      // Otherwise, get check-in location from attendance
      const attendanceRecord = todayAttendance.find(a => a.employeeId === emp.id);
      if (attendanceRecord && attendanceRecord.checkInLatitude && attendanceRecord.checkInLongitude) {
        return {
          employee: emp,
          location: {
            id: 0,
            employeeId: emp.id,
            latitude: attendanceRecord.checkInLatitude,
            longitude: attendanceRecord.checkInLongitude,
            timestamp: attendanceRecord.checkInTime,
            accuracy: null,
            altitude: null,
            speed: null,
            heading: null,
            activityType: "check_in" as const,
            batteryLevel: null,
            isCharging: null,
            networkType: null,
          } as LocationTracking,
        };
      }
      
      return {
        employee: emp,
        location: null,
      };
    })
  );
  
  // Filter to only include employees with valid locations
  return results.filter(r => r.location !== null);
}


// ==================== LEAVE REQUESTS FUNCTIONS ====================

export async function createLeaveRequest(data: InsertLeaveRequest): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(leaveRequests).values(data);
  return Number(result[0].insertId);
}

export async function getLeaveRequestById(id: number): Promise<LeaveRequest | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(leaveRequests)
    .where(eq(leaveRequests.id, id))
    .limit(1);
  
  return result[0] || null;
}

export async function getLeaveRequestsByEmployee(employeeId: number): Promise<LeaveRequest[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(leaveRequests)
    .where(eq(leaveRequests.employeeId, employeeId))
    .orderBy(desc(leaveRequests.createdAt));
}

export async function getLeaveRequestsByBranch(branchId: number, status?: "pending" | "approved" | "rejected"): Promise<Array<LeaveRequest & { employee: Employee | null }>> {
  const db = await getDb();
  if (!db) return [];
  
  // Get employees in this branch
  const branchEmployees = await getActiveEmployeesByBranch(branchId);
  const employeeIds = branchEmployees.map(e => e.id);
  
  if (employeeIds.length === 0) return [];
  
  let requests: LeaveRequest[];
  if (status) {
    requests = await db.select().from(leaveRequests)
      .where(and(
        sql`${leaveRequests.employeeId} IN (${sql.join(employeeIds.map(id => sql`${id}`), sql`, `)})`,
        eq(leaveRequests.status, status)
      ))
      .orderBy(desc(leaveRequests.createdAt));
  } else {
    requests = await db.select().from(leaveRequests)
      .where(sql`${leaveRequests.employeeId} IN (${sql.join(employeeIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(desc(leaveRequests.createdAt));
  }
  
  // Add employee info
  return requests.map(req => {
    const emp = branchEmployees.find(e => e.id === req.employeeId);
    return { ...req, employee: emp || null };
  });
}

export async function getAllLeaveRequests(status?: "pending" | "approved" | "rejected"): Promise<Array<LeaveRequest & { employee: Employee | null }>> {
  const db = await getDb();
  if (!db) return [];
  
  let requests: LeaveRequest[];
  if (status) {
    requests = await db.select().from(leaveRequests)
      .where(eq(leaveRequests.status, status))
      .orderBy(desc(leaveRequests.createdAt));
  } else {
    requests = await db.select().from(leaveRequests)
      .orderBy(desc(leaveRequests.createdAt));
  }
  
  // Add employee info
  const results = await Promise.all(requests.map(async (req) => {
    const emp = await getEmployeeById(req.employeeId);
    return { ...req, employee: emp || null };
  }));
  
  return results;
}

export async function updateLeaveRequestStatus(
  id: number, 
  status: "approved" | "rejected", 
  reviewedBy: number,
  rejectionReason?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: Partial<LeaveRequest> = {
    status,
    reviewedBy,
    reviewedAt: new Date(),
  };
  
  if (status === "rejected" && rejectionReason) {
    updateData.rejectionReason = rejectionReason;
  }
  
  await db.update(leaveRequests)
    .set(updateData)
    .where(eq(leaveRequests.id, id));
  
  // If approved, update leave balance
  if (status === "approved") {
    const request = await getLeaveRequestById(id);
    if (request) {
      await updateLeaveBalance(request.employeeId, request.leaveType, request.totalDays);
    }
  }
}

export async function getPendingLeaveRequestsCount(branchId?: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  if (branchId) {
    const branchEmployees = await getActiveEmployeesByBranch(branchId);
    const employeeIds = branchEmployees.map(e => e.id);
    if (employeeIds.length === 0) return 0;
    
    const result = await db.select({ count: sql<number>`COUNT(*)` })
      .from(leaveRequests)
      .where(and(
        sql`${leaveRequests.employeeId} IN (${sql.join(employeeIds.map(id => sql`${id}`), sql`, `)})`,
        eq(leaveRequests.status, "pending")
      ));
    return result[0]?.count || 0;
  } else {
    const result = await db.select({ count: sql<number>`COUNT(*)` })
      .from(leaveRequests)
      .where(eq(leaveRequests.status, "pending"));
    return result[0]?.count || 0;
  }
}

// ==================== LEAVE BALANCE FUNCTIONS ====================

export async function getOrCreateLeaveBalance(employeeId: number): Promise<LeaveBalance> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const currentYear = new Date().getFullYear();
  
  // Try to get existing balance
  const existing = await db.select().from(leaveBalances)
    .where(and(
      eq(leaveBalances.employeeId, employeeId),
      eq(leaveBalances.year, currentYear)
    ))
    .limit(1);
  
  if (existing[0]) {
    return existing[0];
  }
  
  // Create new balance for this year
  const result = await db.insert(leaveBalances).values({
    employeeId,
    year: currentYear,
    annualBalance: 21,
    sickBalance: 10,
    emergencyBalance: 5,
    usedAnnual: 0,
    usedSick: 0,
    usedEmergency: 0,
  });
  
  const newBalance = await db.select().from(leaveBalances)
    .where(eq(leaveBalances.id, Number(result[0].insertId)))
    .limit(1);
  
  return newBalance[0];
}

export async function updateLeaveBalance(
  employeeId: number, 
  leaveType: "annual" | "sick" | "emergency" | "unpaid",
  days: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Unpaid leave doesn't affect balance
  if (leaveType === "unpaid") return;
  
  const balance = await getOrCreateLeaveBalance(employeeId);
  
  const updateData: Partial<LeaveBalance> = {};
  switch (leaveType) {
    case "annual":
      updateData.usedAnnual = (balance.usedAnnual || 0) + days;
      break;
    case "sick":
      updateData.usedSick = (balance.usedSick || 0) + days;
      break;
    case "emergency":
      updateData.usedEmergency = (balance.usedEmergency || 0) + days;
      break;
  }
  
  await db.update(leaveBalances)
    .set(updateData)
    .where(eq(leaveBalances.id, balance.id));
}

export async function getLeaveBalance(employeeId: number): Promise<{
  annual: { total: number; used: number; remaining: number };
  sick: { total: number; used: number; remaining: number };
  emergency: { total: number; used: number; remaining: number };
}> {
  const balance = await getOrCreateLeaveBalance(employeeId);
  
  return {
    annual: {
      total: balance.annualBalance,
      used: balance.usedAnnual,
      remaining: balance.annualBalance - balance.usedAnnual,
    },
    sick: {
      total: balance.sickBalance,
      used: balance.usedSick,
      remaining: balance.sickBalance - balance.usedSick,
    },
    emergency: {
      total: balance.emergencyBalance,
      used: balance.usedEmergency,
      remaining: balance.emergencyBalance - balance.usedEmergency,
    },
  };
}

// Check if employee has pending leave on a specific date
export async function hasApprovedLeaveOnDate(employeeId: number, date: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const result = await db.select().from(leaveRequests)
    .where(and(
      eq(leaveRequests.employeeId, employeeId),
      eq(leaveRequests.status, "approved"),
      sql`${leaveRequests.startDate} <= ${date}`,
      sql`${leaveRequests.endDate} >= ${date}`
    ))
    .limit(1);
  
  return result.length > 0;
}
