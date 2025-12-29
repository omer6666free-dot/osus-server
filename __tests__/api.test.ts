import { describe, it, expect } from "vitest";
import * as db from "../db";

describe("Database Functions", () => {
  describe("Work Settings", () => {
    it("should get or create work settings", async () => {
      const settings = await db.getWorkSettings();
      expect(settings).toBeDefined();
      if (settings) {
        expect(settings.workStartTime).toBeDefined();
        expect(settings.workEndTime).toBeDefined();
        expect(settings.lateThresholdMinutes).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Employee Functions", () => {
    it("should return array when getting all employees", async () => {
      const employees = await db.getAllEmployees();
      expect(Array.isArray(employees)).toBe(true);
    });

    it("should return undefined for non-existent employee by user ID", async () => {
      const employee = await db.getEmployeeByUserId(999999);
      expect(employee).toBeUndefined();
    });

    it("should return undefined for non-existent employee by ID", async () => {
      const employee = await db.getEmployeeById(999999);
      expect(employee).toBeUndefined();
    });
  });

  describe("Attendance Functions", () => {
    it("should return undefined for non-existent attendance record", async () => {
      const attendance = await db.getTodayAttendance(999999);
      expect(attendance).toBeUndefined();
    });

    it("should return empty array for attendance history of non-existent employee", async () => {
      const history = await db.getEmployeeAttendanceHistory(999999, 30);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });

    it("should return stats for any date", async () => {
      const today = new Date().toISOString().split("T")[0];
      const stats = await db.getAttendanceStats(today);
      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThanOrEqual(0);
      expect(stats.present).toBeGreaterThanOrEqual(0);
      expect(stats.late).toBeGreaterThanOrEqual(0);
      expect(stats.absent).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Location Functions", () => {
    it("should return array when getting latest locations", async () => {
      const locations = await db.getLatestLocations();
      expect(Array.isArray(locations)).toBe(true);
    });
  });
});
