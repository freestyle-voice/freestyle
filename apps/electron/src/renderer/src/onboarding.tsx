import { apiKeySchema } from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import markDark from "@renderer/assets/mark-dark.svg";
import markLight from "@renderer/assets/mark-light.svg";
import { KeyComboDisplay } from "@renderer/components/key-combo";
import { TutorialDemo } from "@renderer/components/tutorial-demo";
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
import { defaultLanguage, ONBOARDING_LANGUAGES } from "@renderer/lib/languages";
import {
  type AvailableModel,
  buildVoiceItems,
  FREESTYLE_CLOUD_MODEL_ID,
  FREESTYLE_CLOUD_PROVIDER_ID,
  formatBytes,
  type MlxAsrStatus,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_KEY_URLS,
  type VoiceItem,
  type WhisperStatus,
} from "@renderer/lib/models";
import { requestMicAccess, resolveMicStatus } from "@renderer/lib/permissions";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
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
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { CloudUser } from "../../shared/cloud-user";
import { getDefaultHotkey } from "../../shared/hotkey-defaults";
import { SETTINGS_KEYS } from "../../shared/settings-keys";

type Step = "permissions" | "cloud" | "language" | "tutorial";

const PLATFORM =
  (typeof window !== "undefined" && window.api?.platform) ||
  (typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
    ? "darwin"
    : "unknown");
const IS_MAC = PLATFORM === "darwin";
const IS_WINDOWS = PLATFORM === "win32";
const IS_LINUX = PLATFORM === "linux";

const DEFAULT_HOTKEY =
  (typeof window !== "undefined" && window.api?.defaultHotkey) ||
  getDefaultHotkey();

