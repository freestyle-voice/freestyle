import { readFileSync } from "node:fs";
import { createAppLogger } from "@freestyle-voice/utils";
import {
  Agent,
  EnvHttpProxyAgent,
  ProxyAgent,
  setGlobalDispatcher,
} from "undici";
import { readSetting } from "./db.js";

const log = createAppLogger("network");

/**
 * Settings keys that hold enterprise network configuration. These override the
 * matching environment variables so a locked-down desktop install can be
 * configured from the UI without editing the launch environment.
 */
export const PROXY_URL_SETTING = "network_proxy_url";
export const CA_CERT_PATH_SETTING = "network_ca_cert_path";

export interface NetworkConfig {
  /** Explicit proxy URL (e.g. http://proxy.corp:8080). */
  proxyUrl?: string;
  /**
   * Whether standard proxy env vars (HTTP_PROXY/HTTPS_PROXY/NO_PROXY) should be
   * honored when no explicit proxy URL is set.
   */
  useEnvProxy: boolean;
  /** Extra CA certificate paths to trust on top of the system store. */
  caCertPaths: string[];
}

/**
 * Resolve the effective network config from settings (highest priority) then
 * environment variables. Reads are best-effort: a missing DB or unreadable
 * setting falls back to env, never throwing.
 */
export function resolveNetworkConfig(): NetworkConfig {
  const proxyFromSetting = readSetting(PROXY_URL_SETTING)?.trim();
  const proxyFromEnv = (
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy
  )?.trim();

  const proxyUrl = proxyFromSetting || undefined;

  const caPathFromSetting = readSetting(CA_CERT_PATH_SETTING)?.trim();
  const caPathFromEnv = (
    process.env.NODE_EXTRA_CA_CERTS ?? process.env.SSL_CERT_FILE
  )?.trim();

  const caCertPaths = [caPathFromSetting, caPathFromEnv].filter(
    (p): p is string => Boolean(p),
  );

  return {
    proxyUrl,
    // Only lean on env proxy vars when the user hasn't pinned one explicitly.
    useEnvProxy: !proxyUrl && Boolean(proxyFromEnv),
    caCertPaths,
  };
}

/** Read and concatenate configured CA bundles; skips unreadable files. */
function loadCaCerts(paths: string[]): string[] {
  const certs: string[] = [];
  for (const path of paths) {
    try {
      certs.push(readFileSync(path, "utf8"));
    } catch (err) {
      log.warn(
        `Could not read CA certificate at ${path}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return certs;
}

/**
 * Install a global undici dispatcher so every `fetch()` in the server (model
 * downloads, Hugging Face API calls, cloud API, updater checks) honors
 * corporate proxy and custom CA configuration.
 *
 * Precedence:
 *   1. Explicit proxy URL from settings/env → {@link ProxyAgent}.
 *   2. Standard HTTP(S)_PROXY / NO_PROXY env vars → {@link EnvHttpProxyAgent}.
 *   3. No proxy → plain {@link Agent} (still needed to attach custom CAs).
 *
 * Custom CA certificates (NODE_EXTRA_CA_CERTS / SSL_CERT_FILE / setting) are
 * layered onto whichever dispatcher is chosen. Node's TLS stack already reads
 * NODE_EXTRA_CA_CERTS at process start, but wiring it into the dispatcher makes
 * a UI-configured CA path take effect without a restart.
 */
export function configureNetwork(): NetworkConfig {
  const config = resolveNetworkConfig();
  const ca = loadCaCerts(config.caCertPaths);
  const connect = ca.length > 0 ? { ca } : undefined;

  try {
    if (config.proxyUrl) {
      setGlobalDispatcher(
        new ProxyAgent({
          uri: config.proxyUrl,
          ...(connect ? { requestTls: connect, proxyTls: connect } : {}),
        }),
      );
      log.info(
        `Routing downloads through proxy ${config.proxyUrl}${
          ca.length > 0 ? ` with ${ca.length} custom CA(s)` : ""
        }`,
      );
    } else if (config.useEnvProxy) {
      setGlobalDispatcher(
        new EnvHttpProxyAgent(connect ? { connect } : undefined),
      );
      log.info(
        `Routing downloads through environment proxy${
          ca.length > 0 ? ` with ${ca.length} custom CA(s)` : ""
        }`,
      );
    } else if (connect) {
      setGlobalDispatcher(new Agent({ connect }));
      log.info(`Trusting ${ca.length} custom CA certificate(s) for downloads`);
    }
  } catch (err) {
    log.error(
      `Failed to configure network dispatcher: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return config;
}
