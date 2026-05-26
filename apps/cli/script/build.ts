/**
 * Build native binaries for all platforms using fossilize (Node SEA).
 *
 * Step 1: esbuild bundles src/bin.ts into a single CJS file.
 * Step 2: fossilize compiles that into native binaries for each platform.
 *
 * Usage:
 *   tsx script/build.ts                 # Build for current platform
 *   FOSSILIZE_PLATFORMS=linux-x64,darwin-arm64 tsx script/build.ts
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);

const outfile = "dist/bundle.cjs";

await build({
  entryPoints: ["./src/bin.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile,
  treeShaking: true,
  minify: true,
  sourcemap: "linked",
  define: {
    FREESTYLE_CLI_VERSION: JSON.stringify(pkg.version),
  },
  external: ["node:*"],
});

console.log(`Bundled → ${outfile}`);

const fossilizeCmd = `npx fossilize --no-bundle -o freestyle ${outfile}`;

console.log(`Running: ${fossilizeCmd}`);
execSync(fossilizeCmd, { stdio: "inherit" });

console.log("Native binaries built → dist-bin/");
