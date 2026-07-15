import { describe, expect, it } from "vitest";
import createApp from "../src/index.js";

const app = createApp();

function putFlag(key: string, body: unknown) {
  return app.request(`/api/config/flags/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/config/flags/:key", () => {
  it("sets a boolean flag and reflects it in GET /api/config", async () => {
    const put = await putFlag("streaming_audio", { value: true });
    expect(put.status).toBe(200);

    const get = await app.request("/api/config");
    expect(get.status).toBe(200);
    const config = (await get.json()) as { flags: Record<string, boolean> };
    expect(config.flags.streaming_audio).toBe(true);
  });

  it("rejects a non-boolean value with 400", async () => {
    const res = await putFlag("streaming_audio", { value: "true" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing value with 400", async () => {
    const res = await putFlag("streaming_audio", {});
    expect(res.status).toBe(400);
  });
});
