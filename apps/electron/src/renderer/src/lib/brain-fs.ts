import { capture } from "@renderer/lib/analytics";
import { apiFetch } from "@renderer/lib/api";

export interface BrainFile {
  path: string;
  size: number;
  modified: number;
}

const GET_ROUTES = new Set(["list", "graph", "export"]);

/** In-memory TTL so tab remounts don't flash "Loading…" while Cloudflare refetches. */
const CACHE_TTL_MS = 60_000;
const MAX_READ_CACHE_ENTRIES = 100;

type CacheEntry<T> = { value: T; at: number };

const readCache = new Map<string, CacheEntry<string>>();
const versions = new Map<string, number>();
let listCache: CacheEntry<BrainFile[]> | null = null;

export class BrainRequestError extends Error {
  constructor(readonly reason: string) {
    super("Could not reach your Brain.");
    this.name = "BrainRequestError";
  }
}

function isFresh(at: number): boolean {
  return Date.now() - at < CACHE_TTL_MS;
}

function pruneReadCache(): void {
  for (const [path, entry] of readCache) {
    if (!isFresh(entry.at)) readCache.delete(path);
  }
  while (readCache.size >= MAX_READ_CACHE_ENTRIES) {
    const oldestPath = readCache.keys().next().value;
    if (oldestPath === undefined) return;
    readCache.delete(oldestPath);
  }
}

function putRead(path: string, text: string): void {
  readCache.delete(path);
  pruneReadCache();
  readCache.set(path, { value: text, at: Date.now() });
}

function invalidateList(): void {
  listCache = null;
}

function dropRead(path: string): void {
  readCache.delete(path);
  versions.delete(path);
}

export function resetBrainCache(): void {
  readCache.clear();
  versions.clear();
  listCache = null;
}

/** Sync cache peek — `undefined` means miss (not yet fetched / expired). */
export function peekBrainFile(path: string): string | undefined {
  const hit = readCache.get(path);
  if (!hit) return undefined;
  if (!isFresh(hit.at)) {
    readCache.delete(path);
    return undefined;
  }
  return hit.value;
}

export function peekBrainFiles(prefix?: string): BrainFile[] | undefined {
  if (!listCache || !isFresh(listCache.at)) return undefined;
  if (!prefix) return listCache.value;
  return listCache.value.filter((f) =>
    f.path.replace(/\\/g, "/").startsWith(`${prefix}/`),
  );
}

export async function fsCall(
  route: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    const isGet = GET_ROUTES.has(route);
    const res = await apiFetch(`/api/brain/${route}`, {
      method: isGet ? "GET" : "POST",
      ...(isGet
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    if (!res.ok) throw new BrainRequestError(`http-${res.status}`);
    const payload = (await res.json()) as Record<string, unknown>;
    if (
      payload.ok === false &&
      typeof payload.reason === "string" &&
      TRANSPORT_FAILURES.has(payload.reason)
    ) {
      throw new BrainRequestError(payload.reason);
    }
    if (payload.ok === true && route === "write") {
      const path = body.path;
      const text = body.text;
      if (typeof path === "string" && typeof text === "string") {
        putRead(path, text);
        if (typeof payload.version === "number")
          versions.set(path, payload.version);
        else versions.delete(path);
        invalidateList();
      }
    }
    if (payload.ok === true && route === "delete") {
      const path = body.path;
      if (typeof path === "string") {
        dropRead(path);
        invalidateList();
      }
    }
    return payload;
  } catch (err) {
    if (err instanceof BrainRequestError) throw err;
    throw new BrainRequestError("network");
  }
}

const TRANSPORT_FAILURES = new Set([
  "cloud_auth_required",
  "cloud-unreachable",
  "brain-failed",
]);

export async function readBrainFile(path: string): Promise<string | null> {
  const cached = peekBrainFile(path);
  if (cached !== undefined) return cached;

  const res = await fsCall("read", { path });
  if (!res?.ok) return null;
  const text = (res.text as string) ?? "";
  putRead(path, text);
  if (typeof res.version === "number") versions.set(path, res.version);
  return text;
}

/** Top-level brain folder, so we can report where a write landed without
 *  ever reporting the path or the contents. */
export function brainFolder(path: string): string {
  const [head = "root"] = path.split("/");
  return head.endsWith(".md") ? head.slice(0, -3).toLowerCase() : head;
}

export async function writeBrainFile(
  path: string,
  text: string,
): Promise<boolean> {
  const version = versions.get(path);
  const res = await fsCall("write", {
    path,
    text,
    ...(version !== undefined ? { ifMatch: version } : {}),
  }).catch(() => null);
  const ok = res?.ok === true;
  if (ok) capture("brain_file_edited", { folder: brainFolder(path) });
  else dropRead(path);
  return ok;
}

export async function deleteBrainFile(path: string): Promise<boolean> {
  const res = await fsCall("delete", { path }).catch(() => null);
  const ok = res?.ok === true;
  if (ok) capture("brain_file_deleted", { folder: brainFolder(path) });
  return ok;
}

export async function listBrainFiles(prefix?: string): Promise<BrainFile[]> {
  const cached = peekBrainFiles(prefix);
  if (cached !== undefined) return cached;

  const res = await fsCall("list", {});
  if (!res?.ok) throw new Error("Could not load Brain files.");
  const files = (res.files as BrainFile[]) ?? [];
  listCache = { value: files, at: Date.now() };
  if (!prefix) return files;
  return files.filter((f) =>
    f.path.replace(/\\/g, "/").startsWith(`${prefix}/`),
  );
}

export async function uniqueBrainPath(path: string): Promise<string> {
  const files = await listBrainFiles().catch(() => [] as BrainFile[]);
  const taken = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
  if (!taken.has(path)) return path;
  const match = /^(.*?)(\.md)?$/.exec(path);
  const base = match?.[1] ?? path;
  const ext = match?.[2] ?? "";
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}
