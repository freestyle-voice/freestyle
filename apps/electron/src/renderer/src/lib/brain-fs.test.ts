import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();

vi.mock("@renderer/lib/api", () => ({ apiFetch }));

function jsonResponse(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
}

describe("brain file cache", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    vi.resetModules();
  });

  it("updates cached contents and invalidates cached lists after a raw write", async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse({ ok: true, text: "old" }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          files: [{ path: "notes/a.md", size: 3, modified: 1 }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const {
      fsCall,
      listBrainFiles,
      peekBrainFile,
      peekBrainFiles,
      readBrainFile,
    } = await import("./brain-fs");

    await readBrainFile("notes/a.md");
    await listBrainFiles();
    await fsCall("write", { path: "notes/a.md", text: "new" });

    expect(peekBrainFile("notes/a.md")).toBe("new");
    expect(peekBrainFiles()).toBeUndefined();
  });

  it("removes cached contents and invalidates cached lists after a raw delete", async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse({ ok: true, text: "old" }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          files: [{ path: "notes/a.md", size: 3, modified: 1 }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const {
      fsCall,
      listBrainFiles,
      peekBrainFile,
      peekBrainFiles,
      readBrainFile,
    } = await import("./brain-fs");

    await readBrainFile("notes/a.md");
    await listBrainFiles();
    await fsCall("delete", { path: "notes/a.md" });

    expect(peekBrainFile("notes/a.md")).toBeUndefined();
    expect(peekBrainFiles()).toBeUndefined();
  });

  it("evicts the oldest read when more than 100 files are cached", async () => {
    apiFetch.mockImplementation(async (_path: string, init?: RequestInit) => {
      const { path } = JSON.parse(String(init?.body)) as { path: string };
      return jsonResponse({ ok: true, text: path });
    });

    const { peekBrainFile, readBrainFile } = await import("./brain-fs");

    for (let index = 0; index <= 100; index += 1) {
      await readBrainFile(`notes/${index}.md`);
    }

    expect(peekBrainFile("notes/0.md")).toBeUndefined();
    expect(peekBrainFile("notes/100.md")).toBe("notes/100.md");
  });

  it("surfaces a list failure so query views can offer a retry", async () => {
    apiFetch.mockResolvedValue(new Response(null, { status: 503 }));

    const { listBrainFiles } = await import("./brain-fs");

    await expect(listBrainFiles("notes")).rejects.toThrow(
      "Could not reach your Brain.",
    );
  });
});

describe("brain read failures", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    vi.resetModules();
  });

  it("throws instead of reporting a missing file when the request fails", async () => {
    apiFetch.mockResolvedValueOnce(new Response("nope", { status: 502 }));
    const { readBrainFile, BrainRequestError } = await import("./brain-fs");
    await expect(readBrainFile("todos.md")).rejects.toBeInstanceOf(
      BrainRequestError,
    );
  });

  it("throws when the proxy reports the cloud is unreachable", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse({ ok: false, reason: "cloud-unreachable" }),
    );
    const { readBrainFile } = await import("./brain-fs");
    await expect(readBrainFile("todos.md")).rejects.toThrow();
  });

  it("returns null for a file that does not exist", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse({ ok: false, reason: "not-found" }),
    );
    const { readBrainFile } = await import("./brain-fs");
    await expect(readBrainFile("todos.md")).resolves.toBeNull();
  });

  it("sends the last seen version with a write", async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse({ ok: true, text: "a", version: 7 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, version: 8 }));
    const { readBrainFile, writeBrainFile } = await import("./brain-fs");
    await readBrainFile("todos.md");
    await writeBrainFile("todos.md", "b");
    const init = apiFetch.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      path: "todos.md",
      text: "b",
      ifMatch: 7,
    });
  });
});
