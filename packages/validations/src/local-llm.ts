import { z } from "zod/v3";

export const localLlmConfigSchema = z.object({
  url: z.string().min(1, "Endpoint URL is required").url("Must be a valid URL"),
  api_key: z.string().optional(),
});

export type LocalLlmConfigInput = z.infer<typeof localLlmConfigSchema>;
