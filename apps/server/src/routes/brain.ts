import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import { freestyleCloudUrl } from "../lib/freestyle-cloud.js";
import { getSessionToken, invalidateSession } from "../lib/sessions.js";

const log = createAppLogger("brain-proxy");
const BRAIN_REQUEST_TIMEOUT_MS = 15_000;

async function forward(
  segment: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<{ status: number; payload: unknown }> {
  const token = getSessionToken();
  if (!token)
    return {
      status: 401,
      payload: { ok: false, reason: "cloud_auth_required" },
    };
  try {
    const upstream = await fetch(`${freestyleCloudUrl()}/v2/brain/${segment}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(BRAIN_REQUEST_TIMEOUT_MS),
    });
    if (upstream.status === 401) {
      invalidateSession();
      return {
        status: 401,
        payload: { ok: false, reason: "cloud_auth_required" },
      };
    }
    return { status: upstream.status, payload: await upstream.json() };
  } catch (err) {
    log.error(`Brain proxy ${segment} failed: ${err}`);
    return { status: 502, payload: { ok: false, reason: "cloud-unreachable" } };
  }
}

const brainRoute = new Hono()
  .get("/list", async (c) => {
    const { status, payload } = await forward("list", "GET");
    return c.json(payload as object, status as 200);
  })
  .get("/graph", async (c) => {
    const { status, payload } = await forward("graph", "GET");
    return c.json(payload as object, status as 200);
  })
  .get("/export", async (c) => {
    const { status, payload } = await forward("export", "GET");
    return c.json(payload as object, status as 200);
  })
  .post("/read", async (c) => {
    const { status, payload } = await forward(
      "read",
      "POST",
      await c.req.json(),
    );
    return c.json(payload as object, status as 200);
  })
  .post("/write", async (c) => {
    const { status, payload } = await forward(
      "write",
      "POST",
      await c.req.json(),
    );
    return c.json(payload as object, status as 200);
  })
  .post("/delete", async (c) => {
    const { status, payload } = await forward(
      "delete",
      "POST",
      await c.req.json(),
    );
    return c.json(payload as object, status as 200);
  })
  .post("/clear", async (c) => {
    const { status, payload } = await forward("clear", "POST", {});
    return c.json(payload as object, status as 200);
  });

export default brainRoute;
