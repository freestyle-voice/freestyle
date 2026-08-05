import {
  apiKeySchema,
  MAX_LANGUAGES,
  normalizeLanguageList,
} from "@freestyle-voice/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyComboDisplay } from "@renderer/components/key-combo";
import {
  LanguageMultiPickerDialog,
  useLanguageOptions,
} from "@renderer/components/language-combobox";
import { ModelSetupPanel } from "@renderer/components/model-setup-panel";
import {
  CoachStrip,
  useCoachPress,
} from "@renderer/components/onboarding/coach-strip";
import { EmailDraft } from "@renderer/components/onboarding/email-draft";
import { SignInButton, SignInSplit } from "@renderer/components/sign-in-split";
import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@renderer/components/ui/input-group";
import { RevealToggle } from "@renderer/components/ui/reveal-toggle";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import { VoiceRow } from "@renderer/components/voice-row";
import {
  comboDisplayKeys,
  formatAcceleratorKeys,
  keyDisplayLabel,
  useHotkeyRecorder,
} from "@renderer/hooks/use-hotkey-recorder";
import { capture } from "@renderer/lib/analytics";
import { getClient } from "@renderer/lib/api";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { defaultLanguage } from "@renderer/lib/languages";
import {
  type AvailableModel,
  buildVoiceItems,
  FREESTYLE_CLOUD_MODEL_ID,
  FREESTYLE_CLOUD_PROVIDER_ID,
  type MlxAsrStatus,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_KEY_URLS,
  type VoiceItem,
  type WhisperStatus,
} from "@renderer/lib/models";
import { requestMicAccess, resolveMicStatus } from "@renderer/lib/permissions";
import { IS_LINUX, IS_MAC, IS_WINDOWS, PLATFORM } from "@renderer/lib/platform";
import { queryKeys, settingsQueryOptions } from "@renderer/lib/query";
import { useCloudConfig } from "@renderer/lib/use-cloud-config";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ClipboardPaste,
  HardDrive,
  Key,
  Keyboard,
  Loader2,
  Mic,
  Shield,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { CloudUser } from "../../shared/cloud-user";
import { getDefaultHotkey } from "../../shared/hotkey-defaults";
import { getDefaultRemixHotkey } from "../../shared/remix";
import { SETTINGS_KEYS } from "../../shared/settings-keys";
import type { ConfiguredModel } from "./pages/models/types";

type Step = "permissions" | "cloud" | "language" | "draft" | "remix";

const DEFAULT_HOTKEY =
  (typeof window !== "undefined" && window.api?.defaultHotkey) ||
  getDefaultHotkey();

// Linux system-setup state reported by the main process (input-group access
// for the hotkey listener, xdotool/wtype for the paste fallback).
type LinuxSetup = {
  wayland: boolean;
  inputAccess: boolean;
  uinputAccess: boolean;
  pasteToolRequired: string;
  pasteTool: string | null;
};

// The opinionated on-device pick, in order of preference. Qwen3 ASR (MLX)
// is the hero when the machine can run it; whisper.cpp's Balanced model is
// the universal fallback (it builds its own binary, no Python required).
// It downloads in the background while the user picks a language and a
// hotkey — first-time users never choose a model.
const RECOMMENDED_MLX_DEF = "qwen3-0.6b-8bit";
const RECOMMENDED_WHISPER_DEF = "small-q5_1";

/** True while any local model is downloading or verifying. */
function hasActiveDownload(
  models: { status: string }[] | undefined | null,
): boolean {
  return !!models?.some(
    (m) => m.status === "downloading" || m.status === "verifying",
  );
}

