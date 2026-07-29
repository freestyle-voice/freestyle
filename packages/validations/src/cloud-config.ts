import { z } from "zod/v3";
import {
  cleanupEmailToneSchema,
  cleanupOverallToneSchema,
  cleanupPersonalToneSchema,
  cleanupWorkToneSchema,
} from "./cleanup-tones.js";

/** One selectable language with its display label. */
export const suggestedLanguageSchema = z.object({
  code: z.string(),
  label: z.string(),
});
export type SuggestedLanguage = z.infer<typeof suggestedLanguageSchema>;

/** Default cleanup tones suggested for an industry (any subset may be present). */
export const industryToneDefaultsSchema = z.object({
  personalTone: cleanupPersonalToneSchema.optional(),
  workTone: cleanupWorkToneSchema.optional(),
  emailTone: cleanupEmailToneSchema.optional(),
  overallTone: cleanupOverallToneSchema.optional(),
});
export type IndustryToneDefaults = z.infer<typeof industryToneDefaultsSchema>;

/**
 * Response shape of the cloud `GET /v2/config` endpoint. `prompts` is the
 * cleanup prompt config (typed on the server side); we keep it `unknown` here
 * so this package does not depend on the server's prompt-config types.
 */
export interface CloudConfigResponse {
  prompts: unknown;
  suggestedLanguages: SuggestedLanguage[];
  industryVocabulary: string[];
  industryToneDefaults: IndustryToneDefaults | null;
}
