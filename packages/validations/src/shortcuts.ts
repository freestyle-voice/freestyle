import { z } from "zod/v3";

export const shortcutActions = ["replace", "open_url"] as const;
export type ShortcutAction = (typeof shortcutActions)[number];

export const createShortcutSchema = z.object({
  key: z.string().min(1, "Trigger phrase is required"),
  value: z.string().min(1, "Value is required"),
  action: z.enum(shortcutActions).optional(),
});

export const updateShortcutSchema = z.object({
  key: z.string().min(1, "Trigger phrase is required").optional(),
  value: z.string().min(1, "Value is required").optional(),
  action: z.enum(shortcutActions).optional(),
});

export type CreateShortcutInput = z.infer<typeof createShortcutSchema>;
export type UpdateShortcutInput = z.infer<typeof updateShortcutSchema>;

export type {
  CreateShortcutInput as CreateDictionaryInput,
  UpdateShortcutInput as UpdateDictionaryInput,
};
// Keep backward-compatible aliases so existing imports don't break
export {
  createShortcutSchema as createDictionarySchema,
  updateShortcutSchema as updateDictionarySchema,
};
