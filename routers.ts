import { z } from "zod";
import { COOKIE_NAME } from "./shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

// Calculate distance between two coordinates in meters (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Employee routes
  employee: router({
    // Get current user's employee profile
    me: protectedProcedure.query(async ({ ctx }) => {
      const employee = await db.getEmployeeByUserId(ctx.user.id);
      return employee || null;
    }),

    // Get employee by code (for biometric login flow)
    getByCode: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
      }))
      .query(async ({ input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          return null;
        }
        return {
          id: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          departmentId: employee.departmentId,
          position: employee.position,
          jobTitle: employee.jobTitle,
          role: employee.role,
          status: employee.status,
          fingerprintEnabled: employee.fingerprintEnabled,
          faceDataId: employee.faceDataId,
        };
      }),

    // Get all employees (admin only)
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      return db.getAllEmployees();
    }),

    // Get active employees (admin only)
    active: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      return db.getActiveEmployees();
    }),

    // Get employee by ID (admin only)
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        return db.getEmployeeById(input.id);
      }),

    // Create employee (admin only)
    create: protectedProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
        fullName: z.string().min(1).max(255),
        phone: z.string().max(20).optional(),
        department: z.string().max(100).optional(),
        position: z.string().max(100).optional(),
        jobTitle: z.enum(["office_employee", "customer_service", "supervisor", "manager"]).optional().default("office_employee"),
        role: z.enum(["employee", "admin"]).optional().default("employee"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        return db.createEmployee(input);
      }),

    // Update employee (admin only)
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        fullName: z.string().min(1).max(255).optional(),
        phone: z.string().max(20).optional(),
        department: z.string().max(100).optional(),
        position: z.string().max(100).optional(),
        status: z.enum(["active", "inactive", "suspended"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const { id, ...data } = input;
        await db.updateEmployee(id, data);
        return { success: true };
      }),

    // Delete employee (admin only)
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.deleteEmployee(input.id);
        return { success: true };
      }),

    // Reset employee device (admin only) - allows employee to register new device
    resetDevice: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // Allow reset device for admin - no auth check needed since this is admin panel
        await db.resetEmployeeDevice(input.id);
        return { success: true };
      }),

    // Register current user as employee
    register: protectedProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
        fullName: z.string().min(1).max(255),
        phone: z.string().max(20).optional(),
        department: z.string().max(100).optional(),
        position: z.string().max(100).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if already registered
        const existing = await db.getEmployeeByUserId(ctx.user.id);
        if (existing) {
          throw new Error("Employee already registered");
        }
        return db.createEmployee({
          userId: ctx.user.id,
          ...input,
        });
      }),

    // Link current user to existing employee by employee code
    linkByCode: protectedProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user is already linked to an employee
        const existingLink = await db.getEmployeeByUserId(ctx.user.id);
        if (existingLink) {
          throw new Error("حسابك مرتبط بالفعل بموظف");
        }

        // Find employee by code
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("الرقم الوظيفي غير موجود. تأكد من الرقم مع مديرك.");
        }

        // Check if employee is already linked to another user
        if (employee.userId && employee.userId !== 0) {
          throw new Error("هذا الرقم الوظيفي مرتبط بحساب آخر");
        }

        // Link the employee to current user
        await db.updateEmployee(employee.id, { userId: ctx.user.id });

        return {
          id: employee.id,
          fullName: employee.fullName,
          employeeCode: employee.employeeCode,
          departmentId: employee.departmentId,
          position: employee.position,
          jobTitle: employee.jobTitle,
        };
      }),

    // Login employee with biometric (no OAuth required)
    loginWithBiometric: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
      }))
      .mutation(async ({ ctx, input }) => {
        // Find employee by code
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("الرقم الوظيفي غير موجود");
        }

        if (employee.status !== "active") {
          throw new Error("الحساب غير نشط. تواصل مع الإدارة.");
        }

        // Check if biometric is registered - return status instead of error
        const needsBiometricSetup = !employee.fingerprintEnabled && !employee.faceDataId;

        return {
          id: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          departmentId: employee.departmentId,
          position: employee.position,
          jobTitle: employee.jobTitle,
          role: employee.role,
          needsBiometricSetup, // true if employee needs to register biometric
        };
      }),

    // Register biometric for employee (first time setup - no auth required)
    setupBiometric: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
        method: z.enum(["fingerprint", "face"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("الرقم الوظيفي غير موجود");
        }

        if (input.method === "fingerprint") {
          await db.updateEmployee(employee.id, { fingerprintEnabled: true });
        } else if (input.method === "face") {
          const faceDataId = `face_${employee.id}_${Date.now()}`;
          await db.updateEmployee(employee.id, { faceDataId });
        }

        return { success: true, method: input.method };
      }),

    // Register biometric data
    registerBiometric: protectedProcedure
      .input(z.object({
        method: z.enum(["fingerprint", "face"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const employee = await db.getEmployeeByUserId(ctx.user.id);
        if (!employee) {
          throw new Error("لم يتم العثور على بيانات الموظف");
        }

        if (input.method === "fingerprint") {
          await db.updateEmployee(employee.id, { fingerprintEnabled: true });
        } else if (input.method === "face") {
          // Generate a unique face data ID (in production, this would be actual face encoding)
          const faceDataId = `face_${ctx.user.id}_${Date.now()}`;
          await db.updateEmployee(employee.id, { faceDataId });
        }

        return { success: true, method: input.method };
      }),

    // Admin login by employee code - allows direct login for admin accounts
    adminLoginByCode: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
      }))
      .mutation(async ({ ctx, input }) => {
        // Find employee by code
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("الرقم الوظيفي غير موجود");
        }

        // Check if employee is admin
        if (employee.role !== "admin") {
          throw new Error("هذا الرقم الوظيفي ليس لمدير عام. استخدم صفحة دخول الموظف.");
        }

        if (employee.status !== "active") {
          throw new Error("الحساب غير نشط. تواصل مع الإدارة.");
        }

        // Import sdk to create session
        const { sdk } = await import("./_core/sdk");
        const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

        // Create a unique openId for admin login by code
        const adminOpenId = `admin_${employee.employeeCode}_${employee.id}`;

        // Check if user exists, if not create one
        let user = await db.getUserByOpenId(adminOpenId);
        if (!user) {
          // Create a new user for this admin
          await db.upsertUser({
            openId: adminOpenId,
            name: employee.fullName,
            email: null,
            role: "admin",
            loginMethod: "code",
            lastSignedIn: new Date(),
          });
          user = await db.getUserByOpenId(adminOpenId);
          
          // Link employee to this user if not already linked
          if (!employee.userId && user) {
            await db.updateEmployee(employee.id, { userId: user.id });
          }
        }

        if (!user) {
          throw new Error("فشل في إنشاء جلسة المستخدم");
        }

        // Create session token
        const sessionToken = await sdk.createSessionToken(adminOpenId, {
          name: employee.fullName || "",
          expiresInMs: ONE_YEAR_MS,
        });

        // Set session cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return {
          success: true,
          sessionToken,
          employee: {
            id: employee.id,
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            role: employee.role,
          },
          user: {
            id: user.id,
            openId: user.openId,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        };
      }),
  }),

  // Attendance routes
  attendance: router({
    // Check in by employee code (for biometric login flow - no OAuth required)
    checkInByCode: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
        latitude: z.number(),
        longitude: z.number(),
        method: z.enum(["face", "fingerprint", "eye"]),
        deviceId: z.string().optional(), // معرف الجهاز
      }))
      .mutation(async ({ input }) => {
        // Find employee by code
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("لم يتم العثور على الموظف");
        }

        // Check device binding
        if (input.deviceId) {
          const deviceCheck = await db.checkEmployeeDevice(employee.id, input.deviceId);
          
          if (!deviceCheck.isRegistered) {
            // First time - register this device
            await db.registerEmployeeDevice(employee.id, input.deviceId);
            console.log(`[Device] Registered device ${input.deviceId} for employee ${employee.fullName}`);
          } else if (!deviceCheck.isMatch) {
            // Device mismatch - notify admin and block
            await db.createNotification({
              type: "device_mismatch",
              title: "محاولة دخول من جهاز غير مصرح",
              message: `حاول الموظف ${employee.fullName} (رقم: ${employee.employeeCode}) تسجيل الحضور من جهاز غير مسجل. الجهاز المسجل: ${deviceCheck.registeredDeviceId?.substring(0, 8)}... الجهاز الحالي: ${input.deviceId.substring(0, 8)}...`,
              employeeId: employee.id,
              isRead: false,
            });
            throw new Error("هذا الجهاز غير مصرح له. يرجى التواصل مع المدير.");
          }
        }

        // Check if already checked in today
        const existing = await db.getTodayAttendance(employee.id);
        if (existing?.checkInTime) {
          throw new Error("تم تسجيل الحضور مسبقاً اليوم");
        }

        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        
        // Check geofencing
        const locationCheck = await db.isLocationInWorkZone(input.latitude, input.longitude);
        const activeZones = await db.getActiveWorkZones();
        const hasActiveZones = activeZones.length > 0;
        
        // If geofencing is enabled and user is outside zone, BLOCK check-in and notify admin
        if (hasActiveZones && !locationCheck.inZone) {
          // Log distance for debugging
          const zones = await db.getActiveWorkZones();
          for (const zone of zones) {
            const dist = calculateDistance(
              input.latitude, input.longitude,
              Number(zone.latitude), Number(zone.longitude)
            );
            console.log(`[Geofence] Distance to ${zone.name}: ${Math.round(dist)}m (allowed: ${zone.radiusMeters}m)`);
          }
          await db.notifyOutsideZone(employee.id, employee.fullName);
          throw new Error("أنت خارج نطاق العمل المحدد. لا يمكنك تسجيل الحضور من هذا الموقع.");
        }
        
        // Determine if late - using local time comparison (UTC+3 for Saudi Arabia)
        const settings = await db.getWorkSettings();
        let status: "present" | "late" = "present";
        if (settings) {
          const [startHour, startMin] = settings.workStartTime.split(':').map(Number);
          // Get current time in local timezone (UTC+3)
          const localTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
          const currentHour = localTime.getUTCHours();
          const currentMin = localTime.getUTCMinutes();
          const currentTotalMinutes = currentHour * 60 + currentMin;
          // Calculate late threshold in total minutes
          const lateThresholdMinutes = startHour * 60 + startMin + settings.lateThresholdMinutes;
          
          console.log(`[Attendance] Check-in time (local UTC+3): ${currentHour}:${currentMin} (${currentTotalMinutes} mins)`);
          console.log(`[Attendance] Late threshold: ${Math.floor(lateThresholdMinutes/60)}:${lateThresholdMinutes%60} (${lateThresholdMinutes} mins)`);
          
          if (currentTotalMinutes > lateThresholdMinutes) {
            status = "late";
            console.log(`[Attendance] Employee is LATE`);
            await db.notifyLateArrival(employee.id, employee.fullName, now);
          } else {
            console.log(`[Attendance] Employee is ON TIME`);
          }
        }

        if (existing) {
          await db.updateAttendanceRecord(existing.id, {
            checkInTime: now,
            checkInLatitude: String(input.latitude),
            checkInLongitude: String(input.longitude),
            checkInMethod: input.method,
            status,
          });
          return { success: true, status, recordId: existing.id };
        } else {
          const recordId = await db.createAttendanceRecord({
            employeeId: employee.id,
            date: today,
            checkInTime: now,
            checkInLatitude: String(input.latitude),
            checkInLongitude: String(input.longitude),
            checkInMethod: input.method,
            status,
          });
          return { success: true, status, recordId };
        }
      }),

    // Check out by employee code (for biometric login flow - no OAuth required)
    checkOutByCode: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
        latitude: z.number(),
        longitude: z.number(),
        method: z.enum(["face", "fingerprint", "eye"]),
        deviceId: z.string().optional(), // معرف الجهاز
      }))
      .mutation(async ({ input }) => {
        // Find employee by code
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("لم يتم العثور على الموظف");
        }

        // Check device binding
        if (input.deviceId) {
          const deviceCheck = await db.checkEmployeeDevice(employee.id, input.deviceId);
          
          if (deviceCheck.isRegistered && !deviceCheck.isMatch) {
            // Device mismatch - notify admin and block
            await db.createNotification({
              type: "device_mismatch",
              title: "محاولة انصراف من جهاز غير مصرح",
              message: `حاول الموظف ${employee.fullName} (رقم: ${employee.employeeCode}) تسجيل الانصراف من جهاز غير مسجل.`,
              employeeId: employee.id,
              isRead: false,
            });
            throw new Error("هذا الجهاز غير مصرح له. يرجى التواصل مع المدير.");
          }
        }

        // Check if checked in today
        const existing = await db.getTodayAttendance(employee.id);
        if (!existing?.checkInTime) {
          throw new Error("لم يتم تسجيل الحضور اليوم");
        }
        if (existing.checkOutTime) {
          throw new Error("تم تسجيل الانصراف مسبقاً اليوم");
        }

        const now = new Date();
        
        await db.updateAttendanceRecord(existing.id, {
          checkOutTime: now,
          checkOutLatitude: String(input.latitude),
          checkOutLongitude: String(input.longitude),
          checkOutMethod: input.method,
        });
        
        // إرسال إشعار للمدير عند انصراف الموظف
        const timeStr = now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
        
        // إشعار لمدير الفرع
        if (employee.branchId) {
          db.createBranchNotification({
            branchId: employee.branchId,
            type: "employee_check_out",
            title: "انصراف موظف",
            message: `قام الموظف ${employee.fullName} (رقم: ${employee.employeeCode}) بتسجيل الانصراف الساعة ${timeStr}`,
            employeeId: employee.id,
          }).catch(console.error);
        }
        
        // إشعار للمدير العام
        db.createNotification({
          type: "early_checkout",
          title: "انصراف موظف",
          message: `قام الموظف ${employee.fullName} (رقم: ${employee.employeeCode}) بتسجيل الانصراف الساعة ${timeStr}`,
          employeeId: employee.id,
          isRead: false,
        }).catch(console.error);

        return { success: true, recordId: existing.id };
      }),

    // Check in (OAuth users)
    checkIn: protectedProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
        method: z.enum(["face", "fingerprint", "eye"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const employee = await db.getEmployeeByUserId(ctx.user.id);
        if (!employee) {
          throw new Error("لم يتم العثور على بيانات الموظف. يرجى ربط حسابك أولاً.");
        }

        // Verify biometric method is registered
        if (input.method === "fingerprint" && !employee.fingerprintEnabled) {
          throw new Error("لم يتم تسجيل بصمة الإصبع. يرجى تسجيلها أولاً من الإعدادات.");
        }
        if (input.method === "face" && !employee.faceDataId) {
          throw new Error("لم يتم تسجيل بصمة الوجه. يرجى تسجيلها أولاً من الإعدادات.");
        }

        // Check if already checked in today
        const existing = await db.getTodayAttendance(employee.id);
        if (existing?.checkInTime) {
          throw new Error("Already checked in today");
        }

        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        
        // Check geofencing
        const locationCheck = await db.isLocationInWorkZone(input.latitude, input.longitude);
        const activeZones = await db.getActiveWorkZones();
        const hasActiveZones = activeZones.length > 0;
        
        // If geofencing is enabled and user is outside zone, BLOCK check-in and notify admin
        if (hasActiveZones && !locationCheck.inZone) {
          // Log distance for debugging
          const zones = await db.getActiveWorkZones();
          for (const zone of zones) {
            const dist = calculateDistance(
              input.latitude, input.longitude,
              Number(zone.latitude), Number(zone.longitude)
            );
            console.log(`[Geofence] Distance to ${zone.name}: ${Math.round(dist)}m (allowed: ${zone.radiusMeters}m)`);
          }
          await db.notifyOutsideZone(employee.id, employee.fullName);
          throw new Error("أنت خارج نطاق العمل المحدد. لا يمكنك تسجيل الحضور من هذا الموقع.");
        }
        
        // Determine if late - using local time comparison (UTC+3 for Saudi Arabia)
        const settings = await db.getWorkSettings();
        let status: "present" | "late" = "present";
        if (settings) {
          const [startHour, startMin] = settings.workStartTime.split(':').map(Number);
          // Get current time in local timezone (UTC+3)
          const localTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
          const currentHour = localTime.getUTCHours();
          const currentMin = localTime.getUTCMinutes();
          const currentTotalMinutes = currentHour * 60 + currentMin;
          // Calculate late threshold in total minutes
          const lateThresholdMinutes = startHour * 60 + startMin + settings.lateThresholdMinutes;
          
          console.log(`[Attendance] Check-in time (local UTC+3): ${currentHour}:${currentMin} (${currentTotalMinutes} mins)`);
          console.log(`[Attendance] Late threshold: ${Math.floor(lateThresholdMinutes/60)}:${lateThresholdMinutes%60} (${lateThresholdMinutes} mins)`);
          
          if (currentTotalMinutes > lateThresholdMinutes) {
            status = "late";
            console.log(`[Attendance] Employee is LATE`);
            // Notify admin of late arrival
            await db.notifyLateArrival(employee.id, employee.fullName, now);
          } else {
            console.log(`[Attendance] Employee is ON TIME`);
          }
        }

        if (existing) {
          // Update existing record
          await db.updateAttendanceRecord(existing.id, {
            checkInTime: now,
            checkInLatitude: String(input.latitude),
            checkInLongitude: String(input.longitude),
            checkInMethod: input.method,
            status,
          });
          return { success: true, status, recordId: existing.id };
        } else {
          // Create new record
          const recordId = await db.createAttendanceRecord({
            employeeId: employee.id,
            date: today,
            checkInTime: now,
            checkInLatitude: String(input.latitude),
            checkInLongitude: String(input.longitude),
            checkInMethod: input.method,
            status,
          });
          return { success: true, status, recordId };
        }
      }),

    // Check out
    checkOut: protectedProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
        method: z.enum(["face", "fingerprint", "eye"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const employee = await db.getEmployeeByUserId(ctx.user.id);
        if (!employee) {
          throw new Error("لم يتم العثور على بيانات الموظف");
        }

        // Verify biometric method is registered
        if (input.method === "fingerprint" && !employee.fingerprintEnabled) {
          throw new Error("لم يتم تسجيل بصمة الإصبع. يرجى تسجيلها أولاً من الإعدادات.");
        }
        if (input.method === "face" && !employee.faceDataId) {
          throw new Error("لم يتم تسجيل بصمة الوجه. يرجى تسجيلها أولاً من الإعدادات.");
        }

        const existing = await db.getTodayAttendance(employee.id);
        if (!existing) {
          throw new Error("No check-in record found for today");
        }
        if (existing.checkOutTime) {
          throw new Error("Already checked out today");
        }

        const now = new Date();
        
        // Check if this is early checkout (more than 2 hours before end of work)
        const workSettings = await db.getWorkSettings();
        if (workSettings?.workEndTime) {
          const [endHour, endMinute] = workSettings.workEndTime.split(":").map(Number);
          const endTime = new Date();
          endTime.setHours(endHour, endMinute, 0, 0);
          
          const twoHoursBeforeEnd = new Date(endTime);
          twoHoursBeforeEnd.setHours(twoHoursBeforeEnd.getHours() - 2);
          
          if (now < twoHoursBeforeEnd) {
            // Early checkout - notify admin
            await db.notifyEarlyCheckout(employee.id, employee.fullName, now);
          }
        }
        
        await db.updateAttendanceRecord(existing.id, {
          checkOutTime: now,
          checkOutLatitude: String(input.latitude),
          checkOutLongitude: String(input.longitude),
          checkOutMethod: input.method,
        });

        return { success: true };
      }),

    // Get today's attendance status (OAuth users)
    today: protectedProcedure.query(async ({ ctx }) => {
      const employee = await db.getEmployeeByUserId(ctx.user.id);
      if (!employee) {
        return null;
      }
      return db.getTodayAttendance(employee.id);
    }),

    // Get today's attendance status by employee code (biometric login users)
    todayByCode: publicProcedure
      .input(z.object({ employeeCode: z.string().min(1).max(50) }))
      .query(async ({ input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          return null;
        }
        const attendance = await db.getTodayAttendance(employee.id);
        return attendance ?? null;
      }),

    // Get attendance history (OAuth users)
    history: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(30) }))
      .query(async ({ ctx, input }) => {
        const employee = await db.getEmployeeByUserId(ctx.user.id);
        if (!employee) {
          return [];
        }
        return db.getEmployeeAttendanceHistory(employee.id, input.limit);
      }),

    // Get attendance history by employee code (biometric login users)
    historyByCode: publicProcedure
      .input(z.object({ 
        employeeCode: z.string().min(1).max(50),
        limit: z.number().min(1).max(100).default(30) 
      }))
      .query(async ({ input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          return [];
        }
        return db.getEmployeeAttendanceHistory(employee.id, input.limit);
      }),

    // Get all attendance by date (admin only)
    byDate: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        return db.getAllAttendanceByDate(input.date);
      }),

    // Get attendance statistics (admin only)
    stats: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        return db.getAttendanceStats(input.date);
      }),

    // Get employee attendance history (admin only)
    employeeHistory: protectedProcedure
      .input(z.object({ 
        employeeId: z.number(),
        limit: z.number().min(1).max(100).default(30) 
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        return db.getEmployeeAttendanceHistory(input.employeeId, input.limit);
      }),
  }),

  // Location tracking routes
  location: router({
    // Update current location
    update: protectedProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
        accuracy: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const employee = await db.getEmployeeByUserId(ctx.user.id);
        if (!employee) {
          throw new Error("Employee not found");
        }

        await db.saveLocation({
          employeeId: employee.id,
          latitude: String(input.latitude),
          longitude: String(input.longitude),
          accuracy: input.accuracy ? String(input.accuracy) : undefined,
        });

        // Check if employee is outside work zone and has checked in today
        const todayAttendance = await db.getTodayAttendance(employee.id);
        if (todayAttendance?.checkInTime && !todayAttendance?.checkOutTime) {
          const workZones = await db.getActiveWorkZones();
          if (workZones.length > 0) {
            const isInsideAnyZone = workZones.some(zone => {
              const distance = calculateDistance(
                input.latitude,
                input.longitude,
                Number(zone.latitude),
                Number(zone.longitude)
              );
              return distance <= zone.radiusMeters;
            });
            
            if (!isInsideAnyZone) {
              // الموظف غادر منطقة العمل بدون تسجيل انصراف - إرسال تنبيه
              const timeStr = new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
              
              // إشعار للمدير العام
              await db.notifyLeftZone(employee.id, employee.fullName);
              
              // إشعار لمدير الفرع
              if (employee.branchId) {
                db.createBranchNotification({
                  branchId: employee.branchId,
                  type: "employee_outside_zone",
                  title: "⚠️ مغادرة منطقة العمل بدون انصراف",
                  message: `الموظف ${employee.fullName} غادر منطقة العمل الساعة ${timeStr} بدون تسجيل انصراف رسمي`,
                  employeeId: employee.id,
                }).catch(console.error);
              }
            }
          }
        }

        return { success: true };
      }),

    // Update location by employee code (for biometric login users)
    updateByCode: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
        latitude: z.number(),
        longitude: z.number(),
        accuracy: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("الموظف غير موجود");
        }

        await db.saveLocation({
          employeeId: employee.id,
          latitude: String(input.latitude),
          longitude: String(input.longitude),
          accuracy: input.accuracy ? String(input.accuracy) : undefined,
        });

        // Check if employee is outside work zone and has checked in today
        const todayAttendance = await db.getTodayAttendance(employee.id);
        if (todayAttendance?.checkInTime && !todayAttendance?.checkOutTime) {
          const workZones = await db.getActiveWorkZones();
          if (workZones.length > 0) {
            const isInsideAnyZone = workZones.some(zone => {
              const distance = calculateDistance(
                input.latitude,
                input.longitude,
                Number(zone.latitude),
                Number(zone.longitude)
              );
              return distance <= zone.radiusMeters;
            });
            
            if (!isInsideAnyZone) {
              // الموظف غادر منطقة العمل بدون تسجيل انصراف - إرسال تنبيه
              const timeStr = new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
              
              // إشعار للمدير العام
              await db.notifyLeftZone(employee.id, employee.fullName);
              
              // إشعار لمدير الفرع
              if (employee.branchId) {
                db.createBranchNotification({
                  branchId: employee.branchId,
                  type: "employee_outside_zone",
                  title: "⚠️ مغادرة منطقة العمل بدون انصراف",
                  message: `الموظف ${employee.fullName} (رقم: ${employee.employeeCode}) غادر منطقة العمل الساعة ${timeStr} بدون تسجيل انصراف رسمي`,
                  employeeId: employee.id,
                }).catch(console.error);
              }
            }
          }
        }

        return { success: true };
      }),

    // Get all latest locations (admin only)
    latest: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      return db.getLatestLocations();
    }),

    // Get latest location for specific employee
    latestByEmployee: protectedProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ input }) => {
        return db.getLatestLocation(input.employeeId);
      }),

    // Get location history
    history: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        startTime: z.string().datetime(),
        endTime: z.string().datetime(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح");
        }
        return db.getEmployeeLocationHistory(
          input.employeeId,
          new Date(input.startTime),
          new Date(input.endTime)
        );
      }),

    // Get all field employees locations (for map)
    fieldEmployees: protectedProcedure
      .input(z.object({ branchId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح");
        }
        return db.getActiveFieldEmployeesLocations(input.branchId);
      }),
  }),

  // Work zones (geofencing) routes
  workZone: router({
    // Get all work zones (admin only)
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      return db.getAllWorkZones();
    }),

    // Get active work zones
    active: protectedProcedure.query(async () => {
      return db.getActiveWorkZones();
    }),

    // Create work zone (admin only)
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        latitude: z.number(),
        longitude: z.number(),
        radiusMeters: z.number().min(10).max(10000).default(500),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const id = await db.createWorkZone({
          name: input.name,
          latitude: String(input.latitude),
          longitude: String(input.longitude),
          radiusMeters: input.radiusMeters,
        });
        return { success: true, id };
      }),

    // Update work zone (admin only)
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        radiusMeters: z.number().min(10).max(10000).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const { id, latitude, longitude, ...rest } = input;
        await db.updateWorkZone(id, {
          ...rest,
          ...(latitude !== undefined && { latitude: String(latitude) }),
          ...(longitude !== undefined && { longitude: String(longitude) }),
        });
        return { success: true };
      }),

    // Delete work zone (admin only)
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.deleteWorkZone(input.id);
        return { success: true };
      }),

    // Check if location is in work zone
    check: protectedProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
      }))
      .query(async ({ input }) => {
        return db.isLocationInWorkZone(input.latitude, input.longitude);
      }),
  }),

  // Admin notifications routes
  notification: router({
    // Get unread notifications (admin only)
    unread: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      return db.getUnreadNotifications();
    }),

    // Get all notifications (admin only)
    list: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(100) }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        return db.getAllNotifications(input.limit);
      }),

    // Get unread count (admin only)
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      return db.getUnreadNotificationCount();
    }),

    // Mark notification as read (admin only)
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.markNotificationAsRead(input.id);
        return { success: true };
      }),

    // Mark all as read (admin only)
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      await db.markAllNotificationsAsRead();
      return { success: true };
    }),
  }),

  // Field tasks routes
  task: router({
    // Start a new field task
    start: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
        description: z.string().min(1).max(500),
        destination: z.string().max(255).optional(),
        latitude: z.number(),
        longitude: z.number(),
      }))
      .mutation(async ({ input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("لم يتم العثور على الموظف");
        }
        
        // Save task start location
        await db.saveLocation({
          employeeId: employee.id,
          latitude: String(input.latitude),
          longitude: String(input.longitude),
        });
        
        return { 
          success: true, 
          message: "تم تسجيل بدء المهمة",
          taskId: Date.now().toString(),
          startTime: new Date().toISOString(),
        };
      }),

    // End a field task
    end: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
        notes: z.string().max(500).optional(),
        latitude: z.number(),
        longitude: z.number(),
      }))
      .mutation(async ({ input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("لم يتم العثور على الموظف");
        }
        
        // Save task end location
        await db.saveLocation({
          employeeId: employee.id,
          latitude: String(input.latitude),
          longitude: String(input.longitude),
        });
        
        return { 
          success: true, 
          message: "تم تسجيل إنهاء المهمة",
          endTime: new Date().toISOString(),
        };
      }),
  }),

  // Job titles routes (admin only)
  jobTitle: router({
    // Get all job titles
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      return db.getAllJobTitles();
    }),

    // Get active job titles
    active: protectedProcedure.query(async () => {
      return db.getActiveJobTitles();
    }),

    // Create job title (admin only)
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(255).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const id = await db.createJobTitle(input);
        return { success: true, id };
      }),

    // Update job title (admin only)
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(255).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const { id, ...data } = input;
        await db.updateJobTitle(id, data);
        return { success: true };
      }),

    // Delete job title (admin only)
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.deleteJobTitle(input.id);
        return { success: true };
      }),
  }),

  // Departments routes (admin only)
  department: router({
    // Get all departments
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      return db.getAllDepartments();
    }),

    // Get active departments
    active: protectedProcedure.query(async () => {
      return db.getActiveDepartments();
    }),

    // Get department by ID
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        return db.getDepartmentById(input.id);
      }),

    // Get employees by department
    employees: protectedProcedure
      .input(z.object({ departmentId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        return db.getEmployeesByDepartment(input.departmentId);
      }),

    // Create department (admin only)
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(255).optional(),
        managerId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const id = await db.createDepartment(input);
        return { success: true, id };
      }),

    // Update department (admin only)
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(255).optional(),
        managerId: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const { id, ...data } = input;
        await db.updateDepartment(id, data);
        return { success: true };
      }),

    // Delete department (admin only)
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.deleteDepartment(input.id);
        return { success: true };
      }),
  }),

  // Branch routes
  branch: router({
    // Get all branches (admin only)
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
        throw new Error("Unauthorized");
      }
      return db.getAllBranches();
    }),

    // Get active branches
    active: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
        throw new Error("Unauthorized");
      }
      return db.getActiveBranches();
    }),

    // Get branch by ID
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("Unauthorized");
        }
        return db.getBranchById(input.id);
      }),

    // Create branch (admin only)
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        code: z.string().min(1).max(20),
        address: z.string().max(255).optional(),
        managerCode: z.string().max(50).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        radiusMeters: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
                // If managerCode provided, find and update the employee as branch_manager
        if (input.managerCode) {
          const manager = await db.getEmployeeByCode(input.managerCode);
          if (manager) {
            await db.updateEmployee(manager.id, { role: "branch_manager" });
          }
        }
        
        // Convert latitude/longitude to strings for database
        const { latitude, longitude, ...rest } = input;
        const branchData: Record<string, unknown> = { ...rest };
        if (latitude !== undefined) branchData.latitude = String(latitude);
        if (longitude !== undefined) branchData.longitude = String(longitude);
        
        const branchId = await db.createBranch(branchData as any);
        return { success: true, id: branchId };
      }),

    // Update branch (admin only)
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        code: z.string().min(1).max(20).optional(),
        address: z.string().max(255).optional(),
        managerCode: z.string().max(50).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        radiusMeters: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const { id, latitude, longitude, ...rest } = input;
        
        // If managerCode changed, update the employee role
        if (rest.managerCode) {
          const manager = await db.getEmployeeByCode(rest.managerCode);
          if (manager) {
            await db.updateEmployee(manager.id, { role: "branch_manager" });
          }
        }
        
        // Convert latitude/longitude to strings for database
        const updateData: Record<string, unknown> = { ...rest };
        if (latitude !== undefined) updateData.latitude = String(latitude);
        if (longitude !== undefined) updateData.longitude = String(longitude);
        
        await db.updateBranch(id, updateData);
        return { success: true };
      }),

    // Delete branch (admin only)
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.deleteBranch(input.id);
        return { success: true };
      }),

    // Get employees by branch
    employees: protectedProcedure
      .input(z.object({ branchId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("Unauthorized");
        }
        return db.getEmployeesByBranch(input.branchId);
      }),

    // Get branch stats
    stats: protectedProcedure
      .input(z.object({ branchId: z.number(), date: z.string() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("Unauthorized");
        }
        return db.getBranchStats(input.branchId, input.date);
      }),

    // Get branch attendance
    attendance: protectedProcedure
      .input(z.object({ branchId: z.number(), date: z.string() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("Unauthorized");
        }
        return db.getAttendanceByBranch(input.branchId, input.date);
      }),

    // Login as branch manager (by employee code + biometric)
    managerLogin: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
      }))
      .mutation(async ({ input }) => {
        // Find employee by code
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("الرقم الوظيفي غير موجود");
        }

        // Check if employee is a branch manager
        if (employee.role !== "branch_manager" && employee.role !== "admin") {
          throw new Error("هذا الحساب ليس لمدير فرع");
        }

        if (employee.status !== "active") {
          throw new Error("الحساب غير نشط. تواصل مع الإدارة.");
        }

        // Find the branch this manager manages
        const branch = await db.getBranchByManagerCode(input.employeeCode);

        return {
          id: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          role: employee.role,
          branchId: branch?.id || employee.branchId,
          branchName: branch?.name || null,
          needsBiometricSetup: !employee.fingerprintEnabled && !employee.faceDataId,
        };
      }),

    // Add employee to branch (branch manager)
    addEmployee: protectedProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
        fullName: z.string().min(1).max(100),
        phone: z.string().max(20).optional(),
        position: z.string().max(100).optional(),
        branchId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user is admin or branch manager of this branch
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح لك بإضافة موظفين");
        }

        // If branch manager, verify they manage this branch
        if (ctx.user.role === "branch_manager") {
          const manager = await db.getEmployeeByCode(ctx.user.openId || "");
          const branch = await db.getBranchByManagerCode(manager?.employeeCode || "");
          if (!branch || branch.id !== input.branchId) {
            throw new Error("لا يمكنك إضافة موظفين لهذا الفرع");
          }
        }

        // Check if employee code already exists
        const existing = await db.getEmployeeByCode(input.employeeCode);
        if (existing) {
          throw new Error("الرقم الوظيفي موجود مسبقاً");
        }

        // Create employee (userId will be set to 0 for employees added by branch manager)
        const employeeId = await db.createEmployee({
          userId: 0, // Will be linked when employee logs in
          employeeCode: input.employeeCode,
          fullName: input.fullName,
          phone: input.phone || null,
          position: input.position || null,
          branchId: input.branchId,
          role: "employee",
          status: "active",
        });

        // Create notification for branch
        await db.createBranchNotification({
          branchId: input.branchId,
          type: "employee_added",
          title: "موظف جديد",
          message: `تم إضافة الموظف ${input.fullName} للفرع`,
          employeeId: employeeId,
        });

        return { success: true, id: employeeId };
      }),
  }),

  // Work settings routes (admin only)
  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      return db.getWorkSettings();
    }),

    update: protectedProcedure
      .input(z.object({
        workStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        workEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        lateThresholdMinutes: z.number().min(0).max(120).optional(),
        workDays: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.updateWorkSettings(input);
        return { success: true };
      }),
  }),

  // Branch notifications routes
  branchNotifications: router({
    list: protectedProcedure
      .input(z.object({ branchId: z.number(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح");
        }
        return db.getBranchNotifications(input.branchId, input.limit || 50);
      }),

    unread: protectedProcedure
      .input(z.object({ branchId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح");
        }
        return db.getUnreadBranchNotifications(input.branchId);
      }),

    unreadCount: protectedProcedure
      .input(z.object({ branchId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح");
        }
        return db.getUnreadBranchNotificationCount(input.branchId);
      }),

    markAsRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح");
        }
        await db.markBranchNotificationAsRead(input.id);
        return { success: true };
      }),

    markAllAsRead: protectedProcedure
      .input(z.object({ branchId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح");
        }
        await db.markAllBranchNotificationsAsRead(input.branchId);
        return { success: true };
      }),
  }),

  // Field Tasks routes
  fieldTask: router({
    // Create a new field task (employee starts a mission) - for OAuth users
    create: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        isReturn: z.boolean().optional(), // true = returning from field
        taskDescription: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        verificationMethod: z.enum(["face", "fingerprint", "eye"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const today = new Date().toISOString().split("T")[0];
        
        // If returning from field, complete the active task
        if (input.isReturn) {
          const activeTask = await db.getActiveFieldTask(input.employeeId);
          if (activeTask) {
            await db.completeFieldTask(activeTask.id);
          }
          return { success: true, id: activeTask?.id || 0 };
        }
        
        const id = await db.createFieldTask({
          employeeId: input.employeeId,
          date: today,
          taskDescription: input.taskDescription,
          startLatitude: input.latitude,
          startLongitude: input.longitude,
          startMethod: input.verificationMethod,
        });
        
        // Get employee info for notification
        const employee = await db.getEmployeeById(input.employeeId);
        if (employee) {
          // Send notification to admin
          const notifType = "خروج لمهمة ميدانية";
          await db.createNotification({
            type: "system",
            title: notifType,
            message: `الموظف ${employee.fullName} - ${input.taskDescription || "مهمة ميدانية"}`,
            employeeId: input.employeeId,
          });
          
          // Send notification to branch manager if employee has branch
          if (employee.branchId) {
            await db.createBranchNotification({
              branchId: employee.branchId,
              type: "general",
              title: notifType,
              message: `الموظف ${employee.fullName} - ${input.taskDescription || "مهمة ميدانية"}`,
              employeeId: input.employeeId,
            });
          }
        }
        
        return { success: true, id };
      }),

    // Create a new field task by employee code (for biometric login users)
    createByCode: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1).max(50),
        isReturn: z.boolean().optional(), // true = returning from field
        taskDescription: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        verificationMethod: z.enum(["face", "fingerprint", "eye"]).optional(),
      }))
      .mutation(async ({ input }) => {
        // Find employee by code
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("لم يتم العثور على الموظف");
        }
        
        const today = new Date().toISOString().split("T")[0];
        
        // If returning from field, complete the active task
        if (input.isReturn) {
          const activeTask = await db.getActiveFieldTask(employee.id);
          if (activeTask) {
            await db.completeFieldTask(activeTask.id);
          }
          return { success: true, id: activeTask?.id || 0 };
        }
        
        const id = await db.createFieldTask({
          employeeId: employee.id,
          date: today,
          taskDescription: input.taskDescription,
          startLatitude: input.latitude,
          startLongitude: input.longitude,
          startMethod: input.verificationMethod,
        });
        
        // Send notification to admin
        const notifType = "خروج لمهمة ميدانية";
        await db.createNotification({
          type: "system",
          title: notifType,
          message: `الموظف ${employee.fullName} - ${input.taskDescription || "مهمة ميدانية"}`,
          employeeId: employee.id,
        });
        
        // Send notification to branch manager if employee has branch
        if (employee.branchId) {
          await db.createBranchNotification({
            branchId: employee.branchId,
            type: "general",
            title: notifType,
            message: `الموظف ${employee.fullName} - ${input.taskDescription || "مهمة ميدانية"}`,
            employeeId: employee.id,
          });
        }
        
        return { success: true, id };
      }),

    // Get employee's field tasks for today (OAuth users)
    today: protectedProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ input }) => {
        const today = new Date().toISOString().split("T")[0];
        return db.getFieldTasksByEmployee(input.employeeId, today);
      }),

    // Get employee's field tasks for today by code (biometric login users)
    todayByCode: publicProcedure
      .input(z.object({ employeeCode: z.string().min(1).max(50) }))
      .query(async ({ input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          return [];
        }
        const today = new Date().toISOString().split("T")[0];
        return db.getFieldTasksByEmployee(employee.id, today);
      }),

    // Get active field task (employee is currently on a mission) - OAuth users
    active: protectedProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ input }) => {
        return db.getActiveFieldTask(input.employeeId);
      }),

    // Get active field task by code (biometric login users)
    activeByCode: publicProcedure
      .input(z.object({ employeeCode: z.string().min(1).max(50) }))
      .query(async ({ input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          return null;
        }
        return db.getActiveFieldTask(employee.id);
      }),

    // Get branch field tasks (for manager)
    byBranch: protectedProcedure
      .input(z.object({ branchId: z.number(), date: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح");
        }
        const date = input.date || new Date().toISOString().split("T")[0];
        return db.getFieldTasksByBranch(input.branchId, date);
      }),
  }),

  // Attendance management routes (admin control)
  attendanceManagement: router({
    // Modify attendance record
    modify: protectedProcedure
      .input(z.object({
        attendanceId: z.number(),
        newCheckIn: z.string().datetime().optional(),
        newCheckOut: z.string().datetime().optional(),
        reason: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح: صلاحية إدارية مطلوبة");
        }
        
        await db.modifyAttendanceRecord(
          input.attendanceId,
          ctx.user.id,
          input.newCheckIn ? new Date(input.newCheckIn) : null,
          input.newCheckOut ? new Date(input.newCheckOut) : null,
          input.reason
        );
        
        return { success: true };
      }),

    // Add manual attendance record
    addManual: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        date: z.string(),
        checkInTime: z.string().datetime().optional(),
        checkOutTime: z.string().datetime().optional(),
        reason: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح: صلاحية إدارية مطلوبة");
        }
        
        const id = await db.addManualAttendance(
          input.employeeId,
          input.date,
          input.checkInTime ? new Date(input.checkInTime) : null,
          input.checkOutTime ? new Date(input.checkOutTime) : null,
          ctx.user.id,
          input.reason
        );
        
        return { success: true, id };
      }),

    // Reset checkout (allow employee to check in again)
    resetCheckout: protectedProcedure
      .input(z.object({
        attendanceId: z.number(),
        reason: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح: صلاحية إدارية مطلوبة");
        }
        
        await db.resetAttendanceCheckOut(
          input.attendanceId,
          ctx.user.id,
          input.reason
        );
        
        return { success: true };
      }),

    // Get modification history
    history: protectedProcedure
      .input(z.object({ attendanceId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "branch_manager") {
          throw new Error("غير مصرح");
        }
        return db.getAttendanceModifications(input.attendanceId);
      }),
  }),

  // Leave requests routes
  leave: router({
    // Create a new leave request (employee)
    create: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1),
        leaveType: z.enum(["annual", "sick", "emergency", "unpaid"]),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("الموظف غير موجود");
        }
        
        // Calculate total days
        const start = new Date(input.startDate);
        const end = new Date(input.endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        
        // Check leave balance
        if (input.leaveType !== "unpaid") {
          const balance = await db.getLeaveBalance(employee.id);
          const balanceKey = input.leaveType as "annual" | "sick" | "emergency";
          if (balance[balanceKey].remaining < totalDays) {
            throw new Error(`رصيد الإجازات غير كافي. المتبقي: ${balance[balanceKey].remaining} يوم`);
          }
        }
        
        const requestId = await db.createLeaveRequest({
          employeeId: employee.id,
          leaveType: input.leaveType,
          startDate: input.startDate,
          endDate: input.endDate,
          totalDays,
          reason: input.reason,
        });
        
        // Create notifications in parallel (non-blocking) for better performance
        const notificationPromises: Promise<any>[] = [];
        
        // Notification for branch manager
        if (employee.branchId) {
          notificationPromises.push(
            db.createBranchNotification({
              branchId: employee.branchId,
              type: "general",
              title: "طلب إجازة جديد",
              message: `قدم ${employee.fullName} طلب إجازة من ${input.startDate} إلى ${input.endDate}`,
              employeeId: employee.id,
            }).catch(err => console.error("Branch notification error:", err))
          );
        }
        
        // Notification for admin
        notificationPromises.push(
          db.createNotification({
            type: "system",
            title: "طلب إجازة جديد",
            message: `قدم ${employee.fullName} طلب إجازة من ${input.startDate} إلى ${input.endDate}`,
            employeeId: employee.id,
          }).catch(err => console.error("Admin notification error:", err))
        );
        
        // Don't wait for notifications - return immediately after creating the request
        Promise.all(notificationPromises).catch(() => {});
        
        return { success: true, requestId };
      }),
    
    // Get employee's leave requests
    myRequests: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1),
      }))
      .query(async ({ input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          return [];
        }
        return db.getLeaveRequestsByEmployee(employee.id);
      }),
    
    // Get employee's leave balance
    balance: publicProcedure
      .input(z.object({
        employeeCode: z.string().min(1),
      }))
      .query(async ({ input }) => {
        const employee = await db.getEmployeeByCode(input.employeeCode);
        if (!employee) {
          throw new Error("الموظف غير موجود");
        }
        return db.getLeaveBalance(employee.id);
      }),
    
    // Get pending requests count
    pendingCount: publicProcedure
      .input(z.object({
        branchId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return db.getPendingLeaveRequestsCount(input.branchId);
      }),
    
    // Get all requests (for admin)
    all: publicProcedure
      .input(z.object({
        status: z.enum(["pending", "approved", "rejected"]).optional(),
      }))
      .query(async ({ input }) => {
        return db.getAllLeaveRequests(input.status);
      }),
    
    // Get branch requests (for branch manager)
    byBranch: publicProcedure
      .input(z.object({
        branchId: z.number(),
        status: z.enum(["pending", "approved", "rejected"]).optional(),
      }))
      .query(async ({ input }) => {
        return db.getLeaveRequestsByBranch(input.branchId, input.status);
      }),
    
    // Approve leave request (manager)
    approve: publicProcedure
      .input(z.object({
        requestId: z.number(),
        reviewerCode: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const reviewer = await db.getEmployeeByCode(input.reviewerCode);
        if (!reviewer || (reviewer.role !== "branch_manager" && reviewer.role !== "admin")) {
          throw new Error("غير مصرح لك بالموافقة على الطلبات");
        }
        
        const request = await db.getLeaveRequestById(input.requestId);
        if (!request) {
          throw new Error("الطلب غير موجود");
        }
        
        if (request.status !== "pending") {
          throw new Error("تم معالجة هذا الطلب مسبقاً");
        }
        
        await db.updateLeaveRequestStatus(input.requestId, "approved", reviewer.id);
        
        // Notify employee
        const employee = await db.getEmployeeById(request.employeeId);
        if (employee?.branchId) {
          await db.createBranchNotification({
            branchId: employee.branchId,
            type: "general",
            title: "تمت الموافقة على طلب الإجازة",
            message: `تمت الموافقة على طلب إجازة ${employee.fullName}`,
            employeeId: employee.id,
          });
        }
        
        return { success: true };
      }),
    
    // Reject leave request (manager)
    reject: publicProcedure
      .input(z.object({
        requestId: z.number(),
        reviewerCode: z.string().min(1),
        reason: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const reviewer = await db.getEmployeeByCode(input.reviewerCode);
        if (!reviewer || (reviewer.role !== "branch_manager" && reviewer.role !== "admin")) {
          throw new Error("غير مصرح لك برفض الطلبات");
        }
        
        const request = await db.getLeaveRequestById(input.requestId);
        if (!request) {
          throw new Error("الطلب غير موجود");
        }
        
        if (request.status !== "pending") {
          throw new Error("تم معالجة هذا الطلب مسبقاً");
        }
        
        await db.updateLeaveRequestStatus(input.requestId, "rejected", reviewer.id, input.reason);
        
        // Notify employee
        const employee = await db.getEmployeeById(request.employeeId);
        if (employee?.branchId) {
          await db.createBranchNotification({
            branchId: employee.branchId,
            type: "general",
            title: "تم رفض طلب الإجازة",
            message: `تم رفض طلب إجازة ${employee.fullName}. السبب: ${input.reason}`,
            employeeId: employee.id,
          });
        }
        
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;