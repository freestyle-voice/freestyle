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

export const DICTIONARY_IMPORT_MAX = 5_000;

// Lenient element shape: the import route counts blank/whitespace entries as
// "skipped" rather than rejecting the whole payload, so we only assert the
// JSON shape (array of {key, value} strings) here and let the route filter.
export const importDictionarySchema = z
  .array(z.object({ key: z.string(), value: z.string() }))
  .max(DICTIONARY_IMPORT_MAX, "Too many dictionary entries");

export type DictionaryInput = z.infer<typeof dictionarySchema>;
export type UpdateDictionaryInput = z.infer<typeof updateDictionarySchema>;
export type ImportDictionaryInput = z.infer<typeof importDictionarySchema>;
