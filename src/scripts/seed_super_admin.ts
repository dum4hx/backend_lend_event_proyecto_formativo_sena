import mongoose from "mongoose";
import { User } from "../modules/user/models/user.model.ts";
import { Organization } from "../modules/organization/models/organization.model.ts";
import { logger } from "../utils/logger.ts";

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

    // Check if super admin already exists
    const existingAdmin = await User.findOne({
      email: ADMIN_EMAIL.toLowerCase().trim(),
      role: "super_admin",
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

      // Create the super admin user
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
        role: "super_admin",
        status: "active",
      });

      await superAdminUser.save();
      logger.info(
        `Super admin user created successfully with email: ${ADMIN_EMAIL}`,
      );
    } else {
      // Platform org exists, just create the user
      const superAdminUser = new User({
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
        role: "super_admin",
        status: "active",
      });

      await superAdminUser.save();
      logger.info(
        `Super admin user created successfully with email: ${ADMIN_EMAIL}`,
      );
    }
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
