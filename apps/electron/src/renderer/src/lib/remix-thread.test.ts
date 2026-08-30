import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("Remix pill agent contract", () => {
  it("uses the dedicated Remix agent proxy instead of retired endpoints", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "../components/remix-chat.tsx"),
      "utf8",
    );

    expect(chat).toContain('api: "/api/remix"');
    expect(chat).toContain('apiFetch("/api/remix"');
    expect(chat).not.toContain('"/api/remix/thread');
    expect(chat).not.toContain('"/api/remix/agent');
  });
});
