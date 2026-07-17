import { z } from "zod/v3";

export const openaiSttConfigSchema = z.object({
  url: z.string().min(1, "Endpoint URL is required").url("Must be a valid URL"),
  api_key: z.string().optional(),
});

export type OpenaiSttConfigInput = z.infer<typeof openaiSttConfigSchema>;

export const openaiSttBaseUrlSchema = z
  .string()
  .max(2048)
  .refine(
    (value) => {
      if (value.trim() === "") return true;
      try {
        const url = new URL(value.trim());
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    {
      message:
        "OpenAI STT base URL must be a valid http:// or https:// URL (or empty to disable)",
    },
  );

export function sanitizeSttBaseUrl(input: string): string | undefined {
  const trimmed = input.trim().replace(/\/+$/, "");
  return trimmed === "" ? undefined : trimmed;
}
