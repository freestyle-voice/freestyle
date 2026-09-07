import { deleteSetting, readSetting, writeSetting } from "./db.js";
import { freestyleCloudUrl } from "./freestyle-cloud.js";
import { getSession } from "./sessions.js";

// Scope pending cancellation to the host and signed-in user. An admission
// whose response was lost also retains its immutable request, so the local
// server can recover its receipt and stop it after the renderer closes.
function key() {
  const session = getSession();
  return session
    ? `remix.cancel.${encodeURIComponent(session.host)}.${session.user.id}`
    : null;
}

export function pendingRemixCancels(): string[] {
  return pendingEntries().flatMap((entry) =>
    entry.turnId ? [entry.turnId] : [],
  );
}

type CancelEntry = {
  turnId?: string;
  request?: Record<string, unknown> & { clientRequestId: string };
};
function pendingEntries(): CancelEntry[] {
  const scopedKey = key();
  if (!scopedKey) return [];
  return (
    JSON.parse(readSetting(scopedKey) ?? "[]") as Array<string | CancelEntry>
  ).map((entry) => (typeof entry === "string" ? { turnId: entry } : entry));
}

export function deferRemixCancel(turnId: string): void {
  deferEntry({ turnId });
}

export function deferRemixRequestCancel(
  request: NonNullable<CancelEntry["request"]>,
): void {
  deferEntry({ request });
}

function entryId(entry: CancelEntry) {
  return entry.turnId ?? entry.request?.clientRequestId;
}
function deferEntry(entry: CancelEntry): void {
  const scopedKey = key();
  if (!scopedKey) throw new Error("cloud_auth_required");
  writeSetting(
    scopedKey,
    JSON.stringify([
      ...pendingEntries().filter((saved) => entryId(saved) !== entryId(entry)),
      entry,
    ]),
  );
}

let flushing: Promise<void> | null = null;
export function flushRemixCancels(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const session = getSession();
    const scopedKey = key();
    if (!session || !scopedKey) return;
    for (const entry of pendingEntries()) {
      try {
        let turnId = entry.turnId;
        if (!turnId && entry.request) {
          const admission = await fetch(
            `${freestyleCloudUrl()}/v2/remix/turns`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.token}`,
              },
              body: JSON.stringify(entry.request),
              signal: AbortSignal.timeout(15_000),
            },
          );
          if (!admission.ok || key() !== scopedKey) continue;
          turnId = ((await admission.json()) as { turn: { id: string } }).turn
            .id;
        }
        if (!turnId || key() !== scopedKey) continue;
        const response = await fetch(
          `${freestyleCloudUrl()}/v2/remix/turns/${encodeURIComponent(turnId)}/commands`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.token}`,
            },
            body: JSON.stringify({ type: "cancel" }),
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (key() !== scopedKey) return;
        if (!response.ok && response.status !== 404) continue;
        const remaining = pendingEntries().filter(
          (saved) => entryId(saved) !== entryId(entry),
        );
        if (remaining.length)
          writeSetting(scopedKey, JSON.stringify(remaining));
        else deleteSetting(scopedKey);
      } catch {
        // Retain the intent through offline periods and process restarts.
      }
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// This belongs to the server, so closing the pill does not abandon Stop.
setInterval(() => {
  void flushRemixCancels().catch(() => {});
}, 10_000).unref();
