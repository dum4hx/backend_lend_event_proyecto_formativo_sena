/**
 * seeders/loan_request.seeder.ts
 *
 * Seeds dummy data for Loan Requests, including Organizations, Customers,
 * Material Types, Categories, Instances, and Packages.
 *
 * Usage:
 *   npx tsx src/modules/request/seeders/loan_request.seeder.ts --userId <USER_ID>
 *   DRY_RUN=1 npx tsx src/modules/request/seeders/loan_request.seeder.ts --userId <USER_ID>
 */

import mongoose, { Types } from "mongoose";
import { connectDB } from "../../../utils/db/connectDB.ts";
import { LoanRequest } from "../models/request.model.ts";
import { User } from "../../user/models/user.model.ts";
import { Role, rolePermissions } from "../../roles/models/role.model.ts";
import { Organization } from "../../organization/models/organization.model.ts";
import {
  Customer,
  type CustomerDocument,
} from "../../customer/models/customer.model.ts";
import { Category } from "../../material/models/category.model.ts";
import { MaterialModel as MaterialType } from "../../material/models/material_type.model.ts";
import { MaterialInstance } from "../../material/models/material_instance.model.ts";
import { Package } from "../../package/models/package.model.ts";
import { Location } from "../../location/models/location.model.ts";
import { randomInt } from "node:crypto";
import { generateAccessToken } from "../../../utils/auth/jwt.ts";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const API_URL = process.env.API_BASE_URL || "https://api.test.local/";

