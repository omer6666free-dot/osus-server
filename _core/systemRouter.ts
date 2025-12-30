import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import * as db from "../db";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      }),
    )
    .query(() => ({
      ok: true,
    })),

  importEmployees: publicProcedure
    .input(
      z.object({
        employees: z.array(
          z.object({
            id: z.number(),
            employee_code: z.string(),
            full_name: z.string(),
            position: z.string().optional(),
            job_title: z.string().optional(),
            department_id: z.number().nullable().optional(),
            role: z.string().optional(),
            needs_biometric_setup: z.boolean().optional(),
            branch_id: z.number().nullable().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      try {
        console.log(`[Import] Importing ${input.employees.length} employees...`);
        let successCount = 0;
        let errorCount = 0;

        for (const emp of input.employees) {
          try {
            await db.createEmployee({
              employeeCode: emp.employee_code,
              fullName: emp.full_name,
              position: emp.position,
              jobTitle: emp.job_title,
              departmentId: emp.department_id,
              role: emp.role,
              needsBiometricSetup: emp.needs_biometric_setup || false,
              branchId: emp.branch_id,
            });
            successCount++;
            console.log(`  ✓ ${emp.full_name}`);
          } catch (error: any) {
            errorCount++;
            console.error(`  ✗ ${emp.full_name}: ${error.message}`);
          }
        }

        console.log(`[Import] Completed: ${successCount} success, ${errorCount} errors`);
        return {
          success: errorCount === 0,
          successCount,
          errorCount,
          message: `Imported ${successCount}/${input.employees.length} employees`,
        };
      } catch (error: any) {
        console.error("[Import] Error:", error);
        throw new Error(`Import failed: ${error.message}`);
      }
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      }),
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
