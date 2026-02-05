#!/usr/bin/env npx zx

// 1. Check for uncommitted changes
let status = await $`git status --porcelain`;
if (status.stdout.trim().length > 0) {
  console.log(chalk.red("\n[ERROR] You have uncommitted changes!"));
  console.log(chalk.yellow("Please commit or stash your work first.\n"));
  process.exit(1);
}

console.log(chalk.cyan("\n========================================="));
console.log(chalk.cyan("      SCALABLE GIT BRANCH CREATOR      "));
console.log(chalk.cyan("=========================================\n"));

// 2. Select Type of Action
console.log(chalk.white("Select the type of change:"));
console.log("1) Feature  - New functionality");
console.log("2) Bugfix   - Development fix");
console.log("3) Hotfix   - Critical production fix");
console.log("4) Refactor - Code improvement");
console.log("5) Chore    - Maintenance/Config");

const typeChoice = await question(chalk.green("\nChoose an option (1-5): "));

const types = {
  "1": { prefix: "feature", base: "develop" },
  "2": { prefix: "bugfix", base: "develop" },
  "3": { prefix: "hotfix", base: "main" },
  "4": { prefix: "refactor", base: "develop" },
  "5": { prefix: "chore", base: "develop" },
};

const selected = types[typeChoice];
if (!selected) {
  console.log(chalk.red("Invalid selection. Exiting."));
  process.exit(1);
}

// 3. Prompt for Issue ID
let issueId = await question("Step 2: Enter Issue ID (e.g., KAN-123): ");
if (!issueId && selected.prefix !== "chore") {
  console.log(
    chalk.red("[ERROR] Issue ID is required for this type of change."),
  );
  process.exit(1);
}

// 4. Prompt for Description
let description = await question("Step 3: Enter short description: ");

// 5. Validation Logic: Description length
const words = description.trim().split(/\s+/);
if (words.length > 5) {
  console.log(
    chalk.yellow(`\n[WARNING] Try to keep description under 5 words.\n`),
  );
}

// 6. Formatting
const formattedDesc = description.toLowerCase().trim().replace(/\s+/g, "-");
const branchName = issueId
  ? `${selected.prefix}/${issueId}-${formattedDesc}`
  : `${selected.prefix}/${formattedDesc}`;

console.log(chalk.blue(`\nTarget Branch: ${branchName}`));
console.log(chalk.blue(`Base Branch:   ${selected.base}`));

// 7. Git Operations
try {
  await $`git checkout ${selected.base}`;
  await $`git pull origin ${selected.base}`;
  await $`git checkout -b ${branchName}`;

  console.log(
    chalk.green(
      `\nSUCCESS: You are now on ${branchName} (based on ${selected.base})`,
    ),
  );
} catch (p) {
  console.log(chalk.red(`\n[ERROR] Git command failed: ${p.stderr}`));
  process.exit(1);
}
