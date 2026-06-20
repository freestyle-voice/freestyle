import type {
  AgentCliStatus,
  AgentPrereqStatus,
  ComputerUsePrereqs,
} from "@freestyle/validations";
import { apiKeySchema } from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import claudeSprite from "@renderer/assets/claude-code-sprite.png";
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
import { defaultLanguage } from "@renderer/lib/languages";
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
  ArrowUp,
  Check,
  ChevronLeft,
  ClipboardPaste,
  HardDrive,
  Key,
  Keyboard,
  Loader2,
  Mic,
  Monitor,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  getDefaultAgentHotkey,
  getDefaultHotkey,
} from "../../shared/hotkey-defaults";
import { SETTINGS_KEYS } from "../../shared/settings-keys";

type Step = "permissions" | "dictation" | "agent";

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
  const [step, setStep] = useState<Step>("permissions");
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
  const [language] = useState<string>(defaultLanguage);
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

  const persistLanguage = useCallback((value: string) => {
    getClient()
      .api.settings[":key"].$put({
        param: { key: SETTINGS_KEYS.language },
        json: { value },
      })
      .catch(() => {});
  }, []);

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
    <div className="bg-background relative flex h-screen flex-col">
      {!isFullscreen && (
        <div
          className="h-9 shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
      )}

      {step === "agent" && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-1.5">
          <ArrowUp
            className="text-primary h-7 w-7 animate-bounce"
            strokeWidth={2.4}
          />
          <span className="text-muted-foreground text-[13px]">
            Claude lives there now
          </span>
        </div>
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
            onContinue={() => {
              capture("onboarding_permissions_completed");
              setStep("dictation");
            }}
          />
        )}

        {step === "dictation" && (
          <DictationStep
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
            onBack={() => setStep("permissions")}
            onContinue={() => {
              persistLanguage(language);
              capture("onboarding_dictation_completed");
              setStep("agent");
            }}
          />
        )}

        {step === "agent" && (
          <AgentStep
            onBack={() => setStep("dictation")}
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
  const allGranted =
    micGranted && (!IS_MAC || accessibilityStatus) && !linuxBlocked;
  // macOS and Windows can deep-link to the OS mic privacy settings.
  const canOpenMicSettings = IS_MAC || IS_WINDOWS;

  return (
    <div className="w-full max-w-[520px]">
      <div className="mb-6 text-center">
        <h1 className="serif text-foreground text-[38px] leading-[1.02] font-normal tracking-[-0.025em]">
          Permissions
        </h1>
      </div>

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

        {IS_MAC && (
          <ComputerUseCard accessibilityGranted={accessibilityStatus} />
        )}

        <ClaudeCodeCard />
      </div>

      <div className="mt-7 flex items-center justify-end gap-3.5">
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
  );
}

function ComputerUseCard({
  accessibilityGranted,
}: {
  accessibilityGranted: boolean;
}): React.JSX.Element {
  const [status, setStatus] = useState<ComputerUsePrereqs | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    window.api?.agent
      .computerUseStatus()
      .then(setStatus)
      .catch(() => {});
    window.api?.agent
      .getComputerUse()
      .then(setEnabled)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = useCallback(() => {
    window.api?.agent.setComputerUse(true);
    setEnabled(true);
    capture("onboarding_computer_use_enabled");
  }, []);

  const grantScreen = useCallback(async () => {
    const s = await window.api?.agent
      .requestScreenRecording()
      .catch(() => null);
    if (s) setStatus(s);
  }, []);

  const installHelper = useCallback(async () => {
    setBusy(true);
    try {
      await window.api?.agent.installComputerUse();
      refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const ready = enabled && !!status?.ok;

  return (
    <div className="border-border bg-card rounded-[12px] border p-4">
      <div className="flex items-center gap-3.5">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border",
            ready
              ? "bg-accent border-primary/20"
              : "bg-background border-border",
          )}
        >
          <Monitor
            size={16}
            className={
              ready ? "text-accent-foreground" : "text-muted-foreground"
            }
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-foreground text-[14px] font-medium">
            Computer use
            <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">
              optional
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5 text-[12.5px] leading-snug">
            Let Claude see your screen and control your computer.
          </div>
        </div>
        {ready ? (
          <span className="mono text-accent-foreground inline-flex items-center gap-1.5 text-[10.5px] tracking-[0.14em] uppercase">
            <Check size={13} strokeWidth={2.2} />
            On
          </span>
        ) : !enabled ? (
          <PermButton onClick={enable}>Enable</PermButton>
        ) : null}
      </div>

      {enabled && !ready && (
        <div className="border-border/60 mt-3 flex flex-col gap-2 border-t pt-3">
          <CuSubRow
            label="Screen recording"
            ok={status?.screenRecording === "ok"}
            actionLabel="Grant"
            onAction={grantScreen}
          />
          <CuSubRow
            label="Helper (cliclick)"
            ok={status?.helper === "ok"}
            actionLabel={busy ? "Installing…" : "Install"}
            onAction={installHelper}
            disabled={busy}
          />
          <CuSubRow
            label="Accessibility"
            ok={accessibilityGranted}
            hideAction
          />
        </div>
      )}
    </div>
  );
}

function CuSubRow({
  label,
  ok,
  actionLabel,
  onAction,
  disabled,
  hideAction,
}: {
  label: string;
  ok: boolean;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  hideAction?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-foreground inline-flex items-center gap-2 text-[12.5px]">
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full",
            ok ? "bg-accent" : "border-border border",
          )}
        >
          {ok && (
            <Check
              className="text-accent-foreground h-3 w-3"
              strokeWidth={2.4}
            />
          )}
        </span>
        {label}
      </span>
      {!ok && !hideAction && (
        <Button
          variant="outline"
          size="xs"
          onClick={onAction}
          disabled={disabled}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

function ClaudeCodeCard(): React.JSX.Element {
  const [prereq, setPrereq] = useState<AgentPrereqStatus | null>(null);
  const [cli, setCli] = useState<AgentCliStatus | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const refresh = useCallback(async (): Promise<AgentPrereqStatus | null> => {
    const s =
      (await window.api?.agent.prereqStatus().catch(() => null)) ?? null;
    if (s) setPrereq(s);
    return s;
  }, []);

  useEffect(() => {
    capture("onboarding_connect_viewed");
    window.api?.agent.setAuthMode("subscription");
    void refresh();
    window.api?.agent
      .cliStatus()
      .then(setCli)
      .catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (!signingIn) return;
    const id = setInterval(async () => {
      const s = await refresh();
      if (s?.subscriptionLoggedIn) {
        setSigningIn(false);
        capture("onboarding_login_succeeded");
      }
    }, 1500);
    const stop = setTimeout(() => setSigningIn(false), 180_000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [signingIn, refresh]);

  const startSignIn = useCallback(() => {
    capture("onboarding_login_started");
    setSigningIn(true);
    window.api?.agent.openTerminalLogin();
  }, []);

  const signedIn = !!prereq?.subscriptionLoggedIn;
  const notInstalled = cli?.installed === false;

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-[12px] border p-4">
      <div className="flex items-center gap-3.5">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border",
            signedIn
              ? "bg-accent border-primary/20"
              : "bg-background border-border",
          )}
        >
          <Sparkles
            size={16}
            className={
              signedIn ? "text-accent-foreground" : "text-muted-foreground"
            }
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-foreground text-[14px] font-medium">
            {signedIn ? "Claude is connected" : "Sign in to Claude"}
          </div>
          <div className="text-muted-foreground mt-0.5 text-[12.5px] leading-snug">
            {signedIn
              ? "The agent will run with your Claude subscription."
              : "Use your existing Claude subscription — no extra key."}
          </div>
        </div>
        {signedIn ? (
          <span className="mono text-accent-foreground inline-flex items-center gap-1.5 text-[10.5px] tracking-[0.14em] uppercase">
            <Check size={13} strokeWidth={2.2} />
            Connected
          </span>
        ) : (
          <Button
            variant="ink"
            size="sm"
            onClick={startSignIn}
            disabled={signingIn}
            className="shrink-0"
          >
            {signingIn ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : null}
            {signingIn ? "Waiting…" : "Sign in"}
          </Button>
        )}
      </div>

      {!signedIn && notInstalled && (
        <div className="border-border bg-background rounded-[10px] border p-3">
          <div className="text-foreground mb-1 text-[12px] font-medium">
            Install the Claude Code CLI first
          </div>
          <code className="text-muted-foreground block font-mono text-[11px]">
            npm install -g @anthropic-ai/claude-code
          </code>
        </div>
      )}

      {!signedIn && signingIn && (
        <p className="text-muted-foreground text-[11.5px] leading-snug">
          A terminal opened running{" "}
          <code className="text-foreground">claude login</code>. Finish there
          and this updates automatically.
        </p>
      )}
    </div>
  );
}

function HotkeyButton({
  recorderState,
  hotkey,
  draftKeys,
  captureHint,
  onStartRecording,
  onCancelRecording,
}: {
  recorderState: string;
  hotkey: string;
  draftKeys: string[];
  captureHint: string;
  onStartRecording: () => void;
  onCancelRecording: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  if (recorderState === "idle") {
    return (
      <Button
        variant="outline"
        onClick={onStartRecording}
        className="bg-card hover:bg-secondary h-auto gap-3 rounded-[10px] px-3.5 py-2.5"
      >
        <Keyboard className="text-muted-foreground h-4 w-4 shrink-0" />
        <KeyComboDisplay keys={formatAcceleratorKeys(hotkey)} />
        <span className="text-muted-foreground ml-1 text-[12.5px]">
          {t("common.change")}
        </span>
      </Button>
    );
  }
  return (
    <div className="border-primary bg-accent inline-flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5">
      <Keyboard className="text-accent-foreground h-4 w-4 shrink-0" />
      {draftKeys.length > 0 ? (
        <KeyComboDisplay keys={draftKeys} variant="dim" />
      ) : null}
      <span className="text-accent-foreground text-[12px]">{captureHint}</span>
      <Button
        variant="outline"
        size="xs"
        onClick={onCancelRecording}
        className="ml-1"
      >
        {t("common.cancel")}
      </Button>
    </div>
  );
}

function DictationStep({
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
  onContinue,
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
  onContinue: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-[560px]">
      <TutorialDemo
        hotkey={hotkey}
        interactive={modelReady}
        onDictation={onDictation}
      />
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

      <div className="mt-5 flex justify-center">
        <HotkeyButton
          recorderState={recorderState}
          hotkey={hotkey}
          draftKeys={draftKeys}
          captureHint={captureHint}
          onStartRecording={onStartRecording}
          onCancelRecording={onCancelRecording}
        />
      </div>

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
// ---------------------------------------------------------------------------
function AgentStep({
  onBack,
  onFinish,
}: {
  onBack: () => void;
  onFinish: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [agentHotkey, setAgentHotkey] = useState(getDefaultAgentHotkey());
  const [error, setError] = useState<string | null>(null);

  const recorder = useHotkeyRecorder(() => {}, { target: "agent" });
  const liveKeys = recorder.liveModifiers.map(keyDisplayLabel);
  const draftKeys = recorder.capturedCombo
    ? comboDisplayKeys(recorder.capturedCombo)
    : liveKeys;
  const captureHint = recorder.needsModifierOrMouseButton
    ? "Add a modifier or side mouse button · Esc to cancel"
    : recorder.canSaveRecording
      ? "Release to save · Esc to cancel"
      : "Press a modifier or side mouse button… · Esc to cancel";

  useEffect(() => {
    getClient()
      .api.settings[":key"].$get({ param: { key: SETTINGS_KEYS.agentHotkey } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.value) setAgentHotkey(d.value as string);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return window.api?.agent.onAgentHotkeyRecorded(({ ok, accel, reason }) => {
      setAgentHotkey(accel);
      if (ok) {
        setError(null);
        capture("onboarding_agent_hotkey_changed", { hotkey: accel });
        getClient()
          .api.settings[":key"].$put({
            param: { key: SETTINGS_KEYS.agentHotkey },
            json: { value: accel },
          })
          .catch(() => {});
      } else {
        setError(
          reason === "collision"
            ? "That's your dictation key — pick a different one."
            : "That key won't work — try another.",
        );
      }
    });
  }, []);

  useEffect(() => {
    window.api?.agent.setBarAttention(true);
    return () => window.api?.agent.setBarAttention(false);
  }, []);

  return (
    <div className="w-full max-w-[480px]">
      <div className="mb-6 flex flex-col items-center text-center">
        <img
          src={claudeSprite}
          alt=""
          className="mb-3 h-16 w-16 [image-rendering:pixelated]"
        />
        <h1 className="serif text-foreground text-[34px] leading-[1.05] font-normal tracking-[-0.02em]">
          Talk to Claude Code
        </h1>
        <p className="text-muted-foreground mx-auto mt-2.5 max-w-[420px] text-[13px] leading-relaxed">
          Hold down the hotkey, speak into Claude Code. Hit enter to execute.
        </p>
        <div className="border-primary/30 bg-accent/40 mt-4 rounded-[10px] border px-4 py-2.5">
          <span className="text-foreground text-[14px]">
            Try asking: <i>"What are the results of the world cup?"</i>
          </span>
        </div>
      </div>

      <div className="flex justify-center">
        <HotkeyButton
          recorderState={recorder.state}
          hotkey={agentHotkey}
          draftKeys={draftKeys}
          captureHint={captureHint}
          onStartRecording={recorder.startRecording}
          onCancelRecording={recorder.cancelRecording}
        />
      </div>
      {error && (
        <p className="text-destructive mt-3 text-center text-[12px]">{error}</p>
      )}

      <div className="mt-8 flex items-center justify-between">
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
