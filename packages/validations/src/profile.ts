import { z } from "zod/v3";

/**
 * Field-of-work options for the user's profile. Kept in sync with the cloud
 * repo's `@freestyle/validations` `industrySchema`.
 */
export const industrySchema = z.enum([
  "software",
  "healthcare",
  "legal",
  "finance",
  "education",
  "marketing",
  "media",
  "real_estate",
  "consulting",
  "engineering",
  "design",
  "sales",
  "hr",
  "retail",
  "manufacturing",
  "government",
  "research",
  "nonprofit",
  "other",
]);

export type Industry = z.infer<typeof industrySchema>;

/** Display labels for industry values (UI consumption). */
export const INDUSTRY_LABELS: Record<Industry, string> = {
  software: "Software & Technology",
  healthcare: "Healthcare & Medicine",
  legal: "Legal",
  finance: "Finance & Banking",
  education: "Education",
  marketing: "Marketing & Advertising",
  media: "Media & Entertainment",
  real_estate: "Real Estate",
  consulting: "Consulting",
  engineering: "Engineering",
  design: "Design & Creative",
  sales: "Sales",
  hr: "Human Resources",
  retail: "Retail & E-commerce",
  manufacturing: "Manufacturing",
  government: "Government & Public Sector",
  research: "Research & Academia",
  nonprofit: "Nonprofit & NGO",
  other: "Other",
};

/**
 * Profile fields editable by the user.
 *
 * Each field is `.nullish()`: omit a key to leave it untouched, or send `null`
 * (or an empty string, normalized server-side) to explicitly clear it.
 */
export const profileSchema = z.object({
  industry: industrySchema.nullish(),
  jobTitle: z.string().trim().max(120).nullish(),
  company: z.string().trim().max(120).nullish(),
  // Transient control flag (NOT persisted): when the industry changes and this
  // is not explicitly `false`, the cloud re-seeds tone + vocabulary defaults
  // for the new industry. Defaults to enabled.
  updatePreferences: z.boolean().optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/** Shape returned by the cloud `GET /{org}/member/preferences` (profile subset). */
export type CloudProfile = ProfileInput;
