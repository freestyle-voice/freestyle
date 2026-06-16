import { Hono } from "hono";
import { getLanguageSetting } from "../lib/language.js";
import { postProcess } from "../lib/post-process.js";

const postProcessRoute = new Hono().post("/", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    return c.json({ error: "text field is required" }, 400);
  }

  const appContext: string | null = body.appContext ?? null;
  const language =
    typeof body.language === "string" ? body.language : getLanguageSetting();

  const pp = await postProcess(body.text, appContext, {
    language,
    source: "multi_segment",
  });

  return c.json({
    cleaned: pp.cleaned,
    inputTokens: pp.inputTokens,
    outputTokens: pp.outputTokens,
    costUsd: pp.costUsd,
  });
});

export default postProcessRoute;
