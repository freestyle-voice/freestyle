import { z } from "zod/v3";

// Multi-segment post-processing (LLM cleanup) of an assembled transcript.
export const postProcessSchema = z.object({
  // Non-blank, but preserve the caller's original whitespace (the pipeline
  // relies on the raw text) — hence refine rather than .trim().
  text: z.string().refine((v) => v.trim().length > 0, "text field is required"),
  appContext: z.string().nullable().optional(),
  language: z.string().optional(),
});

export type PostProcessInput = z.infer<typeof postProcessSchema>;
