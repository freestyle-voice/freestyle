import { z } from "zod/v3";

export const DICTIONARY_KEY_MAX = 200;
export const DICTIONARY_VALUE_MAX = 5000;

export const createDictionarySchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .max(DICTIONARY_KEY_MAX, "Key is too long"),
  value: z
    .string()
    .min(1, "Value is required")
    .max(DICTIONARY_VALUE_MAX, "Value is too long"),
});

export const updateDictionarySchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .max(DICTIONARY_KEY_MAX, "Key is too long")
    .optional(),
  value: z
    .string()
    .min(1, "Value is required")
    .max(DICTIONARY_VALUE_MAX, "Value is too long")
    .optional(),
});

export type CreateDictionaryInput = z.infer<typeof createDictionarySchema>;
export type UpdateDictionaryInput = z.infer<typeof updateDictionarySchema>;
