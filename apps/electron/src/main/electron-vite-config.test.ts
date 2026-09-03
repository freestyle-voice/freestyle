import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("Electron production build configuration", () => {
  it("emits source maps when a release upload is enabled", async () => {
    process.env.SENTRY_UPLOAD_SOURCEMAPS = "1";
    process.env.SENTRY_AUTH_TOKEN = "test-token";
    process.env.SENTRY_ORG = "test-org";
    delete process.env.SENTRY_PROJECT;
    delete process.env.ANALYZE;
    vi.resetModules();

    const { default: config } = await import("../../electron.vite.config");

    expect(config.main?.build?.sourcemap).toBe(true);
    expect(config.preload?.build?.sourcemap).toBe(true);
    expect(config.renderer?.build?.sourcemap).toBe(true);
  });
});
