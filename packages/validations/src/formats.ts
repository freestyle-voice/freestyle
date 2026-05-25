import { z } from "zod/v3";

export const createFormatSchema = z.object({
  app_pattern: z.string().min(1, "App pattern is required"),
  label: z.string().min(1, "Label is required"),
  instructions: z.string().min(1, "Instructions are required"),
});

export const updateFormatSchema = z.object({
  app_pattern: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  instructions: z.string().min(1).optional(),
});

export type CreateFormatInput = z.infer<typeof createFormatSchema>;
export type UpdateFormatInput = z.infer<typeof updateFormatSchema>;
