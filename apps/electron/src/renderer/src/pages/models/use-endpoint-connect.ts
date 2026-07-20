import { getClient } from "@renderer/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsKey } from "../../../../shared/settings-keys";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EndpointTestValues {
  url: string;
  apiKey: string;
}

/**
 * Connection state for an OpenAI-compatible endpoint (local LLM or custom
 * STT). The form fields themselves live in react-hook-form inside the connect
 * component; this hook owns the persisted seed values and the async test that
 * saves the settings then probes the endpoint.
 */
export interface EndpointConnectState {
  /** Persisted URL, used to seed the form once settings resolve. */
  initialUrl: string;
  /** Persisted API key, used to seed the form once settings resolve. */
  initialApiKey: string;
  testing: boolean;
  connected: boolean | null;
  error: string | null;
  models: string[];
  test: (values: EndpointTestValues) => Promise<void>;
  clearStatus: () => void;
}

/** Static configuration for an endpoint — invariant across renders. */
export interface EndpointConnectConfig {
  /** Setting key for the URL (e.g. `SETTINGS_KEYS.localLlmUrl`). */
  urlKey: SettingsKey;
  /** Setting key for the API key (e.g. `SETTINGS_KEYS.localLlmApiKey`). */
  apiKeyKey: SettingsKey;
  /** Default URL shown when no persisted value exists. */
  defaultUrl: string;
  /** When true, an empty URL clears the setting and skips probing. */
  clearUrlWhenEmpty: boolean;
  /** Issue the typed test-endpoint call for this particular provider. */
  probe: (
    client: ReturnType<typeof getClient>,
    body: { url: string; api_key: string | undefined },
  ) => Promise<Response>;
}

// ---------------------------------------------------------------------------
// Shared test runner (pure function, no hooks)
// ---------------------------------------------------------------------------

interface TestStatus {
  setTesting: (v: boolean) => void;
  setConnected: (v: boolean | null) => void;
  setError: (v: string | null) => void;
  setModels: (v: string[]) => void;
  setInitialUrl: (v: string) => void;
  setInitialApiKey: (v: string) => void;
}

async function runEndpointTest(
  values: EndpointTestValues,
  config: EndpointConnectConfig,
  status: TestStatus,
  onDone: () => Promise<void>,
): Promise<void> {
  status.setTesting(true);
  status.setConnected(null);
  status.setError(null);
  try {
    const url = values.url.replace(/\/+$/, "");
    const key = values.apiKey.trim();
    const client = getClient();

    const saveUrl =
      url || !config.clearUrlWhenEmpty
        ? client.api.settings[":key"].$put({
            param: { key: config.urlKey },
            json: { value: url },
          })
        : client.api.settings[":key"].$delete({
            param: { key: config.urlKey },
          });
    const saveKey = key
      ? client.api.settings[":key"].$put({
          param: { key: config.apiKeyKey },
          json: { value: key },
        })
      : client.api.settings[":key"].$delete({
          param: { key: config.apiKeyKey },
        });
    await Promise.all([saveUrl, saveKey]);

    // Keep seed values in sync so the form re-seeds correctly on remount.
    status.setInitialUrl(url);
    status.setInitialApiKey(key);

    if (config.clearUrlWhenEmpty && !url) {
      status.setConnected(null);
      await onDone();
      return;
    }

    const res = await config.probe(client, { url, api_key: key || undefined });
    if (res.ok) {
      const result = (await res.json()) as {
        ok?: boolean;
        models?: string[];
        error?: string;
      };
      if (result.ok) {
        status.setConnected(true);
        status.setModels(result.models ?? []);
        await onDone();
        return;
      }
      status.setConnected(false);
      status.setError(
        typeof result.error === "string" ? result.error : "Connection failed",
      );
      return;
    }
    status.setConnected(false);
    status.setError(`HTTP ${res.status}`);
  } catch (err) {
    status.setConnected(false);
    status.setError(err instanceof Error ? err.message : "Connection failed");
  } finally {
    status.setTesting(false);
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages a single OpenAI-compatible endpoint connection. Called once per
 * endpoint (local LLM, custom STT) inside `useModels`.
 *
 * @param config  Static description of the endpoint (keys, default URL, probe).
 * @param settingsData  The resolved settings record from the shared query.
 * @param onDone  Called after a successful save/test (typically `loadData`).
 */
export function useEndpointConnect(
  config: EndpointConnectConfig,
  settingsData: Record<string, string> | undefined,
  onDone: () => Promise<void>,
): EndpointConnectState {
  const [initialUrl, setInitialUrl] = useState(config.defaultUrl);
  const [initialApiKey, setInitialApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);

  // Seed from persisted settings once, matching the original truthiness guards
  // in useModels (an empty string does not override the default).
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !settingsData) return;
    seeded.current = true;
    const url = settingsData[config.urlKey];
    if (url) setInitialUrl(url);
    const key = settingsData[config.apiKeyKey];
    if (key) setInitialApiKey(key);
  }, [settingsData, config.urlKey, config.apiKeyKey]);

  const clearStatus = useCallback(() => {
    setConnected(null);
    setError(null);
  }, []);

  const test = useCallback(
    (values: EndpointTestValues) =>
      runEndpointTest(
        values,
        config,
        {
          setTesting,
          setConnected,
          setError,
          setModels,
          setInitialUrl,
          setInitialApiKey,
        },
        onDone,
      ),
    [config, onDone],
  );

  return {
    initialUrl,
    initialApiKey,
    testing,
    connected,
    error,
    models,
    test,
    clearStatus,
  };
}
