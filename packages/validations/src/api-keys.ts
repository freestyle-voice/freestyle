import { z } from "zod/v3";

export const apiKeySchema = z.object({
  provider: z.string().min(1, "Provider is required"),
  key: z.string().min(1, "API key is required"),
});

export type ApiKeyInput = z.infer<typeof apiKeySchema>;
