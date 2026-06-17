import { z } from "zod/v3";

/**
 * Server URL for the desktop app. An empty string means "use the built-in
 * local server"; otherwise it must be a valid URL. Trailing slashes are
 * stripped so callers can append paths cleanly.
 */
export const serverUrlSchema = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || z.string().url().safeParse(v).success,
    "Must be a valid URL",
  )
  // Normalize via the URL parser (lowercases scheme/host so the renderer's
  // http->ws rewrite is reliable), then drop any trailing slash.
  .transform((v) => {
    if (v === "") return "";
    try {
      return new URL(v).href.replace(/\/+$/, "");
    } catch {
      return v.replace(/\/+$/, "");
    }
  });
