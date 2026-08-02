import { z } from "zod/v3";
import { EXPORT_TYPES } from "./export.js";

const VOCABULARY_TERM_MAX = 200;
const VOCABULARY_NOTES_MAX = 2_000;
const VOCABULARY_IMPORT_MAX = 1_000;

const vocabularyTermSchema = z
  .string()
  .trim()
  .min(1, "Term is required")
  .max(VOCABULARY_TERM_MAX, "Term is too long");

const vocabularyNotesSchema = z
  .string()
  .trim()
  .max(VOCABULARY_NOTES_MAX, "Notes are too long");

export const createVocabularySchema = z.object({
  term: vocabularyTermSchema,
  notes: vocabularyNotesSchema.optional(),
});

export const updateVocabularySchema = z.object({
  term: vocabularyTermSchema.optional(),
  notes: vocabularyNotesSchema.optional(),
});

export const importVocabularySchema = z
  .array(
    z.object({
      term: vocabularyTermSchema,
      notes: vocabularyNotesSchema.nullable().optional(),
    }),
  )
  .max(VOCABULARY_IMPORT_MAX, "Too many vocabulary entries");

/** Upper bound on ids accepted by a single bulk-delete action. */
const VOCABULARY_BULK_MAX = 1_000;

/**
 * Consolidated `POST /vocabulary/actions` payload: a discriminated union keyed
 * on `action`, so bulk operations that don't map cleanly onto REST verbs (delete
 * many, import, export) share one endpoint instead of proliferating routes.
 *
 * `bulk-delete` takes an array of row ids and removes them in a single
 * transaction (one cloud push, not one per row). `import` / `export` mirror the
 * standalone schemas so callers can route everything through `/actions`.
 */
export const vocabularyActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("bulk-delete"),
    ids: z
      .array(z.number().int().positive())
      .min(1, "No entries selected")
      .max(VOCABULARY_BULK_MAX, "Too many entries selected"),
  }),
  z.object({
    action: z.literal("import"),
    entries: importVocabularySchema,
  }),
  z.object({
    action: z.literal("export"),
    type: z.enum(EXPORT_TYPES).default("json"),
  }),
]);

export type CreateVocabularyInput = z.infer<typeof createVocabularySchema>;
export type UpdateVocabularyInput = z.infer<typeof updateVocabularySchema>;
export type ImportVocabularyInput = z.infer<typeof importVocabularySchema>;
export type VocabularyActionInput = z.infer<typeof vocabularyActionSchema>;
