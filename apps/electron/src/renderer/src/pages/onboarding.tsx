import { apiKeySchema } from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import markDark from "@renderer/assets/mark-dark.svg";
import markLight from "@renderer/assets/mark-light.svg";
import { getApiBase, getClient } from "@renderer/lib/api";
import {
  type AvailableModel,
  CLOUD_VOICE_PROVIDERS,
  formatBytes,
  formatSpeed,
  PROVIDER_DISPLAY_NAMES,
  type WhisperStatus,
} from "@renderer/lib/models";
import { Recorder } from "@renderer/lib/recorder";
import { cn } from "@renderer/lib/utils";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  Keyboard,
  Loader2,
  Mic,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";

type Step = "welcome" | "permissions" | "voice-model" | "test-run";

const STEPS: Step[] = ["welcome", "permissions", "voice-model", "test-run"];

type ModelSource = "cloud" | "local";

const IS_MAC =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

export default function OnboardingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");

  // Permissions state
  const [micStatus, setMicStatus] = useState<string>("unknown");
  const [accessibilityStatus, setAccessibilityStatus] = useState(false);

  // Voice model state
  const [modelSource, setModelSource] = useState<ModelSource>("cloud");
  const [available, setAvailable] = useState<AvailableModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AvailableModel | null>(
    null,
  );
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
  const [selectedWhisperModel, setSelectedWhisperModel] = useState<
    string | null
  >(null);

  // Test run state
  const [testState, setTestState] = useState<
    "idle" | "recording" | "transcribing" | "done" | "error"
  >("idle");
  const [testTranscript, setTestTranscript] = useState("");
  const [testError, setTestError] = useState("");
  const recorderRef = useRef<Recorder | null>(null);
  const startTimeRef = useRef(0);

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
      const res = await fetch(`${getApiBase()}/api/whisper/status`);
      if (res.ok) {
        const data: WhisperStatus = await res.json();
        setWhisperStatus(data);
        return data;
      }
    } catch {}
    return null;
  }, []);

  useEffect(() => {
    loadWhisperStatus();
  }, [loadWhisperStatus]);

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

  const selectModel = useCallback(
    (model: AvailableModel) => {
      setSelectedModel(model);
      setSelectedWhisperModel(null);
      if (!apiKeys.has(model.provider_id)) {
        setNeedsKey(true);
        apiKeyForm.reset({ provider: model.provider_id, key: "" });
      } else {
        setNeedsKey(false);
      }
    },
    [apiKeys, apiKeyForm],
  );

  const selectLocalWhisper = useCallback((modelId: string) => {
    setSelectedWhisperModel(modelId);
    setSelectedModel(null);
    setNeedsKey(false);
  }, []);

  const downloadWhisperModel = useCallback(
    async (modelId: string) => {
      await fetch(`${getApiBase()}/api/whisper/models/${modelId}/download`, {
        method: "POST",
      });
      loadWhisperStatus();
    },
    [loadWhisperStatus],
  );

  const saveModelAndContinue = useCallback(async () => {
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
      } else if (selectedWhisperModel && whisperStatus) {
        const def = whisperStatus.modelDefinitions.find(
          (d) => d.id === selectedWhisperModel,
        );
        if (def) {
          await client.api.models.configured.$post({
            json: {
              provider: "local-whisper",
              model_id: `local-whisper/${def.id}`,
              model_name: `${def.displayName} (Local)`,
              type: "voice",
              is_default: true,
            },
          });
          fetch(`${getApiBase()}/api/whisper/server/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelId: selectedWhisperModel }),
          }).catch(() => {});
        }
      }

      setStep("test-run");
    } catch {
      // stay on voice-model step
    } finally {
      setSaving(false);
    }
  }, [
    selectedModel,
    selectedWhisperModel,
    needsKey,
    apiKeyForm,
    whisperStatus,
  ]);

  const finishOnboarding = useCallback(() => {
    window.api?.setOnboardingComplete();
    navigate("/today", { replace: true });
  }, [navigate]);

  // Test run: start recording
  const startTestRecording = useCallback(async () => {
    setTestState("recording");
    setTestTranscript("");
    setTestError("");
    startTimeRef.current = Date.now();

    const recorder = new Recorder();
    recorderRef.current = recorder;
    try {
      await recorder.start();
    } catch (err) {
      setTestState("error");
      setTestError(
        err instanceof Error ? err.message : "Could not access microphone",
      );
      recorder.destroy();
      recorderRef.current = null;
    }
  }, []);

  // Test run: stop and transcribe
  const stopTestRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    const recordingDuration = Date.now() - startTimeRef.current;
    if (recordingDuration < 500) {
      recorder.cancel();
      recorder.releaseStream();
      recorderRef.current = null;
      setTestState("idle");
      return;
    }

    setTestState("transcribing");

    try {
      const wavBlob = await recorder.stop();
      recorder.releaseStream();
      recorderRef.current = null;

      const headers: Record<string, string> = {
        "Content-Type": "audio/wav",
        "x-audio-duration-ms": String(recordingDuration),
      };

      const res = await fetch(`${getApiBase()}/api/transcribe`, {
        method: "POST",
        body: wavBlob,
        headers,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error || body?.detail || `Transcription failed (${res.status})`,
        );
      }

      const data = await res.json();
      const text = (data.cleaned || data.raw || "").trim();
      if (text) {
        setTestTranscript(text);
        setTestState("done");
      } else {
        setTestState("idle");
      }
    } catch (err) {
      setTestState("error");
      setTestError(err instanceof Error ? err.message : "Transcription failed");
    }
  }, []);

  // Cleanup recorder on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.destroy();
    };
  }, []);

  const voiceModels = available.filter(
    (m) => m.type === "voice" && CLOUD_VOICE_PROVIDERS.includes(m.provider_id),
  );

  const modelsByProvider = new Map<string, AvailableModel[]>();
  for (const m of voiceModels) {
    const list = modelsByProvider.get(m.provider_id) ?? [];
    list.push(m);
    modelsByProvider.set(m.provider_id, list);
  }

  const hasModelSelected =
    selectedModel !== null || selectedWhisperModel !== null;
  const canAdvanceFromModel =
    hasModelSelected &&
    (!needsKey || apiKeyForm.watch("key").trim()) &&
    !saving;

  const currentStepIndex = STEPS.indexOf(step);

  return (
    <div className="bg-background flex h-screen flex-col">
      {!isFullscreen && (
        <div
          className="h-9 shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
      )}
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="responsive-standalone-pad w-full max-w-md space-y-8">
          {/* Logo */}
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
              <div className="text-center">
                <h2 className="text-lg font-semibold">Choose a Voice Model</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Use a cloud provider with an API key, or run speech-to-text
                  locally with whisper.cpp.
                </p>
              </div>

              {/* Source toggle */}
              <div className="flex justify-center">
                <div className="border-border bg-secondary inline-flex rounded-md border p-[3px]">
                  <button
                    type="button"
                    onClick={() => {
                      setModelSource("cloud");
                      setSelectedWhisperModel(null);
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

              {modelSource === "cloud" && (
                <>
                  {/* Cloud model list */}
                  <div className="border-border max-h-52 overflow-y-auto rounded-lg border">
                    {[...modelsByProvider.entries()].map(
                      ([providerId, models]) => (
                        <div key={providerId}>
                          <div className="text-muted-foreground bg-secondary/50 sticky top-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider">
                            {PROVIDER_DISPLAY_NAMES[providerId] ?? providerId}
                          </div>
                          {models.map((model) => (
                            <button
                              key={model.model_id}
                              type="button"
                              onClick={() => selectModel(model)}
                              className={cn(
                                "hover:bg-secondary flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                                selectedModel?.model_id === model.model_id &&
                                  "bg-primary/5",
                              )}
                            >
                              <span className="flex-1">{model.model_name}</span>
                              {selectedModel?.model_id === model.model_id && (
                                <Check size={14} className="text-primary" />
                              )}
                            </button>
                          ))}
                        </div>
                      ),
                    )}
                    {voiceModels.length === 0 && (
                      <div className="flex items-center gap-2 px-3 py-4">
                        <AlertTriangle className="text-muted-foreground h-4 w-4" />
                        <span className="text-muted-foreground text-sm">
                          Loading models...
                        </span>
                      </div>
                    )}
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
                            apiKeyForm.formState.errors.key &&
                              "border-destructive",
                          )}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              apiKeyForm.getValues("key").trim()
                            )
                              saveModelAndContinue();
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
                </>
              )}

              {modelSource === "local" && (
                <>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Audio never leaves your device. Download a model to get
                    started.
                  </p>

                  {whisperStatus?.binaryDownloading && (
                    <div className="border-border bg-card flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
                      <Loader2 className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" />
                      <span className="text-muted-foreground text-xs">
                        Building whisper.cpp from source...
                      </span>
                    </div>
                  )}

                  <div className="border-border max-h-52 overflow-y-auto rounded-lg border">
                    {whisperStatus?.modelDefinitions.map((def) => {
                      const state = whisperStatus.models.find(
                        (m) => m.model === def.id,
                      );
                      const status = state?.status ?? "not_downloaded";
                      const isSelected = selectedWhisperModel === def.id;

                      return (
                        <div
                          key={def.id}
                          className={cn(
                            "border-border flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0",
                            isSelected && "bg-primary/5",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-foreground text-[13px] font-medium">
                                {def.displayName}
                              </span>
                              <span className="text-muted-foreground text-[11px]">
                                {formatBytes(def.sizeBytes)}
                              </span>
                              {def.quantized && (
                                <span className="mono bg-primary/10 text-primary rounded-full px-1.5 py-[1px] text-[9px] tracking-wider">
                                  FASTER
                                </span>
                              )}
                            </div>
                            <div className="text-muted-foreground mt-0.5 text-[11px]">
                              {def.speed} · {def.quality} · {def.ramRequired}
                            </div>

                            {status === "downloading" &&
                              state?.phase === "downloading_model" &&
                              state.downloadProgress && (
                                <div className="mt-1.5 space-y-1">
                                  <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
                                    <div
                                      className="bg-primary h-full rounded-full transition-all"
                                      style={{
                                        width: `${state.downloadProgress.percent}%`,
                                      }}
                                    />
                                  </div>
                                  <div className="text-muted-foreground flex justify-between text-[10px]">
                                    <span>
                                      {formatBytes(
                                        state.downloadProgress.bytesDownloaded,
                                      )}{" "}
                                      /{" "}
                                      {formatBytes(
                                        state.downloadProgress.bytesTotal,
                                      )}
                                    </span>
                                    {state.downloadProgress.speedBps > 0 && (
                                      <span>
                                        {formatSpeed(
                                          state.downloadProgress.speedBps,
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                            {status === "downloading" &&
                              state?.phase === "building_binary" && (
                                <div className="mt-1.5">
                                  <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
                                    <div className="bg-primary h-full w-full animate-pulse rounded-full" />
                                  </div>
                                  <div className="text-muted-foreground mt-1 text-[10px]">
                                    Building whisper.cpp...
                                  </div>
                                </div>
                              )}

                            {status === "error" && state?.error && (
                              <div className="text-destructive mt-1 text-[11px]">
                                {state.error}
                              </div>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {(status === "not_downloaded" ||
                              status === "error") && (
                              <button
                                type="button"
                                onClick={() => downloadWhisperModel(def.id)}
                                className="border-border hover:bg-secondary flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium"
                              >
                                {status === "error" ? (
                                  <>
                                    <RefreshCw size={12} />
                                    Retry
                                  </>
                                ) : (
                                  <>
                                    <Download size={12} />
                                    Download
                                  </>
                                )}
                              </button>
                            )}
                            {status === "downloading" && (
                              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                            )}
                            {status === "ready" && (
                              <button
                                type="button"
                                onClick={() => selectLocalWhisper(def.id)}
                                className={cn(
                                  "rounded-md px-2.5 py-1.5 text-[11px] font-medium",
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "border-border hover:bg-secondary border",
                                )}
                              >
                                {isSelected ? (
                                  <span className="flex items-center gap-1">
                                    <Check size={12} /> Selected
                                  </span>
                                ) : (
                                  "Use"
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {!whisperStatus && (
                      <div className="flex items-center gap-2 px-3 py-4">
                        <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                        <span className="text-muted-foreground text-sm">
                          Loading...
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={saveModelAndContinue}
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

          {/* Step: Test Run */}
          {step === "test-run" && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-semibold">Try It Out</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Press the button below and say something. Your transcription
                  will appear in the box.
                </p>
              </div>

              {/* Transcript display */}
              <div
                className={cn(
                  "border-border bg-card min-h-[100px] rounded-lg border p-4",
                  testState === "recording" && "border-primary/50",
                )}
              >
                {testState === "idle" && !testTranscript && (
                  <p className="text-muted-foreground text-sm italic">
                    Your transcription will appear here...
                  </p>
                )}
                {testState === "recording" && (
                  <div className="flex items-center gap-2">
                    <span className="bg-destructive h-2.5 w-2.5 animate-pulse rounded-full" />
                    <span className="text-muted-foreground text-sm">
                      Listening...
                    </span>
                  </div>
                )}
                {testState === "transcribing" && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="text-primary h-4 w-4 animate-spin" />
                    <span className="text-muted-foreground text-sm">
                      Transcribing...
                    </span>
                  </div>
                )}
                {(testState === "done" ||
                  (testState === "idle" && testTranscript)) && (
                  <p className="text-foreground text-sm leading-relaxed">
                    {testTranscript}
                  </p>
                )}
                {testState === "error" && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-destructive text-sm">{testError}</p>
                  </div>
                )}
              </div>

              {/* Record button */}
              <div className="flex justify-center">
                {testState === "recording" ? (
                  <button
                    type="button"
                    onClick={stopTestRecording}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium"
                  >
                    <span className="h-3 w-3 rounded-sm bg-current" />
                    Stop Recording
                  </button>
                ) : testState === "transcribing" ? (
                  <button
                    type="button"
                    disabled
                    className="bg-secondary text-muted-foreground flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium opacity-60"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startTestRecording}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium"
                  >
                    <Mic className="h-4 w-4" />
                    {testTranscript ? "Try Again" : "Start Recording"}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={finishOnboarding}
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg py-3 text-sm font-medium"
              >
                {testTranscript ? "Finish Setup" : "Skip & Finish Setup"}
              </button>
            </div>
          )}
        </div>

        {/* Step progress indicator */}
        {step !== "welcome" && (
          <div className="mt-8 flex items-center gap-2">
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
