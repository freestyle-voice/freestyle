import { z } from "zod/v3";

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

export type CreateVocabularyInput = z.infer<typeof createVocabularySchema>;
export type UpdateVocabularyInput = z.infer<typeof updateVocabularySchema>;
export type ImportVocabularyInput = z.infer<typeof importVocabularySchema>;
