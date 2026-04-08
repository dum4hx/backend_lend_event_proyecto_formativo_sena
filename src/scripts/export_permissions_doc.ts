import { writeFile } from "node:fs/promises";
import { disconnect } from "mongoose";
import { connectDB } from "../utils/db/connectDB.ts";
import { Permission } from "../modules/roles/models/permissions.model.ts";

type PermissionDoc = {
  _id: string;
  displayName: string;
  description: string;
  category: string;
  isActive: boolean;
  isPlatformPermission: boolean;
};

const ACTION_EXPLANATIONS: Record<string, string> = {
  create: "Create new records in this resource.",
  read: "View/list records and details for this resource.",
  update: "Modify existing records in this resource.",
  delete: "Remove records from this resource.",
  approve: "Approve pending workflows for this resource.",
  assign: "Assign ownership/responsibility for this resource.",
  checkout: "Mark items in this resource as checked out.",
  return: "Process returns and close checkouts for this resource.",
  manage: "Perform administrative/management operations for this resource.",
  state_update: "Change lifecycle/status state for this resource.",
  send: "Initiate physical transfer shipments.",
  receive: "Mark transfer shipments as received.",
};

function titleize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function explainAction(actionRaw: string): string {
  const action = actionRaw.replace(/-/g, "_");
  if (ACTION_EXPLANATIONS[action]) {
    return ACTION_EXPLANATIONS[action];
  }

  return `Perform the \`${actionRaw}\` operation on this resource.`;
}

function toSection(permission: PermissionDoc): string {
  const [resourceRaw, actionRaw] = permission._id.split(":");
  const resource = resourceRaw ?? "unknown";
  const action = actionRaw ?? "unknown";

  const lines = [
    `### \`${permission._id}\``,
    "",
    `- **Display Name:** ${permission.displayName}`,
    `- **Category:** ${permission.category}`,
    `- **Scope:** ${permission.isPlatformPermission ? "Platform" : "Organization"}`,
    `- **Active:** ${permission.isActive ? "Yes" : "No"}`,
    `- **Purpose:** ${permission.description}`,
    `- **Allowed Action:** ${explainAction(action)}`,
    `- **Resource Target:** ${titleize(resource)}`,
    "",
  ];

  return lines.join("\n");
}

async function main() {
  await connectDB();

  const permissions = (await Permission.find(
    {},
    {
      _id: 1,
      displayName: 1,
      description: 1,
      category: 1,
      isActive: 1,
      isPlatformPermission: 1,
    },
  )
    .sort({ category: 1, _id: 1 })
    .lean()) as PermissionDoc[];

  const generatedAt = new Date().toISOString();

  const header = [
    "# Permissions Reference",
    "",
    `Generated at: ${generatedAt}`,
    "",
    `Total permissions: ${permissions.length}`,
    "",
    "This document is generated from the MongoDB `permissions` collection.",
    "Each section explains the purpose of a permission and the action it allows.",
    "",
    "## Index",
    "",
    ...permissions.map(
      (p) => `- [\`${p._id}\`](#${p._id.replace(/[:]/g, "")})`,
    ),
    "",
    "## Permission Details",
    "",
  ].join("\n");

  const body = permissions
    .map((permission) => toSection(permission))
    .join("\n");
  const output = `${header}${body}`;

  await writeFile("docs/PERMISSIONS_REFERENCE.md", output, "utf8");

  console.log(
    `Generated docs/PERMISSIONS_REFERENCE.md with ${permissions.length} permissions.`,
  );
}

main()
  .catch((err) => {
    console.error("Failed to export permissions documentation:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnect();
  });
