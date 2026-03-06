import mongoose, { Types } from "mongoose";
import { fileURLToPath } from "url";
import path from "path";
import { User } from "../models/user.model.ts";
import { Organization } from "../../organization/models/organization.model.ts";
import { Role, rolePermissions } from "../../roles/models/role.model.ts";

type SeedItem = {
  userEmail: string;
  businessEmail: string;
  firstName: string;
  firstSurname: string;
  phone: string;
  password: string;
};

const seedItems: SeedItem[] = [
  {
    userEmail: "sduqueordones2@gmail.com",
    businessEmail: "examplebusiness1@gmail.com",
    firstName: "Sergio",
    firstSurname: "Duque",
    phone: "+15550000001",
    password: "Password123.",
  },
  {
    userEmail: "santiagoduqueordonez@gmail.com",
    businessEmail: "examplebusiness2@gmail.com",
    firstName: "Santiago",
    firstSurname: "Duque",
    phone: "+15550000002",
    password: "Password123.",
  },
  {
    userEmail: "dum4h@gmail.com",
    businessEmail: "examplebusiness3@gmail.com",
    firstName: "Dum",
    firstSurname: "H",
    phone: "+15550000003",
    password: "Password123.",
  },
];

export async function seedUsers(): Promise<void> {
  for (const item of seedItems) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const orgId = new Types.ObjectId();
        const userId = new Types.ObjectId();

        // Create organization referencing the future user as owner
        const org = new Organization({
          _id: orgId,
          name: `${item.firstName} ${item.firstSurname} Company`,
          legalName: `${item.firstName} ${item.firstSurname} Company`,
          email: item.businessEmail,
          ownerId: userId,
        });
        await org.save({ session });

        // Find SYSTEM owner role and copy its permissions; fallback to exported defaults
        const systemOwner = await Role.findOne({
          type: "SYSTEM",
          name: "owner",
        })
          .lean()
          .exec();

        const role = new Role({
          organizationId: orgId,
          name: "owner",
          permissions: systemOwner?.permissions ?? rolePermissions.owner,
          description: systemOwner?.description ?? "Organization owner role",
          isReadOnly: false,
          type: "CUSTOM",
        });
        await role.save({ session });

        // Create user belonging to the organization and assigned the copied role
        const user = new User({
          _id: userId,
          organizationId: orgId,
          name: {
            firstName: item.firstName,
            secondName: "",
            firstSurname: item.firstSurname,
            secondSurname: "",
          },
          email: item.userEmail,
          phone: item.phone,
          password: item.password,
          roleId: role._id.toString(),
        });
        await user.save({ session });
      });
    } catch (err) {
      // Transaction aborted on error — session will be ended below
      // Re-throw to surface if needed
      console.error("Seeder error for", item.userEmail, err);
    } finally {
      session.endSession();
    }
  }
}

// If executed directly (ESM), run the seeder (useful for manual invocation)
const __filename = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(__filename) === path.resolve(process.argv[1])
) {
  (async () => {
    try {
      await seedUsers();
      // eslint-disable-next-line no-console
      console.log("User seeding complete");
      process.exit(0);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    }
  })();
}
