import { commandSchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  CommandError,
  reportCommandFailure,
  runCommand,
} from "../lib/commands.js";
import {
  FreestyleCloudAuthError,
  FreestyleCloudUsageError,
} from "../lib/freestyle-cloud.js";
import { getLanguageSetting } from "../lib/language.js";
import { invalidateSession } from "../lib/sessions.js";

/**
 * Run an AI edit over a text selection and hand back the replacement.
 *
 * Deliberately outside the dictation pipeline: no plugin hooks, no dictionary
 * replacements, no history row. A command is a direct edit the user asked for
 * on text they already had — the transformations that exist to turn speech into
 * writing have nothing to say about it, and running the `beforeOutput`
 * suppression hooks over someone's own document would be a surprise.
 */
const commandRoute = new Hono().post(
  "/",
  zValidator("json", commandSchema),
  async (c) => {
    const body = c.req.valid("json");

    try {
      const text = await runCommand({
        text: body.text,
        commandId: body.commandId,
        instruction: body.instruction,
        language: body.language ?? getLanguageSetting(),
      });
      return c.json({ text });
    } catch (err) {
      if (err instanceof FreestyleCloudAuthError) {
        invalidateSession();
        return c.json({ error: "cloud_auth_required" }, 401);
      }
      if (err instanceof FreestyleCloudUsageError) {
        return c.json({ error: "usage_exceeded", resetsAt: err.resetsAt }, 429);
      }
      reportCommandFailure(err, body.commandId);
      if (err instanceof CommandError) {
        // A setup problem is the user's to fix and says so in its message; a
        // failure is ours. Both are shown verbatim in the pill's card.
        return c.json(
          { error: err.kind, detail: err.message },
          err.kind === "failed" ? 502 : 400,
        );
      }
      return c.json(
        {
          error: "failed",
          detail: err instanceof Error ? err.message : "Command failed",
        },
        502,
      );
    }
  },
);

export default commandRoute;
