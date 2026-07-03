import { z } from "zod/v3";

export const DICTIONARY_KEY_MAX = 200;
export const DICTIONARY_VALUE_MAX = 5000;

export const dictionarySchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .max(DICTIONARY_KEY_MAX, "Key is too long"),
  value: z
    .string()
    .min(1, "Value is required")
    .max(DICTIONARY_VALUE_MAX, "Value is too long"),
});

export const updateDictionarySchema = dictionarySchema.partial();

export type DictionaryInput = z.infer<typeof dictionarySchema>;
export type UpdateDictionaryInput = z.infer<typeof updateDictionarySchema>;
