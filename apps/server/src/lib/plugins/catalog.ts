/**
 * The curated catalog of plugins users can install from the Browse tab. Each
 * entry maps to an npm package the installer downloads. This is a static,
 * in-repo list for now; a hosted registry can replace it behind the same
 * `GET /api/plugins/catalog` route later without changing clients.
 */
export interface CatalogEntry {
  /** npm package name, used by the installer to resolve + download. */
  npmName: string;
  /** Display name. */
  title: string;
  /** Short description for the catalog card. */
  description: string;
  /** Optional lucide icon name (PascalCase). */
  icon?: string;
  /** Optional homepage / repo link. */
  homepage?: string;
  /** Optional author label. */
  author?: string;
}

export const PLUGIN_CATALOG: CatalogEntry[] = [
  {
    npmName: "@freestyle-voice/plugin-audio-transcription",
    title: "Audio Transcription",
    description: "Transcribe audio files by dropping them into Freestyle.",
    icon: "FileMusic",
    author: "Freestyle",
  },
  {
    npmName: "@freestyle-voice/profanity-filter",
    title: "Profanity Filter",
    description:
      "Swap curse words for wholesome, funnier stand-ins as you dictate.",
    icon: "Sparkles",
    author: "Freestyle",
  },
];
