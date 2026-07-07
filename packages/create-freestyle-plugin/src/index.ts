#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { downloadTemplate } from "@bluwy/giget-core";
import confirm from "@inquirer/confirm";
import input from "@inquirer/input";
import select from "@inquirer/select";
import { Option, program } from "commander";
import pc from "picocolors";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const config = {
  user: "freestyle-voice",
  repository: "freestyle",
  directory: "templates",
  ref: "main",
} as const;

interface Template {
  name: string;
  description: string;
}

const templates: Template[] = [
  { name: "basic", description: "Hook-only plugin (no UI)" },
  { name: "with-ui", description: "Plugin with a React UI page" },
];

const templateNames = templates.map((t) => t.name);

const knownPackageManagers = ["pnpm", "npm", "bun", "yarn"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkdirp(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "EEXIST") return;
    throw e;
  }
}

/** Detect which package manager invoked this CLI via npm_config_user_agent. */
function detectPackageManager(): string {
  const ua = process.env.npm_config_user_agent;
  if (!ua) return "npm";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("bun")) return "bun";
  if (ua.startsWith("yarn")) return "yarn";
  return "npm";
}

/** Slugify a project name for use as a package name. */
function toPackageName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-._~]/g, "")
    .replace(/^[._]/, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "my-freestyle-plugin";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const isCurrentDirRegex = /^(\.\/|\.\\|\.)$/;

program
  .name("create-freestyle-plugin")
  .version(version)
  .arguments("[target]")
  .addOption(
    new Option("-t, --template <template>", "Template to use").choices(
      templateNames,
    ),
  )
  .addOption(
    new Option("-i, --install", "Install dependencies after scaffolding"),
  )
  .addOption(
    new Option("-p, --pm <pm>", "Package manager to use").choices(
      knownPackageManagers as unknown as string[],
    ),
  )
  .addOption(new Option("-o, --offline", "Use offline mode").default(false))
  .action(main);

interface Options {
  template?: string;
  install?: boolean;
  pm?: string;
  offline: boolean;
}

async function main(targetDir: string | undefined, options: Options) {
  console.log(pc.gray(`create-freestyle-plugin v${version}`));
  console.log();

  // 1. Target directory
  let target = "";
  if (targetDir) {
    target = targetDir;
    console.log(
      `${pc.bold(`${pc.green("\u2714")} Using target directory`)} \u2026 ${target}`,
    );
  } else {
    target = await input({
      message: "Target directory",
      default: "my-freestyle-plugin",
    });
  }

  let projectName = "";
  if (isCurrentDirRegex.test(target)) {
    projectName = path.basename(process.cwd());
  } else {
    projectName = path.basename(target);
  }

  // 2. Template selection
  const templateName =
    options.template ||
    (await select({
      loop: true,
      message: "Which template do you want to use?",
      choices: templates.map((t) => ({
        name: `${t.name} \u2014 ${t.description}`,
        value: t.name,
      })),
    }));

  if (!templateName || !templateNames.includes(templateName)) {
    console.error(pc.red(`Invalid template: ${templateName}`));
    process.exit(1);
  }

  // 3. Package manager
  const packageManager =
    options.pm ||
    (await select({
      message: "Which package manager do you want to use?",
      choices: knownPackageManagers.map((pm) => ({ name: pm, value: pm })),
      default: detectPackageManager(),
    }));

  // 4. Install dependencies?
  const shouldInstall =
    options.install ??
    (await confirm({
      message: "Install dependencies?",
      default: true,
    }));

  // 5. Check target directory
  if (fs.existsSync(target)) {
    if (fs.readdirSync(target).length > 0) {
      const proceed = await confirm({
        message: "Directory not empty. Continue?",
        default: false,
      });
      if (!proceed) process.exit(1);
    }
  } else {
    mkdirp(target);
  }

  const targetPath = path.resolve(process.cwd(), target);

  // 6. Download template
  console.log();
  console.log(
    `${pc.cyan("\u25B6")} Downloading ${pc.bold(templateName)} template\u2026`,
  );

  try {
    await downloadTemplate(
      `gh:${config.user}/${config.repository}/${config.directory}/${templateName}#${config.ref}`,
      {
        dir: targetPath,
        offline: options.offline,
        force: true,
      },
    );
  } catch (e) {
    console.error(
      pc.red(
        `Failed to download template: ${e instanceof Error ? e.message : e}`,
      ),
    );
    process.exit(1);
  }

  console.log(`${pc.green("\u2714")} Template downloaded`);

  // 7. Rewrite package.json with the project name
  const packageJsonPath = path.join(targetPath, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const raw = fs.readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(raw);

    const pkgName = toPackageName(projectName);
    pkg.name = pkgName;

    // Update the plugin's display name and page title to match
    if (pkg.freestyle) {
      if (pkg.freestyle.displayName === "My Plugin") {
        pkg.freestyle.displayName = projectName;
      }
      if (pkg.freestyle.contributes?.pages?.[0]?.title === "My Plugin") {
        pkg.freestyle.contributes.pages[0].title = projectName;
      }
    }

    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(
      `${pc.green("\u2714")} Package name set to ${pc.bold(pkgName)}`,
    );
  }

  // Also update the plugin name in src/index.ts
  const srcIndexPath = path.join(targetPath, "src", "index.ts");
  if (fs.existsSync(srcIndexPath)) {
    let src = fs.readFileSync(srcIndexPath, "utf-8");
    src = src.replace(
      /name: "freestyle-plugin-starter"/,
      `name: "${toPackageName(projectName)}"`,
    );
    fs.writeFileSync(srcIndexPath, src);
  }

  // 8. Install dependencies
  if (shouldInstall) {
    console.log();
    console.log(
      `${pc.cyan("\u25B6")} Installing dependencies with ${pc.bold(packageManager)}\u2026`,
    );
    try {
      execSync(`${packageManager} install`, {
        cwd: targetPath,
        stdio: "inherit",
      });
      console.log(`${pc.green("\u2714")} Dependencies installed`);
    } catch {
      console.log(pc.yellow("Could not install dependencies. Try manually:"));
      console.log(pc.gray(`  cd ${target} && ${packageManager} install`));
    }
  }

  // 9. Done!
  console.log();
  console.log(pc.green(`${pc.bold("Done!")} Your Freestyle plugin is ready.`));
  console.log();

  const resolvedTarget = path.resolve(target);
  const currentDir = process.cwd();
  if (resolvedTarget !== currentDir) {
    console.log(`  ${pc.gray("cd")} ${target}`);
  }
  if (!shouldInstall) {
    console.log(`  ${pc.gray(packageManager)} install`);
  }
  // Always use the `<pm> run <script>` form: `build` and `link` collide with
  // built-in package-manager commands (e.g. `bun build`, `pnpm/yarn/bun link`),
  // which would run the wrong thing.
  const run = `${packageManager} run`;
  console.log(`  ${pc.gray(run)} build`);
  console.log(
    `  ${pc.gray(run)} link    ${pc.gray("# symlink into Freestyle for testing")}`,
  );
  console.log();
}

program.parse();
