import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import createApp from "../src/index.js";
import { getDb, readSetting } from "../src/lib/db.js";
import { getDefaultModels } from "../src/lib/providers.js";
import { clearSession, getSession, setSession } from "../src/lib/sessions.js";

const app = createApp();

vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/freestyle-cloud.js")>();
  return {
    ...actual,
    fetchCloudUser: vi.fn(async () => ({
      id: "user_1",
      email: "user@example.com",
      name: "User",
      image: null,
    })),
    freestyleCloudUrl: vi.fn(() => "https://service.freestylevoice.com"),
    pollDeviceToken: vi.fn(),
    requestDeviceCode: vi.fn(async () => ({
      device_code: "device-code",
      user_code: "ABCD-1234",
      verification_uri: "https://service.freestylevoice.com/device",
      verification_uri_complete:
        "https://service.freestylevoice.com/device?user_code=ABCD-1234",
      expires_in: 600,
      interval: 1,
    })),
    signOutCloud: vi.fn(async () => {}),
  };
});

afterEach(() => {
  clearSession();
  vi.clearAllMocks();
});

describe("Freestyle Cloud auth sessions", () => {
  it("stores and reads the active session", () => {
    setSession({
      token: "token",
      user: { id: "user_1", email: "user@example.com" },
      host: "https://service.freestylevoice.com",
    });

    expect(getSession()?.token).toBe("token");
    expect(getSession()?.user.email).toBe("user@example.com");
  });

  it("clears expired sessions", () => {
    setSession({
      token: "token",
      expiresAt: Date.now() - 1,
      user: { id: "user_1", email: "user@example.com" },
      host: "https://service.freestylevoice.com",
    });

    expect(getSession()).toBeNull();
  });
});

describe("/api/auth", () => {
  it("rejects untrusted browser origins", async () => {
    const res = await app.request("/api/auth/status", {
      headers: { origin: "https://example.com" },
    });

    expect(res.status).toBe(403);
  });

  it("maps authorization_pending without treating it as a server error", async () => {
    const cloud = await import("../src/lib/freestyle-cloud.js");
    vi.mocked(cloud.pollDeviceToken).mockRejectedValueOnce(
      new cloud.DeviceFlowError("authorization_pending"),
    );

    const res = await app.request("/api/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: "device-code" }),
    });

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({
      error: "authorization_pending",
    });
  });

  it("maps denied device flow to a client error", async () => {
    const cloud = await import("../src/lib/freestyle-cloud.js");
    vi.mocked(cloud.pollDeviceToken).mockRejectedValueOnce(
      new cloud.DeviceFlowError("access_denied"),
    );

    const res = await app.request("/api/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: "device-code" }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "access_denied" });
  });
});

describe("Freestyle Transcribe default on sign-in", () => {
  async function signIn(): Promise<Response> {
    const cloud = await import("../src/lib/freestyle-cloud.js");
    vi.mocked(cloud.pollDeviceToken).mockResolvedValueOnce({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
    });
    return app.request("/api/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: "device-code" }),
    });
  }

  function insertLocalVoiceDefault(): void {
    const db = getDb();
    db.prepare(
      "UPDATE model_configs SET is_default = 0 WHERE type = 'voice'",
    ).run();
    db.prepare(
      `INSERT INTO model_configs (provider, model_id, model_name, type, is_default)
       VALUES ('local-whisper', 'local-whisper/base-q5_1', 'Whisper Base', 'voice', 1)
       ON CONFLICT(provider, model_id, type) DO UPDATE SET is_default = 1`,
    ).run();
  }

  beforeEach(() => {
    const db = getDb();
    db.prepare("DELETE FROM model_configs").run();
    db.prepare("DELETE FROM settings WHERE key = 'llm_cleanup'").run();
  });

  it("makes Freestyle the default voice without configuring a cleanup model", async () => {
    const res = await signIn();
    expect(res.status).toBe(200);

    const defaults = getDefaultModels();
    expect(defaults.voice?.provider).toBe("freestyle-cloud");
    expect(defaults.voice?.model_id).toBe("freestyle-cloud/stt");
    expect(defaults.llm?.provider).not.toBe("freestyle-cloud");
    expect(readSetting("llm_cleanup")).toBeUndefined();
  });

  it("overrides an existing local voice default and leaves local cleanup alone", async () => {
    insertLocalVoiceDefault();
    getDb()
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('llm_cleanup', 'false')",
      )
      .run();

    await signIn();

    const defaults = getDefaultModels();
    expect(defaults.voice?.provider).toBe("freestyle-cloud");
    expect(defaults.llm?.provider).not.toBe("freestyle-cloud");
    expect(readSetting("llm_cleanup")).toBe("false");
  });

  it("persists a local model chosen after sign-in (no re-switch)", async () => {
    await signIn();

    const res = await app.request("/api/models/configured", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "local-whisper",
        model_id: "local-whisper/base-q5_1",
        model_name: "Whisper Base",
        type: "voice",
        is_default: true,
      }),
    });
    expect(res.status).toBe(201);

    expect(getDefaultModels().voice?.provider).toBe("local-whisper");
  });

  it("reverts to a local model on sign-out without touching local cleanup", async () => {
    insertLocalVoiceDefault();
    await signIn();
    expect(getDefaultModels().voice?.provider).toBe("freestyle-cloud");

    const res = await app.request("/api/auth/sign-out", { method: "POST" });
    expect(res.status).toBe(200);

    expect(getDefaultModels().voice?.provider).toBe("local-whisper");
    expect(readSetting("llm_cleanup")).toBeUndefined();
  });

  it("re-applies the Freestyle voice default when signing in again", async () => {
    insertLocalVoiceDefault();
    await signIn();
    await app.request("/api/auth/sign-out", { method: "POST" });
    expect(getDefaultModels().voice?.provider).toBe("local-whisper");

    await signIn();

    const defaults = getDefaultModels();
    expect(defaults.voice?.provider).toBe("freestyle-cloud");
    expect(defaults.llm?.provider).not.toBe("freestyle-cloud");
  });
});
