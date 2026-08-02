/**
 * User-facing dictation preferences (language + cleanup + all tone dials),
 * persisted locally and shared across the app via a context provider so every
 * settings sub-page reads and writes the same source of truth.
 */

import type {
  CloudMemberPreferences,
  MemberPreferencesInput,
} from "@freestyle-voice/validations";
import {
  normalizeLanguageList,
  parseStoredLanguageList,
} from "@freestyle-voice/validations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/hooks/use-auth";
import {
  type CleanupEmailTone,
  type CleanupIntensity,
  type CleanupOverallTone,
  type CleanupPersonalTone,
  type CleanupWorkTone,
  DEFAULT_EMAIL_TONE,
  DEFAULT_INTENSITY,
  DEFAULT_OVERALL_TONE,
  DEFAULT_PERSONAL_TONE,
  DEFAULT_WORK_TONE,
} from "./cleanup-tones";
import {
  fetchCloudPreferences,
  pushCloudPreferences,
} from "./cloud/preferences";
import { getPref, setPref } from "./storage";

/**
 * Query key for the member's cloud-synced preferences. Cloud is the authority
 * for these fields once industry-based seeding runs server-side; AsyncStorage
 * is the offline/instant-first-paint cache. The `cloud-` prefix marks it as
 * remote/auth-scoped (wiped on sign-out) per the app's query-key convention.
 */
const CLOUD_PREFERENCES_QUERY_KEY = ["cloud-preferences"] as const;

/** Cloud preferences are refetched at most every 5 minutes while fresh. */
const CLOUD_PREFERENCES_STALE_MS = 5 * 60 * 1000;

export const LANGUAGES = [
  { code: "auto", name: "Auto detect" },
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "hi", name: "Hindi" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
] as const;

// Canonical multi-language key (JSON array of ISO codes). `language` is the
// legacy singular key, read once for back-compat migration.
const LANGUAGES_KEY = "languages";
const LEGACY_LANGUAGE_KEY = "language";
const CLEANUP_KEY = "cleanup";
const INTENSITY_KEY = "cleanup_intensity";
const CUSTOM_PROMPT_KEY = "cleanup_custom_prompt";
const PERSONAL_TONE_KEY = "cleanup_personal_tone";
const WORK_TONE_KEY = "cleanup_work_tone";
const EMAIL_TONE_KEY = "cleanup_email_tone";
const OVERALL_TONE_KEY = "cleanup_overall_tone";

export interface DictationSettings {
  /** Preferred spoken languages (ISO codes); `[]` means auto-detect. */
  languages: string[];
  cleanup: boolean;
  intensity: CleanupIntensity;
  customPrompt: string;
  personalTone: CleanupPersonalTone;
  workTone: CleanupWorkTone;
  emailTone: CleanupEmailTone;
  overallTone: CleanupOverallTone;
}

const DEFAULTS: DictationSettings = {
  languages: [],
  cleanup: true,
  intensity: DEFAULT_INTENSITY,
  customPrompt: "",
  personalTone: DEFAULT_PERSONAL_TONE,
  workTone: DEFAULT_WORK_TONE,
  emailTone: DEFAULT_EMAIL_TONE,
  overallTone: DEFAULT_OVERALL_TONE,
};

