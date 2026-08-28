import { z } from "zod/v3";

export const localLlmConfigSchema = z.object({
  url: z.string().min(1, "Endpoint URL is required").url("Must be a valid URL"),
  api_key: z.string().optional(),
});

export type LocalLlmConfigInput = z.infer<typeof localLlmConfigSchema>;

/**
 * Shape for the local LLM connect form in the Models page. Drives a
 * react-hook-form with inline validation matching the `/local-llm/test`
 * endpoint's expectations.
 */
export const localLlmConnectFormSchema = z.object({
  url: z.string().min(1, "Endpoint URL is required").url("Must be a valid URL"),
  apiKey: z.string().max(2048),
});

export type LocalLlmConnectForm = z.infer<typeof localLlmConnectFormSchema>;