export default function OnboardingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("cloud");

  const {
    user: cloudUser,
    loading: cloudLoading,
    signingIn: cloudSigningIn,
    error: cloudError,
    refresh: cloudRefresh,
    signIn: cloudSignIn,
  } = useCloudAuth();
  const prevSignedIn = useRef(false);

  // Permissions state
  const [micStatus, setMicStatus] = useState<string>("unknown");
  const [accessibilityStatus, setAccessibilityStatus] = useState(false);
  const [linuxSetup, setLinuxSetup] = useState<LinuxSetup | null>(null);

  // Voice model state
  const [available, setAvailable] = useState<AvailableModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AvailableModel | null>(
    null,
  );
  const [selectedWhisperDefId, setSelectedWhisperDefId] = useState<
    string | null
  >(null);
  const [selectedMlxDefId, setSelectedMlxDefId] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Set<string>>(new Set());
  const [languages, setLanguages] = useState<string[]>(() => {
    // Seed from the OS language when it's a real code; "auto" starts empty.
    const guess = defaultLanguage();
    return guess === "auto" ? [] : [guess];
  });
  const autoPicked = useRef(false);
  const warmed = useRef(false);
  // Tracks the most recent explicit local pick so cloud users who briefly
  // selected a different on-device model still download the right one.
  const lastLocalSetupRef = useRef<{
    defId: string;
    engine: "whisper" | "mlx";
  } | null>(null);
  // Full model selector overlay (cloud + everything else)
  const [showSelector, setShowSelector] = useState(false);
  const [selectorSource, setSelectorSource] = useState<"cloud" | "local">(
    "cloud",
  );
  const apiKeyForm = useForm<{ provider: string; key: string }>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { provider: "", key: "" },
  });
  const [showKey, setShowKey] = useState(false);

  // Hotkey recorder state (draft step)
  const [hotkey, setHotkey] = useState(DEFAULT_HOTKEY);

  // The practice email body, lifted so it survives the draft→remix step
  // transition (and Back).
  const [draftBody, setDraftBody] = useState("");
  const draftDictated = useRef(false);
  const onDraftDictated = useCallback(() => {
    if (draftDictated.current) return;
    draftDictated.current = true;
    capture("onboarding_draft_dictated");
  }, []);

  const handleHotkeyRecorded = useCallback((accelerator: string) => {
    setHotkey(accelerator);
    capture("onboarding_hotkey_changed", { hotkey: accelerator });
    getClient()
      .api.settings[":key"].$put({
        param: { key: SETTINGS_KEYS.hotkey },
        json: { value: accelerator },
      })
      .catch(() => {});
  }, []);

  const {
    state: recorderState,
    liveModifiers,
    capturedCombo,
    canSaveRecording,
    needsModifierOrMouseButton,
    startRecording: startHotkeyRecording,
    cancelRecording: cancelHotkeyRecording,
  } = useHotkeyRecorder(handleHotkeyRecorded);

  const liveKeys = liveModifiers.map(keyDisplayLabel);
  const draftKeys = capturedCombo ? comboDisplayKeys(capturedCombo) : liveKeys;
  const captureHint = needsModifierOrMouseButton
    ? "Add a modifier or side mouse button · Esc to cancel"
    : canSaveRecording
      ? "Release to save · Esc to cancel"
      : "Press a modifier or side mouse button… · Esc to cancel";

  // Load permissions
  useEffect(() => {
    resolveMicStatus()
      .then(setMicStatus)
      .catch(() => {});
    window.api
      ?.checkAccessibilityPermission()
      .then(setAccessibilityStatus)
      .catch(() => {});
    if (IS_LINUX) {
      window.api
        ?.checkLinuxSetup()
        .then((setup) => setup && setLinuxSetup(setup))
        .catch(() => {});
    }
  }, []);

  // Saved hotkey, read from the shared settings cache (deduped with every other
  // settings consumer instead of a dedicated GET /api/settings/:key).
  const { data: settingsData } = useQuery(settingsQueryOptions());
  useEffect(() => {
    const value = settingsData?.[SETTINGS_KEYS.hotkey];
    if (value) setHotkey(value);
  }, [settingsData]);

  // Analytics: entry + per-step views (drives the drop-off funnel).
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      capture("onboarding_started", {
        platform: PLATFORM,
      });
    }
    capture("onboarding_step_viewed", { step });
  }, [step]);

  // Analytics: fire once each permission flips to granted.
  useEffect(() => {
    if (micStatus === "granted") capture("onboarding_mic_granted");
  }, [micStatus]);
  useEffect(() => {
    if (accessibilityStatus) capture("onboarding_accessibility_granted");
  }, [accessibilityStatus]);

  // Load models + keys
  useEffect(() => {
    const client = getClient();
    client.api.models.available
      .$get()
      .then((r) => (r.ok ? r.json() : []))
      .then((models: AvailableModel[]) => setAvailable(models))
      .catch(() => {});
    client.api.keys
      .$get()
      .then((r) => (r.ok ? r.json() : []))
      .then((keys: { provider: string }[]) =>
        setApiKeys(new Set(keys.map((k) => k.provider))),
      )
      .catch(() => {});
  }, []);

  // Whisper / MLX status via React Query. refetchInterval replaces the manual
  // 500ms setInterval polling: it polls only while a download/verify is active
  // and stops automatically once everything settles.
  const whisperQuery = useQuery({
    queryKey: queryKeys.whisperStatus,
    queryFn: async () => {
      const res = await getClient().api.whisper.status.$get();
      if (!res.ok) throw new Error("Failed to load whisper status");
      return (await res.json()) as WhisperStatus;
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && (d.binaryDownloading || hasActiveDownload(d.models))
        ? 500
        : false;
    },
    staleTime: 0,
  });

  const mlxQuery = useQuery({
    queryKey: queryKeys.mlxStatus,
    enabled: IS_MAC,
    queryFn: async () => {
      const res = await getClient().api["mlx-asr"].status.$get();
      if (!res.ok) throw new Error("Failed to load MLX ASR status");
      return (await res.json()) as MlxAsrStatus;
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && hasActiveDownload(d.models) ? 500 : false;
    },
    staleTime: 0,
  });

  const whisperStatus = whisperQuery.data ?? null;
  const mlxStatus = mlxQuery.data ?? null;
  // True once we know whether MLX can run — the auto-pick waits for the
  // Qwen-vs-Whisper decision instead of settling on Whisper Base while the MLX
  // probe is in flight. Non-Mac has nothing to wait for.
  const mlxResolved = !IS_MAC || mlxQuery.isFetched;

  const requestMic = useCallback(async () => {
    capture("onboarding_mic_permission_clicked", { action: "allow" });
    const status = await requestMicAccess();
    if (status) setMicStatus(status);
  }, []);

  const recheckLinuxSetup = useCallback(async () => {
    capture("onboarding_linux_setup_rechecked");
    const setup = await window.api?.checkLinuxSetup();
    if (setup) setLinuxSetup(setup);
  }, []);

  const openMicSettings = useCallback(() => {
    capture("onboarding_mic_permission_clicked", {
      action: "open_settings",
    });
    window.api?.openMicSettings();
    const interval = setInterval(async () => {
      const mic = await window.api?.checkMicPermission();
      if (mic === "granted") {
        setMicStatus("granted");
        clearInterval(interval);
      }
    }, 1000);
    setTimeout(() => clearInterval(interval), 30000);
  }, []);

  const openAccessibility = useCallback(() => {
    capture("onboarding_accessibility_clicked");
    window.api?.openAccessibilitySettings();
    const interval = setInterval(async () => {
      const ok = await window.api?.checkAccessibilityPermission();
      if (ok) {
        setAccessibilityStatus(true);
        clearInterval(interval);
      }
    }, 1000);
    setTimeout(() => clearInterval(interval), 30000);
  }, []);

  // Commit a model as the default. Selection in this flow IS commitment —
  // there is no separate "save" step anymore.
  const commitCloudModel = useCallback((model: AvailableModel) => {
    getClient()
      .api.models.configured.$post({
        json: {
          provider: model.provider_id,
          model_id: model.model_id,
          model_name: model.model_name,
          type: "voice",
          is_default: true,
        },
      })
      .catch(() => {});
    capture("onboarding_model_completed", {
      model_id: model.model_id,
      kind: "cloud",
      provider: model.provider_id,
      source: "selector",
    });
  }, []);

  const commitFreestyleCloudDefault = useCallback(() => {
    const model = available.find(
      (m) =>
        m.provider_id === FREESTYLE_CLOUD_PROVIDER_ID && m.type === "voice",
    );
    if (model) {
      setSelectedModel(model);
      setSelectedWhisperDefId(null);
      setSelectedMlxDefId(null);
    }
    const modelId = model?.model_id ?? FREESTYLE_CLOUD_MODEL_ID;
    const modelName = model?.model_name ?? "Freestyle Transcribe";
    getClient()
      .api.models.configured.$post({
        json: {
          provider: FREESTYLE_CLOUD_PROVIDER_ID,
          model_id: modelId,
          model_name: modelName,
          type: "voice",
          is_default: true,
        },
      })
      .catch(() => {});
    capture("onboarding_cloud_default_set", { model_id: modelId });
  }, [available]);

  const selectCloudModel = useCallback(
    (model: AvailableModel) => {
      if (model.provider_id === FREESTYLE_CLOUD_PROVIDER_ID) {
        void (async () => {
          const user = cloudUser ? await cloudRefresh() : await cloudSignIn();
          if (!user) return;
          commitFreestyleCloudDefault();
          setShowSelector(false);
        })();
        return;
      }
      setSelectedModel(model);
      setSelectedWhisperDefId(null);
      setSelectedMlxDefId(null);
      if (apiKeys.has(model.provider_id)) {
        commitCloudModel(model);
      } else {
        // Reset the key form so the key-entry view opens empty for a
        // provider we don't have a key for yet; commit happens on key save.
        apiKeyForm.reset({ provider: model.provider_id, key: "" });
      }
    },
    [
      apiKeys,
      apiKeyForm,
      commitCloudModel,
      cloudUser,
      cloudRefresh,
      cloudSignIn,
      commitFreestyleCloudDefault,
    ],
  );

  const selectLocalModel = useCallback(
    (
      defId: string,
      name: string,
      engine?: "whisper" | "mlx",
      source: "auto" | "selector" = "selector",
      makeDefault = true,
    ) => {
      if (makeDefault) {
        if (engine === "mlx") {
          setSelectedMlxDefId(defId);
          setSelectedWhisperDefId(null);
        } else if (engine === "whisper") {
          setSelectedWhisperDefId(defId);
          setSelectedMlxDefId(null);
        }
        if (engine) {
          lastLocalSetupRef.current = { defId, engine };
        }
        setSelectedModel(null);
      }
      const provider = engine === "mlx" ? "local-mlx" : "local-whisper";
      getClient()
        .api.models.configured.$post({
          json: {
            provider,
            model_id: `${provider}/${defId}`,
            model_name: name,
            type: "voice",
            is_default: makeDefault,
          },
        })
        .catch(() => {});
      if (makeDefault) {
        // The funnel's model-step event: with auto-setup this fires for every
        // user; `source` separates the silent default from explicit picks.
        capture("onboarding_model_completed", {
          model_id: `${provider}/${defId}`,
          kind: "local",
          provider,
          source,
        });
      }
    },
    [],
  );

  const downloadWhisperModel = useCallback(
    async (modelId: string) => {
      await getClient().api.whisper.models[":model"].download.$post({
        param: { model: modelId },
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.whisperStatus });
    },
    [queryClient],
  );

  const downloadMlxModel = useCallback(
    async (modelId: string) => {
      await getClient().api["mlx-asr"].models[":model"].download.$post({
        param: { model: modelId },
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mlxStatus });
    },
    [queryClient],
  );

  const downloadLocalModel = useCallback(
    (modelId: string, engine?: "whisper" | "mlx") => {
      if (engine === "mlx") {
        void downloadMlxModel(modelId);
        return;
      }
      void downloadWhisperModel(modelId);
    },
    [downloadMlxModel, downloadWhisperModel],
  );

  const allVoiceItems = buildVoiceItems(available, whisperStatus, mlxStatus, {
    selectedModelId: selectedModel?.model_id,
    selectedProvider:
      selectedModel?.provider_id ??
      (selectedWhisperDefId
        ? "local-whisper"
        : selectedMlxDefId
          ? "local-mlx"
          : undefined),
    selectedWhisperModelId: selectedWhisperDefId ?? undefined,
    selectedMlxModelId: selectedMlxDefId ?? undefined,
    keyProviders: apiKeys,
    cloudSignedIn: !!cloudUser,
  });

  // Resolve the opinionated recommendation: Qwen3 on-device when MLX can run,
  // otherwise whisper.cpp Base (universal).
  const mlxQwen = allVoiceItems.find(
    (v) => v.localEngine === "mlx" && v.defId === RECOMMENDED_MLX_DEF,
  );
  const whisperBase = allVoiceItems.find(
    (v) => v.localEngine === "whisper" && v.defId === RECOMMENDED_WHISPER_DEF,
  );
  const recommended: VoiceItem | undefined =
    mlxQwen && mlxStatus?.canRun ? mlxQwen : (whisperBase ?? mlxQwen);

  // Auto-setup: once the MLX capability check and cloud session both settle,
  // commit a default local model. Signed in → Freestyle Cloud is the default
  // and the on-device fallback downloads silently in the background. Signed
  // out → the on-device model is the default; download starts from the
  // setup panel when the user taps Download.
  useEffect(() => {
    if (
      autoPicked.current ||
      cloudLoading ||
      !mlxResolved ||
      !recommended?.defId ||
      !recommended.localEngine
    )
      return;
    autoPicked.current = true;
    lastLocalSetupRef.current = {
      defId: recommended.defId,
      engine: recommended.localEngine,
    };
    selectLocalModel(
      recommended.defId,
      recommended.name,
      recommended.localEngine,
      "auto",
      !cloudUser,
    );
    if (cloudUser) {
      commitFreestyleCloudDefault();
      if (recommended.status === "not_downloaded" && !window.api?.isE2E) {
        capture("onboarding_model_auto_setup", {
          model_id: recommended.modelId,
        });
        downloadLocalModel(recommended.defId, recommended.localEngine);
      }
    }
  }, [
    recommended,
    selectLocalModel,
    mlxResolved,
    downloadLocalModel,
    cloudLoading,
    cloudUser,
    commitFreestyleCloudDefault,
  ]);

  useEffect(() => {
    const signedIn = !!cloudUser;
    if (signedIn && !prevSignedIn.current && autoPicked.current) {
      commitFreestyleCloudDefault();
    }
    prevSignedIn.current = signedIn;
  }, [cloudUser, commitFreestyleCloudDefault]);

  // Pre-warm the local engine the moment its download lands, so the first
  // dictation in the tutorial is fast.
  const warmTarget = allVoiceItems.find((v) => v.selected) ?? recommended;
  useEffect(() => {
    if (
      warmed.current ||
      warmTarget?.kind !== "local" ||
      warmTarget.status !== "ready" ||
      !warmTarget.defId
    )
      return;
    warmed.current = true;
    if (warmTarget.localEngine === "mlx") {
      getClient()
        .api["mlx-asr"].server.start.$post({
          json: { modelId: warmTarget.defId },
        })
        .catch(() => {});
    } else {
      getClient()
        .api.whisper.server.start.$post({ json: { modelId: warmTarget.defId } })
        .catch(() => {});
    }
  }, [warmTarget]);

  // The model the card reflects: whatever is currently selected, falling
  // back to the recommendation before the user has touched anything.
  const chosen = allVoiceItems.find((v) => v.selected) ?? recommended;

  // Analytics: detect the chosen local model's download finishing or failing.
  const chosenStatus = chosen?.kind === "local" ? chosen.status : undefined;
  const chosenModelId = chosen?.modelId;
  const prevDownload = useRef<{ id?: string; status?: string }>({});
  useEffect(() => {
    const prev = prevDownload.current;
    prevDownload.current = { id: chosenModelId, status: chosenStatus };
    // Only count transitions for the *same* model (not a re-selection).
    if (
      prev.id !== chosenModelId ||
      !prev.status ||
      prev.status === chosenStatus
    )
      return;
    if (
      chosenStatus === "ready" &&
      (prev.status === "downloading" || prev.status === "verifying")
    ) {
      capture("onboarding_model_download_completed", {
        model_id: chosenModelId,
      });
    } else if (chosenStatus === "error") {
      capture("onboarding_model_download_failed", {
        model_id: chosenModelId,
      });
    }
  }, [chosenStatus, chosenModelId]);

  // Persist the language list (the transcribe path reads it per request).
  const persistLanguages = useCallback((next: string[]) => {
    getClient()
      .api.settings[":key"].$put({
        param: { key: SETTINGS_KEYS.languages },
        json: { value: JSON.stringify(next) },
      })
      .catch(() => {});
  }, []);

  const toggleLanguage = useCallback(
    (code: string) => {
      setLanguages((prev) => {
        const next = prev.includes(code)
          ? prev.filter((c) => c !== code)
          : normalizeLanguageList([...prev, code]);
        capture("onboarding_language_changed", { languages: next });
        persistLanguages(next);
        return next;
      });
    },
    [persistLanguages],
  );

  const clearLanguages = useCallback(() => {
    setLanguages([]);
    capture("onboarding_language_changed", { languages: [] });
    persistLanguages([]);
  }, [persistLanguages]);

  // Validate + persist a freshly entered cloud key. Returns true when stored
  // so the selector can commit and close.
  const saveCloudKey = useCallback(async () => {
    const valid = await apiKeyForm.trigger();
    if (!valid) return false;
    const { provider, key } = apiKeyForm.getValues();
    if (!key.trim()) return false;
    await getClient()
      .api.keys.$post({ json: { provider, key: key.trim() } })
      .catch(() => {});
    setApiKeys((prev) => new Set([...prev, provider]));
    capture("onboarding_cloud_key_saved", { provider });
    if (selectedModel) commitCloudModel(selectedModel);
    return true;
  }, [apiKeyForm, selectedModel, commitCloudModel]);

  const finishSetup = useCallback(() => {
    capture("onboarding_completed");
    window.api?.setOnboardingComplete();
    navigate("/today", { replace: true });
  }, [navigate]);

  // Whether the chosen voice model is ready to use (downloaded / has a key).
  const chosenReady =
    !!chosen &&
    (chosen.kind === "cloud" ? !!chosen.hasKey : chosen.status === "ready");

  const localSetupModel = ((): VoiceItem | undefined => {
    if (chosen?.kind === "local") return chosen;
    if (lastLocalSetupRef.current) {
      const { defId, engine } = lastLocalSetupRef.current;
      return allVoiceItems.find(
        (v) =>
          v.kind === "local" && v.defId === defId && v.localEngine === engine,
      );
    }
    return recommended;
  })();
  const showLocalSetupPanel = !cloudUser;
  const mustHaveLocalReady = chosen?.kind === "local" && !chosenReady;
  const localSetupActive =
    localSetupModel?.kind === "local" &&
    (localSetupModel.status === "downloading" ||
      localSetupModel.status === "verifying" ||
      localSetupModel.state?.phase === "building_binary");

  const startLocalDownload = useCallback(() => {
    if (!localSetupModel?.defId || window.api?.isE2E) return;
    capture("onboarding_model_download_started", {
      model_id: localSetupModel.modelId,
    });
    downloadLocalModel(localSetupModel.defId, localSetupModel.localEngine);
  }, [localSetupModel, downloadLocalModel]);

  const retryLocalDownload = useCallback(() => {
    if (!localSetupModel?.defId || window.api?.isE2E) return;
    capture("onboarding_model_download_started", {
      model_id: localSetupModel.modelId,
      retry: true,
    });
    downloadLocalModel(localSetupModel.defId, localSetupModel.localEngine);
  }, [localSetupModel, downloadLocalModel]);

  return (
    <div className="glass-window-shell glass-content flex h-screen flex-col">
      <div
        className="h-9 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {step === "cloud" ? (
        <CloudStep
          user={cloudUser}
          signingIn={cloudSigningIn}
          error={cloudError}
          onSignIn={() => {
            capture("onboarding_cloud_signin_clicked");
            void cloudSignIn().then((u) => {
              if (u) capture("onboarding_cloud_signin_succeeded");
            });
          }}
          onContinue={() => {
            capture("onboarding_cloud_step_completed", {
              signed_in: true,
              skipped: false,
            });
            setStep("permissions");
          }}
          onSkip={() => {
            capture("onboarding_cloud_step_completed", {
              signed_in: false,
              skipped: true,
            });
            setStep("permissions");
          }}
        />
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-6 py-8"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {step === "permissions" && (
            <PermissionsStep
              micStatus={micStatus}
              accessibilityStatus={accessibilityStatus}
              linuxSetup={linuxSetup}
              onRequestMic={requestMic}
              onOpenMicSettings={openMicSettings}
              onOpenAccessibility={openAccessibility}
              onRecheckLinuxSetup={recheckLinuxSetup}
              onBack={() => {
                capture("onboarding_permissions_back_clicked");
                setStep("cloud");
              }}
              onContinue={() => {
                capture("onboarding_permissions_completed");
                setStep("language");
              }}
            />
          )}

          {step === "language" && (
            <LanguageStep
              languages={languages}
              onToggle={toggleLanguage}
              onClear={clearLanguages}
              localModel={showLocalSetupPanel ? localSetupModel : undefined}
              onDownloadLocal={startLocalDownload}
              onRetryLocal={retryLocalDownload}
              onBack={() => {
                capture("onboarding_language_back_clicked");
                setStep("permissions");
              }}
              onContinue={() => {
                // Persist even when the pre-selected locale was never toggled.
                persistLanguages(languages);
                capture("onboarding_language_completed", { languages });
                setStep("draft");
              }}
            />
          )}

          {step === "draft" && (
            <DraftStep
              hotkey={hotkey}
              recorderState={recorderState}
              draftKeys={draftKeys}
              captureHint={captureHint}
              modelReady={chosenReady}
              localModel={showLocalSetupPanel ? localSetupModel : undefined}
              onDownloadLocal={startLocalDownload}
              onRetryLocal={retryLocalDownload}
              canContinue={!mustHaveLocalReady || !!window.api?.isE2E}
              continueBlockedReason={
                mustHaveLocalReady
                  ? localSetupActive
                    ? "downloading"
                    : "notReady"
                  : null
              }
              body={draftBody}
              onBodyChange={setDraftBody}
              onDraftDictated={onDraftDictated}
              onStartRecording={() => {
                capture("onboarding_hotkey_change_started");
                startHotkeyRecording();
              }}
              onCancelRecording={cancelHotkeyRecording}
              onDictation={() => capture("onboarding_dictation_tried")}
              onBack={() => {
                capture("onboarding_tutorial_back_clicked");
                setStep("language");
              }}
              onContinue={() => setStep("remix")}
            />
          )}

          {step === "remix" && (
            <RemixStep
              body={draftBody}
              onBodyChange={setDraftBody}
              onBack={() => setStep("draft")}
              onFinish={finishSetup}
            />
          )}
        </div>
      )}

      {showSelector && (
        <ModelSelectorOverlay
          source={selectorSource}
          onSourceChange={(s) => {
            capture("onboarding_model_selector_source_changed", {
              source: s,
            });
            setSelectorSource(s);
          }}
          voiceItems={allVoiceItems}
          keyProviders={apiKeys}
          selectedCloud={selectedModel}
          apiKeyForm={apiKeyForm}
          showKey={showKey}
          onToggleShowKey={() => setShowKey((v) => !v)}
          onSelectCloud={selectCloudModel}
          onSelectLocal={selectLocalModel}
          onDownload={downloadLocalModel}
          onRetryLocal={(defId, engine) => {
            if (engine === "mlx") {
              // Force a fresh MLX capability probe, prime the cache, then
              // download only if the machine can actually run it.
              void (async () => {
                const res = await getClient()
                  .api["mlx-asr"].status.$get({ query: { refresh: "1" } })
                  .catch(() => null);
                if (!res?.ok) return;
                const data = (await res.json()) as MlxAsrStatus;
                queryClient.setQueryData(queryKeys.mlxStatus, data);
                if (data.canRun) void downloadMlxModel(defId);
              })();
            } else {
              downloadWhisperModel(defId);
            }
          }}
          onClose={() => setShowSelector(false)}
          onSaveKey={saveCloudKey}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Permissions
// ---------------------------------------------------------------------------
function PermissionsStep({
  micStatus,
  accessibilityStatus,
  linuxSetup,
  onRequestMic,
  onOpenMicSettings,
  onOpenAccessibility,
  onRecheckLinuxSetup,
  onBack,
  onContinue,
}: {
  micStatus: string;
  accessibilityStatus: boolean;
  linuxSetup: LinuxSetup | null;
  onRequestMic: () => void;
  onOpenMicSettings: () => void;
  onOpenAccessibility: () => void;
  onRecheckLinuxSetup: () => void;
  onBack: () => void;
  onContinue: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const micGranted = micStatus === "granted";
  // On Wayland there is no hotkey fallback without /dev/input access, so
  // missing input access blocks. On X11 the Electron globalShortcut still
  // works (toggle mode), so the card only warns.
  const linuxBlocked = !!linuxSetup?.wayland && !linuxSetup.inputAccess;
  // Accessibility is macOS-only; elsewhere the mic alone unblocks.
  // E2E runs on machines that can't grant OS permissions.
  const allGranted =
    (micGranted && (!IS_MAC || accessibilityStatus) && !linuxBlocked) ||
    !!window.api?.isE2E;
  // macOS and Windows can deep-link to the OS mic privacy settings.
  const canOpenMicSettings = IS_MAC || IS_WINDOWS;

  return (
    <div className="w-full max-w-[440px]">
      <div className="flex flex-col gap-2.5">
        <PermCard
          icon={Mic}
          title={t("onboarding.permissions.microphone.title")}
          desc={t("onboarding.permissions.microphone.desc")}
          granted={micGranted}
          action={
            micStatus === "denied" && canOpenMicSettings ? (
              <PermButton onClick={onOpenMicSettings}>
                {t("common.openSettings")}
              </PermButton>
            ) : (
              <PermButton onClick={onRequestMic}>
                {t("common.allow")}
              </PermButton>
            )
          }
        />

        {IS_MAC && (
          <PermCard
            icon={Shield}
            title={t("onboarding.permissions.accessibility.title")}
            desc={t("onboarding.permissions.accessibility.desc")}
            granted={accessibilityStatus}
            action={
              <PermButton onClick={onOpenAccessibility}>
                {t("common.openSettings")}
              </PermButton>
            }
          />
        )}

        {IS_LINUX && linuxSetup && (
          <PermCard
            icon={Keyboard}
            title={t("onboarding.permissions.keyboardAccess.title")}
            desc={
              linuxSetup.inputAccess ? (
                t("onboarding.permissions.keyboardAccess.descGranted")
              ) : (
                <>
                  <Trans
                    i18nKey="onboarding.permissions.keyboardAccess.descDenied"
                    components={{ code: <code className="text-foreground" /> }}
                  />
                  {!linuxSetup.wayland &&
                    t("onboarding.permissions.keyboardAccess.toggleNote")}
                </>
              )
            }
            granted={linuxSetup.inputAccess}
            action={
              <PermButton onClick={onRecheckLinuxSetup}>
                {t("common.recheck")}
              </PermButton>
            }
          />
        )}

        {IS_LINUX &&
          linuxSetup &&
          !linuxSetup.pasteTool &&
          !(linuxSetup.wayland && linuxSetup.uinputAccess) && (
            <PermCard
              icon={ClipboardPaste}
              title={t("onboarding.permissions.pasteTool.title")}
              desc={
                <Trans
                  i18nKey="onboarding.permissions.pasteTool.desc"
                  values={{ tool: linuxSetup.pasteToolRequired }}
                  components={{ code: <code className="text-foreground" /> }}
                />
              }
              granted={false}
              action={
                <PermButton onClick={onRecheckLinuxSetup}>
                  {t("common.recheck")}
                </PermButton>
              }
            />
          )}
      </div>

      <div className="mt-7 flex items-center justify-between gap-3.5">
        <Button variant="outline" onClick={onBack}>
          {t("common.back")}
        </Button>
        <div className="flex items-center gap-3.5">
          {!allGranted && (
            <span className="mono text-muted-foreground text-[10.5px] tracking-[0.1em] uppercase">
              {IS_MAC
                ? t("onboarding.permissions.grantBoth")
                : t("onboarding.permissions.grantAccess")}
            </span>
          )}
          <Button variant="ink" disabled={!allGranted} onClick={onContinue}>
            {t("common.continue")}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function PermCard({
  icon: Icon,
  title,
  desc,
  granted,
  action,
}: {
  icon: typeof Mic;
  title: string;
  desc: React.ReactNode;
  granted: boolean;
  action: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="border-border bg-card flex items-center gap-3.5 rounded-[12px] border p-4">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border",
          granted
            ? "bg-accent border-primary/20"
            : "bg-background border-border",
        )}
      >
        <Icon
          size={16}
          className={
            granted ? "text-accent-foreground" : "text-muted-foreground"
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-[14px] font-medium">{title}</div>
        <div className="text-muted-foreground mt-0.5 text-[12.5px] leading-snug">
          {desc}
        </div>
      </div>
      {granted ? (
        <span className="mono text-accent-foreground inline-flex items-center gap-1.5 text-[10.5px] tracking-[0.14em] uppercase">
          <Check size={13} strokeWidth={2.2} />
          {t("common.granted")}
        </span>
      ) : (
        action
      )}
    </div>
  );
}

function PermButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Button variant="ink" size="sm" onClick={onClick} className="shrink-0">
      {children}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Welcome + Freestyle Cloud sign-in (optional, skippable)
// ---------------------------------------------------------------------------
function CloudStep({
  user,
  signingIn,
  error,
  onSignIn,
  onContinue,
  onSkip,
}: {
  user: CloudUser | null;
  signingIn: boolean;
  error: string | null;
  onSignIn: () => void;
  onContinue: () => void;
  onSkip: () => void;
}): React.JSX.Element {
  return (
    <SignInSplit
      titlePrefix="Welcome to "
      subtitle="Write with intelligence at your cursor"
      error={error}
      footer={
        !user &&
        // Skipping sign-in is a local-development/E2E affordance only — in
        // production the browser sign-in is the sole way past this step.
        (import.meta.env.DEV || window.api?.isE2E) && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              disabled={signingIn}
              className="text-muted-foreground -ml-2 h-auto px-2 py-1 text-[12px]"
            >
              Skip for now (dev)
            </Button>
          </div>
        )
      }
    >
      {user ? (
        <>
          <div className="border-border bg-card mt-9 flex w-full items-center gap-3 rounded-[12px] border p-4 text-left">
            {user.image ? (
              <img
                src={user.image}
                alt=""
                className="size-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="bg-accent border-primary/20 flex size-9 shrink-0 items-center justify-center rounded-full border">
                <Check className="text-accent-foreground size-4" />
              </div>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-foreground truncate text-[14px] font-medium">
                {user.name || user.email}
              </div>
              <div className="text-muted-foreground truncate text-[12px]">
                {user.name ? `Signed in · ${user.email}` : "Signed in"}
              </div>
            </div>
            <Check className="text-accent-foreground size-4 shrink-0" />
          </div>
          <Button variant="ink" onClick={onContinue} className="mt-5 w-full">
            Continue
            <ArrowRight data-icon="inline-end" />
          </Button>
        </>
      ) : (
        <SignInButton signingIn={signingIn} onClick={onSignIn} />
      )}
    </SignInSplit>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Language (the model sets itself up in the background)
// ---------------------------------------------------------------------------
function LanguageStep({
  languages,
  onToggle,
  onClear,
  localModel,
  onDownloadLocal,
  onRetryLocal,
  onBack,
  onContinue,
}: {
  languages: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  localModel: VoiceItem | undefined;
  onDownloadLocal: () => void;
  onRetryLocal: () => void;
  onBack: () => void;
  onContinue: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { user } = useCloudAuth();
  const { data: cloudConfig } = useCloudConfig(!!user);
  const options = useLanguageOptions(cloudConfig?.suggestedLanguages);
  const [showAll, setShowAll] = useState(false);

  const selectedSet = useMemo(() => new Set(languages), [languages]);
  const atCap = languages.length >= MAX_LANGUAGES;

  // Show a handful of region-relevant languages as pills; the rest live behind
  // "See all". "auto" gets its own pill below, so exclude it from the top set.
  const PILL_COUNT = 12;
  const pills = useMemo(
    () => options.filter((l) => l.code !== "auto").slice(0, PILL_COUNT),
    [options],
  );

  // Selected languages picked via "See all" may fall outside the top pills;
  // surface them as extra pills so every selection stays visible.
  const selectedOutside = useMemo(
    () =>
      languages
        .filter((code) => !pills.some((l) => l.code === code))
        .map((code) => options.find((l) => l.code === code))
        .filter((l): l is (typeof options)[number] => Boolean(l)),
    [languages, pills, options],
  );

  return (
    <div className="w-full max-w-[560px]">
      <h1 className="serif text-foreground m-0 mb-7 text-center text-[56px] leading-[0.95] font-normal tracking-[-0.025em]">
        <span>{t("onboarding.language.titlePrefix")}</span>
        <span className="serif-italic text-primary">
          {t("onboarding.language.titleEmphasis")}
        </span>
      </h1>

      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant={languages.length === 0 ? "default" : "outline"}
          size="sm"
          onClick={onClear}
          className="rounded-full px-4 text-[13.5px]"
        >
          {t("onboarding.language.autoDetect")}
        </Button>
        {pills.map((l) => {
          const active = selectedSet.has(l.code);
          return (
            <Button
              key={l.code}
              variant={active ? "default" : "outline"}
              size="sm"
              disabled={!active && atCap}
              onClick={() => onToggle(l.code)}
              className="rounded-full px-4 text-[13.5px]"
            >
              {l.label}
            </Button>
          );
        })}
        {selectedOutside.map((l) => (
          <Button
            key={l.code}
            variant="default"
            size="sm"
            onClick={() => onToggle(l.code)}
            className="rounded-full px-4 text-[13.5px]"
          >
            {l.label}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAll(true)}
          className="rounded-full px-4 text-[13.5px]"
        >
          {t("onboarding.language.seeAll") || "See all"}
        </Button>
      </div>

      <LanguageMultiPickerDialog
        open={showAll}
        onOpenChange={setShowAll}
        values={languages}
        onToggle={onToggle}
        options={options}
      />

      <ModelSetupPanel
        model={localModel}
        onDownload={onDownloadLocal}
        onRetry={onRetryLocal}
      />

      <div className="mt-7 flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button variant="ink" onClick={onContinue}>
          {t("common.continue")}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full model selector — opened from the model step as an option. Two views:
//   "list" — browse cloud / on-device models, pick one
//   "key"  — a focused, full-width API-key entry for a cloud pick that needs
//            one (no more burying the input at the bottom of a scroll area)
// ---------------------------------------------------------------------------
function ModelSelectorOverlay({
  source,
  onSourceChange,
  voiceItems,
  keyProviders,
  selectedCloud,
  apiKeyForm,
  showKey,
  onToggleShowKey,
  onSelectCloud,
  onSelectLocal,
  onDownload,
  onRetryLocal,
  onClose,
  onSaveKey,
}: {
  source: "cloud" | "local";
  onSourceChange: (s: "cloud" | "local") => void;
  voiceItems: VoiceItem[];
  keyProviders: Set<string>;
  selectedCloud: AvailableModel | null;
  apiKeyForm: ReturnType<typeof useForm<{ provider: string; key: string }>>;
  showKey: boolean;
  onToggleShowKey: () => void;
  onSelectCloud: (m: AvailableModel) => void;
  onSelectLocal: (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ) => void;
  onDownload: (defId: string, engine?: "whisper" | "mlx") => void;
  onRetryLocal: (defId: string, engine: "whisper" | "mlx") => void;
  onClose: () => void;
  onSaveKey: () => Promise<boolean>;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [view, setView] = useState<"list" | "key">("list");
  const [savingKey, setSavingKey] = useState(false);

  const items = voiceItems.filter((v) =>
    source === "local" ? v.kind === "local" : v.kind === "cloud",
  );

  // Pick a cloud model: commit immediately when its key is already stored,
  // otherwise move into the focused key-entry view.
  const handleSelectCloud = (model: AvailableModel) => {
    capture("onboarding_model_selected", {
      model_id: model.model_id,
      kind: "cloud",
      provider: model.provider_id,
      from: "selector",
    });
    onSelectCloud(model);
    if (keyProviders.has(model.provider_id)) {
      onClose();
    } else if (model.provider_id === FREESTYLE_CLOUD_PROVIDER_ID) {
      // Keep the selector open while the account flow runs; close only after
      // cloudUser updates and the selected model becomes ready.
    } else {
      capture("onboarding_cloud_key_entry_viewed", {
        provider: model.provider_id,
      });
      setView("key");
    }
  };

  // Picking a ready on-device model commits straight away.
  const handleSelectLocal = (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ) => {
    capture("onboarding_model_selected", {
      model_id: `${engine === "mlx" ? "local-mlx" : "local-whisper"}/${defId}`,
      kind: "local",
      provider: engine === "mlx" ? "local-mlx" : "local-whisper",
      from: "selector",
    });
    onSelectLocal(defId, name, engine);
    onClose();
  };

  const handleSaveKey = async () => {
    setSavingKey(true);
    try {
      const ok = await onSaveKey();
      if (ok) onClose();
    } finally {
      setSavingKey(false);
    }
  };

  const providerName = selectedCloud
    ? (PROVIDER_DISPLAY_NAMES[selectedCloud.provider_id] ??
      selectedCloud.provider_id)
    : "";
  const keyValue = apiKeyForm.watch("key") ?? "";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => {
          // Esc steps back from key entry to the list before closing.
          if (view === "key") {
            e.preventDefault();
            setView("list");
          }
        }}
        className="flex max-h-[calc(100vh-5rem)] w-full max-w-[600px] flex-col gap-0 overflow-hidden rounded-[16px] border-border bg-background p-0 sm:max-w-[600px]"
      >
        <DialogTitle className="sr-only">Choose a voice model</DialogTitle>
        {view === "list" ? (
          <>
            {/* Header */}
            <div className="border-border/60 flex shrink-0 items-center justify-between border-b px-[22px] py-[18px]">
              <div>
                <div className="mono text-muted-foreground text-[10px] tracking-[0.16em] uppercase">
                  {t("onboarding.modelSelector.chooseModel")}
                </div>
                <div className="serif text-foreground mt-0.5 text-[26px] leading-[1.05]">
                  {t("onboarding.modelSelector.allVoiceModels")}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close"
              >
                <X />
              </Button>
            </div>

            {/* Source toggle */}
            <div className="flex shrink-0 justify-center pt-4">
              <SegmentedControl
                size="sm"
                value={source}
                onValueChange={(v) => onSourceChange(v as "cloud" | "local")}
                options={[
                  {
                    value: "cloud",
                    label: t("onboarding.modelSelector.cloudApi"),
                  },
                  {
                    value: "local",
                    label: t("onboarding.modelSelector.onDevice"),
                    icon: HardDrive,
                  },
                ]}
              />
            </div>

            {/* List */}
            <div className="overflow-y-auto px-[22px] py-4 [scrollbar-gutter:stable]">
              <div className="border-border overflow-hidden rounded-[14px] border">
                {items.length === 0 && (
                  <div className="flex items-center gap-2 px-5 py-6">
                    <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                    <span className="text-muted-foreground text-sm">
                      {t("onboarding.modelSelector.loading")}
                    </span>
                  </div>
                )}
                {items.map((item, i) => (
                  <VoiceRow
                    key={item.key}
                    item={item}
                    first={i === 0}
                    onSelectCloud={handleSelectCloud}
                    onSelectLocal={handleSelectLocal}
                    onDownload={onDownload}
                    onRetryLocal={onRetryLocal}
                  />
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="border-border/60 flex shrink-0 items-center justify-between border-t px-[22px] py-4">
              <span className="text-muted-foreground text-[11.5px]">
                {source === "cloud"
                  ? t("onboarding.modelSelector.cloudNote")
                  : t("onboarding.modelSelector.onDeviceNote", {
                      phrase: ON_DEVICE_PHRASE,
                    })}
              </span>
              <Button variant="outline" onClick={onClose}>
                {t("common.cancel")}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Key-entry header */}
            <div className="border-border/60 flex shrink-0 items-center gap-3 border-b px-[22px] py-[18px]">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setView("list")}
                aria-label={t("onboarding.modelSelector.backToModels")}
              >
                <ChevronLeft />
              </Button>
              <div>
                <div className="mono text-muted-foreground text-[10px] tracking-[0.16em] uppercase">
                  {t("onboarding.modelSelector.connect", {
                    provider: providerName,
                  })}
                </div>
                <div className="serif text-foreground mt-0.5 text-[26px] leading-[1.05]">
                  {t("onboarding.modelSelector.addKey", {
                    provider: providerName,
                  })}
                </div>
              </div>
            </div>

            {/* Key-entry body — the input is the whole view */}
            <div className="px-[22px] py-7">
              {selectedCloud && (
                <p className="text-muted-foreground mb-4 text-[13px] leading-relaxed">
                  {t("onboarding.modelSelector.requiredFor", {
                    model: selectedCloud.model_name,
                  })}
                </p>
              )}

              <InputGroup className="h-10">
                <InputGroupInput
                  autoFocus
                  type={showKey ? "text" : "password"}
                  {...apiKeyForm.register("key")}
                  placeholder={t("onboarding.modelSelector.keyPlaceholder")}
                  aria-invalid={!!apiKeyForm.formState.errors.key}
                  className="font-mono text-[14px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && keyValue.trim()) handleSaveKey();
                  }}
                />
                <InputGroupAddon>
                  <Key />
                </InputGroupAddon>
                <RevealToggle
                  revealed={showKey}
                  onToggle={onToggleShowKey}
                  label="key"
                />
              </InputGroup>
              {apiKeyForm.formState.errors.key && (
                <p className="text-destructive mt-2 text-[12px]">
                  {apiKeyForm.formState.errors.key.message}
                </p>
              )}
              {selectedCloud &&
                PROVIDER_KEY_URLS[selectedCloud.provider_id] && (
                  <p className="mt-3 text-[12.5px]">
                    <a
                      href={PROVIDER_KEY_URLS[selectedCloud.provider_id]}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      {t("onboarding.modelSelector.getKey", {
                        provider: providerName,
                      })}
                    </a>
                  </p>
                )}
            </div>

            {/* Key-entry footer */}
            <div className="border-border/60 flex shrink-0 items-center justify-between border-t px-[22px] py-4">
              <Button variant="outline" onClick={() => setView("list")}>
                {t("common.back")}
              </Button>
              <Button
                variant="ink"
                onClick={handleSaveKey}
                disabled={!keyValue.trim() || savingKey}
              >
                {savingKey ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Check data-icon="inline-start" />
                )}
                {savingKey
                  ? t("common.saving")
                  : t("onboarding.modelSelector.saveKey", {
                      provider: providerName,
                    })}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepHeading({ title }: { title: string }): React.JSX.Element {
  return (
    <h1 className="text-foreground m-0 mb-6 text-[30px] leading-[1.15] font-semibold tracking-[-0.01em]">
      {title}
    </h1>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Dictate into the Gmail draft (replaces the old tutorial step:
// same model setup + hotkey rebind, new practice surface).
// ---------------------------------------------------------------------------
function DraftStep({
  hotkey,
  recorderState,
  draftKeys,
  captureHint,
  modelReady,
  localModel,
  onDownloadLocal,
  onRetryLocal,
  canContinue,
  continueBlockedReason,
  body,
  onBodyChange,
  onDraftDictated,
  onStartRecording,
  onCancelRecording,
  onDictation,
  onBack,
  onContinue,
}: {
  hotkey: string;
  recorderState: string;
  draftKeys: string[];
  captureHint: string;
  modelReady: boolean;
  localModel: VoiceItem | undefined;
  onDownloadLocal: () => void;
  onRetryLocal: () => void;
  canContinue: boolean;
  continueBlockedReason: "downloading" | "notReady" | null;
  body: string;
  onBodyChange: (text: string) => void;
  onDraftDictated: () => void;
  onStartRecording: () => void;
  onCancelRecording: () => void;
  onDictation: () => void;
  onBack: () => void;
  onContinue: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const onDictationRef = useRef(onDictation);
  onDictationRef.current = onDictation;
  const { phase, getLiveLevel } = useCoachPress("dictation", {
    onDown: () => {
      if (modelReady) onDictationRef.current();
    },
  });

  // A dictation counts as such only when the paste is corroborated by the
  // pill's transcription:done ping — manual typing still enables Continue,
  // it just isn't counted as a dictation.
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const transcribedRef = useRef(false);
  const onDraftDictatedRef = useRef(onDraftDictated);
  onDraftDictatedRef.current = onDraftDictated;
  useEffect(() => {
    return window.api?.onTranscriptionDone(() => {
      transcribedRef.current = true;
      if (bodyRef.current.trim()) onDraftDictatedRef.current();
    });
  }, []);
  useEffect(() => {
    if (body.trim() && transcribedRef.current) onDraftDictatedRef.current();
  }, [body]);

  const statusLabel =
    phase === "pressed"
      ? t("onboarding.draft.statusListening")
      : phase === "result"
        ? t("onboarding.draft.statusLanded")
        : t("onboarding.draft.statusReady");

  return (
    <div className="w-full max-w-[1100px]">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        <div>
          <StepHeading title={t("onboarding.draft.title")} />

          <CoachStrip
            keys={formatAcceleratorKeys(hotkey)}
            phase={phase}
            instructionPrefix={t("onboarding.draft.instructionPrefix")}
            instructionSuffix={t("onboarding.draft.instructionSuffix")}
            sayText={t("onboarding.draft.sayText")}
            statusLabel={statusLabel}
            statusEmphasis={phase !== "idle"}
            getLiveLevel={getLiveLevel}
          />

          <ModelSetupPanel
            model={localModel}
            onDownload={onDownloadLocal}
            onRetry={onRetryLocal}
          />
        </div>

        <div className="flex justify-center lg:justify-end">
          <EmailDraft body={body} onBodyChange={onBodyChange} stage="dictate" />
        </div>
      </div>

      {/* Hotkey rebind — a single minimal control */}
      <div className="mt-5 flex justify-start">
        {recorderState === "idle" ? (
          <Button
            variant="outline"
            onClick={onStartRecording}
            className="bg-card hover:bg-secondary h-auto gap-3 rounded-[10px] px-3.5 py-2.5"
          >
            <Keyboard className="text-muted-foreground shrink-0" />
            <KeyComboDisplay keys={formatAcceleratorKeys(hotkey)} />
            <span className="text-muted-foreground ml-1 text-[12.5px]">
              {t("common.change")}
            </span>
          </Button>
        ) : (
          <div className="border-primary bg-accent inline-flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5">
            <Keyboard className="text-accent-foreground h-4 w-4 shrink-0" />
            {draftKeys.length > 0 ? (
              <KeyComboDisplay keys={draftKeys} variant="dim" />
            ) : null}
            <span className="text-accent-foreground text-[12px]">
              {captureHint}
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={onCancelRecording}
              className="ml-1"
            >
              {t("common.cancel")}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-7 flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          {t("common.back")}
        </Button>
        <div className="flex flex-col items-end gap-1.5">
          {!canContinue && continueBlockedReason && (
            <p className="text-muted-foreground text-[11px]">
              {continueBlockedReason === "downloading"
                ? t("onboarding.modelSetup.waitingWhileDownloading")
                : t("onboarding.modelSetup.waitingToFinish")}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onContinue}
              disabled={!canContinue}
              className="text-muted-foreground h-auto px-2 py-1 text-[12px]"
            >
              {t("onboarding.draft.skip")}
            </Button>
            <Button
              variant="ink"
              onClick={onContinue}
              disabled={!canContinue || !body.trim()}
            >
              {t("common.continue")}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Remix the draft. Interactive when an LLM default exists: the real
// Remix pipeline runs against our own window via main's practice-target mode.
// Otherwise a scripted preview of a remix pass.
// ---------------------------------------------------------------------------
const REMIX_IN_FLIGHT_GRACE_MS = 30_000;

function RemixStep({
  body,
  onBodyChange,
  onBack,
  onFinish,
}: {
  body: string;
  onBodyChange: (text: string) => void;
  onBack: () => void;
  onFinish: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { user: cloudUser } = useCloudAuth();
  const { data: settingsData, isFetched: settingsFetched } = useQuery(
    settingsQueryOptions(),
  );
  const configuredQuery = useQuery({
    queryKey: queryKeys.models.configured,
    queryFn: async () => {
      const res = await getClient().api.models.configured.$get();
      if (!res.ok) throw new Error("Failed to load configured models");
      return (await res.json()) as ConfiguredModel[];
    },
  });

  // The agent only hears what the user says, so the suggested instruction
  // must carry a concrete name: the signed-in user's first name, or a stand-in.
  const signoffName =
    cloudUser?.name?.trim().split(/\s+/)[0] ||
    t("onboarding.remix.fallbackName");

  const llmDefault = (configuredQuery.data ?? []).find(
    (m) => m.type === "llm" && m.is_default === 1,
  );
  const ready = settingsFetched && configuredQuery.isFetched;
  const interactive = ready && !!llmDefault && !window.api?.isE2E;
  // Server tools (web/image search) exist only behind the cloud proxy; the
  // BYOK loop declares client tools only.
  const searchCapable = llmDefault?.provider === FREESTYLE_CLOUD_PROVIDER_ID;

  const remixHotkey =
    settingsData?.[SETTINGS_KEYS.remixHotkey] ||
    window.api?.defaultRemixHotkey ||
    getDefaultRemixHotkey();

  const [remixed, setRemixed] = useState(false);
  const [extraDone, setExtraDone] = useState(false);
  const [working, setWorking] = useState(false);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const remixedRef = useRef(false);
  const extraDoneRef = useRef(false);
  const triedRef = useRef(false);
  const extraTriedRef = useRef(false);
  const chipShownRef = useRef(false);
  const chipVisibleRef = useRef(false);
  const viewedRef = useRef(false);
  const inFlightUntilRef = useRef(0);
  const lastDeliveredAtRef = useRef(0);
  const workingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || viewedRef.current) return;
    viewedRef.current = true;
    capture("onboarding_remix_step_viewed", { interactive });
  }, [ready, interactive]);

  // The one gate this feature opens: while this step is interactive, main
  // treats our own window as a legal Remix target. Unmount is the primary
  // off-switch; main clears it defensively too.
  useEffect(() => {
    if (!interactive) return;
    window.api?.setRemixPracticeTarget(true);
    return () => window.api?.setRemixPracticeTarget(false);
  }, [interactive]);

  const handleDelivered = useCallback(() => {
    // One paste can signal twice (IPC + the body-change fallback) — dedupe.
    const now = Date.now();
    if (now - lastDeliveredAtRef.current < 1500) return;
    lastDeliveredAtRef.current = now;
    inFlightUntilRef.current = 0;
    setDeliveredCount((count) => count + 1);
    setWorking(false);
    if (workingTimerRef.current !== null) {
      window.clearTimeout(workingTimerRef.current);
      workingTimerRef.current = null;
    }
    if (!remixedRef.current) {
      remixedRef.current = true;
      setRemixed(true);
      capture("onboarding_remix_completed");
      return;
    }
    // A late second paste from beat one must not count as the third beat —
    // require a session started while the chip was showing.
    if (
      chipVisibleRef.current &&
      extraTriedRef.current &&
      !extraDoneRef.current
    ) {
      extraDoneRef.current = true;
      setExtraDone(true);
      capture("onboarding_remix_extra_completed");
    }
  }, []);
  const handleDeliveredRef = useRef(handleDelivered);
  handleDeliveredRef.current = handleDelivered;

  useEffect(() => {
    if (!interactive) return;
    return window.api?.onRemixPracticeDelivered(() =>
      handleDeliveredRef.current(),
    );
  }, [interactive]);

  const { phase, getLiveLevel } = useCoachPress("remix", {
    onDown: () => {
      inFlightUntilRef.current = Number.MAX_SAFE_INTEGER;
      if (!triedRef.current) {
        triedRef.current = true;
        capture("onboarding_remix_tried");
      }
      if (chipVisibleRef.current && !extraTriedRef.current) {
        extraTriedRef.current = true;
        capture("onboarding_remix_extra_tried");
      }
    },
    onUp: () => {
      inFlightUntilRef.current = Date.now() + REMIX_IN_FLIGHT_GRACE_MS;
      setWorking(true);
      if (workingTimerRef.current !== null) {
        window.clearTimeout(workingTimerRef.current);
      }
      workingTimerRef.current = window.setTimeout(() => {
        setWorking(false);
      }, REMIX_IN_FLIGHT_GRACE_MS);
    },
  });

  // Belt-and-braces success detection: a body change while a remix session is
  // in flight counts as delivery even if a future path bypasses the two paste
  // handlers.
  useEffect(() => {
    if (!interactive || !body.trim()) return;
    if (Date.now() <= inFlightUntilRef.current) handleDeliveredRef.current();
  }, [body, interactive]);

  const chipVisible = interactive && remixed && searchCapable;
  useEffect(() => {
    chipVisibleRef.current = chipVisible;
    if (chipVisible && !chipShownRef.current) {
      chipShownRef.current = true;
      capture("onboarding_remix_extra_shown");
    }
  }, [chipVisible]);

  const handleFinish = useCallback(() => {
    if (!remixedRef.current) capture("onboarding_remix_skipped");
    onFinish();
  }, [onFinish]);

  // Scripted fallback: an automated remix pass over the user's actual text.
  const [scriptPhase, setScriptPhase] = useState<"idle" | "pressed" | "result">(
    "idle",
  );
  const scripted = ready && !interactive;
  useEffect(() => {
    if (!scripted) return;
    const steps: ReadonlyArray<
      readonly ["idle" | "pressed" | "result", number]
    > = [
      ["idle", 2000],
      ["pressed", 3200],
      ["result", 3600],
    ];
    let index = 0;
    let timeout = 0;
    const tick = (): void => {
      const [name, dur] = steps[index % steps.length];
      setScriptPhase(name);
      index += 1;
      timeout = window.setTimeout(tick, dur);
    };
    tick();
    return () => window.clearTimeout(timeout);
  }, [scripted]);

  const scriptedBase = body.trim() || t("onboarding.remix.sampleDraft");
  const scriptedBody = scripted
    ? scriptPhase === "result"
      ? `${scriptedBase}\n\n${t("onboarding.remix.sampleSignoff", {
          name: signoffName,
        })}`
      : scriptedBase
    : null;

  const statusLabel =
    phase === "pressed"
      ? t("onboarding.remix.statusListening")
      : working
        ? t("onboarding.remix.statusWorking")
        : remixed
          ? t("onboarding.remix.statusRemixed")
          : t("onboarding.remix.statusReady");

  const keys = formatAcceleratorKeys(remixHotkey);

  return (
    <div className="w-full max-w-[1100px]">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        <div>
          <StepHeading title={t("onboarding.remix.title")} />

          {!ready ? (
            <div className="flex justify-start">
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
            </div>
          ) : interactive ? (
            <CoachStrip
              keys={keys}
              phase={phase}
              lead={
                !remixed ? (
                  t("onboarding.remix.highlightNote")
                ) : chipVisible ? (
                  extraDone ? (
                    <span className="text-accent-foreground">
                      {t("onboarding.remix.extraDone")}
                    </span>
                  ) : (
                    t("onboarding.remix.extraLead")
                  )
                ) : (
                  t("onboarding.remix.doneNote")
                )
              }
              instructionPrefix={t("onboarding.remix.instructionPrefix")}
              instructionSuffix={t("onboarding.remix.instructionSuffix")}
              sayText={
                chipVisible
                  ? t("onboarding.remix.extraSay")
                  : t("onboarding.remix.sayText", { name: signoffName })
              }
              statusLabel={statusLabel}
              statusEmphasis={phase === "pressed" || working || remixed}
              getLiveLevel={getLiveLevel}
            >
              {chipVisible && !extraDone && (
                <p className="text-muted-foreground/80 text-[13px] leading-relaxed">
                  {t("onboarding.remix.extraCaption")}
                </p>
              )}
            </CoachStrip>
          ) : (
            <CoachStrip
              keys={keys}
              phase={scriptPhase}
              instructionPrefix={t("onboarding.remix.instructionPrefix")}
              instructionSuffix={t("onboarding.remix.instructionSuffix")}
              sayText={t("onboarding.remix.sayText", { name: signoffName })}
              statusLabel={
                scriptPhase === "pressed"
                  ? t("onboarding.remix.statusListening")
                  : scriptPhase === "result"
                    ? t("onboarding.remix.statusRemixed")
                    : t("onboarding.remix.statusReady")
              }
              statusEmphasis={scriptPhase !== "idle"}
              getLiveLevel={() => null}
            >
              <p className="text-muted-foreground text-[14px] leading-relaxed">
                {t("onboarding.remix.fallbackNote")}
              </p>
            </CoachStrip>
          )}
        </div>

        <div className="flex justify-center lg:justify-end">
          <EmailDraft
            body={body}
            onBodyChange={onBodyChange}
            stage="remix"
            scriptedBody={scriptedBody}
            highlightBody={interactive}
            highlightSignal={deliveredCount}
          />
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button variant="ink" onClick={handleFinish}>
          {t("onboarding.tutorial.finish")}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
