import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { build } from "vite";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return `http://127.0.0.1:${address.port}`;
}

for (const scenario of ["local model", "device token poll"] as const) {
  test(`routed ${scenario} JSON POST reaches an HTTP/1 server in Chromium`, async () => {
    const calls: { path: string; body: unknown; authorization?: string }[] = [];
    const api = createServer((request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader(
        "Access-Control-Allow-Headers",
        "content-type,authorization",
      );
      response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
      if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
      }
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        calls.push({
          path: request.url!,
          body: JSON.parse(body),
          authorization: request.headers.authorization,
        });
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ ok: true }));
      });
    });
    const profile = mkdtempSync(join(tmpdir(), "freestyle-api-transport-"));
    let renderer: Server | undefined;
    let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
    try {
      const apiUrl = await listen(api);
      const output = await build({
        configFile: false,
        logLevel: "silent",
        build: {
          write: false,
          minify: false,
          lib: {
            entry: resolve(__dirname, "../src/renderer/src/lib/api.ts"),
            name: "FreestyleApi",
            formats: ["iife"],
          },
        },
      });
      const built = Array.isArray(output) ? output[0] : output;
      if (!("output" in built)) throw new Error("Unexpected client bundle");
      const bundle = built.output.find((item) => item.type === "chunk");
      if (!bundle || bundle.type !== "chunk")
        throw new Error("Missing client bundle");
      renderer = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<script>window.api = {
        getServerUrl: async () => ${JSON.stringify(apiUrl)},
        getServerToken: async () => "synthetic-token",
        getServerPort: async () => 4649
      };</script><script>${bundle.code}</script>`);
      });
      const rendererUrl = await listen(renderer);
      app = await electron.launch({
        args: [resolve(__dirname, "fixtures/api-transport-main.cjs")],
        env: {
          ...process.env,
          FREESTYLE_API_TEST_PROFILE: profile,
          FREESTYLE_API_TEST_RENDERER: rendererUrl,
        },
      });
      const page = await app.firstWindow();
      await page.waitForFunction(() => "FreestyleApi" in window);
      const result = await page.evaluate(async (scenario) => {
        const client = (
          window as unknown as {
            FreestyleApi: typeof import("../src/renderer/src/lib/api");
          }
        ).FreestyleApi.getClient();
        try {
          const response =
            scenario === "local model"
              ? await client.api.whisper.server.start.$post({
                  json: { modelId: "small-q5_1" },
                })
              : await client.api.auth.device.token.$post({
                  json: { device_code: "synthetic-device-code" },
                });
          return { status: response.status };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }, scenario);
      expect(result).toEqual({ status: 200 });
      expect(calls).toEqual([
        {
          path:
            scenario === "local model"
              ? "/api/whisper/server/start"
              : "/api/auth/device/token",
          body:
            scenario === "local model"
              ? { modelId: "small-q5_1" }
              : { device_code: "synthetic-device-code" },
          authorization: "Bearer synthetic-token",
        },
      ]);
    } finally {
      try {
        await app?.close();
      } finally {
        await Promise.all(
          [api, renderer]
            .filter((server): server is Server => !!server)
            .map(
              (server) =>
                new Promise<void>((resolve) => {
                  server.closeAllConnections();
                  server.close(() => resolve());
                }),
            ),
        );
        rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
      }
    }
  });
}
