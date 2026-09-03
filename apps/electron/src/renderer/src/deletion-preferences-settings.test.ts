import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("deletion confirmation preferences", () => {
  it("keeps the reversible session and schedule preferences in Settings", async () => {
    const [settings, shell, schedules] = await Promise.all([
      readFile(resolve(rendererRoot, "pages/settings.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "shell.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "components/scheduled-tasks.tsx"), "utf8"),
    ]);

    expect(settings).toContain("Confirm before deleting sessions");
    expect(settings).toContain("Confirm before deleting schedules");
    expect(settings).toContain('setDeletionConfirmationSkipped("session"');
    expect(settings).toContain('setDeletionConfirmationSkipped("schedule"');
    expect(shell).not.toContain("Confirm session deletions");
    expect(schedules).not.toContain("Confirm schedule deletions");
    expect(schedules).not.toContain("Confirm deletions");
  });
});