async function apiCall(
  endpoint: string,
  method: string,
  token: string,
  body?: any,
) {
  if (DRY_RUN) {
    console.log(
      `[DRY RUN] ${method} ${endpoint}`,
      body ? JSON.stringify(body) : "",
    );
    return { data: {} };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API Call failed: ${method} ${endpoint} - ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return await response.json();
}

async function seed() {
  const args = process.argv.slice(2);
  const userIdArg = args.find((arg, i) => arg === "--userId" && args[i + 1]);
  const userEmailArg = args.find((arg, i) => arg === "--email" && args[i + 1]);

  const userIdInput = userIdArg ? args[args.indexOf(userIdArg) + 1] : null;
  const userEmailInput = userEmailArg
    ? args[args.indexOf(userEmailArg) + 1]
    : null;

  if (!userIdInput && !userEmailInput) {
    console.error(
      "Error: Either --userId <USER_ID> or --email <USER_EMAIL> is required.",
    );
    process.exit(1);
  }

  try {
    await connectDB();

    // Find user
    let user;
    if (userIdInput) {
      if (!Types.ObjectId.isValid(userIdInput)) {
        console.error("Error: Invalid --userId format.");
        process.exit(1);
      }
      user = await User.findById(userIdInput).populate("roleId");
    } else if (userEmailInput) {
      user = await User.findOne({
        email: userEmailInput.toLowerCase(),
      }).populate("roleId");
    }

    if (!user) {
      const value = userIdInput || userEmailInput || "unknown";
      console.error(
        `Error: User not found with ${userIdInput ? "id" : "email"}: ${value}`,
      );
      process.exit(1);
    }

    // Verify permissions
    const REQUIRED_PERMISSION = "requests:create";
    const userRole = (user.roleId as any)?.name;
    const permissions =
      (rolePermissions[
        userRole as keyof typeof rolePermissions
      ] as unknown as string[]) || [];

    if (!permissions.includes(REQUIRED_PERMISSION)) {
      console.error(
        `Error: User '${(user as any).email}' (role: ${userRole}) does not have '${REQUIRED_PERMISSION}' permission.`,
      );
      process.exit(1);
    }

    // Generate Access Token for API calls
    const userOrgId = (user as any).organizationId;
    if (!userOrgId) {
      console.error(
        `Error: User '${user.email}' is not associated with any organization.`,
      );
      process.exit(1);
    }

    const token = await generateAccessToken({
      sub: (user._id as any).toString(),
      org: userOrgId.toString(),
      roleId: (user.roleId as any)?._id.toString(),
      roleName: (user.roleId as any)?.name,
      email: user.email,
    });
    console.log("✓ Access Token generated for API calls");

    const userId = (user._id as any).toString();
    const organizationId = userOrgId.toString();

    // 2. Create Category via API
    const categoryData = {
      name: `Seeder Category ${Date.now()}`,
      description: "Category created by seeder",
    };

    let category;
    const categoryRes = await apiCall(
      "/materials/categories",
      "POST",
      token,
      categoryData,
    );
    category = DRY_RUN
      ? { _id: new Types.ObjectId() }
      : categoryRes.data.category;
    console.log("✓ Category created via API:", category._id);

    // 3. Create Material Type via API
    const materialTypeData = {
      categoryId: [category._id],
      name: `Seeder Material Type ${Date.now()}`,
      description: "Material type created by seeder",
      pricePerDay: 50,
    };

    let materialType;
    const matTypeRes = await apiCall(
      "/materials/types",
      "POST",
      token,
      materialTypeData,
    );
    materialType = DRY_RUN
      ? { _id: new Types.ObjectId() }
      : matTypeRes.data.materialType;
    console.log("✓ Material Type created via API:", materialType._id);

    // 4. Create Location via API
    const locationData = {
      name: `Seeder Warehouse ${Date.now()}`,
      address: {
        streetType: "Calle",
        primaryNumber: "123",
        secondaryNumber: "A",
        complementaryNumber: "456",
        department: "Capital District",
        city: "Bogotá",
        postalCode: "110111",
      },
      status: "available",
      materialCapacities: [
        {
          materialTypeId: materialType._id,
          maxQuantity: 100,
          currentQuantity: 0,
        },
      ],
      isActive: true,
    };

    let location;
    const locationRes = await apiCall(
      "/locations",
      "POST",
      token,
      locationData,
    );
    location = DRY_RUN ? { _id: new Types.ObjectId() } : locationRes.data;
    console.log("✓ Location created via API:", location._id);

    // 5. Create Material Instance via API
    const instanceDataCount = 3;
    const instances = [];
    for (let i = 0; i < instanceDataCount; i++) {
      const data = {
        modelId: materialType._id,
        serialNumber: `SEED-SN-${Date.now()}-${i}`,
        status: "available",
        locationId: location._id,
      };
      const instRes = await apiCall(
        "/materials/instances",
        "POST",
        token,
        data,
      );
      const inst = DRY_RUN
        ? { _id: new Types.ObjectId() }
        : instRes.data.instance;
      instances.push(inst);
    }
    console.log(`✓ ${instanceDataCount} Material Instances created via API`);

    // 6. Create Package via API
    const packageData = {
      name: `Seeder Package ${Date.now()}`,
      description: "Package created by seeder",
      items: [{ materialTypeId: materialType._id, quantity: 2 }],
      pricePerDay: 80,
      discountRate: 0.2,
      depositAmount: 100,
    };

    let pack;
    const pkgRes = await apiCall("/packages", "POST", token, packageData);
    pack = DRY_RUN ? { _id: new Types.ObjectId() } : pkgRes.data.package;
    console.log("✓ Package created via API:", pack._id);

    // 7. Create Customer via API
    const customerData = {
      name: {
        firstName: "Seed",
        firstSurname: "Customer",
        secondSurname: "",
        secondName: "",
      },
      status: "active",
      email: `customer-${Date.now()}@example.com`,
      phone: "+" + randomInt(1000000000, 9999999999),
      address: {
        streetType: "Calle",
        primaryNumber: "456",
        secondaryNumber: "B",
        complementaryNumber: "10",
        city: "Cust City",
        department: "Cust State",
        country: "Cust Country",
        postalCode: "67890",
      },
      documentType: "CC",
      documentNumber: `SEED-${Date.now()}`,
    };

    let customer;
    const custRes = await apiCall("/customers", "POST", token, customerData);
    customer = DRY_RUN ? { _id: new Types.ObjectId() } : custRes.data.customer;
    console.log("✓ Customer created via API:", customer._id);

    // 8. Create Loan Request via API
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 8);

    const loanRequestData = {
      customerId: customer._id,
      items: [
        {
          type: "material",
          referenceId: materialType._id,
          quantity: 1,
        },
        {
          type: "package",
          referenceId: pack._id,
          quantity: 1,
        },
      ],
      startDate,
      endDate,
      notes: "Dummy request created by seeder",
    };

    const loanReqRes = await apiCall(
      "/requests",
      "POST",
      token,
      loanRequestData,
    );
    const loanRequest = DRY_RUN
      ? { _id: new Types.ObjectId() }
      : loanReqRes.data.request;
    console.log("✓ Loan Request created via API:", loanRequest._id);

    console.log("\nSeed process completed successfully.");
  } catch (error) {
    console.error("Error during seeding:", error);
  } finally {
    if (!DRY_RUN) {
      await mongoose.disconnect();
    }
  }
}

seed();