interface SettingsContextValue {
  settings: DictationSettings;
  ready: boolean;
  setLanguages: (languages: string[]) => void;
  setCleanup: (cleanup: boolean) => void;
  setIntensity: (intensity: CleanupIntensity) => void;
  setCustomPrompt: (prompt: string) => void;
  setPersonalTone: (tone: CleanupPersonalTone) => void;
  setWorkTone: (tone: CleanupWorkTone) => void;
  setEmailTone: (tone: CleanupEmailTone) => void;
  setOverallTone: (tone: CleanupOverallTone) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * The scalar `DictationSettings` fields owned by the cloud (synced +
 * industry-seeded), and the `CloudMemberPreferences` field each maps to.
 * `cleanup` is a device-only app toggle and is intentionally absent.
 * `languages` (an array) is synced separately since it needs JSON handling.
 */
const CLOUD_FIELD_MAP: {
  [K in keyof DictationSettings]?:
    | "intensity"
    | "customPrompt"
    | "personalTone"
    | "workTone"
    | "emailTone"
    | "overallTone";
} = {
  intensity: "intensity",
  customPrompt: "customPrompt",
  personalTone: "personalTone",
  workTone: "workTone",
  emailTone: "emailTone",
  overallTone: "overallTone",
};

/** The AsyncStorage key backing each scalar cloud-owned field. */
const CLOUD_FIELD_STORAGE_KEY: Record<
  NonNullable<(typeof CLOUD_FIELD_MAP)[keyof typeof CLOUD_FIELD_MAP]>,
  string
> = {
  intensity: INTENSITY_KEY,
  customPrompt: CUSTOM_PROMPT_KEY,
  personalTone: PERSONAL_TONE_KEY,
  workTone: WORK_TONE_KEY,
  emailTone: EMAIL_TONE_KEY,
  overallTone: OVERALL_TONE_KEY,
};

/**
 * Overlay the cloud preference snapshot onto local settings (pure). Only fields
 * the cloud actually has (non-null/undefined) override the local value;
 * everything else is kept.
 */
function applyCloudPreferences(
  local: DictationSettings,
  remote: CloudMemberPreferences,
): DictationSettings {
  const next = { ...local };
  const overlay = <K extends keyof DictationSettings>(
    field: K,
    value: DictationSettings[K] | null | undefined,
  ): void => {
    if (value === undefined || value === null) return;
    next[field] = value;
  };

  overlay("intensity", remote.intensity ?? undefined);
  overlay("customPrompt", remote.customPrompt ?? undefined);
  overlay("personalTone", remote.personalTone ?? undefined);
  overlay("workTone", remote.workTone ?? undefined);
  overlay("emailTone", remote.emailTone ?? undefined);
  overlay("overallTone", remote.overallTone ?? undefined);
  // The cloud is authoritative for languages once present (including an
  // explicit empty array = auto-detect).
  if (remote.languages !== undefined && remote.languages !== null) {
    next.languages = normalizeLanguageList(remote.languages);
  }

  return next;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useAuth();
  const queryClient = useQueryClient();

  // Local device state, hydrated from AsyncStorage on mount. This is the
  // instant + offline source of truth; the cloud query overlays its
  // (authoritative) fields on top once it resolves.
  const [local, setLocal] = useState<DictationSettings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [
        languagesRaw,
        legacyLang,
        cleanup,
        intensity,
        customPrompt,
        personalTone,
        workTone,
        emailTone,
        overallTone,
      ] = await Promise.all([
        getPref(LANGUAGES_KEY),
        getPref(LEGACY_LANGUAGE_KEY),
        getPref(CLEANUP_KEY),
        getPref(INTENSITY_KEY),
        getPref(CUSTOM_PROMPT_KEY),
        getPref(PERSONAL_TONE_KEY),
        getPref(WORK_TONE_KEY),
        getPref(EMAIL_TONE_KEY),
        getPref(OVERALL_TONE_KEY),
      ]);
      setLocal({
        languages: parseStoredLanguageList(languagesRaw, legacyLang),
        cleanup: cleanup == null ? DEFAULTS.cleanup : cleanup === "true",
        intensity: (intensity as CleanupIntensity) ?? DEFAULTS.intensity,
        customPrompt: customPrompt ?? DEFAULTS.customPrompt,
        personalTone:
          (personalTone as CleanupPersonalTone) ?? DEFAULTS.personalTone,
        workTone: (workTone as CleanupWorkTone) ?? DEFAULTS.workTone,
        emailTone: (emailTone as CleanupEmailTone) ?? DEFAULTS.emailTone,
        overallTone:
          (overallTone as CleanupOverallTone) ?? DEFAULTS.overallTone,
      });
      setReady(true);
    })();
  }, []);

  // Cloud-synced preferences — the authority for the synced fields once
  // industry-based seeding runs server-side. Invalidating this key (e.g. after
  // a first-time industry save on the profile screen) refetches the seeded
  // tones/vocabulary so they surface immediately. Errors (signed out / offline
  // / no org) leave `data` undefined, so the local settings are used as-is.
  const { data: cloud } = useQuery({
    queryKey: CLOUD_PREFERENCES_QUERY_KEY,
    enabled: signedIn,
    staleTime: CLOUD_PREFERENCES_STALE_MS,
    retry: 1,
    queryFn: fetchCloudPreferences,
  });

  // Mirror the cloud's authoritative fields into AsyncStorage so the next cold
  // launch paints the synced values while offline (before the query resolves).
  useEffect(() => {
    if (!cloud) return;
    for (const cloudField of Object.values(CLOUD_FIELD_MAP)) {
      if (!cloudField) continue;
      const value = cloud[cloudField];
      if (value === undefined || value === null) continue;
      void setPref(CLOUD_FIELD_STORAGE_KEY[cloudField], String(value));
    }
    // Languages is an array — mirror it as JSON (present, incl. empty, wins).
    if (cloud.languages !== undefined && cloud.languages !== null) {
      void setPref(
        LANGUAGES_KEY,
        JSON.stringify(normalizeLanguageList(cloud.languages)),
      );
    }
  }, [cloud]);

  // One-time-ish backfill: seed the cloud with any synced field it's still
  // missing but that the user has stored locally. Pre-cloud-sync installs never
  // pushed their EXISTING local preferences up (a value only syncs when it later
  // changes), so without this a cloud-missing field would make the streaming DO
  // fall back to a built-in default now that the app no longer sends preferences
  // inline. Only fields the cloud LACKS are pushed (a value it already has —
  // including an explicit `null` clear — wins); the cache is patched optimistically
  // so this won't re-fire, and a failed push simply retries on the next resolve.
  useEffect(() => {
    if (!signedIn || !cloud) return;
    (async () => {
      const patch: MemberPreferencesInput = {};

      for (const cloudField of Object.values(CLOUD_FIELD_MAP)) {
        if (!cloudField) continue;
        // Cloud already carries this field — don't clobber the authoritative value.
        if (cloud[cloudField] !== undefined && cloud[cloudField] !== null)
          continue;
        const stored = await getPref(CLOUD_FIELD_STORAGE_KEY[cloudField]);
        if (stored == null || stored === "") continue;
        (patch as Record<string, unknown>)[cloudField] = stored;
      }

      // Languages is a JSON array with its own storage key. Seed it only when
      // the cloud has nothing and the user actually has a stored selection.
      if (cloud.languages === undefined || cloud.languages === null) {
        const [raw, legacy] = await Promise.all([
          getPref(LANGUAGES_KEY),
          getPref(LEGACY_LANGUAGE_KEY),
        ]);
        const langs = normalizeLanguageList(
          parseStoredLanguageList(raw, legacy),
        );
        if (langs.length > 0) patch.languages = langs;
      }

      if (Object.keys(patch).length === 0) return;

      // Reflect the seed in the cache so the overlay + this effect converge
      // without waiting for a refetch (the effect re-runs, finds nothing
      // missing, and stops).
      queryClient.setQueryData<CloudMemberPreferences>(
        CLOUD_PREFERENCES_QUERY_KEY,
        (prev) => ({ ...(prev ?? {}), ...patch }),
      );
      void pushCloudPreferences(patch).catch(() => {});
    })();
  }, [signedIn, cloud, queryClient]);

  // The effective settings: local device state with the cloud's authoritative
  // fields overlaid. Recomputes only when local or cloud changes.
  const settings = useMemo<DictationSettings>(
    () => (cloud ? applyCloudPreferences(local, cloud) : local),
    [local, cloud],
  );

  const persist = useCallback(
    <K extends keyof DictationSettings>(
      storageKey: string,
      field: K,
      value: DictationSettings[K],
    ) => {
      // Optimistic local update + AsyncStorage write (instant + offline).
      setLocal((s) => ({ ...s, [field]: value }));
      void setPref(storageKey, String(value));

      // Mirror the change to the cloud (fire-and-forget; swallowed on failure
      // so a sync error never affects the local write). Also patch the cached
      // cloud snapshot optimistically so a re-render (or a later query read)
      // reflects the change without waiting for a refetch.
      const cloudField = CLOUD_FIELD_MAP[field];
      if (cloudField) {
        queryClient.setQueryData<CloudMemberPreferences>(
          CLOUD_PREFERENCES_QUERY_KEY,
          (prev) => ({ ...(prev ?? {}), [cloudField]: value }),
        );
        void pushCloudPreferences({ [cloudField]: value }).catch(() => {});
      }
    },
    [queryClient],
  );

  // Languages need JSON storage + an array cloud payload, so they get their own
  // setter rather than going through the scalar `persist`.
  const setLanguages = useCallback(
    (next: string[]) => {
      const normalized = normalizeLanguageList(next);
      setLocal((s) => ({ ...s, languages: normalized }));
      void setPref(LANGUAGES_KEY, JSON.stringify(normalized));
      queryClient.setQueryData<CloudMemberPreferences>(
        CLOUD_PREFERENCES_QUERY_KEY,
        (prev) => ({ ...(prev ?? {}), languages: normalized }),
      );
      void pushCloudPreferences({ languages: normalized }).catch(() => {});
    },
    [queryClient],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      ready,
      setLanguages,
      setCleanup: (cleanup) => persist(CLEANUP_KEY, "cleanup", cleanup),
      setIntensity: (intensity) =>
        persist(INTENSITY_KEY, "intensity", intensity),
      setCustomPrompt: (prompt) =>
        persist(CUSTOM_PROMPT_KEY, "customPrompt", prompt),
      setPersonalTone: (tone) =>
        persist(PERSONAL_TONE_KEY, "personalTone", tone),
      setWorkTone: (tone) => persist(WORK_TONE_KEY, "workTone", tone),
      setEmailTone: (tone) => persist(EMAIL_TONE_KEY, "emailTone", tone),
      setOverallTone: (tone) => persist(OVERALL_TONE_KEY, "overallTone", tone),
    }),
    [settings, ready, persist, setLanguages],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

/** Access dictation settings. Must be used under a `SettingsProvider`. */
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}
