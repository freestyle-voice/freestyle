import { Hono } from "hono";
import agentRoute from "./agent.js";
import runsRoute from "./runs.js";
import threadRoute from "./thread.js";
import transformRoute from "./transform.js";

/**
 * Remix, mounted at /api/remix. Two lanes plus their local state:
 *   /transform — one-shot edit over a selection (preset or spoken)
 *   /agent     — the chat agent loop (cloud proxy or BYOK)
 *   /thread    — the pill's chat thread (local SQLite)
 *   /runs      — one row per write into the user's document; powers Revert
 */
const remixRouter = new Hono()
  .route("/transform", transformRoute)
  .route("/agent", agentRoute)
  .route("/thread", threadRoute)
  .route("/runs", runsRoute);

export default remixRouter;
