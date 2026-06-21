import { statfs } from "node:fs/promises";
import { createAppLogger } from "@freestyle/utils";

const log = createAppLogger("disk");

function formatGiB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/**
 * Free bytes available to the current (unprivileged) user on the filesystem
 * that contains `dir`, or `null` if it can't be determined.
 */
export async function getFreeSpace(dir: string): Promise<number | null> {
  try {
    const stats = await statfs(dir);
    // `bavail` = blocks free for unprivileged users; `bsize` = block size.
    return Number(stats.bavail) * Number(stats.bsize);
  } catch (err) {
    log.warn(`Could not read free disk space for ${dir}: ${String(err)}`);
    return null;
  }
}

/** Raised by `assertEnoughDiskSpace` when the target volume is too full. */
export class InsufficientDiskSpaceError extends Error {
  readonly code = "ENOSPC";
  readonly requiredBytes: number;
  readonly freeBytes: number;

  constructor(requiredBytes: number, freeBytes: number) {
    super(
      `Not enough disk space: need ~${formatGiB(requiredBytes)}, only ${formatGiB(
        freeBytes,
      )} free.`,
    );
    this.name = "InsufficientDiskSpaceError";
    this.requiredBytes = requiredBytes;
    this.freeBytes = freeBytes;
  }
}

/**
 * Throw {@link InsufficientDiskSpaceError} when the filesystem holding `dir`
 * has less than `requiredBytes` available. Best-effort: if free space can't be
 * read (e.g. `statfs` unsupported), this is a no-op so a legitimate download is
 * never blocked by a probe failure.
 */
export async function assertEnoughDiskSpace(
  dir: string,
  requiredBytes: number,
): Promise<void> {
  const free = await getFreeSpace(dir);
  if (free === null) return;
  if (free < requiredBytes) {
    throw new InsufficientDiskSpaceError(requiredBytes, free);
  }
}

/**
 * Map a download/extraction error to a short, user-facing message.
 *
 * Out-of-disk conditions — our own pre-flight check, a Node `ENOSPC`, or a raw
 * `tar` "No space left on device" stderr dump — collapse to one clear sentence.
 * Anything else returns a trimmed first line, so the UI never renders a
 * multi-line stderr wall.
 */
export function describeDownloadError(err: unknown): string {
  if (err instanceof InsufficientDiskSpaceError) {
    return `Not enough disk space — free up about ${formatGiB(
      err.requiredBytes,
    )} and try again.`;
  }

  const raw = err instanceof Error ? err.message : String(err);
  if (/ENOSPC/i.test(raw) || /no space left on device/i.test(raw)) {
    return "Not enough disk space to finish the download. Free up some space and try again.";
  }

  const firstLine =
    raw
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? raw;
  return firstLine.length > 200 ? `${firstLine.slice(0, 197)}…` : firstLine;
}
