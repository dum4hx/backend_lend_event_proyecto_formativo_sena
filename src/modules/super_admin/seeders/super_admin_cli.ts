import mongoose from "mongoose";
import readline from "readline";
import { User } from "../../user/models/user.model.ts";
import { Organization } from "../../organization/models/organization.model.ts";
import { Role, rolePermissions } from "../../roles/models/role.model.ts";
import { logger } from "../../../utils/logger.ts";

/**
 * Interactive CLI script to create a super admin account.
 * Asks for email and password via command line prompts.
 *
 * Usage: node --env-file=.env src/modules/super_admin/seeders/super_admin_cli.ts
 */

const DB_URI =
  process.env.DB_CONNECTION_STRING || "mongodb://localhost:27017/lend-event";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

async function createSuperAdminInteractive() {
  console.log("\n--- Super Admin Manual Creation ---\n");

  const email = await question("Enter Super Admin Email: ");
  if (!email || !email.includes("@")) {
    console.error("Invalid email address.");
    process.exit(1);
  }

  // Hide password input is tricky in plain readline without external libs,
  // but for a dev/admin script we'll keep it simple or note it.
  const password = await question("Enter Super Admin Password: ");
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters long.");
    process.exit(1);
  }

  const confirm = await question(`Create super admin for ${email}? (y/n): `);
  if (confirm.toLowerCase() !== "y") {
    console.log("Operation cancelled.");
    process.exit(0);
  }

  try {
    await mongoose.connect(DB_URI);
    logger.info("Connected to MongoDB");

    const existingAdminByEmail = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (existingAdminByEmail) {
      logger.error(`User with email ${email} already exists.`);
      process.exit(1);
    }

    // Match any existing platform org regardless of which random suffix was used.
    let platformOrg = await Organization.findOne({
      email: /^platform\d{6}@system\.internal$/,
    });

    if (!platformOrg) {
      const newPlatformAdminId = new mongoose.Types.ObjectId();
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const platformEmail = `platform${randomSuffix}@system.internal`;
      const orgPhone = `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const orgDoc = new Organization({
        name: "Platform Administration",
        legalName: "Platform Administration",
        email: platformEmail,
        phone: orgPhone,
        ownerId: newPlatformAdminId,
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

    // Check if a user already exists with the organization's ownerId to avoid E11000
    const platformAdminId = (platformOrg as any).ownerId;
    const existingAdminById = await User.findById(platformAdminId);

    if (existingAdminById) {
      logger.error(
        `User already exists with ID ${platformAdminId} (linked to platform org). Cannot create another.`,
      );
      process.exit(1);
    }

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
        description: "Platform super admin — full access.",
      });
      logger.info(`Created super_admin role with ID: ${superAdminRole._id}`);
    }

    const superAdminUser = new User({
      _id: platformAdminId,
      organizationId: platformOrg._id,
      name: {
        firstName: "Super",
        secondName: "",
        firstSurname: "Admin",
        secondSurname: "",
      },
      email: email.toLowerCase().trim(),
      phone: `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      password: password,
      roleId: superAdminRole._id.toString(),
      status: "active",
    });

    await superAdminUser.save();
    console.log(`\nSUCCESS: Super admin created for ${email}\n`);
  } catch (error) {
    logger.error("Error creating super admin:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    rl.close();
  }
}

createSuperAdminInteractive();
