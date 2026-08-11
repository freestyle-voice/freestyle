import {
  CLEANUP_PRESET_PROMPTS,
  type CleanupAppAssignment,
  type CleanupEmailTone,
  type CleanupIntensity,
  type CleanupOverallTone,
  type CleanupPersonalTone,
  type CleanupWorkTone,
  parseCleanupAppAssignments,
  parseCleanupEmailTone,
  parseCleanupIntensity,
  parseCleanupOverallTone,
  parseCleanupPersonalTone,
  parseCleanupWorkTone,
} from "@freestyle-voice/validations";
import { normalizeManagedAssignments } from "@renderer/components/tone-previews/route-ownership";
import { getClient } from "@renderer/lib/api";
import { useCloudAuth } from "@renderer/lib/auth-context";
import {
  availableModelsQueryOptions,
  queryKeys,
  settingsQueryOptions,
} from "@renderer/lib/query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CLEANUP_EMAIL_TONE,
  DEFAULT_CLEANUP_OVERALL_TONE,
  DEFAULT_CLEANUP_PERSONAL_TONE,
  DEFAULT_CLEANUP_WORK_TONE,
} from "../../../../shared/cleanup-tone-settings";
import { SETTINGS_KEYS } from "../../../../shared/settings-keys";
import type { ConfiguredModel } from "../models/types";

// Settings that change whether the pill needs to capture the frontmost app for
// cleanup destination routing. Saving any of these notifies the pill to refresh
// its cached decision (see cleanup-app-context.ts).
const CLEANUP_CONTEXT_KEYS: ReadonlySet<string> = new Set([
  SETTINGS_KEYS.llmCleanup,
  SETTINGS_KEYS.cleanupPersonalTone,
  SETTINGS_KEYS.cleanupWorkTone,
  SETTINGS_KEYS.cleanupEmailTone,
  SETTINGS_KEYS.cleanupOverallTone,
]);

const FREESTYLE_CLOUD_PROVIDER = "freestyle-cloud";

export type ToneSettings = ReturnType<typeof useToneSettings>;

/**
 * Shared state for the Tone index and its destination pages.
 *
 * Both routes mount this independently, so every save writes through to the
 * `["settings"]` query cache as well as local state — otherwise navigating
 * index → destination → index would re-seed the index from a stale cache and
 * show the pre-edit value.
 */
