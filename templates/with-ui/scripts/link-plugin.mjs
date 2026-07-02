#!/usr/bin/env node

/**
 * Link (or unlink) a local Freestyle plugin for development.
 *
 * Usage:
 *   node scripts/link-plugin.mjs          # link (build + symlink into Freestyle's plugins dir)
 *   node scripts/link-plugin.mjs --unlink # unlink (remove the dev symlink)
 *
 * The script creates a wrapper directory at `<userData>/plugins/<slug>-dev/`
 * that symlinks back to the plugin's built output. This lets a dev copy coexist
 * alongside a production (npm-installed) copy of the same plugin:
 *
 *   <userData>/plugins/freestyle-voice-my-plugin/     <- npm install
 *   <userData>/plugins/freestyle-voice-my-plugin-dev/ <- this script
 *
 * On Windows, if symlinks fail (requires Developer Mode), the script falls back
 * to copying the built files instead.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect which package manager invoked this script via npm_config_user_agent. */
function detectPackageManager() {
  const ua = process.env.npm_config_user_agent;
  if (!ua) return "npm";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("bun")) return "bun";
  if (ua.startsWith("yarn")) return "yarn";
  return "npm";
}

/** Derive a URL/route-safe slug from a package name (mirrors SDK pluginSlug). */
function pluginSlug(name) {
  return name
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** Resolve the Freestyle userData directory for the current OS. */
function freestyleUserData() {
  const platform = os.platform();
  if (platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Freestyle",
    );
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA;
    if (!appData) throw new Error("APPDATA environment variable is not set");
    return path.join(appData, "Freestyle");
  }
  // Linux / other: XDG_CONFIG_HOME or ~/.config
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "Freestyle");
}

/** Try to create a symlink; return false if it fails (e.g. Windows without dev mode). */
function trySymlink(target, linkPath) {
  try {
    fs.symlinkSync(target, linkPath, "junction"); // "junction" is ignored on non-Windows
    return true;
  } catch {
    return false;
  }
}

/** Recursively copy a directory. */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Append `-dev` to a scoped or unscoped package name.
 * @freestyle-voice/profanity-filter -> @freestyle-voice/profanity-filter-dev
 * my-plugin -> my-plugin-dev
 */
function devName(name) {
  return `${name}-dev`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const unlink = process.argv.includes("--unlink");
const pm = detectPackageManager();

// Resolve the plugin's root from this script's location (scripts/ is one level down).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, "..");
const pkgJsonPath = path.join(pluginRoot, "package.json");

if (!fs.existsSync(pkgJsonPath)) {
  console.error("Error: no package.json found in the plugin root.");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
const pluginName = pkg.name;

if (!pluginName) {
  console.error('Error: package.json is missing a "name" field.');
  process.exit(1);
}

const slug = pluginSlug(pluginName);
const devSlug = `${slug}-dev`;
const pluginsDir = path.join(freestyleUserData(), "plugins");
const devDir = path.join(pluginsDir, devSlug);

// ---- Unlink ---------------------------------------------------------------

if (unlink) {
  if (!fs.existsSync(devDir)) {
    console.log(`Nothing to unlink — ${devDir} does not exist.`);
    process.exit(0);
  }
  fs.rmSync(devDir, { recursive: true, force: true });
  console.log(`Unlinked dev plugin: ${devSlug}`);
  console.log("Restart Freestyle to apply changes.");
  process.exit(0);
}

// ---- Link -----------------------------------------------------------------

// Step 1: Build the plugin if a build script exists.
if (pkg.scripts?.build) {
  console.log("Building plugin...");
  try {
    execSync(`${pm} run build`, { cwd: pluginRoot, stdio: "inherit" });
  } catch {
    console.error("Build failed. Fix the errors above and try again.");
    process.exit(1);
  }
}

// Verify dist/ exists after build.
const distDir = path.join(pluginRoot, "dist");
if (!fs.existsSync(distDir)) {
  console.error("Error: no dist/ directory found after build.");
  console.error("Make sure the plugin's build script produces a dist/ folder.");
  process.exit(1);
}

// Step 2: Ensure the plugins directory exists.
fs.mkdirSync(pluginsDir, { recursive: true });

// Step 3: Remove any previous dev link.
if (fs.existsSync(devDir)) {
  fs.rmSync(devDir, { recursive: true, force: true });
}

// Step 4: Create the wrapper directory with a generated package.json that
// references the source plugin's dist/ via symlinks. This lets the dev copy
// coexist with a production install of the same plugin.
fs.mkdirSync(devDir, { recursive: true });

// Generate a dev package.json with a suffixed name so it gets a unique slug.
const devPkg = {
  name: devName(pluginName),
  version: pkg.version || "0.0.0-dev",
  description: `[DEV] ${pkg.description || pluginName}`,
  main: pkg.main || "dist/index.js",
};

// Preserve the freestyle manifest (icon, pages) so the UI works.
if (pkg.freestyle) {
  devPkg.freestyle = pkg.freestyle;
}

fs.writeFileSync(
  path.join(devDir, "package.json"),
  `${JSON.stringify(devPkg, null, 2)}\n`,
);

// Step 5: Symlink dist/ (or copy as fallback).
const distLink = path.join(devDir, "dist");
if (!trySymlink(distDir, distLink)) {
  console.log("Symlink failed — falling back to copy...");
  copyDir(distDir, distLink);
  console.log(
    `Note: changes won't be reflected live. Re-run \`${pm} run link\` after each build.`,
  );
}

// Step 6: Symlink README if present.
const readmeSrc = path.join(pluginRoot, "README.md");
if (fs.existsSync(readmeSrc)) {
  const readmeLink = path.join(devDir, "README.md");
  if (!trySymlink(readmeSrc, readmeLink)) {
    try {
      fs.copyFileSync(readmeSrc, readmeLink);
    } catch {
      // Non-critical — skip.
    }
  }
}

console.log();
console.log(`Linked dev plugin: ${devSlug}`);
console.log(`  ${devDir}`);
if (fs.lstatSync(distLink).isSymbolicLink()) {
  console.log(
    `  dist/ → ${distDir} (symlinked — changes are live after rebuild)`,
  );
} else {
  console.log(`  dist/ copied (re-run \`${pm} run link\` after changes)`);
}
console.log();
console.log(
  "Start (or restart) Freestyle to see the plugin in the Plugins page.",
);
console.log("Enable it from there to activate its hooks and middleware.");
