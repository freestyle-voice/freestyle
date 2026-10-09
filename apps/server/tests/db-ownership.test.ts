import { describe, expect, it } from "vitest";
import { closeDb, getDb, prepareCached } from "../src/lib/db";
import { acquireServerDatabase } from "../src/lib/db-ownership";

describe("server database ownership", () => {
  it("rejects stale callers even when the replacement owner has cached the same query", () => {
    const previous = acquireServerDatabase();
    previous.run(() => prepareCached("SELECT 1"));
    previous.revoke();
    closeDb();
    const replacement = acquireServerDatabase();
    replacement.run(() => prepareCached("SELECT 1"));
    expect(() => previous.run(() => getDb())).toThrow(
      "Server database owner has stopped",
    );
    expect(() => previous.run(() => prepareCached("SELECT 1"))).toThrow(
      "Server database owner has stopped",
    );
    expect(() => replacement.run(() => getDb())).not.toThrow();
    replacement.revoke();
    closeDb();
  });
});
