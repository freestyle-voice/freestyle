import type {
  CleanupEmailTone,
  CleanupIntensity,
  CleanupOverallTone,
  CleanupPersonalTone,
  CleanupToneDestination,
  CleanupWorkTone,
} from "@freestyle-voice/validations";

export type ToneCardOption<T extends string> = {
  value: T;
  titleKey: string;
  descKey: string;
  sampleKey: string;
};

const option = <T extends string>(group: string, value: T) =>
  ({
    value,
    titleKey: `tone.${group}.cards.${value}.title`,
    descKey: `tone.${group}.cards.${value}.desc`,
    sampleKey: `tone.${group}.cards.${value}.sample`,
  }) satisfies ToneCardOption<T>;

export const CLEANUP_OPTIONS: readonly ToneCardOption<CleanupIntensity>[] = [
  option("cleanup", "low"),
  option("cleanup", "medium"),
  option("cleanup", "high"),
  option("cleanup", "custom"),
];

export const PERSONAL_OPTIONS: readonly ToneCardOption<CleanupPersonalTone>[] =
  [
    option("personal", "polished"),
    option("personal", "casual"),
    option("personal", "very_casual"),
    option("personal", "off"),
  ];

export const WORK_OPTIONS: readonly ToneCardOption<CleanupWorkTone>[] = [
  option("work", "direct"),
  option("work", "friendly"),
  option("work", "formal"),
  option("work", "off"),
];

export const EMAIL_OPTIONS: readonly ToneCardOption<CleanupEmailTone>[] = [
  option("email", "casual"),
  option("email", "warm"),
  option("email", "formal"),
  option("email", "off"),
];

export const OVERALL_OPTIONS: readonly ToneCardOption<CleanupOverallTone>[] = [
  option("everythingElse", "casual"),
  option("everythingElse", "neutral"),
  option("everythingElse", "professional"),
  option("everythingElse", "off"),
];

// ---------------------------------------------------------------------------
// Destination metadata
//
// One record per destination page. `slug` is the URL segment
// (/settings/tone/:slug); `group` is the i18n namespace, which predates the
// route and does not always match the slug ("overall" ⇄ "everythingElse").
// ---------------------------------------------------------------------------

export type DestinationSlug = "personal" | "work" | "email" | "everywhere-else";

export type DestinationMeta = {
  slug: DestinationSlug;
  destination: CleanupToneDestination;
  /** i18n namespace under `tone.` */
  group: string;
  previewKind: "personal" | "work" | "email" | "overall";
  /** Built-in app routing only exists for the three named destinations. */
  canManageRoutes: boolean;
  options: readonly ToneCardOption<string>[];
};

export const DESTINATIONS: readonly DestinationMeta[] = [
  {
    slug: "personal",
    destination: "personal",
    group: "personal",
    previewKind: "personal",
    canManageRoutes: true,
    options: PERSONAL_OPTIONS,
  },
  {
    slug: "work",
    destination: "work",
    group: "work",
    previewKind: "work",
    canManageRoutes: true,
    options: WORK_OPTIONS,
  },
  {
    slug: "email",
    destination: "email",
    group: "email",
    previewKind: "email",
    canManageRoutes: true,
    options: EMAIL_OPTIONS,
  },
  {
    slug: "everywhere-else",
    destination: "overall",
    group: "everythingElse",
    previewKind: "overall",
    canManageRoutes: false,
    options: OVERALL_OPTIONS,
  },
];

export function findDestinationBySlug(
  slug: string | undefined,
): DestinationMeta | null {
  return DESTINATIONS.find((entry) => entry.slug === slug) ?? null;
}

/** The custom cleanup prompt lives on its own page, not under :destination. */
export const CUSTOM_PROMPT_PATH = "/settings/tone/custom-prompt";

export function destinationPath(slug: DestinationSlug): string {
  return `/settings/tone/${slug}`;
}

/** The tone currently stored for a destination. */
export function destinationValue(
  meta: DestinationMeta,
  settings: {
    personalTone: string;
    workTone: string;
    emailTone: string;
    overallTone: string;
  },
): string {
  switch (meta.destination) {
    case "personal":
      return settings.personalTone;
    case "work":
      return settings.workTone;
    case "email":
      return settings.emailTone;
    default:
      return settings.overallTone;
  }
}
