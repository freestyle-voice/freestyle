/**
 * Bundle the CLI for npm distribution.
 *
 * Produces dist/bin.cjs (a single CJS file with all dependencies bundled)
 * and dist/index.cjs (a thin wrapper with Node version check + shebang).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);

await build({
  entryPoints: ["./src/bin.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/index.cjs",
  treeShaking: true,
  minify: true,
  sourcemap: "linked",
  define: {
    FREESTYLE_CLI_VERSION: JSON.stringify(pkg.version),
  },
  banner: {
    js: "/* @freestyle/cli */",
  },
  external: ["node:*"],
});

mkdirSync("dist", { recursive: true });

const binWrapper = `#!/usr/bin/env node
{
  const v = process.versions.node.split(".").map(Number);
  if (v[0] < 22) {
    console.error("Freestyle CLI requires Node.js >= 22. Current: " + process.version);
    process.exit(1);
  }
}
{
  const e = process.emit;
  process.emit = function (n, ...a) {
    return n === "warning" ? false : e.apply(this, [n, ...a]);
  };
}
require("./index.cjs");
`;

writeFileSync("dist/bin.cjs", binWrapper);

console.log(`Bundled @freestyle/cli v${pkg.version} → dist/`);
