#!/usr/bin/env npx zx

// 1. Check for uncommitted changes
let status = await $`git status --porcelain`;
if (status.stdout.trim().length > 0) {
  console.log(chalk.red("\n[ERROR] You have uncommitted changes!"));
  console.log(
    chalk.yellow(
      "Please commit or stash your work before creating a new branch.\n",
    ),
  );
  process.exit(1);
}

console.log(chalk.cyan("========================================="));
console.log(chalk.cyan("   GITHUB FLOW: FEATURE BRANCH CREATOR   "));
console.log(chalk.cyan("=========================================\n"));

// 2. Prompt for Issue ID
let issueId = await question("Step 1: Enter Issue ID (e.g., KAN-123): ");

// 3. Prompt for Description
let description = await question("Step 2: Enter description: ");

// 4. Word count check
const words = description.trim().split(/\s+/);
if (words.length > 5) {
  console.log(
    chalk.yellow(
      `\n[WARNING] Description is ${words.length} words. Try keeping it under 5.\n`,
    ),
  );
}

// 5. Formatting
const formattedDesc = description.toLowerCase().trim().replace(/\s+/g, "-");
const branchName = `feature/${issueId}-${formattedDesc}`;

console.log(chalk.blue(`\nTarget Branch: ${branchName}`));

// 6. Git Operations
try {
  await $`git checkout main`;
  await $`git pull origin main`;
  await $`git checkout -b ${branchName}`;

  console.log(chalk.green(`\nSUCCESS: You are now on ${branchName}`));
} catch (p) {
  console.log(chalk.red(`\n[ERROR] Git command failed: ${p.stderr}`));
  process.exit(1);
}
