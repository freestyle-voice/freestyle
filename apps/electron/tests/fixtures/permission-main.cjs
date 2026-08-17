const { appendFileSync, mkdirSync } = require("node:fs");
const electron = require("electron");

const eventsPath = process.env.FREESTYLE_E2E_PERMISSION_EVENTS;
const userDataDir = process.env.FREESTYLE_E2E_USER_DATA_DIR;

if (userDataDir) {
  mkdirSync(userDataDir, { recursive: true });
  electron.app.setPath("userData", userDataDir);
}

function record(event) {
  if (!eventsPath) return;
  appendFileSync(eventsPath, `${JSON.stringify(event)}\n`);
}

Object.defineProperty(
  electron.systemPreferences,
  "isTrustedAccessibilityClient",
  {
    configurable: true,
    value: (prompt) => {
      record({ type: "accessibility-check", prompt });
      return process.env.FREESTYLE_E2E_ACCESSIBILITY === "granted";
    },
  },
);

Object.defineProperty(electron.systemPreferences, "getMediaAccessStatus", {
  configurable: true,
  value: (mediaType) => {
    record({ type: "media-check", mediaType });
    return process.env.FREESTYLE_E2E_MICROPHONE ?? "granted";
  },
});

Object.defineProperty(electron.dialog, "showMessageBox", {
  configurable: true,
  value: async (options) => {
    record({ type: "dialog", options });
    return {
      response: Number(process.env.FREESTYLE_E2E_DIALOG_RESPONSE ?? 1),
      checkboxChecked: false,
    };
  },
});

Object.defineProperty(electron.shell, "openExternal", {
  configurable: true,
  value: async (url) => {
    record({ type: "open-external", url });
  },
});

electron.ipcMain.on("e2e:mic-requested", () => {
  record({ type: "mic-requested" });
});

electron.ipcMain.on("dictation:state", (_event, phase) => {
  record({ type: "dictation-state", body: { phase } });
});

const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (url.endsWith("/api/events")) {
    const body =
      typeof init?.body === "string"
        ? init.body
        : input instanceof Request
          ? await input.clone().text()
          : "";
    if (body) {
      record({ type: "pipeline-event", body: JSON.parse(body) });
    }
  }
  if (
    process.env.FREESTYLE_E2E_ONBOARDING_COMPLETE === "false" &&
    url.endsWith("/api/models/configured")
  ) {
    return new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
};

require("../../out/main/index.js");
