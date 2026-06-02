import { z } from "zod/v3";

export const stepActions = [
  "replace",
  "open_app",
  "open_url",
  "paste_clipboard",
  "if",
  "transform",
] as const;
export type StepAction = (typeof stepActions)[number];

export const shortcutStepSchema = z.object({
  action: z.enum(stepActions),
  value: z.string().default(""),
});

export type ShortcutStep = z.infer<typeof shortcutStepSchema>;

export const createShortcutSchema = z.object({
  key: z.string().min(1, "Trigger phrase is required"),
  description: z.string().optional(),
  steps: z.array(shortcutStepSchema).min(1, "At least one step is required"),
});

export const updateShortcutSchema = z.object({
  key: z.string().min(1, "Trigger phrase is required").optional(),
  description: z.string().optional(),
  steps: z.array(shortcutStepSchema).min(1).optional(),
});

export type CreateShortcutInput = z.infer<typeof createShortcutSchema>;
export type UpdateShortcutInput = z.infer<typeof updateShortcutSchema>;