export function useToneSettings() {
  const cloudAuth = useCloudAuth();
  const queryClient = useQueryClient();

  const [llmCleanup, setLlmCleanup] = useState(false);
  const [cleanupIntensity, setCleanupIntensity] =
    useState<CleanupIntensity>("medium");
  const [cleanupCustomPrompt, setCleanupCustomPrompt] = useState("");
  const [savedCleanupCustomPrompt, setSavedCleanupCustomPrompt] = useState("");
  const [savingCustomPrompt, setSavingCustomPrompt] = useState(false);
  const [personalTone, setPersonalTone] = useState<CleanupPersonalTone>(
    DEFAULT_CLEANUP_PERSONAL_TONE,
  );
  const [workTone, setWorkTone] = useState<CleanupWorkTone>(
    DEFAULT_CLEANUP_WORK_TONE,
  );
  const [emailTone, setEmailTone] = useState<CleanupEmailTone>(
    DEFAULT_CLEANUP_EMAIL_TONE,
  );
  const [overallTone, setOverallTone] = useState<CleanupOverallTone>(
    DEFAULT_CLEANUP_OVERALL_TONE,
  );
  const [assignments, setAssignments] = useState<CleanupAppAssignment[]>([]);
  const [usingCloud, setUsingCloud] = useState(false);

  const settingsQuery = useQuery(settingsQueryOptions());

  const configuredQuery = useQuery({
    queryKey: queryKeys.models.configured,
    queryFn: async () => {
      const res = await getClient().api.models.configured.$get();
      if (!res.ok) throw new Error("Failed to load configured models");
      return (await res.json()) as ConfiguredModel[];
    },
  });

  const loading = settingsQuery.isLoading || configuredQuery.isLoading;

  // Whether a default cleanup (LLM) model is configured — drives the banners.
  const hasCleanupModel = useMemo(
    () =>
      (configuredQuery.data ?? []).some(
        (model) => model.type === "llm" && model.is_default === 1,
      ),
    [configuredQuery.data],
  );

  // Seed editable state from persisted settings once. Save handlers update
  // local state and the query cache directly, so we don't re-seed on later
  // invalidations (which would clobber in-progress edits).
  const seededRef = useRef(false);
  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings || seededRef.current) return;
    seededRef.current = true;

    setLlmCleanup(settings[SETTINGS_KEYS.llmCleanup] === "true");
    setCleanupIntensity(
      parseCleanupIntensity(settings[SETTINGS_KEYS.cleanupIntensity]),
    );
    const prompt = settings[SETTINGS_KEYS.cleanupCustomPrompt];
    if (typeof prompt === "string") {
      setCleanupCustomPrompt(prompt);
      setSavedCleanupCustomPrompt(prompt);
    }
    setPersonalTone(
      parseCleanupPersonalTone(settings[SETTINGS_KEYS.cleanupPersonalTone]),
    );
    setWorkTone(parseCleanupWorkTone(settings[SETTINGS_KEYS.cleanupWorkTone]));
    setEmailTone(
      parseCleanupEmailTone(settings[SETTINGS_KEYS.cleanupEmailTone]),
    );
    setOverallTone(
      parseCleanupOverallTone(settings[SETTINGS_KEYS.cleanupOverallTone]),
    );
    setAssignments(
      normalizeManagedAssignments(
        parseCleanupAppAssignments(
          settings[SETTINGS_KEYS.cleanupAppAssignments],
        ),
      ),
    );
  }, [settingsQuery.data]);

  const reload = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.models.configured,
        }),
      ]),
    [queryClient],
  );

  const saveSetting = useCallback(
    async (key: string, value: string) => {
      // The Hono client does not throw on non-2xx — surface server rejections so
      // callers' .catch handlers fire (and "Saved" state isn't shown on failure).
      const res = await getClient().api.settings[":key"].$put({
        param: { key },
        json: { value },
      });
      if (!res.ok) {
        throw new Error(`Failed to save setting "${key}" (${res.status})`);
      }
      // Keep the shared cache in step so a sibling Tone route that mounts later
      // seeds from the value we just wrote, not the one it replaced.
      queryClient.setQueryData(
        queryKeys.settings,
        (prev: Record<string, string> | undefined) =>
          prev ? { ...prev, [key]: value } : prev,
      );
      // Let the pill refresh its cached "needs frontmost app for routing"
      // decision when a cleanup-relevant setting changes, so it doesn't
      // re-fetch settings on every recording start.
      if (CLEANUP_CONTEXT_KEYS.has(key)) {
        window.api?.sendCleanupContextChanged();
      }
    },
    [queryClient],
  );

  // Turn cleanup on by wiring Freestyle Cloud as the cleanup model. Requires a
  // signed-in cloud session; mirrors the Models page "Use Freestyle Cloud" flow.
  const onUseCloud = useCallback(async () => {
    if (usingCloud) return;
    setUsingCloud(true);
    try {
      const authed = cloudAuth.user
        ? !!(await cloudAuth.refresh())
        : !!(await cloudAuth.signIn());
      if (!authed) return;

      const client = getClient();
      const models = await queryClient.ensureQueryData(
        availableModelsQueryOptions(),
      );
      const cloudLlm = models.find(
        (model) =>
          model.type === "llm" &&
          model.provider_id === FREESTYLE_CLOUD_PROVIDER,
      );
      if (!cloudLlm) return;

      // Configure the cloud cleanup model first; only flip llm_cleanup on once
      // the model is actually persisted, otherwise cleanup would be "enabled"
      // with no model behind it (server silently returns raw text).
      const configRes = await client.api.models.configured.$post({
        json: {
          provider: cloudLlm.provider_id,
          model_id: cloudLlm.model_id,
          model_name: cloudLlm.model_name,
          type: "llm",
          is_default: true,
        },
      });
      if (!configRes.ok) {
        console.error(
          `Failed to configure Freestyle Cloud cleanup model (${configRes.status})`,
        );
        return;
      }

      await saveSetting(SETTINGS_KEYS.llmCleanup, "true");
      setLlmCleanup(true);
      await reload();
    } catch (err) {
      console.error("Failed to enable cleanup:", err);
    } finally {
      setUsingCloud(false);
    }
  }, [cloudAuth, queryClient, reload, saveSetting, usingCloud]);

  const selectCleanupMode = useCallback(
    (next: CleanupIntensity) => {
      // Enablement lives on the Models page now — this only picks the strength.
      setCleanupIntensity(next);
      saveSetting(SETTINGS_KEYS.cleanupIntensity, next).catch((err) =>
        console.error("Failed to save cleanup strength:", err),
      );
    },
    [saveSetting],
  );

  /**
   * Fill an empty custom prompt from a preset, and persist it.
   *
   * The editor page owns this, not `selectCleanupMode`. Seeding at selection
   * time raced its own navigation: the write went out unawaited, the editor
   * mounted and seeded from the `["settings"]` cache before it landed, and
   * `seededRef` latched that stale empty value. The result was an empty box
   * with a 15k prompt stored behind it.
   *
   * Awaited, so a failed write leaves the text as an unsaved draft with Save
   * enabled rather than a half-applied state.
   */
  const seedCustomPromptFrom = useCallback(
    async (preset: "low" | "medium" | "high") => {
      if (savedCleanupCustomPrompt.trim()) return;
      const seed = CLEANUP_PRESET_PROMPTS[preset];
      setCleanupCustomPrompt(seed);
      try {
        await saveSetting(SETTINGS_KEYS.cleanupCustomPrompt, seed);
        setSavedCleanupCustomPrompt(seed);
      } catch (err) {
        console.error("Failed to seed custom prompt:", err);
      }
    },
    [savedCleanupCustomPrompt, saveSetting],
  );

  const saveCleanupCustomPrompt = useCallback(async () => {
    const value = cleanupCustomPrompt;
    setSavingCustomPrompt(true);
    try {
      await saveSetting(SETTINGS_KEYS.cleanupCustomPrompt, value);
      setSavedCleanupCustomPrompt(value);
    } catch (err) {
      console.error("Failed to save cleanup custom prompt:", err);
    } finally {
      setSavingCustomPrompt(false);
    }
  }, [cleanupCustomPrompt, saveSetting]);

  const savePersonalTone = useCallback(
    (value: CleanupPersonalTone) => {
      setPersonalTone(value);
      saveSetting(SETTINGS_KEYS.cleanupPersonalTone, value).catch((err) =>
        console.error("Failed to save personal tone:", err),
      );
    },
    [saveSetting],
  );

  const saveWorkTone = useCallback(
    (value: CleanupWorkTone) => {
      setWorkTone(value);
      saveSetting(SETTINGS_KEYS.cleanupWorkTone, value).catch((err) =>
        console.error("Failed to save work tone:", err),
      );
    },
    [saveSetting],
  );

  const saveEmailTone = useCallback(
    (value: CleanupEmailTone) => {
      setEmailTone(value);
      saveSetting(SETTINGS_KEYS.cleanupEmailTone, value).catch((err) =>
        console.error("Failed to save email tone:", err),
      );
    },
    [saveSetting],
  );

  const saveOverallTone = useCallback(
    (value: CleanupOverallTone) => {
      setOverallTone(value);
      saveSetting(SETTINGS_KEYS.cleanupOverallTone, value).catch((err) =>
        console.error("Failed to save everything-else tone:", err),
      );
    },
    [saveSetting],
  );

  const persistAssignments = useCallback(
    (next: CleanupAppAssignment[]) => {
      const normalized = normalizeManagedAssignments(next);
      setAssignments(normalized);
      saveSetting(
        SETTINGS_KEYS.cleanupAppAssignments,
        JSON.stringify(normalized),
      ).catch((err) => console.error("Failed to save app assignments:", err));
    },
    [saveSetting],
  );

  const addAssignment = useCallback(
    (assignment: CleanupAppAssignment) => {
      // A given app/site maps to exactly one group — a re-add moves it.
      persistAssignments([
        ...assignments.filter((a) => a.match !== assignment.match),
        assignment,
      ]);
    },
    [assignments, persistAssignments],
  );

  const removeAssignment = useCallback(
    (match: string) => {
      persistAssignments(assignments.filter((a) => a.match !== match));
    },
    [assignments, persistAssignments],
  );

  return {
    loading,
    llmCleanup,
    hasCleanupModel,
    signedIn: !!cloudAuth.user,
    usingCloud,
    onUseCloud,

    cleanupIntensity,
    selectCleanupMode,
    cleanupCustomPrompt,
    setCleanupCustomPrompt,
    seedCustomPromptFrom,
    savedCleanupCustomPrompt,
    customPromptDirty: cleanupCustomPrompt !== savedCleanupCustomPrompt,
    savingCustomPrompt,
    saveCleanupCustomPrompt,

    personalTone,
    savePersonalTone,
    workTone,
    saveWorkTone,
    emailTone,
    saveEmailTone,
    overallTone,
    saveOverallTone,

    assignments,
    addAssignment,
    removeAssignment,
  };
}
