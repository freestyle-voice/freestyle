import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pageRoot = dirname(fileURLToPath(import.meta.url));

describe("transcription history loading state", () => {
  it("keeps the grouped feed and stats-column geometry while data loads", async () => {
    const history = await readFile(resolve(pageRoot, "history.tsx"), "utf8");

    expect(history).toContain("HistoryFeedSkeleton");
    expect(history).toContain("HistoryStatsSkeleton");
    expect(history).not.toContain(
      '"border-border/50 bg-card/60 h-16 rounded-lg border"',
    );
  });
});
