import { mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, vi } from "vitest";

let dbPath: string;

/**
 * Initialise a throwaway SQLite database before the test suite runs.
 * Each test file gets its own temporary DB so tests stay isolated.
 *
 * We also use fake timers to prevent the module-level
 * `setTimeout(() => autoStartWhisperServer(), 1000)` in the server
 * entry from firing during tests.
 */
beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });

  const dir = mkdtempSync(join(tmpdir(), "freestyle-test-"));
  dbPath = join(dir, "test.db");
  process.env.FREESTYLE_DB_PATH = dbPath;
});

/**
 * Clean up the database file after all tests in the suite finish.
 */
afterAll(async () => {
  vi.useRealTimers();

  // Close the cached DB connection so the file handle is released
  // before we attempt to delete it.
  const { closeDb } = await import("../src/lib/db.js");
  closeDb();

  try {
    unlinkSync(dbPath);
  } catch {
    // Already cleaned up or never created.
  }
});
