import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pluginSlug } from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";
import * as tar from "tar";

const log = createAppLogger("plugin-installer");

const NPM_REGISTRY = "https://registry.npmjs.org";

/** Metadata resolved from the npm registry for a specific plugin version. */
export interface ResolvedPackage {
  name: string;
  version: string;
  tarball: string;
  /** `dist.integrity` (SRI) when present, else a `sha1-<hex>` from `shasum`. */
  integrity?: string;
  shasum?: string;
}

/** The result of a successful install. */
export interface InstalledPackage {
  name: string;
  version: string;
  /** Absolute directory the package was extracted into. */
  dir: string;
}

interface NpmPackument {
  "dist-tags"?: Record<string, string>;
  versions?: Record<
    string,
    {
      name?: string;
      version?: string;
      dist?: { tarball?: string; integrity?: string; shasum?: string };
    }
  >;
}

/**
 * Resolve a plugin package + version to its tarball URL and integrity, querying
 * the npm registry. When `version` is omitted the `latest` dist-tag is used.
 */
export async function resolvePackage(
  npmName: string,
  version?: string,
): Promise<ResolvedPackage> {
  const url = `${NPM_REGISTRY}/${encodeName(npmName)}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`registry returned HTTP ${res.status} for "${npmName}"`);
  }
  const doc = (await res.json()) as NpmPackument;
  const resolvedVersion = version ?? doc["dist-tags"]?.latest;
  if (!resolvedVersion) {
    throw new Error(`no version resolved for "${npmName}"`);
  }
  const entry = doc.versions?.[resolvedVersion];
  const tarball = entry?.dist?.tarball;
  if (!entry || !tarball) {
    throw new Error(`version "${resolvedVersion}" of "${npmName}" not found`);
  }
  return {
    name: entry.name ?? npmName,
    version: entry.version ?? resolvedVersion,
    tarball,
    ...(entry.dist?.integrity ? { integrity: entry.dist.integrity } : {}),
    ...(entry.dist?.shasum ? { shasum: entry.dist.shasum } : {}),
  };
}

/**
 * Download, verify, and extract a plugin package into
 * `<pluginsDir>/<slug(name)>/`. The download is staged in a temp dir and atomically
 * swapped into place, so a failed install never leaves a half-written package.
 */
export async function installPackage(
  pluginsDir: string,
  resolved: ResolvedPackage,
): Promise<InstalledPackage> {
  const res = await fetch(resolved.tarball);
  if (!res.ok || !res.body) {
    throw new Error(`failed to download tarball (HTTP ${res.status})`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  verifyIntegrity(bytes, resolved);

  const slug = pluginSlug(resolved.name);
  const dest = path.join(pluginsDir, slug);
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "freestyle-plugin-"));

  try {
    // npm tarballs wrap everything under a top-level `package/` directory, so
    // strip it. Feed the in-memory bytes through tar's unpack stream.
    await extractBuffer(bytes, staging);
    await fs.rm(dest, { recursive: true, force: true });
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(staging, dest);
  } catch (err) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  log.info(`installed ${resolved.name}@${resolved.version} -> ${dest}`);
  return { name: resolved.name, version: resolved.version, dir: dest };
}

/**
 * Remove an installed plugin's directory from `<pluginsDir>/<slug(name)>/`.
 * Best-effort: a missing directory is treated as already uninstalled.
 */
export async function uninstallPackage(
  pluginsDir: string,
  name: string,
): Promise<void> {
  const dir = path.join(pluginsDir, pluginSlug(name));
  await fs.rm(dir, { recursive: true, force: true });
  log.info(`uninstalled ${name} (${dir})`);
}

/** Extract gzipped-tar bytes into `cwd`, stripping the leading `package/`. */
function extractBuffer(bytes: Buffer, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = tar.x({ cwd, strip: 1 });
    stream.on("error", reject);
    stream.on("finish", () => resolve());
    stream.end(bytes);
  });
}

/** Throw if the downloaded bytes don't match the registry's integrity/shasum. */
function verifyIntegrity(bytes: Buffer, resolved: ResolvedPackage): void {
  if (resolved.integrity) {
    // SRI: `<alg>-<base64>` (npm uses sha512).
    const [alg, expected] = resolved.integrity.split("-", 2);
    if (alg && expected) {
      const actual = createHash(alg).update(bytes).digest("base64");
      if (actual !== expected) {
        throw new Error(`integrity mismatch for ${resolved.name}`);
      }
      return;
    }
  }
  if (resolved.shasum) {
    const actual = createHash("sha1").update(bytes).digest("hex");
    if (actual !== resolved.shasum) {
      throw new Error(`shasum mismatch for ${resolved.name}`);
    }
    return;
  }
  throw new Error(`no integrity metadata for ${resolved.name}`);
}

/** Encode a (possibly scoped) package name for a registry URL path. */
function encodeName(name: string): string {
  // A scoped name `@scope/pkg` must keep its slash unencoded in the path.
  return name.startsWith("@")
    ? `@${encodeURIComponent(name.slice(1))}`
    : encodeURIComponent(name);
}
