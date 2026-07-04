import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteSetting, writeSetting } from "../src/lib/db.js";
import {
  CA_CERT_PATH_SETTING,
  configureNetwork,
  PROXY_URL_SETTING,
  resolveNetworkConfig,
} from "../src/lib/network.js";

const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
] as const;

describe("resolveNetworkConfig", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    deleteSetting(PROXY_URL_SETTING);
    deleteSetting(CA_CERT_PATH_SETTING);
  });

  afterEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    deleteSetting(PROXY_URL_SETTING);
    deleteSetting(CA_CERT_PATH_SETTING);
  });

  it("returns an empty config when nothing is set", () => {
    const config = resolveNetworkConfig();
    expect(config.proxyUrl).toBeUndefined();
    expect(config.useEnvProxy).toBe(false);
    expect(config.caCertPaths).toEqual([]);
  });

  it("prefers the settings proxy over environment proxy vars", () => {
    process.env.HTTPS_PROXY = "http://env-proxy:8080";
    writeSetting(PROXY_URL_SETTING, "http://setting-proxy:3128");

    const config = resolveNetworkConfig();
    expect(config.proxyUrl).toBe("http://setting-proxy:3128");
    // An explicit proxy disables env-proxy fallback.
    expect(config.useEnvProxy).toBe(false);
  });

  it("falls back to env proxy vars only when no setting is present", () => {
    process.env.HTTP_PROXY = "http://env-proxy:8080";

    const config = resolveNetworkConfig();
    expect(config.proxyUrl).toBeUndefined();
    expect(config.useEnvProxy).toBe(true);
  });

  it("treats a blank/whitespace setting as unset", () => {
    writeSetting(PROXY_URL_SETTING, "   ");
    process.env.HTTPS_PROXY = "http://env-proxy:8080";

    const config = resolveNetworkConfig();
    expect(config.proxyUrl).toBeUndefined();
    expect(config.useEnvProxy).toBe(true);
  });

  it("collects CA paths from both setting and environment", () => {
    writeSetting(CA_CERT_PATH_SETTING, "/etc/ssl/corp.pem");
    process.env.NODE_EXTRA_CA_CERTS = "/etc/ssl/env.pem";

    const config = resolveNetworkConfig();
    expect(config.caCertPaths).toEqual([
      "/etc/ssl/corp.pem",
      "/etc/ssl/env.pem",
    ]);
  });
});

describe("configureNetwork", () => {
  afterEach(() => {
    deleteSetting(PROXY_URL_SETTING);
    deleteSetting(CA_CERT_PATH_SETTING);
    // Reset the global dispatcher to a clean default for other suites.
    configureNetwork();
  });

  it("installs a dispatcher for a configured proxy without throwing", () => {
    writeSetting(PROXY_URL_SETTING, "http://setting-proxy:3128");
    const config = configureNetwork();
    expect(config.proxyUrl).toBe("http://setting-proxy:3128");
  });

  it("resets cleanly after a proxy is cleared", () => {
    writeSetting(PROXY_URL_SETTING, "http://setting-proxy:3128");
    configureNetwork();

    // Clearing the proxy must reinstall a clean dispatcher (no throw, no proxy).
    deleteSetting(PROXY_URL_SETTING);
    const config = configureNetwork();
    expect(config.proxyUrl).toBeUndefined();
    expect(config.useEnvProxy).toBe(false);
  });
});
