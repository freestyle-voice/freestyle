import { apiKeySchema } from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import markDark from "@renderer/assets/mark-dark.svg";
import markLight from "@renderer/assets/mark-light.svg";
import { getClient } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Keyboard,
  Mic,
  Shield,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";

type Step = "welcome" | "permissions" | "voice-model";

interface AvailableModel {
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  type: "voice" | "llm";
}

const VOICE_PROVIDERS = ["openai", "groq", "deepgram", "elevenlabs"];

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  groq: "Groq",
  deepgram: "Deepgram",
  elevenlabs: "ElevenLabs",
};

export default function OnboardingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");

  // Permissions state
  const [micStatus, setMicStatus] = useState<string>("unknown");
  const [accessibilityStatus, setAccessibilityStatus] = useState(false);

  // Voice model state
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
      if (!apiKeys.has(model.provider_id)) {
        setNeedsKey(true);
        apiKeyForm.reset({ provider: model.provider_id, key: "" });
      } else {
        setNeedsKey(false);
      }
    },
    [apiKeys, apiKeyForm],
  );

  const finishSetup = useCallback(async () => {
    if (!selectedModel) return;
    setSaving(true);

    try {
      const client = getClient();
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

      // Save voice model as default
      await client.api.models.configured.$post({
        json: {
          provider: selectedModel.provider_id,
          model_id: selectedModel.model_id,
          model_name: selectedModel.model_name,
          type: "voice",
          is_default: true,
        },
      });

      // Mark onboarding complete
      window.api?.setOnboardingComplete();

      // Navigate to settings
      navigate("/today", { replace: true });
    } catch {
      setSaving(false);
    }
  }, [selectedModel, needsKey, apiKeyForm, navigate]);

  const voiceModels = available.filter(
    (m) => m.type === "voice" && VOICE_PROVIDERS.includes(m.provider_id),
  );

  const modelsByProvider = new Map<string, AvailableModel[]>();
  for (const m of voiceModels) {
    const list = modelsByProvider.get(m.provider_id) ?? [];
    list.push(m);
    modelsByProvider.set(m.provider_id, list);
  }

  return (
    <div className="bg-background flex h-screen flex-col">
      {!isFullscreen && (
        <div
          className="h-9 shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
      )}
      <div className="flex flex-1 items-center justify-center">
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
                  Freestyle needs access to your microphone and accessibility
                  features.
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
                  ) : micStatus === "denied" &&
                    navigator.userAgent.includes("Mac") ? (
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

              {/* Accessibility */}
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

              {/* Hotkey info */}
              <div className="border-border rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Keyboard className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      Default Hotkey: Alt + Space
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {process.platform === "win32"
                        ? "Press once to start recording, press again to stop and transcribe. You can change this in Settings later."
                        : "Hold to record, release to transcribe. You can change this in Settings later."}
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
                  Select a speech-to-text model. You'll need an API key from the
                  provider.
                </p>
              </div>

              {/* Model list */}
              <div className="border-border max-h-52 overflow-y-auto rounded-lg border">
                {[...modelsByProvider.entries()].map(([providerId, models]) => (
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
                ))}
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
                        apiKeyForm.formState.errors.key && "border-destructive",
                      )}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          apiKeyForm.getValues("key").trim()
                        )
                          finishSetup();
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
                onClick={finishSetup}
                disabled={
                  !selectedModel ||
                  (needsKey && !apiKeyForm.watch("key").trim()) ||
                  saving
                }
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg py-3 text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Setting up..." : "Finish Setup"}
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
        </div>
      </div>
    </div>
  );
}
