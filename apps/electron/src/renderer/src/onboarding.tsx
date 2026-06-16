import { apiKeySchema } from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyComboDisplay } from "@renderer/components/key-combo";
import { LanguageSelector } from "@renderer/components/language-selector";
import { TutorialDemo } from "@renderer/components/tutorial-demo";
import { VoiceRow } from "@renderer/components/voice-row";
import {
  comboDisplayKeys,
  formatAcceleratorKeys,
  keyDisplayLabel,
  useHotkeyRecorder,
} from "@renderer/hooks/use-hotkey-recorder";
import { capture } from "@renderer/lib/analytics";
import { getClient } from "@renderer/lib/api";
import { defaultLanguage, ONBOARDING_LANGUAGES } from "@renderer/lib/languages";
import {
  type AvailableModel,
  buildVoiceItems,
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
  Eye,
  EyeOff,
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
import { getDefaultHotkey } from "../../shared/hotkey-defaults";
import { SETTINGS_KEYS } from "../../shared/settings-keys";

type Step = "ui-language" | "permissions" | "language" | "tutorial";

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
  const [step, setStep] = useState<Step>("ui-language");
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const selectCloudModel = useCallback(
    (model: AvailableModel) => {
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
    [apiKeys, apiKeyForm, commitCloudModel],
  );

  const selectLocalModel = useCallback(
    (
      defId: string,
      name: string,
      engine?: "whisper" | "mlx",
      source: "auto" | "selector" = "selector",
    ) => {
      if (engine === "mlx") {
        setSelectedMlxDefId(defId);
        setSelectedWhisperDefId(null);
      } else {
        setSelectedWhisperDefId(defId);
        setSelectedMlxDefId(null);
      }
      setSelectedModel(null);
      const provider = engine === "mlx" ? "local-mlx" : "local-whisper";
      getClient()
        .api.models.configured.$post({
          json: {
            provider,
            model_id: `${provider}/${defId}`,
            model_name: name,
            type: "voice",
            is_default: true,
          },
        })
        .catch(() => {});
      // The funnel's model-step event: with auto-setup this fires for every
      // user; `source` separates the silent default from explicit picks.
      capture("onboarding_model_completed", {
        model_id: `${provider}/${defId}`,
        kind: "local",
        provider,
        source,
      });
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

  // Auto-setup: once the MLX capability check settles, commit the platform
  // default and start its download in the background — the user never has
  // to choose a model. The selector stays available as an escape hatch.
  useEffect(() => {
    if (autoPicked.current || !mlxResolved || !recommended?.defId) return;
    autoPicked.current = true;
    selectLocalModel(
      recommended.defId,
      recommended.name,
      recommended.localEngine,
      "auto",
    );
    if (recommended.status === "not_downloaded" && !window.api?.isE2E) {
      capture("onboarding_model_auto_setup", {
        model_id: recommended.modelId,
      });
      downloadLocalModel(recommended.defId, recommended.localEngine);
    }
  }, [recommended, selectLocalModel, mlxResolved, downloadLocalModel]);

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
        {step === "ui-language" && (
          <UILanguageStep onContinue={() => setStep("permissions")} />
        )}

        {step === "permissions" && (
          <PermissionsStep
            micStatus={micStatus}
            accessibilityStatus={accessibilityStatus}
            linuxSetup={linuxSetup}
            onRequestMic={requestMic}
            onOpenMicSettings={openMicSettings}
            onOpenAccessibility={openAccessibility}
            onRecheckLinuxSetup={recheckLinuxSetup}
            onContinue={() => {
              capture("onboarding_permissions_completed");
              setStep("language");
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
// Step 0 — UI Language selection (must come before all other steps)
// ---------------------------------------------------------------------------
function UILanguageStep({
  onContinue,
}: {
  onContinue: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-[440px]">
      <h1 className="serif text-foreground m-0 mb-2 text-center text-[42px] leading-[1.0] font-normal tracking-[-0.025em]">
        {t("onboarding.uiLanguage.title")}
      </h1>
      <p className="text-muted-foreground mb-7 text-center text-[14px]">
        {t("onboarding.uiLanguage.subtitle")}
      </p>

      <LanguageSelector className="mx-auto" />

      <div className="mt-7 flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center gap-1.5 rounded-[7px] px-3.5 py-[7px] text-[12.5px] font-medium transition-colors"
        >
          {t("onboarding.uiLanguage.getStarted")}
          <ArrowRight size={13} />
        </button>
      </div>
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
  onContinue,
}: {
  micStatus: string;
  accessibilityStatus: boolean;
  linuxSetup: LinuxSetup | null;
  onRequestMic: () => void;
  onOpenMicSettings: () => void;
  onOpenAccessibility: () => void;
  onRecheckLinuxSetup: () => void;
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

      <div className="mt-7 flex items-center justify-end gap-3.5">
        {!allGranted && (
          <span className="mono text-muted-foreground text-[10.5px] tracking-[0.1em] uppercase">
            {IS_MAC
              ? t("onboarding.permissions.grantBoth")
              : t("onboarding.permissions.grantAccess")}
          </span>
        )}
        <button
          type="button"
          disabled={!allGranted}
          onClick={onContinue}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[7px] px-3.5 py-[7px] text-[12.5px] font-medium transition-colors",
            allGranted
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "bg-secondary text-muted-foreground cursor-not-allowed",
          )}
        >
          {t("common.continue")}
          <ArrowRight size={13} />
        </button>
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
    <button
      type="button"
      onClick={onClick}
      className="bg-foreground text-background hover:bg-foreground/90 shrink-0 rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Language (the model sets itself up in the background)
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
          <button
            key={l.id}
            type="button"
            onClick={() => onSelect(l.id)}
            className={cn(
              "rounded-full border px-4 py-2 text-[13.5px] font-medium transition-colors",
              language === l.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-secondary",
            )}
          >
            {l.nativeLabel}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onSelect("auto")}
          className={cn(
            "rounded-full border px-4 py-2 text-[13.5px] transition-colors",
            language === "auto"
              ? "border-primary bg-primary text-primary-foreground font-medium"
              : "border-border text-muted-foreground hover:bg-secondary",
          )}
        >
          {t("onboarding.language.autoDetect")}
        </button>
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
        <button
          type="button"
          onClick={onBack}
          className="border-border hover:bg-secondary rounded-[7px] border px-3.5 py-2 text-[12.5px] font-medium"
        >
          {t("common.back")}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center gap-1.5 rounded-[7px] px-3.5 py-2 text-[12.5px] font-medium"
        >
          {t("common.continue")}
          <ArrowRight size={13} />
        </button>
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

  // Esc steps back from key entry to the list, then closes the selector.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view === "key") setView("list");
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, view]);

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
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss; Esc handled above
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss; Esc handled above
    <div
      className="absolute inset-0 z-20 flex items-center justify-center p-10"
      style={{ background: "rgba(22,20,15,0.34)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a voice model"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="border-border bg-background flex max-h-full w-full max-w-[600px] flex-col overflow-hidden rounded-[16px] border"
        style={{ boxShadow: "0 24px 60px -16px rgba(20,12,4,0.4)" }}
      >
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
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="border-border bg-card text-muted-foreground hover:text-foreground flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border"
              >
                <X size={15} />
              </button>
            </div>

            {/* Source toggle */}
            <div className="flex shrink-0 justify-center pt-4">
              <div className="border-border bg-secondary inline-flex rounded-md border p-[3px]">
                <button
                  type="button"
                  onClick={() => onSourceChange("cloud")}
                  className={cn(
                    "rounded-[5px] px-3 py-1.5 text-[12px] transition-colors",
                    source === "cloud"
                      ? "bg-card border-border text-foreground border font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("onboarding.modelSelector.cloudApi")}
                </button>
                <button
                  type="button"
                  onClick={() => onSourceChange("local")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-[12px] transition-colors",
                    source === "local"
                      ? "bg-card border-border text-foreground border font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <HardDrive size={12} />
                  {t("onboarding.modelSelector.onDevice")}
                </button>
              </div>
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
              <button
                type="button"
                onClick={onClose}
                className="border-border hover:bg-secondary rounded-[7px] border px-3.5 py-2 text-[12.5px] font-medium"
              >
                {t("common.cancel")}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Key-entry header */}
            <div className="border-border/60 flex shrink-0 items-center gap-3 border-b px-[22px] py-[18px]">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label={t("onboarding.modelSelector.backToModels")}
                className="border-border bg-card text-muted-foreground hover:text-foreground flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border"
              >
                <ChevronLeft size={16} />
              </button>
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

              <div className="relative">
                <Key
                  size={15}
                  className="text-muted-foreground absolute top-1/2 left-3.5 -translate-y-1/2"
                />
                <input
                  // biome-ignore lint/a11y/noAutofocus: key entry is the sole purpose of this view
                  autoFocus
                  type={showKey ? "text" : "password"}
                  {...apiKeyForm.register("key")}
                  placeholder={t("onboarding.modelSelector.keyPlaceholder")}
                  className={cn(
                    "border-input bg-card focus:border-primary focus:ring-ring/30 w-full rounded-[8px] border py-3 pr-11 pl-10 font-mono text-[14px] outline-none focus:ring-2",
                    apiKeyForm.formState.errors.key && "border-destructive",
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && keyValue.trim()) handleSaveKey();
                  }}
                />
                <button
                  type="button"
                  onClick={onToggleShowKey}
                  aria-label={showKey ? "Hide key" : "Show key"}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3.5 -translate-y-1/2"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
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
              <button
                type="button"
                onClick={() => setView("list")}
                className="border-border hover:bg-secondary rounded-[7px] border px-3.5 py-2 text-[12.5px] font-medium"
              >
                {t("common.back")}
              </button>
              <button
                type="button"
                onClick={handleSaveKey}
                disabled={!keyValue.trim() || savingKey}
                className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center gap-2 rounded-[7px] px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-50"
              >
                {savingKey ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                {savingKey
                  ? t("common.saving")
                  : t("onboarding.modelSelector.saveKey", {
                      provider: providerName,
                    })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
        <button
          type="button"
          onClick={onOpenSelector}
          className="mono text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-[3px]"
        >
          {modelReady && modelName
            ? t("onboarding.tutorial.usingModel", { name: modelName })
            : t("onboarding.tutorial.chooseModel")}
        </button>
      </div>

      {/* Hotkey rebind — a single minimal control */}
      <div className="mt-5 flex justify-center">
        {recorderState === "idle" ? (
          <button
            type="button"
            onClick={onStartRecording}
            className="border-border bg-card hover:bg-secondary inline-flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 transition-colors"
          >
            <Keyboard className="text-muted-foreground h-4 w-4 shrink-0" />
            <KeyComboDisplay keys={formatAcceleratorKeys(hotkey)} />
            <span className="text-muted-foreground ml-1 text-[12.5px]">
              {t("common.change")}
            </span>
          </button>
        ) : (
          <div className="border-primary bg-accent inline-flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5">
            <Keyboard className="text-accent-foreground h-4 w-4 shrink-0" />
            {draftKeys.length > 0 ? (
              <KeyComboDisplay keys={draftKeys} variant="dim" />
            ) : null}
            <span className="text-accent-foreground text-[12px]">
              {captureHint}
            </span>
            <button
              type="button"
              onClick={onCancelRecording}
              className="border-border bg-background hover:bg-secondary ml-1 rounded-[7px] border px-2.5 py-1 text-[12px]"
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
      </div>

      <div className="mt-7 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="border-border hover:bg-secondary rounded-[7px] border px-3.5 py-2 text-[12.5px] font-medium"
        >
          {t("common.back")}
        </button>
        <button
          type="button"
          onClick={onFinish}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-[7px] px-4 py-2 text-[12.5px] font-medium"
        >
          {t("onboarding.tutorial.finish")}
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
