/**
 * Audit script to identify locations with invalid manager assignments.
 * Checks for:
 * 1. Locations missing managerId field
 * 2. Locations with managers that have invalid roles (e.g., Owner instead of Manager)
 * 
 * Usage: npx ts-node scripts/audit_location_managers.ts
 * Output: logs/location-audit-<timestamp>.json
 * Exit codes:
 *   0 = All locations valid
 *   1 = Invalid locations found
 */

import mongoose from "mongoose";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_MANAGER_ROLE_VARIANTS = new Set([
  "gerente",
  "gerente de sede",
  "manager",
  "branch manager",
]);

// ============================================================================
// CONNECT TO DATABASE
// ============================================================================

async function connectDb() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    throw error;
  }
}

// ============================================================================
// AUDIT LOGIC
// ============================================================================

interface LocationAuditIssue {
  type: "missing_manager" | "invalid_manager_role";
  locationId: string;
  locationName: string;
  code: string;
  organizationId: string;
  managerId?: string;
  managerRoleName?: string;
  description: string;
}

interface AuditReport {
  timestamp: string;
  totalLocations: number;
  validLocations: number;
  issuesFound: number;
  issues: LocationAuditIssue[];
  summary: {
    missing_manager: number;
    invalid_manager_role: number;
  };
}

async function auditLocationManagers(): Promise<AuditReport> {
  // Get all locations with populated manager and manager role
  const pipeline = [
    {
      $lookup: {
        from: "users",
        localField: "managerId",
        foreignField: "_id",
        as: "managerData",
      },
    },
    {
      $lookup: {
        from: "roles",
        localField: "managerData.roleId",
        foreignField: "_id",
        as: "roleData",
      },
    },
    {
      $project: {
        _id: 1,
        code: 1,
        name: 1,
        organizationId: 1,
        managerId: 1,
        manager: {
          $arrayElemAt: ["$managerData", 0],
        },
        role: {
          $arrayElemAt: ["$roleData", 0],
        },
      },
    },
  ];

  const db = mongoose.connection;
  const locations = await db.collection("locations").aggregate(pipeline).toArray();

  console.log(`📊 Total locations in database: ${locations.length}`);

  const issues: LocationAuditIssue[] = [];
  let validCount = 0;

  for (const location of locations) {
    // Check 1: Missing managerId
    if (!location.managerId) {
      issues.push({
        type: "missing_manager",
        locationId: location._id.toString(),
        locationName: location.name,
        code: location.code,
        organizationId: location.organizationId.toString(),
        description: "Ubicación sin gerente asignado (managerId vacío)",
      });
      continue;
    }

    // Check 2: Invalid manager role
    if (location.manager && location.role) {
      const roleNameLower = (location.role.name || "").toLowerCase().trim();
      if (!VALID_MANAGER_ROLE_VARIANTS.has(roleNameLower)) {
        issues.push({
          type: "invalid_manager_role",
          locationId: location._id.toString(),
          locationName: location.name,
          code: location.code,
          organizationId: location.organizationId.toString(),
          managerId: location.managerId.toString(),
          managerRoleName: location.role.name,
          description: `Manager tiene rol inválido '${location.role.name}'. Solo se permiten roles Manager/Gerente.`,
        });
        continue;
      }
    }

    validCount++;
  }

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    totalLocations: locations.length,
    validLocations: validCount,
    issuesFound: issues.length,
    issues,
    summary: {
      missing_manager: issues.filter((i) => i.type === "missing_manager").length,
      invalid_manager_role: issues.filter(
        (i) => i.type === "invalid_manager_role"
      ).length,
    },
  };

  return report;
}

// ============================================================================
// SAVE REPORT
// ============================================================================

function saveReport(report: AuditReport): string {
  const logsDir = path.join(process.cwd(), "logs");

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = Date.now();
  const filename = `location-audit-${timestamp}.json`;
  const filepath = path.join(logsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8");

  return filepath;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    await connectDb();

    console.log("\n🔍 Auditing location manager assignments...\n");

    const report = await auditLocationManagers();

    const filepath = saveReport(report);

    console.log(`\n📋 Audit Complete`);
    console.log(`   Total ubicaciones: ${report.totalLocations}`);
    console.log(`   Ubicaciones válidas: ${report.validLocations}`);
    console.log(`   Problemas encontrados: ${report.issuesFound}`);
    console.log(`\n📌 Detalle de problemas:`);
    console.log(`   Sin gerente asignado: ${report.summary.missing_manager}`);
    console.log(
      `   Rol de gerente inválido: ${report.summary.invalid_manager_role}`
    );

    console.log(`\n💾 Reporte guardado: ${filepath}`);

    if (report.issuesFound > 0) {
      console.log(`\n⚠️  Se encontraron ${report.issuesFound} ubicaciones con problemas.`);
      console.log(`   Revisa el reporte para detalles específicos.`);

      await mongoose.connection.close();
      process.exit(1);
    } else {
      console.log(`\n✅ Todas las ubicaciones tienen asignaciones válidas de gerente.`);

      await mongoose.connection.close();
      process.exit(0);
    }
  } catch (error) {
    console.error("\n❌ Error durante auditoría:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

main();
