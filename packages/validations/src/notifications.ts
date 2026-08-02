import { z } from "zod/v3";

/**
 * Format guard for dismissible-notification keys. Keys are short opaque
 * identifiers (e.g. `profile_info_prompt`, `changelog.1.2.0`) used as the
 * primary key of the local `dismissed_notifications` table / AsyncStorage list.
 * Presence of a key means the corresponding dialog/banner has been dismissed.
 */
export const notificationKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9_.:-]+$/);

export type NotificationKey = z.infer<typeof notificationKeySchema>;

/**
 * Registry of concrete dialog/banner keys shared by desktop and mobile.
 * Object keys are UPPER_SNAKE constants; values are the persisted lowercase
 * identifiers. Hooks still accept any string — this is just the source of
 * truth for real use-sites so callers don't typo free-form literals.
 */
export const KNOWN_NOTIFICATION_KEYS = {
  /** Nudge to fill out job title / industry on the profile. */
  PROFILE_INFO_PROMPT: "profile_info_prompt",
} as const;

export type KnownNotificationKey =
  (typeof KNOWN_NOTIFICATION_KEYS)[keyof typeof KNOWN_NOTIFICATION_KEYS];