// Linux system-setup state reported by the main process (input-group access
// for the hotkey listener, xdotool/wtype for the paste fallback).
type LinuxSetup = {
  wayland: boolean;
  inputAccess: boolean;
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

export default function OnboardingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("cloud");
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  const [mlxStatus, setMlxStatus] = useState<MlxAsrStatus | null>(null);
  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus | null>(
    null,
  );
  const [apiKeys, setApiKeys] = useState<Set<string>>(new Set());
  const [language, setLanguage] = useState<string>(defaultLanguage);
  const autoPicked = useRef(false);
  const warmed = useRef(false);
  // True once we know whether MLX can run on this machine — so the auto-pick
  // waits for the Qwen-vs-Whisper decision instead of settling on Whisper
  // Base while the MLX status request is still in flight.
  const [mlxResolved, setMlxResolved] = useState(false);

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

  // Hotkey recorder state (tutorial step)
  const [hotkey, setHotkey] = useState(DEFAULT_HOTKEY);

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

  // Load permissions + saved hotkey
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
    getClient()
      .api.settings[":key"].$get({ param: { key: SETTINGS_KEYS.hotkey } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setHotkey(data.value as string);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return window.api?.onFullscreenChanged(setIsFullscreen);
  }, []);

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

  const loadWhisperStatus = useCallback(async () => {
    try {
      const res = await getClient().api.whisper.status.$get();
      if (res.ok) {
        const data: WhisperStatus = await res.json();
        setWhisperStatus(data);
        return data;
      }
    } catch {}
    return null;
  }, []);

  const loadMlxStatus = useCallback(async (refresh = false) => {
    try {
      const res = refresh
        ? await getClient().api["mlx-asr"].status.$get({
            query: { refresh: "1" },
          })
        : await getClient().api["mlx-asr"].status.$get();
      if (res.ok) {
        const data: MlxAsrStatus = await res.json();
        setMlxStatus(data);
        return data;
      }
    } catch {
    } finally {
      // Settled — whether the probe succeeded or failed, the auto-pick can
      // now proceed (a failed probe means MLX isn't usable → Whisper Base).
      setMlxResolved(true);
    }
    return null;
  }, []);

  useEffect(() => {
    loadWhisperStatus();
    // MLX only exists on Apple Silicon; elsewhere there's nothing to wait for.
    if (IS_MAC) loadMlxStatus();
    else setMlxResolved(true);
  }, [loadWhisperStatus, loadMlxStatus]);

  // Poll while a download is active (whisper or mlx)
  useEffect(() => {
    const hasActiveDownload =
      whisperStatus?.binaryDownloading ||
      whisperStatus?.models.some(
        (m) => m.status === "downloading" || m.status === "verifying",
      );
    if (!hasActiveDownload) return;
    const interval = setInterval(() => loadWhisperStatus(), 500);
    return () => clearInterval(interval);
  }, [whisperStatus, loadWhisperStatus]);

  useEffect(() => {
    const hasActiveDownload = mlxStatus?.models?.some(
      (m) => m.status === "downloading" || m.status === "verifying",
    );
    if (!hasActiveDownload) return;
    const interval = setInterval(() => loadMlxStatus(), 500);
    return () => clearInterval(interval);
  }, [mlxStatus, loadMlxStatus]);

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
    const modelName = model?.model_name ?? "Freestyle Cloud";
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
        } else {
          setSelectedWhisperDefId(defId);
          setSelectedMlxDefId(null);
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
      loadWhisperStatus();
    },
    [loadWhisperStatus],
  );

  const downloadMlxModel = useCallback(
    async (modelId: string) => {
      await getClient().api["mlx-asr"].models[":model"].download.$post({
        param: { model: modelId },
      });
      loadMlxStatus();
    },
    [loadMlxStatus],
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
  // commit a default and start downloads in the background — the user never
  // has to choose a model. Signed in → Freestyle Cloud is the default; the
  // on-device model is still set up underneath as an offline/signed-out
  // fallback. Signed out → the on-device model is the default.
  useEffect(() => {
    if (
      autoPicked.current ||
      cloudLoading ||
      !mlxResolved ||
      !recommended?.defId
    )
      return;
    autoPicked.current = true;
    selectLocalModel(
      recommended.defId,
      recommended.name,
      recommended.localEngine,
      "auto",
      !cloudUser,
    );
    if (recommended.status === "not_downloaded" && !window.api?.isE2E) {
      capture("onboarding_model_auto_setup", {
        model_id: recommended.modelId,
      });
      downloadLocalModel(recommended.defId, recommended.localEngine);
    }
    if (cloudUser) commitFreestyleCloudDefault();
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

  // Persist the language choice (the transcribe path reads it per request).
  const persistLanguage = useCallback((value: string) => {
    getClient()
      .api.settings[":key"].$put({
        param: { key: SETTINGS_KEYS.language },
        json: { value },
      })
      .catch(() => {});
  }, []);

  const saveLanguage = useCallback(
    (value: string) => {
      setLanguage(value);
      capture("onboarding_language_changed", { language: value });
      persistLanguage(value);
    },
    [persistLanguage],
  );

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

  // One quiet line describing the background setup, shown while it runs.
  // The user never chooses the model, but they should see what's being
  // installed on their machine — name and size, not a mystery download.
  const setupStatus = ((): string | null => {
    if (!chosen || chosen.kind !== "local" || chosenReady) return null;
    if (chosen.state?.phase === "building_binary") {
      return "Preparing your transcription engine…";
    }
    const size =
      chosen.sizeBytes != null ? ` (${formatBytes(chosen.sizeBytes)})` : "";
    if (
      chosen.status === "downloading" ||
      chosen.status === "verifying" ||
      chosen.status === "not_downloaded"
    ) {
      const p = chosen.state?.downloadProgress;
      const pct = p?.bytesTotal ? ` ${p.percent}%` : "";
      return `Downloading ${chosen.name}${size}, your private transcription model…${pct}`;
    }
    return null;
  })();

  const setupError =
    chosen?.kind === "local" && chosen.status === "error"
      ? (chosen.state?.error ?? "Model download failed")
      : null;

  return (
    <div className="bg-background flex h-screen flex-col">
      {!isFullscreen && (
        <div
          className="h-9 shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
      )}

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

        {step === "cloud" && (
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
        )}

        {step === "language" && (
          <LanguageStep
            language={language}
            onSelect={saveLanguage}
            setupStatus={setupStatus}
            setupError={setupError}
            onBack={() => {
              capture("onboarding_language_back_clicked");
              setStep("permissions");
            }}
            onContinue={() => {
              // Persist even when the pre-selected locale was never clicked.
              persistLanguage(language);
              capture("onboarding_language_completed", { language });
              setStep("tutorial");
            }}
          />
        )}

        {step === "tutorial" && (
          <TutorialStep
            hotkey={hotkey}
            recorderState={recorderState}
            draftKeys={draftKeys}
            captureHint={captureHint}
            modelReady={chosenReady}
            modelName={chosen?.name}
            setupStatus={setupStatus}
            setupError={setupError}
            onOpenSelector={() => {
              capture("onboarding_model_selector_opened");
              setShowSelector(true);
            }}
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
            onFinish={finishSetup}
          />
        )}
      </div>

      {step === "cloud" && <CloudTermsFooter />}

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
              void loadMlxStatus(true).then((data) => {
                if (data?.canRun) void downloadMlxModel(defId);
              });
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
  const allGranted =
    micGranted && (!IS_MAC || accessibilityStatus) && !linuxBlocked;
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

        {IS_LINUX && linuxSetup && !linuxSetup.pasteTool && (
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
function GitHubMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

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
    <div className="flex w-full max-w-[420px] flex-col items-center text-center">
      <img
        src={markLight}
        alt="Freestyle"
        className="block h-14 w-14 dark:hidden"
      />
      <img
        src={markDark}
        alt="Freestyle"
        className="hidden h-14 w-14 dark:block"
      />

      <h1 className="serif text-foreground mt-6 mb-0 text-[44px] leading-[1.0] font-normal tracking-[-0.025em]">
        <span>Welcome to </span>
        <span className="serif-italic text-primary">Freestyle</span>
      </h1>

      {user ? (
        <div className="border-border bg-card mt-6 flex w-full items-center gap-3 rounded-[12px] border p-4 text-left">
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
      ) : (
        <button
          type="button"
          onClick={onSignIn}
          disabled={signingIn}
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-[11px] bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white transition-colors hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-60"
        >
          {signingIn ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              <GitHubMark className="size-[18px]" />
              Sign in / Create account
            </>
          )}
        </button>
      )}

      {error && (
        <p className="text-destructive mt-3 text-[12px] leading-snug">
          {error}
        </p>
      )}

      {user ? (
        <Button variant="ink" onClick={onContinue} className="mt-6 w-full">
          Continue
          <ArrowRight data-icon="inline-end" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          disabled={signingIn}
          className="text-muted-foreground mt-2 h-auto px-2 py-1 text-[12px]"
        >
          Skip for now
        </Button>
      )}
    </div>
  );
}

function CloudTermsFooter(): React.JSX.Element {
  return (
    <p className="text-muted-foreground shrink-0 px-6 pb-8 text-center text-[11px] leading-[1.7]">
      By continuing, you agree to our{" "}
      <a
        href="https://freestylevoice.com/terms"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline underline-offset-2"
      >
        Terms of Service
      </a>
      <br />
      and{" "}
      <a
        href="https://freestylevoice.com/privacy"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline underline-offset-2"
      >
        Privacy Policy
      </a>
      .
    </p>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Language (the model sets itself up in the background)
// ---------------------------------------------------------------------------
function LanguageStep({
  language,
  onSelect,
  setupStatus,
  setupError,
  onBack,
  onContinue,
}: {
  language: string;
  onSelect: (id: string) => void;
  setupStatus: string | null;
  setupError: string | null;
  onBack: () => void;
  onContinue: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-[560px]">
      <h1 className="serif text-foreground m-0 mb-7 text-center text-[56px] leading-[0.95] font-normal tracking-[-0.025em]">
        <span>{t("onboarding.language.titlePrefix")}</span>
        <span className="serif-italic text-primary">
          {t("onboarding.language.titleEmphasis")}
        </span>
      </h1>

      <div className="flex flex-wrap justify-center gap-2">
        {ONBOARDING_LANGUAGES.map((l) => (
          <Button
            key={l.id}
            variant={language === l.id ? "default" : "outline"}
            size="sm"
            onClick={() => onSelect(l.id)}
            className="rounded-full px-4 text-[13.5px]"
          >
            {l.nativeLabel}
          </Button>
        ))}
        <Button
          variant={language === "auto" ? "default" : "outline"}
          size="sm"
          onClick={() => onSelect("auto")}
          className="rounded-full px-4 text-[13.5px]"
        >
          {t("onboarding.language.autoDetect")}
        </Button>
      </div>
      {/* Background model setup — quiet status, never a decision. */}
      {setupStatus && (
        <p className="mono text-muted-foreground mt-6 text-center text-[11px]">
          {setupStatus}
        </p>
      )}
      {setupError && (
        <p className="text-destructive mt-6 text-center text-[12px] leading-snug">
          {setupError}
        </p>
      )}

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

// ---------------------------------------------------------------------------
// Step 3 — How to use (live tutorial + hotkey rebind)
// ---------------------------------------------------------------------------
function TutorialStep({
  hotkey,
  recorderState,
  draftKeys,
  captureHint,
  modelReady,
  modelName,
  setupStatus,
  setupError,
  onOpenSelector,
  onStartRecording,
  onCancelRecording,
  onDictation,
  onBack,
  onFinish,
}: {
  hotkey: string;
  recorderState: string;
  draftKeys: string[];
  captureHint: string;
  modelReady: boolean;
  modelName?: string;
  setupStatus: string | null;
  setupError: string | null;
  onOpenSelector: () => void;
  onStartRecording: () => void;
  onCancelRecording: () => void;
  onDictation: () => void;
  onBack: () => void;
  onFinish: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-[600px]">
      <TutorialDemo
        hotkey={hotkey}
        interactive={modelReady}
        onDictation={onDictation}
      />

      {/* Background setup catching up — practice unlocks when it lands. */}
      {!modelReady && setupStatus && (
        <p className="mono text-muted-foreground mt-3 text-center text-[11px]">
          {t("onboarding.tutorial.almostReady")}
          {setupStatus.charAt(0).toLowerCase() + setupStatus.slice(1)}
        </p>
      )}
      {!modelReady && setupError && (
        <p className="text-destructive mt-3 text-center text-[12px]">
          {setupError}
        </p>
      )}

      {/* The model is visible and changeable here — where it can be tested. */}
      <div className="mt-3 flex justify-center">
        <Button
          variant="link"
          onClick={onOpenSelector}
          className="mono text-muted-foreground hover:text-foreground h-auto p-0 text-[11px] underline underline-offset-[3px]"
        >
          {modelReady && modelName
            ? t("onboarding.tutorial.usingModel", { name: modelName })
            : t("onboarding.tutorial.chooseModel")}
        </Button>
      </div>

      {/* Hotkey rebind — a single minimal control */}
      <div className="mt-5 flex justify-center">
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
        <Button variant="default" onClick={onFinish}>
          {t("onboarding.tutorial.finish")}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
