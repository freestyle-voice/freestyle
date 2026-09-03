import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  close: vi.fn().mockResolvedValue(true),
  init: vi.fn(),
  logger: { info: vi.fn() },
  setTags: vi.fn(),
  setUser: vi.fn(),
}));
const telemetry = vi.hoisted(() => ({
  removeLegacyIdentity: vi.fn(),
  value: undefined as string | undefined,
}));

vi.mock("@sentry/node", () => sentry);
vi.mock("../src/lib/db.js", () => ({
  closeDb: vi.fn(),
  getDb: () => ({
    prepare: () => ({
      get: () =>
        telemetry.value === undefined ? undefined : { value: telemetry.value },
      run: (...args: unknown[]) => telemetry.removeLegacyIdentity(...args),
    }),
  }),
}));

import {
  capture,
  captureException,
  identifyCloudUser,
  invalidateTelemetrySetting,
  registerSuperProperties,
  removeLegacyTelemetryIdentity,
  setPersonProperties,
  setTelemetrySettingChangeHandler,
  shutdownSentry,
} from "../src/lib/sentry.js";

const originalEnv = { ...process.env };

function setTelemetry(value: string | undefined): void {
  telemetry.value = value;
}

describe("Sentry telemetry adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, FREESTYLE_ENV: "production" };
    delete process.env.DO_NOT_TRACK;
    setTelemetry(undefined);
    invalidateTelemetrySetting();
    setTelemetrySettingChangeHandler(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("sends product events as structured Sentry logs", () => {
    capture("transcription completed", { provider: "openai", duration_ms: 42 });

    expect(sentry.logger.info).toHaveBeenCalledWith(
      "transcription completed",
      expect.objectContaining({ provider: "openai", duration_ms: 42 }),
    );
  });

  it("honors the existing telemetry opt-out before sending events", () => {
    setTelemetry("false");
    invalidateTelemetrySetting();

    capture("transcription completed");

    expect(sentry.logger.info).not.toHaveBeenCalled();
  });

  it("notifies the active SDK when the telemetry setting changes", () => {
    const onChange = vi.fn();
    setTelemetrySettingChangeHandler(onChange);

    invalidateTelemetrySetting();

    expect(onChange).toHaveBeenCalledOnce();
  });

  it("reports exceptions with their safe structured context", () => {
    const error = new Error("request failed");

    captureException(error, { source: "renderer" });

    expect(sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ extra: { source: "renderer" } }),
    );
  });

  it("keeps user and release context on the Sentry scope", async () => {
    identifyCloudUser({ id: "user-1" });
    setPersonProperties({ plan: "pro" });
    registerSuperProperties({
      app_version: "1.2.3",
      environment: "production",
    });
    await shutdownSentry();

    expect(sentry.setUser).toHaveBeenLastCalledWith({
      id: "user-1",
      data: { plan: "pro" },
    });
    expect(sentry.setTags).toHaveBeenCalledWith({
      app_version: "1.2.3",
      environment: "production",
    });
    expect(sentry.close).toHaveBeenCalled();
  });

  it("clears the anonymous identity left by the retired provider", () => {
    removeLegacyTelemetryIdentity();

    expect(telemetry.removeLegacyIdentity).toHaveBeenCalledWith(
      "posthog_device_id",
    );
  });
});
