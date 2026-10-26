import { configureLocalApiBase } from "../lib/api";
import { createFixtureFetch, parseScenario } from "./fixtures";
import { browserCapabilities, createBrowserApi } from "./platform";
import { mountPreviewToolbar } from "./toolbar";

declare const __FREESTYLE_BROWSER_MODE__: "fixtures" | "server";

// This entry is substituted only by browser.vite.config.ts. The dynamic imports
// ensure the platform exists even for module-level reads in legacy components.
const mode = __FREESTYLE_BROWSER_MODE__;
const scenario = parseScenario(
  new URLSearchParams(location.search).get("scenario"),
);
const diagnostics = { errors: [] as string[], missingFixtures: [] as string[] };
// MCP deliberately uses the local transport. In this host it must use the
// same isolated proxy, never a desktop process that happens to occupy 4649.
configureLocalApiBase(location.origin);
const unsupported = (action: string) => {
  window.dispatchEvent(
    new CustomEvent("freestyle:browser-unsupported", {
      detail: `${action} requires the desktop application.`,
    }),
  );
};

window.api = createBrowserApi(
  {
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    navigate: (route) => {
      if (
        location.pathname.endsWith("pill.html") ||
        location.pathname.endsWith("notification.html")
      ) {
        location.href = `./index.html${location.search}#${route}`;
      } else location.hash = route;
    },
    openExternal: (url) => {
      // Keep a WindowProxy long enough to detect a blocked popup, then detach it.
      const popup = window.open("about:blank", "_blank");
      if (!popup) return false;
      popup.opener = null;
      popup.location.href = url;
      return true;
    },
    unsupported,
    writeClipboard: (text) => navigator.clipboard.writeText(text),
    readClipboard: () => navigator.clipboard.readText(),
    micPermission: async () => {
      try {
        const permission = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        return permission.state === "prompt"
          ? "not-determined"
          : permission.state;
      } catch {
        return "unknown";
      }
    },
    requestMic: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        for (const track of stream.getTracks()) track.stop();
        return "granted";
      } catch {
        return "denied";
      }
    },
  },
  {
    platform: navigator.userAgent.includes("Mac")
      ? "darwin"
      : navigator.userAgent.includes("Windows")
        ? "win32"
        : "linux",
    version: "development",
    apiBase: location.origin,
  },
);

if (mode === "fixtures") {
  const fixtureFetch = createFixtureFetch(scenario);
  const assetFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (
      url.origin === location.origin &&
      !url.pathname.startsWith("/api/") &&
      url.pathname !== "/stream"
    )
      return assetFetch(input, init);
    const response = await fixtureFetch(request);
    if (url.pathname === "/api/client-error")
      diagnostics.errors.push(await request.clone().text());
    if (response.status === 501) {
      diagnostics.missingFixtures.push(`${request.method} ${url.pathname}`);
      unsupported(
        `Missing fixture: ${request.method} ${url.pathname}. This interaction`,
      );
    }
    return response;
  };
}

// Expose explicit capabilities to browser automation without faking Electron.
Object.defineProperty(window, "freestyleBrowser", {
  value: { mode, scenario, capabilities: browserCapabilities, diagnostics },
});
mountPreviewToolbar(mode, scenario);

async function startRenderer(): Promise<void> {
  if (location.pathname.endsWith("pill.html")) {
    await import("../components/pill");
  } else if (location.pathname.endsWith("notification.html")) {
    if (mode === "fixtures") await import("./notification-preview");
    else await import("../components/notification");
  } else {
    await import("../dashboard");
  }
}
void startRenderer().catch((error) => {
  console.error(error);
  unsupported(`Renderer startup failed: ${String(error)}. This preview`);
});
