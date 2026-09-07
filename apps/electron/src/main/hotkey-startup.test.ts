import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  shouldRetryMacNativeListener,
  shouldScheduleRemixRegistration,
} from "./hotkey-startup";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "index.ts");

function sourceForFunction(source: string, name: string): string {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  const nextFunction = source.slice(start + 1).search(/\n(?:async )?function /);
  const end = nextFunction === -1 ? -1 : start + 1 + nextFunction;
  return source.slice(start, end === -1 ? undefined : end);
}

describe("hotkey startup registration", () => {
  it("does not queue equal default Remix settings during initial registration", () => {
    expect(shouldScheduleRemixRegistration(false, false, true)).toBe(false);
    expect(shouldScheduleRemixRegistration(true, false, true)).toBe(true);
    expect(shouldScheduleRemixRegistration(false, false, false)).toBe(true);
  });

  it("retries only transient native startup failures", () => {
    expect(shouldRetryMacNativeListener(true, "")).toBe(true);
    expect(shouldRetryMacNativeListener(false, "")).toBe(true);
    expect(
      shouldRetryMacNativeListener(
        false,
        "Native key listener binary not found: macos-key-listener",
      ),
    ).toBe(false);
    expect(
      shouldRetryMacNativeListener(false, "accessibility-not-granted"),
    ).toBe(false);
  });

  it("serializes listener teardown, startup retries, and shutdown", async () => {
    const source = await readFile(mainPath, "utf8");
    const startup = source.slice(
      source.indexOf(
        "// Remix uses its default even when the server is unavailable",
      ),
      source.indexOf("// Listen for hotkey changes from the settings UI"),
    );
    const configuredRegistration = sourceForFunction(
      source,
      "registerConfiguredHotkeys",
    );
    const applyRemix = sourceForFunction(source, "applyRemixSettings");
    const scheduleListeners = sourceForFunction(
      source,
      "scheduleListenerRegistration",
    );
    const registerHotkey = sourceForFunction(source, "registerHotkey");
    const cleanup = sourceForFunction(source, "cleanupBeforeQuit");

    expect(startup).not.toContain(
      "scheduleRemixHotkeyRegistration(getDefaultRemixHotkey());",
    );
    expect(startup).toContain("remixInitialized = true;");
    expect(configuredRegistration).toContain(
      "await stopNativeHotkeyListeners();",
    );
    expect(configuredRegistration).toContain("NATIVE_LISTENER_RETRY_DELAYS_MS");
    expect(configuredRegistration).toContain("registerHotkey(hotkey, false)");
    expect(configuredRegistration).toContain("await registerRemixHotkey();");
    expect(applyRemix).toContain("scheduleRemixHotkeyRegistration()");
    expect(applyRemix).toContain("configured !== remixHotkeyPreference");
    expect(applyRemix).toContain("listenerRegistration.isActive");
    expect(registerHotkey).toContain("shouldRetryMacNativeListener");
    expect(scheduleListeners).toContain("if (isQuitting || !remixInitialized)");
    expect(cleanup).toContain("remixInitialized = false;");
    expect(cleanup).toContain("listenerRegistration.shutdown();");
  });
});
