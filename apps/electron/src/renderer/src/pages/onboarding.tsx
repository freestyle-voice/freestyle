import { apiKeySchema } from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import markDark from "@renderer/assets/mark-dark.svg";
import markLight from "@renderer/assets/mark-light.svg";
import {
  LlmModelRow,
  MODEL_ROW_PAGE_SIZE,
  ProviderModelHeader,
  ShowMoreModelRowsButton,
} from "@renderer/components/model-row";
import { Toggle, VoiceRow } from "@renderer/components/voice-row";
import { getClient } from "@renderer/lib/api";
import {
  type AvailableModel,
  buildVoiceItems,
  LLM_PROVIDERS,
  type MlxAsrStatus,
  PROVIDER_DISPLAY_NAMES,
  type WhisperStatus,
} from "@renderer/lib/models";
import { cn } from "@renderer/lib/utils";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  Keyboard,
  Loader2,
  Mic,
  Power,
  Shield,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";

type Step = "welcome" | "permissions" | "voice-model" | "llm-cleanup";

const STEPS: Step[] = ["welcome", "permissions", "voice-model", "llm-cleanup"];

const IS_MAC =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

export default function OnboardingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");

  // Permissions state
  const [micStatus, setMicStatus] = useState<string>("unknown");
  const [accessibilityStatus, setAccessibilityStatus] = useState(false);
  const [launchAtStartup, setLaunchAtStartup] = useState(false);

  // Voice model state
  const [modelSource, setModelSource] = useState<"cloud" | "local">("cloud");
  const [available, setAvailable] = useState<AvailableModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AvailableModel | null>(
    null,
  );
  const [selectedWhisperDefId, setSelectedWhisperDefId] = useState<
    string | null
  >(null);
  const [selectedMlxDefId, setSelectedMlxDefId] = useState<string | null>(null);
  const [mlxStatus, setMlxStatus] = useState<MlxAsrStatus | null>(null);
  const apiKeyForm = useForm<{ provider: string; key: string }>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { provider: "", key: "" },
  });
  const [showKey, setShowKey] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiKeys, setApiKeys] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Local whisper state
  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus | null>(
    null,
  );

  // LLM cleanup state
  const [llmCleanup, setLlmCleanup] = useState(false);
  const [selectedLlm, setSelectedLlm] = useState<AvailableModel | null>(null);
  const llmKeyForm = useForm<{ provider: string; key: string }>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { provider: "", key: "" },
  });
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [needsLlmKey, setNeedsLlmKey] = useState(false);
  const [llmVisibleModelCounts, setLlmVisibleModelCounts] = useState<
    Record<string, number>
  >({});

  // Load permissions
  useEffect(() => {
    window.api
      ?.checkMicPermission()
      .then(setMicStatus)
      .catch(() => {});
    window.api
      ?.checkAccessibilityPermission()
      .then(setAccessibilityStatus)
      .catch(() => {});
    window.api
      ?.getLaunchAtStartup()
      .then(setLaunchAtStartup)
      .catch(() => {});
  }, []);

  useEffect(() => {
    return window.api?.onFullscreenChanged(setIsFullscreen);
  }, []);

  // Load models
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

  // Load whisper status
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
    } catch {}
    return null;
  }, []);

  useEffect(() => {
    loadWhisperStatus();
    if (IS_MAC) loadMlxStatus();
  }, [loadWhisperStatus, loadMlxStatus]);

  // Poll whisper status while a download is active
  useEffect(() => {
    const hasActiveDownload =
      whisperStatus?.binaryDownloading ||
      whisperStatus?.models.some(
        (m) => m.status === "downloading" || m.status === "verifying",
      );
    if (!hasActiveDownload) return;
    const interval = setInterval(() => {
      loadWhisperStatus();
    }, 500);
    return () => clearInterval(interval);
  }, [whisperStatus, loadWhisperStatus]);

  useEffect(() => {
    const hasActiveDownload = mlxStatus?.models?.some(
      (m) => m.status === "downloading" || m.status === "verifying",
    );
    if (!hasActiveDownload) return;
    const interval = setInterval(() => {
      loadMlxStatus();
    }, 500);
    return () => clearInterval(interval);
  }, [mlxStatus, loadMlxStatus]);

  const requestMic = useCallback(async () => {
    const status = await window.api?.requestMicPermission();
    if (status) setMicStatus(status);
  }, []);

  const openMicSettings = useCallback(() => {
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

  const handleLaunchAtStartupToggle = useCallback((enabled: boolean) => {
    setLaunchAtStartup(enabled);
    window.api?.setLaunchAtStartup(enabled);
  }, []);

  const openAccessibility = useCallback(() => {
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

  const selectCloudModel = useCallback(
    (model: AvailableModel) => {
      setSelectedModel(model);
      setSelectedWhisperDefId(null);
      setSelectedMlxDefId(null);
      if (!apiKeys.has(model.provider_id)) {
        setNeedsKey(true);
        apiKeyForm.reset({ provider: model.provider_id, key: "" });
      } else {
        setNeedsKey(false);
      }
    },
    [apiKeys, apiKeyForm],
  );

  const selectLocalModel = useCallback(
    (defId: string, _name: string, engine?: "whisper" | "mlx") => {
      if (engine === "mlx") {
        setSelectedMlxDefId(defId);
        setSelectedWhisperDefId(null);
      } else {
        setSelectedWhisperDefId(defId);
        setSelectedMlxDefId(null);
      }
      setSelectedModel(null);
      setNeedsKey(false);
    },
    [],
  );

  const selectLlm = useCallback(
    (model: AvailableModel) => {
      setSelectedLlm(model);
      if (!apiKeys.has(model.provider_id)) {
        setNeedsLlmKey(true);
        llmKeyForm.reset({ provider: model.provider_id, key: "" });
      } else {
        setNeedsLlmKey(false);
      }
    },
    [apiKeys, llmKeyForm],
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

  const saveVoiceAndContinue = useCallback(async () => {
    if (needsKey && selectedModel) {
      const valid = await apiKeyForm.trigger();
      if (!valid) return;
    }

    setSaving(true);

    try {
      const client = getClient();

      if (selectedModel) {
        if (needsKey) {
          const keyData = apiKeyForm.getValues();
          if (keyData.key.trim()) {
            await client.api.keys.$post({
              json: {
                provider: keyData.provider,
                key: keyData.key.trim(),
              },
            });
            setApiKeys((prev) => new Set([...prev, keyData.provider]));
          }
        }

        await client.api.models.configured.$post({
          json: {
            provider: selectedModel.provider_id,
            model_id: selectedModel.model_id,
            model_name: selectedModel.model_name,
            type: "voice",
            is_default: true,
          },
        });
      } else if (selectedMlxDefId && mlxStatus) {
        const def = mlxStatus.modelDefinitions.find(
          (d) => d.id === selectedMlxDefId,
        );
        if (def) {
          await client.api.models.configured.$post({
            json: {
              provider: "local-mlx",
              model_id: `local-mlx/${def.id}`,
              model_name: def.displayName,
              type: "voice",
              is_default: true,
            },
          });
          client.api["mlx-asr"].server.start
            .$post({ json: { modelId: selectedMlxDefId } })
            .catch(() => {});
        }
      } else if (selectedWhisperDefId && whisperStatus) {
        const def = whisperStatus.modelDefinitions.find(
          (d) => d.id === selectedWhisperDefId,
        );
        if (def) {
          await client.api.models.configured.$post({
            json: {
              provider: "local-whisper",
              model_id: `local-whisper/${def.id}`,
              model_name: def.displayName,
              type: "voice",
              is_default: true,
            },
          });
          client.api.whisper.server.start
            .$post({ json: { modelId: selectedWhisperDefId } })
            .catch(() => {});
        }
      }

      setStep("llm-cleanup");
    } catch {
      // stay on voice-model step
    } finally {
      setSaving(false);
    }
  }, [
    selectedModel,
    selectedWhisperDefId,
    selectedMlxDefId,
    needsKey,
    apiKeyForm,
    whisperStatus,
    mlxStatus,
  ]);

  const finishSetup = useCallback(async () => {
    if (llmCleanup && selectedLlm && needsLlmKey) {
      const valid = await llmKeyForm.trigger();
      if (!valid) return;
    }

    setSaving(true);

    try {
      const client = getClient();

      if (llmCleanup && selectedLlm) {
        if (needsLlmKey) {
          const keyData = llmKeyForm.getValues();
          if (keyData.key.trim()) {
            await client.api.keys.$post({
              json: {
                provider: keyData.provider,
                key: keyData.key.trim(),
              },
            });
            setApiKeys((prev) => new Set([...prev, keyData.provider]));
          }
        }

        await client.api.settings[":key"].$put({
          param: { key: "llm_cleanup" },
          json: { value: "true" },
        });

        await client.api.models.configured.$post({
          json: {
            provider: selectedLlm.provider_id,
            model_id: selectedLlm.model_id,
            model_name: selectedLlm.model_name,
            type: "llm",
            is_default: true,
          },
        });
      }

      window.api?.setOnboardingComplete();
      navigate("/today", { replace: true });
    } catch {
      // stay on step
    } finally {
      setSaving(false);
    }
  }, [llmCleanup, selectedLlm, needsLlmKey, llmKeyForm, navigate]);

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

  const voiceItems =
    modelSource === "local"
      ? allVoiceItems.filter((v) => v.kind === "local")
      : allVoiceItems.filter((v) => v.kind === "cloud");

  const llmModels = available.filter(
    (m) =>
      m.type === "llm" &&
      LLM_PROVIDERS.includes(m.provider_id) &&
      m.provider_id !== "local-llm",
  );

  const llmsByProvider = new Map<string, AvailableModel[]>();
  for (const m of llmModels) {
    const list = llmsByProvider.get(m.provider_id) ?? [];
    list.push(m);
    llmsByProvider.set(m.provider_id, list);
  }
  const visibleLlmCountFor = (providerId: string) =>
    llmVisibleModelCounts[providerId] ?? MODEL_ROW_PAGE_SIZE;
  const showMoreLlmsFor = (providerId: string, total: number) => {
    setLlmVisibleModelCounts((prev) => ({
      ...prev,
      [providerId]: Math.min(
        (prev[providerId] ?? MODEL_ROW_PAGE_SIZE) + MODEL_ROW_PAGE_SIZE,
        total,
      ),
    }));
  };

  const hasModelSelected =
    selectedModel !== null ||
    selectedWhisperDefId !== null ||
    selectedMlxDefId !== null;
  const canAdvanceFromModel =
    hasModelSelected &&
    (!needsKey || apiKeyForm.watch("key").trim()) &&
    !saving;

  const currentStepIndex = STEPS.indexOf(step);
  const wideModelStep = step === "voice-model" || step === "llm-cleanup";

  return (
    <div className="flex h-screen flex-col">
      {!isFullscreen && (
        <div
          className="h-9 shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
      )}
      <div
        className="flex min-h-0 flex-1 flex-col items-center overflow-auto py-8"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div
          className={cn(
            "responsive-standalone-pad my-auto w-full space-y-8",
            wideModelStep ? "max-w-2xl" : "max-w-md",
          )}
        >
          {/* Logo — welcome step only */}
          {step === "welcome" && (
            <div className="flex flex-col items-center gap-3">
              <img
                src={markLight}
                alt="Freestyle"
                className="block h-12 w-12 dark:hidden"
              />
              <img
                src={markDark}
                alt="Freestyle"
                className="hidden h-12 w-12 dark:block"
              />
              <h1 className="serif text-2xl font-bold tracking-tight">
                Freestyle
              </h1>
            </div>
          )}

          {/* Step: Welcome */}
          {step === "welcome" && (
            <div className="space-y-6 text-center">
              <div>
                <p className="text-muted-foreground text-sm">
                  Voice-to-text that works everywhere. Hold a hotkey, speak, and
                  your words appear as polished text in any app.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep("permissions")}
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg py-3 text-sm font-medium"
              >
                Get Started
              </button>
            </div>
          )}

          {/* Step: Permissions */}
          {step === "permissions" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setStep("welcome")}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
              >
                <ChevronLeft size={14} />
                Back
              </button>
              <div className="text-center">
                <h2 className="text-lg font-semibold">Permissions</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {IS_MAC
                    ? "Freestyle needs access to your microphone and accessibility features."
                    : "Freestyle needs access to your microphone to capture audio."}
                </p>
              </div>

              {/* Microphone */}
              <div className="border-border rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Mic className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">Microphone</div>
                    <p className="text-muted-foreground text-xs">
                      Required to capture your voice for transcription.
                    </p>
                  </div>
                  {micStatus === "granted" ? (
                    <Check className="text-primary h-5 w-5 shrink-0" />
                  ) : micStatus === "denied" && IS_MAC ? (
                    <button
                      type="button"
                      onClick={openMicSettings}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium"
                    >
                      Open Settings
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={requestMic}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium"
                    >
                      Allow
                    </button>
                  )}
                </div>
              </div>

              {/* Accessibility — macOS only */}
              {IS_MAC && (
                <div className="border-border rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    <Shield className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Accessibility</div>
                      <p className="text-muted-foreground text-xs">
                        Required to detect the global hotkey and paste text into
                        other apps.
                      </p>
                    </div>
                    {accessibilityStatus ? (
                      <Check className="text-primary h-5 w-5 shrink-0" />
                    ) : (
                      <button
                        type="button"
                        onClick={openAccessibility}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium"
                      >
                        Open Settings
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Hotkey info */}
              <div className="border-border rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Keyboard className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      Default Hotkey: Alt + Space
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {IS_MAC
                        ? "Hold to record, release to transcribe. You can change this in Settings later."
                        : "Press once to start recording, press again to stop and transcribe. You can change this in Settings later."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Launch at startup */}
              <div className="border-border rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Power className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">Launch at startup</div>
                    <p className="text-muted-foreground text-xs">
                      Automatically start Freestyle when you log in.
                    </p>
                  </div>
                  <Toggle
                    on={launchAtStartup}
                    onChange={handleLaunchAtStartupToggle}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep("voice-model")}
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium"
              >
                Continue
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Step: Voice Model */}
          {step === "voice-model" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setStep("permissions")}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
              >
                <ChevronLeft size={14} />
                Back
              </button>
              <div className="text-center">
                <h2 className="text-lg font-semibold">Choose a Voice Model</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Use a cloud provider with an API key, or run speech-to-text
                  locally.
                </p>
              </div>

              {/* Source toggle */}
              <div className="flex justify-center">
                <div className="border-border bg-secondary inline-flex rounded-md border p-[3px]">
                  <button
                    type="button"
                    onClick={() => {
                      setModelSource("cloud");
                      setSelectedWhisperDefId(null);
                      setSelectedMlxDefId(null);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-[12px] transition-colors",
                      modelSource === "cloud"
                        ? "bg-card border-border text-foreground border font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Cloud API
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModelSource("local");
                      setSelectedModel(null);
                      setNeedsKey(false);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-[12px] transition-colors",
                      modelSource === "local"
                        ? "bg-card border-border text-foreground border font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <HardDrive className="h-3 w-3" />
                    Local
                  </button>
                </div>
              </div>

              {/* Voice model list */}
              <div className="border-border overflow-hidden rounded-[14px] border">
                <div className="max-h-[340px] overflow-y-auto [scrollbar-gutter:stable]">
                  {voiceItems.length === 0 && (
                    <div className="flex items-center gap-2 px-5 py-6">
                      <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                      <span className="text-muted-foreground text-sm">
                        Loading models...
                      </span>
                    </div>
                  )}
                  {voiceItems.map((item, i) => (
                    <VoiceRow
                      key={item.key}
                      item={item}
                      first={i === 0}
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
                    />
                  ))}
                </div>
              </div>

              {/* API key input */}
              {needsKey && selectedModel && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Enter your{" "}
                    {PROVIDER_DISPLAY_NAMES[selectedModel.provider_id] ??
                      selectedModel.provider_id}{" "}
                    API key
                  </p>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      {...apiKeyForm.register("key")}
                      placeholder="sk-..."
                      className={cn(
                        "border-border bg-card w-full rounded-lg border px-3 py-2.5 pr-10 font-mono text-sm",
                        apiKeyForm.formState.errors.key && "border-destructive",
                      )}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          apiKeyForm.getValues("key").trim()
                        )
                          saveVoiceAndContinue();
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {apiKeyForm.formState.errors.key && (
                    <p className="text-destructive text-xs">
                      {apiKeyForm.formState.errors.key.message}
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={saveVoiceAndContinue}
                disabled={!canAdvanceFromModel}
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Setting up..." : "Continue"}
                {!saving && <ChevronRight size={16} />}
              </button>

              <button
                type="button"
                onClick={() => {
                  window.api?.setOnboardingComplete();
                  navigate("/today", { replace: true });
                }}
                className="text-muted-foreground hover:text-foreground w-full py-2 text-center text-xs"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* Step: LLM Cleanup */}
          {step === "llm-cleanup" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setStep("voice-model")}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
              >
                <ChevronLeft size={14} />
                Back
              </button>
              <div className="text-center">
                <h2 className="text-lg font-semibold">Text Cleanup</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Optionally use an LLM to clean up transcriptions — fix
                  grammar, remove filler words, and format text.
                </p>
              </div>

              {/* Toggle */}
              <div className="border-border rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Sparkles className="text-muted-foreground h-5 w-5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium">
                        Enable LLM cleanup
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Polish transcriptions with a language model.
                      </p>
                    </div>
                  </div>
                  <Toggle on={llmCleanup} onChange={setLlmCleanup} />
                </div>
              </div>

              {/* LLM model picker — shown when cleanup is enabled */}
              {llmCleanup && (
                <>
                  <div className="border-border overflow-hidden rounded-[14px] border">
                    <div className="max-h-[280px] overflow-y-auto [scrollbar-gutter:stable]">
                      {[...llmsByProvider.entries()].map(
                        ([providerId, models]) => {
                          const providerName =
                            PROVIDER_DISPLAY_NAMES[providerId] ?? providerId;
                          const hasKey = apiKeys.has(providerId);
                          const visibleCount = visibleLlmCountFor(providerId);
                          const visibleModels = models.slice(0, visibleCount);
                          return (
                            <div key={providerId}>
                              <ProviderModelHeader
                                providerId={providerId}
                                providerName={providerName}
                                hasKey={hasKey}
                              />
                              {visibleModels.map((model, index) => (
                                <LlmModelRow
                                  key={`${providerId}:${model.model_id}`}
                                  name={model.model_name}
                                  providerName={providerName}
                                  modelId={model.model_id}
                                  selected={
                                    selectedLlm?.provider_id ===
                                      model.provider_id &&
                                    selectedLlm?.model_id === model.model_id
                                  }
                                  hasKey={hasKey}
                                  first={index === 0}
                                  onSelect={() => selectLlm(model)}
                                />
                              ))}
                              <ShowMoreModelRowsButton
                                hiddenCount={
                                  models.length - visibleModels.length
                                }
                                onClick={() =>
                                  showMoreLlmsFor(providerId, models.length)
                                }
                              />
                            </div>
                          );
                        },
                      )}
                      {llmModels.length === 0 && (
                        <div className="flex items-center gap-2 px-5 py-6">
                          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                          <span className="text-muted-foreground text-sm">
                            Loading models...
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* LLM API key input */}
                  {needsLlmKey && selectedLlm && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        Enter your{" "}
                        {PROVIDER_DISPLAY_NAMES[selectedLlm.provider_id] ??
                          selectedLlm.provider_id}{" "}
                        API key
                      </p>
                      <div className="relative">
                        <input
                          type={showLlmKey ? "text" : "password"}
                          {...llmKeyForm.register("key")}
                          placeholder="sk-..."
                          className={cn(
                            "border-border bg-card w-full rounded-lg border px-3 py-2.5 pr-10 font-mono text-sm",
                            llmKeyForm.formState.errors.key &&
                              "border-destructive",
                          )}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              llmKeyForm.getValues("key").trim()
                            )
                              finishSetup();
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowLlmKey(!showLlmKey)}
                          className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
                        >
                          {showLlmKey ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </div>
                      {llmKeyForm.formState.errors.key && (
                        <p className="text-destructive text-xs">
                          {llmKeyForm.formState.errors.key.message}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={finishSetup}
                disabled={
                  saving ||
                  (llmCleanup &&
                    selectedLlm !== null &&
                    needsLlmKey &&
                    !llmKeyForm.watch("key").trim()) ||
                  (llmCleanup && selectedLlm === null)
                }
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg py-3 text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Setting up..." : "Finish Setup"}
              </button>

              {!llmCleanup && (
                <p className="text-muted-foreground text-center text-xs">
                  You can enable this later in Settings &gt; Models.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Step progress indicator */}
        {step !== "welcome" && (
          <div className="mt-8 mb-4 flex shrink-0 items-center gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i <= currentStepIndex ? "bg-primary w-6" : "bg-border w-1.5",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
