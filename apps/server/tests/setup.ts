import { mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach } from "vitest";

let dbPath: string;

/**
 * Initialise a throwaway SQLite database before the test suite runs.
 * Each test file gets its own temporary DB so tests stay isolated.
 */
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "freestyle-test-"));
  dbPath = join(dir, "test.db");
  process.env.FREESTYLE_DB_PATH = dbPath;
});

/**
 * Clean up the database file after all tests in the suite finish.
 */
afterAll(() => {
  // Reset the module-level singleton so the next suite gets a fresh DB.
  // The db module caches the connection; deleting the env var and
  // removing the file is enough because each test file runs in its
  // own forked process (pool: "forks").
  try {
    unlinkSync(dbPath);
  } catch {
    // Already cleaned up or never created.
  }
});
