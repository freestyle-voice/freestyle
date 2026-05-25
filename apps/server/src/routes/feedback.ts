import { feedbackSchema } from "@freestyle/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { Sentry } from "../lib/sentry.js";

const feedback = new Hono().post(
  "/",
  zValidator("json", feedbackSchema),
  async (c) => {
    const body = c.req.valid("json");

    Sentry.captureMessage(`User Feedback: ${body.message}`, {
      level: "info",
      tags: {
        feedback_type: body.type,
      },
      extra: {
        message: body.message,
        email: body.email,
        type: body.type,
      },
      user: body.email ? { email: body.email } : undefined,
    });

    return c.json({ ok: true });
  },
);

export default feedback;
