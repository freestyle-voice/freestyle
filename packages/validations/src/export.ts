import { z } from "zod/v3";

// Supported export formats. Only "json" for now; add more types here later.
export const EXPORT_TYPES = ["json"] as const;

export const exportSchema = z.object({
  type: z.enum(EXPORT_TYPES).default("json"),
});

export type ExportType = (typeof EXPORT_TYPES)[number];
export type ExportInput = z.infer<typeof exportSchema>;
