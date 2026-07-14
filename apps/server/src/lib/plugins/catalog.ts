/**
 * Static fallback catalog, used when the cloud registry at
 * `GET /plugins/catalog` is unreachable (offline, timeout, etc.).
 * The cloud-hosted list is the source of truth — update it there so new
 * plugins are available without a desktop release.
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
