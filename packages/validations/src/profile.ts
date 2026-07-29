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
 * Profile fields editable by the user. Geo fields (country, region, timezone)
 * are auto-detected server-side and returned by the cloud but never sent by the
 * client, so they are not part of the writable input schema.
 */
export const profileSchema = z.object({
  industry: industrySchema.optional(),
  jobTitle: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/** Shape returned by the cloud `GET /profile` (writable fields + detected geo). */
export interface CloudProfile extends ProfileInput {
  country?: string | null;
  region?: string | null;
  timezone?: string | null;
}
