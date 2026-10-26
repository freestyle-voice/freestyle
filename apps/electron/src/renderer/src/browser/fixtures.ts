export const scenarios = [
  "default",
  "empty",
  "signed-out",
  "loading",
  "error",
  "onboarding",
] as const;
export type PreviewScenario = (typeof scenarios)[number];

export function parseScenario(value: string | null): PreviewScenario {
  return scenarios.find((scenario) => scenario === value) ?? "default";
}

const user = {
  id: "browser-preview",
  name: "Browser Preview",
  email: "preview@example.test",
};
const timestamp = "2026-10-01T10:00:00.000Z";

/** Each page load gets isolated mutable fixtures. Unknown requests never go live. */
export function createFixtureFetch(scenario: PreviewScenario) {
  let signedOut = scenario === "signed-out" || scenario === "onboarding";
  const settings: Record<string, string> = {
    ...(scenario === "onboarding"
      ? {}
      : { onboarding: JSON.stringify({ v: 2, done: true }) }),
    llm_cleanup: "true",
    cleanup_intensity: "medium",
    output_mode: "clipboard",
    hotkey: "Alt+Space",
    hotkey_mode: "toggle",
    telemetry_enabled: "false",
  };
  const models =
    scenario === "empty"
      ? []
      : [
          {
            id: 1,
            provider: "openai",
            model_id: "openai/whisper-1",
            model_name: "Whisper",
            type: "voice",
            is_default: 1,
          },
          {
            id: 2,
            provider: "openai",
            model_id: "openai/gpt-4o-mini",
            model_name: "GPT-4o mini",
            type: "llm",
            is_default: 1,
          },
        ];
  const history =
    scenario === "empty"
      ? []
      : [
          {
            id: 1,
            raw_text: "Remember to review the browser preview today",
            cleaned_text: "Remember to review the browser preview today.",
            voice_provider: "openai",
            voice_model: "whisper-1",
            llm_provider: "openai",
            llm_model: "gpt-4o-mini",
            duration_ms: 650,
            audio_duration_ms: 3200,
            input_tokens: 18,
            output_tokens: 12,
            cost_usd: 0,
            created_at: "2026-10-01 10:00:00",
          },
        ];
  const thread = {
    id: "preview-thread",
    type: "remote",
    title: "Browser development",
    messages: [
      {
        id: "preview-message",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "This is a fixture conversation. Explore the UI without running Electron.",
          },
        ],
      },
    ],
  };
  const dictionary: { id: number; key: string; value: string }[] = [];
  const vocabulary: { id: number; word: string }[] = [];

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const json = (value: unknown) => Response.json(value);
    // Health/auth/settings remain available so failure/loading previews can
    // reach the product shell and display the page's own data states.
    if (path === "/api/health")
      return json({ status: "ok", name: "freestyle" });
    if (path === "/api/client-error" && method === "POST")
      return json({ ok: true });
    if (path === "/api/notifications/token" && method === "POST")
      return json({ token: null, userId: null });
    if (path === "/api/brain/read" && method === "POST")
      return json({ ok: true, text: "" });
    if (path === "/api/auth/status")
      return json({
        authenticated: !signedOut,
        user: signedOut ? null : user,
        verified: true,
      });
    if (path === "/api/auth/sign-out" && method === "POST") {
      signedOut = true;
      return json({ ok: true });
    }
    if (path === "/api/settings" && method === "GET") return json(settings);
    if (path.startsWith("/api/settings/") && method === "PUT") {
      const body = await request.json();
      const key = decodeURIComponent(path.slice("/api/settings/".length));
      settings[key] = String(body.value);
      return json({ key, value: settings[key] });
    }
    if (path === "/api/config" && method === "GET")
      return json({ version: 1, flags: {} });
    if (
      scenario === "error" &&
      [
        "/api/history",
        "/api/dictionary",
        "/api/vocabulary",
        "/api/attention",
        "/api/models/available",
      ].includes(path)
    ) {
      return Response.json(
        { error: "Preview failure: switch scenario to recover." },
        { status: 503 },
      );
    }
    if (
      scenario === "loading" &&
      [
        "/api/history",
        "/api/dictionary",
        "/api/vocabulary",
        "/api/models/available",
      ].includes(path)
    ) {
      request.signal.throwIfAborted();
      return new Promise((_, reject) => {
        request.signal.addEventListener(
          "abort",
          () => reject(request.signal.reason),
          { once: true },
        );
      });
    }
    if (method === "GET") {
      switch (path) {
        case "/api/brain/list":
          return json({ ok: true, files: [] });
        case "/api/remix/identity":
          return json({ userId: user.id, host: "http://browser-preview.test" });
        case "/api/remix/sessions/runtime":
          return json({ kind: "managed" });
        case "/api/org/active":
          return json({ organization: null });
        case "/api/org/list":
          return json({ organizations: [] });
        case "/api/config/cloud":
          return json({ suggestedLanguages: [] });
        case "/api/auth/accounts":
          return json({ accounts: [] });
        case "/api/auth/profile-fields":
          return json({
            name: user.name,
            industry: null,
            role: null,
            country: null,
            timezone: null,
          });
        case "/api/pricing":
          return json({
            currency: "usd",
            monthly: { amount: 1200, display: "$12" },
            annual: { amount: 900, display: "$9" },
          });
        case "/api/agent/activity/stream":
          return new Response(
            `event: activity\ndata: ${JSON.stringify({ threads: [] })}\n\n`,
            { headers: { "Content-Type": "text/event-stream" } },
          );
        case "/api/history": {
          const search = url.searchParams.get("search")?.toLowerCase() ?? "";
          const items = history.filter((item) =>
            item.cleaned_text.toLowerCase().includes(search),
          );
          return json({ items, total: items.length });
        }
        case "/api/history/stats":
          return json({
            total_sessions: history.length,
            total_duration_ms: 650,
            total_input_tokens: 18,
            total_output_tokens: 12,
            total_cost_usd: 0,
            avg_duration_ms: 650,
            total_audio_ms: 3200,
            total_fixes: 0,
            total_words: 10,
            today_sessions: 0,
            today_cost: 0,
            unfiltered_total_sessions: history.length,
          });
        case "/api/history/daily":
          return json({ days: [] });
        case "/api/models/available":
          return json([
            {
              provider_id: "openai",
              provider_name: "OpenAI",
              model_id: "openai/whisper-1",
              model_name: "Whisper",
              type: "voice",
              curated: true,
            },
            {
              provider_id: "openai",
              provider_name: "OpenAI",
              model_id: "openai/gpt-4o-mini",
              model_name: "GPT-4o mini",
              type: "llm",
              curated: true,
            },
          ]);
        case "/api/models/configured":
          return json(models);
        case "/api/models/remix-runtime":
          return json({
            provider: "openai",
            model: "gpt-4o-mini",
            configured: true,
          });
        case "/api/whisper/status":
          return json({
            binaryAvailable: false,
            binaryDownloading: false,
            serverBinaryAvailable: false,
            serverRunning: false,
            serverFailed: false,
            modelsDir: "",
            models: [],
            modelDefinitions: [],
          });
        case "/api/mlx-asr/status":
          return json({
            platformSupported: false,
            pythonAvailable: false,
            pythonPath: null,
            workerPath: null,
            mlxAudioInstalled: false,
            canRun: false,
            blockedReason: "Model engines do not run in fixture previews.",
            serverRunning: false,
            serverFailed: false,
            keepAliveMinutes: 5,
            models: [],
            modelDefinitions: [],
            setupHint: null,
          });
        case "/api/keys":
        case "/api/api-keys":
        case "/api/dismissed-notifications":
          return json([]);
        case "/api/dictionary":
          return json({ items: dictionary, total: dictionary.length });
        case "/api/vocabulary":
          return json({ items: vocabulary, total: vocabulary.length });
        case "/api/plugins":
        case "/api/plugins/catalog":
          return json({ plugins: [] });
        case "/api/plugins/check-updates":
          return json({ updates: [] });
        case "/api/agent/activity":
          return json({ threads: [] });
        case "/api/agent/thread/latest":
          return json({ thread: scenario === "empty" ? null : thread });
        case "/api/agent/thread/list":
          return json({ threads: [], nextCursor: null });
        case "/api/agent/thread/preview-thread":
        case "/api/remix/thread/preview-thread":
          return json({ thread, activeTurn: null, pendingAction: null });
        case "/api/remix/preview-thread/queue":
          return json({ active: false, items: [] });
        case "/api/agent/thread/preview-thread/runs":
          return json({ runs: [] });
        case "/api/remix/sessions/local":
          return json({ threads: [], nextCursor: null });
        case "/api/remix/model":
          return json({ model: null });
        case "/api/usage":
          return json({
            remaining: 2400,
            limit: 3000,
            totalConsumed: 600,
            resetsAt: "2030-01-01T00:00:00.000Z",
            plan: "free",
          });
        case "/api/attention":
          return json({ generatedAt: timestamp, items: [] });
        case "/api/connectors/catalog":
          return json({ connectors: [], nextCursor: null });
        case "/api/connectors/connections":
          return json({ connections: [] });
        case "/api/connectors/suggested":
          return json({ connectors: [] });
        case "/api/notifications/token":
          return json({ token: null, userId: null });
        case "/api/brain/files":
        case "/api/brain/notes":
          return json([]);
        case "/api/mcp/connections":
          return json([]);
        case "/api/connectors":
          return json({ connectors: [] });
        case "/api/scheduled-tasks":
          return json({ tasks: [] });
        case "/api/suggestions/home":
          return json({ suggestions: [] });
        case "/api/suggestions/capabilities":
          return json({ capabilities: [] });
      }
    }
    return Response.json(
      { error: `No browser fixture for ${method} ${path}` },
      { status: 501 },
    );
  };
}
