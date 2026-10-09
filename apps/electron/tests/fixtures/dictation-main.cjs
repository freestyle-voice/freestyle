const { appendFileSync } = require("node:fs");
const electron = require("electron");

function record(event) {
  appendFileSync(
    process.env.FREESTYLE_E2E_PERMISSION_EVENTS,
    `${JSON.stringify(event)}\n`,
  );
}

// Preserve the production renderer/preload IPC boundary while keeping native
// paste and clipboard writes inside the fixture. Neither can affect user apps.
const handle = electron.ipcMain.handle.bind(electron.ipcMain);
electron.ipcMain.handle = (channel, listener) => {
  if (channel === "paste:text" || channel === "copy:text") {
    return handle(channel, async (_event, text, appContext) => {
      record({
        type: "native-output",
        body: {
          text,
          appContext,
          mode: channel === "copy:text" ? "clipboard" : "paste",
        },
      });
    });
  }
  return handle(channel, listener);
};
electron.ipcMain.on("transcription:done", () =>
  record({ type: "transcription-done" }),
);

const fetch = global.fetch;
global.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  if (url.pathname === "/api/auth/status") {
    return Response.json({ authenticated: true, verified: true });
  }
  if (url.hostname === "cloud.test") {
    return Response.json(
      { error: "fixture has no Cloud credentials" },
      { status: 503 },
    );
  }
  return fetch(input, init);
};

// Reuse the permission fixture's isolated profile, granted permission API
// responses, dialog recorder, and production application entrypoint.
require("./permission-main.cjs");
