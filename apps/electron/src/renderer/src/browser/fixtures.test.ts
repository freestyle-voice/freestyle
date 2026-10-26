import { describe, expect, it } from "vitest";
import { createFixtureFetch } from "./fixtures";

const request = (path: string, init?: RequestInit) =>
  new Request(`http://localhost:5173${path}`, init);

describe("browser fixtures", () => {
  it("matches the health identity expected by the real renderer", async () => {
    expect(
      await (
        await createFixtureFetch("default")(request("/api/health"))
      ).json(),
    ).toEqual({ status: "ok", name: "freestyle" });
  });
  it("serves seeded history and explicit empty/error scenarios", async () => {
    expect(
      (
        await (
          await createFixtureFetch("default")(request("/api/history"))
        ).json()
      ).items.length,
    ).toBeGreaterThan(0);
    expect(
      (
        await (
          await createFixtureFetch("empty")(request("/api/history"))
        ).json()
      ).items,
    ).toEqual([]);
    expect(
      (await createFixtureFetch("error")(request("/api/history"))).status,
    ).toBe(503);
  });
  it("keeps mutations in memory and isolates separate previews", async () => {
    const fetch = createFixtureFetch("default");
    await fetch(
      request("/api/settings/theme", {
        method: "PUT",
        body: JSON.stringify({ value: "dark" }),
      }),
    );
    expect((await (await fetch(request("/api/settings"))).json()).theme).toBe(
      "dark",
    );
    expect(
      (
        await (
          await createFixtureFetch("default")(request("/api/settings"))
        ).json()
      ).theme,
    ).toBeUndefined();
  });
  it("fails unimplemented routes and methods without network fallback", async () => {
    const fetch = createFixtureFetch("default");
    expect((await fetch(request("/api/not-implemented"))).status).toBe(501);
    expect(
      (await fetch(request("/api/models/configured", { method: "DELETE" })))
        .status,
    ).toBe(501);
    expect(
      (await fetch(new Request("https://example.test/private"))).status,
    ).toBe(501);
  });
  it("allows aborting a pending loading preview", async () => {
    const controller = new AbortController();
    const response = createFixtureFetch("loading")(
      request("/api/history", { signal: controller.signal }),
    );
    controller.abort();
    await expect(response).rejects.toMatchObject({ name: "AbortError" });
  });
});
