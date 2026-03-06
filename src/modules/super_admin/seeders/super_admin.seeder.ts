import mongoose from "mongoose";
import { User } from "../../user/models/user.model.ts";
import { Organization } from "../../organization/models/organization.model.ts";
import { Role, rolePermissions } from "../../roles/models/role.model.ts";
import { logger } from "../../../utils/logger.ts";

/**
 * One-time seeder to create the initial super admin user.
 * Uses INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD environment variables.
 *
 * Run with: npm run seed:admin
 */

const DB_URI =
  process.env.DB_CONNECTION_STRING || "mongodb://localhost:27017/lend-event";
const ADMIN_EMAIL = process.env.INITIAL_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD;

async function seedSuperAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    logger.error(
      "INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD environment variables are required",
    );
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    await mongoose.connect(DB_URI);
    logger.info("Connected to MongoDB");

    // Check if super admin already exists (match by email only — roleId is now
    // a real ObjectId referencing the super_admin Role document).
    const existingAdmin = await User.findOne({
      email: ADMIN_EMAIL.toLowerCase().trim(),
    });

    if (existingAdmin) {
      logger.info("Super admin user already exists, skipping seed");
      return;
    }

    // Create or get the platform organization (required for super admin)
    let platformOrg = await Organization.findOne({
      email: "platform@system.internal",
    });

    if (!platformOrg) {
      // Create a special admin ObjectId for platform organization owner
      const platformAdminId = new mongoose.Types.ObjectId();

      const orgDoc = new Organization({
        name: "Platform Administration",
        legalName: "Platform Administration",
        email: "platform@system.internal",
        phone: "+10000000000",
        ownerId: platformAdminId,
        status: "active",
        subscription: {
          plan: "system",
          seatCount: 1,
          catalogItemCount: 1,
        },
      });

      platformOrg = await orgDoc.save();
      logger.info(`Created platform organization with ID: ${platformOrg._id}`);
    }

    // Ensure the platform super_admin Role document exists (upsert by org + name).
    // This mirrors how register() seeds org roles via Role.insertMany() before
    // creating the user, ensuring roleId always points to a real Role document.
    let superAdminRole = await Role.findOne({
      organizationId: platformOrg._id,
      name: "super_admin",
    });

    if (!superAdminRole) {
      superAdminRole = await Role.create({
        organizationId: platformOrg._id,
        name: "super_admin",
        permissions: rolePermissions.super_admin,
        isReadOnly: true,
        type: "SYSTEM",
        description:
          "Platform super admin — full access. System role, non-editable and non-deletable.",
      });
      logger.info(`Created super_admin role with ID: ${superAdminRole._id}`);
    }

    const platformAdminId =
      (platformOrg as any).ownerId ?? new mongoose.Types.ObjectId();

    // Create the super admin user using the real Role _id, matching the pattern
    // used by register() which sets roleId: ownerRole._id.toString().
    const superAdminUser = new User({
      _id: platformAdminId,
      organizationId: platformOrg._id,
      name: {
        firstName: "Super",
        secondName: "",
        firstSurname: "Admin",
        secondSurname: "",
      },
      email: ADMIN_EMAIL.toLowerCase().trim(),
      phone: "+10000000000",
      password: ADMIN_PASSWORD,
      roleId: superAdminRole._id.toString(),
      status: "active",
    });

    await superAdminUser.save();
    logger.info(
      `Super admin user created successfully with email: ${ADMIN_EMAIL}`,
    );
  } catch (error) {
    logger.error("Error seeding super admin:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info("Database connection closed");
  }
}

// Run the seeder
seedSuperAdmin()
  .then(() => {
    logger.info("Seeding completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    logger.error("Seeding failed:", error);
    process.exit(1);
  });
