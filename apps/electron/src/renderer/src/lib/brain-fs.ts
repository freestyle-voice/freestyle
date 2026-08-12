import { apiFetch } from "@renderer/lib/api";

export interface BrainFile {
  path: string;
  size: number;
  modified: number;
}

const GET_ROUTES = new Set(["list", "graph", "export"]);

/** In-memory TTL so tab remounts don't flash "Loading…" while Cloudflare refetches. */
const CACHE_TTL_MS = 60_000;

type CacheEntry<T> = { value: T; at: number };

const readCache = new Map<string, CacheEntry<string>>();
let listCache: CacheEntry<BrainFile[]> | null = null;

function isFresh(at: number): boolean {
  return Date.now() - at < CACHE_TTL_MS;
}

function putRead(path: string, text: string): void {
  readCache.set(path, { value: text, at: Date.now() });
}

function invalidateList(): void {
  listCache = null;
}

function dropRead(path: string): void {
  readCache.delete(path);
}

/** Sync cache peek — `undefined` means miss (not yet fetched / expired). */
export function peekBrainFile(path: string): string | undefined {
  const hit = readCache.get(path);
  if (!hit || !isFresh(hit.at)) return undefined;
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
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function readBrainFile(path: string): Promise<string | null> {
  const cached = peekBrainFile(path);
  if (cached !== undefined) return cached;

  const res = await fsCall("read", { path });
  if (!res?.ok) return null;
  const text = (res.text as string) ?? "";
  putRead(path, text);
  return text;
}

export async function writeBrainFile(
  path: string,
  text: string,
): Promise<boolean> {
  const res = await fsCall("write", { path, text });
  const ok = res?.ok === true;
  if (ok) {
    putRead(path, text);
    invalidateList();
  }
  return ok;
}

export async function deleteBrainFile(path: string): Promise<boolean> {
  const res = await fsCall("delete", { path });
  const ok = res?.ok === true;
  if (ok) {
    dropRead(path);
    invalidateList();
  }
  return ok;
}

export async function listBrainFiles(prefix?: string): Promise<BrainFile[]> {
  const cached = peekBrainFiles(prefix);
  if (cached !== undefined) return cached;

  const res = await fsCall("list", {});
  if (!res?.ok) return [];
  const files = (res.files as BrainFile[]) ?? [];
  listCache = { value: files, at: Date.now() };
  if (!prefix) return files;
  return files.filter((f) =>
    f.path.replace(/\\/g, "/").startsWith(`${prefix}/`),
  );
}
