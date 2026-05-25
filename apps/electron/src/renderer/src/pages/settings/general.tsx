import {
  comboDisplayKeys,
  formatAcceleratorKeys,
  keyDisplayLabel,
  useHotkeyRecorder,
} from "@renderer/hooks/use-hotkey-recorder";
import { getClient } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import {
  Download,
  Keyboard,
  Languages,
  Mic,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Volume2,
  VolumeOff,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// KeyBadge: renders a single key as a physical-key-style badge
// ---------------------------------------------------------------------------

function KeyBadge({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "recording" | "dim";
}) {
  return (
    <kbd
      className={cn(
        "inline-flex select-none items-center justify-center",
        "min-w-[26px] rounded-md px-1.5 py-1",
        "font-mono text-xs font-medium leading-none",
        "border shadow-[0_1px_0_0_hsl(var(--border))]",
        variant === "default" && "border-border bg-muted text-foreground",
        variant === "recording" &&
          "border-primary/40 bg-primary/10 text-primary",
        variant === "dim" &&
          "border-border/50 bg-muted/50 text-muted-foreground",
      )}
    >
      {label}
    </kbd>
  );
}

/** Renders an array of key labels as badges with + separators */
function KeyComboDisplay({
  keys,
  variant = "default",
}: {
  keys: string[];
  variant?: "default" | "recording" | "dim";
}) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && (
            <span className="text-muted-foreground text-[10px]">+</span>
          )}
          <KeyBadge label={k} variant={variant} />
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

interface AudioDevice {
  deviceId: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GeneralSettingsPage(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [hotkey, setHotkey] = useState("Alt+Space");
  const [language, setLanguage] = useState("auto");
  const [pillPosition, setPillPosition] = useState("bottom-center");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [transcriptionPrompt, setTranscriptionPrompt] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);

  const handleHotkeyRecorded = useCallback((accelerator: string) => {
    setHotkey(accelerator);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "hotkey" },
        json: { value: accelerator },
      })
      .catch(() => {});
    window.api.updateHotkey(accelerator);
  }, []);

  const {
    state: recorderState,
    liveModifiers,
    capturedCombo,
    startRecording: startHotkeyRecording,
    cancelRecording: cancelHotkeyRecording,
    saveRecording: saveHotkeyRecording,
  } = useHotkeyRecorder(handleHotkeyRecorded);

  // Load available audio input devices
  useEffect(() => {
    (async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
          for (const t of s.getTracks()) t.stop();
        });
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        setDevices(
          allDevices
            .filter((d) => d.kind === "audioinput")
            .map((d) => ({
              deviceId: d.deviceId,
              label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
            })),
        );
      } catch {
        // ignore
      }
    })();
  }, []);

  // Load saved settings from server
  useEffect(() => {
    getClient()
      .api.settings[":key"].$get({ param: { key: "mic_device_id" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setSelectedDevice(data.value);
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: "hotkey" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setHotkey(data.value);
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: "language" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setLanguage(data.value);
      })
      .catch(() => {});
    window.api
      ?.getPillPosition()
      .then(setPillPosition)
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: "sound_enabled" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value === "false") setSoundEnabled(false);
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: "transcription_prompt" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setTranscriptionPrompt(data.value);
      })
      .catch(() => {});

    // Auto-update setting
    window.api
      ?.getAutoUpdate()
      .then((v) => setAutoUpdate(v))
      .catch(() => {});

    // Auto-updater events
    const removeAvail = window.api?.onUpdateAvailable((info) => {
      setUpdateAvailable(info.version);
    });
    const removeDownloaded = window.api?.onUpdateDownloaded(() => {
      setUpdateDownloaded(true);
      setDownloading(false);
    });
    window.api
      ?.checkForUpdate()
      .then((v) => {
        if (v) setUpdateAvailable(v);
      })
      .catch(() => {});

    return () => {
      removeAvail?.();
      removeDownloaded?.();
    };
  }, []);

  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDevice(deviceId);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "mic_device_id" },
        json: { value: deviceId },
      })
      .catch(() => {});
  }, []);

  const handleThemeChange = useCallback(
    (value: string) => {
      setTheme(value);
      getClient()
        .api.settings[":key"].$put({ param: { key: "theme" }, json: { value } })
        .catch(() => {});
    },
    [setTheme],
  );

  const handleLanguageChange = useCallback((value: string) => {
    setLanguage(value);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "language" },
        json: { value },
      })
      .catch(() => {});
  }, []);

  const handlePillPositionChange = useCallback((value: string) => {
    setPillPosition(value);
    window.api?.setPillPosition(value);
  }, []);

  const handleAutoUpdateToggle = useCallback((enabled: boolean) => {
    setAutoUpdate(enabled);
    window.api?.setAutoUpdate(enabled);
  }, []);

  const handleSoundToggle = useCallback((enabled: boolean) => {
    setSoundEnabled(enabled);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "sound_enabled" },
        json: { value: String(enabled) },
      })
      .catch(() => {});
  }, []);

  // Build display keys for current recorder state
  const liveKeys = liveModifiers.map(keyDisplayLabel);
  const capturedKeys = capturedCombo ? comboDisplayKeys(capturedCombo) : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">General Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure general application preferences.
        </p>
      </div>

      {/* ── Updates ────────────────────────────────────────────── */}
      {updateAvailable && (
        <div className="border-primary/30 bg-primary/5 flex items-center justify-between rounded-lg border px-4 py-3">
          <div className="flex items-center gap-2">
            <Download className="text-primary h-4 w-4" />
            <span className="text-sm">
              {updateDownloaded
                ? `Version ${updateAvailable} ready to install`
                : `Version ${updateAvailable} available`}
            </span>
          </div>
          {updateDownloaded ? (
            <button
              type="button"
              onClick={() => window.api?.installUpdate()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium"
            >
              Restart & Update
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDownloading(true);
                window.api?.downloadUpdate();
              }}
              disabled={downloading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
            >
              {downloading ? "Downloading..." : "Download"}
            </button>
          )}
        </div>
      )}

      {/* ── Auto Update toggle ──────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">Automatic updates</span>
          <span className="text-muted-foreground text-xs">
            Automatically download updates in the background
          </span>
        </div>
        <button
          type="button"
          onClick={() => handleAutoUpdateToggle(!autoUpdate)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
            autoUpdate ? "bg-primary" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
              autoUpdate ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>

      {/* ── Recording ─────────────────────────────────────────── */}
      <div className="space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recording
        </h2>

        {/* Hotkey */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Hotkey</label>
          {recorderState === "idle" ? (
            <button
              type="button"
              onClick={startHotkeyRecording}
              className="border-border hover:bg-secondary flex w-full items-center gap-3 rounded-lg border px-4 py-3 transition-colors"
            >
              <Keyboard className="text-muted-foreground h-4 w-4 shrink-0" />
              <KeyComboDisplay keys={formatAcceleratorKeys(hotkey)} />
              <span className="text-muted-foreground ml-auto text-xs">
                Click to change
              </span>
            </button>
          ) : recorderState === "recording" ? (
            <div className="border-primary/60 bg-primary/5 flex items-center justify-between rounded-lg border px-4 py-3">
              <div className="flex items-center gap-3">
                <Keyboard className="text-primary h-4 w-4 shrink-0" />
                {liveKeys.length > 0 ? (
                  <>
                    <KeyComboDisplay keys={liveKeys} variant="dim" />
                    <span className="text-muted-foreground animate-pulse text-xs">
                      + press a key
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground animate-pulse text-sm">
                    Press a key combination...
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={cancelHotkeyRecording}
                className="border-border hover:bg-secondary rounded-md border px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            /* captured */
            <div className="border-primary/60 bg-primary/5 flex items-center justify-between rounded-lg border px-4 py-3">
              <div className="flex items-center gap-3">
                <Keyboard className="text-primary h-4 w-4 shrink-0" />
                <KeyComboDisplay keys={capturedKeys} variant="recording" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveHotkeyRecording}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-xs font-medium"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelHotkeyRecording}
                  className="border-border hover:bg-secondary rounded-md border px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Microphone + Language side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Microphone</label>
            <div className="flex items-center gap-2">
              <Mic className="text-muted-foreground h-4 w-4 shrink-0" />
              <select
                value={selectedDevice}
                onChange={(e) => handleDeviceChange(e.target.value)}
                className="border-border bg-card text-foreground w-full appearance-auto rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">System default</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Language</label>
            <div className="flex items-center gap-2">
              <Languages className="text-muted-foreground h-4 w-4 shrink-0" />
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="border-border bg-card text-foreground w-full appearance-auto rounded-lg border px-3 py-2 text-sm"
              >
                <option value="auto">Auto-detect</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="nl">Dutch</option>
                <option value="ru">Russian</option>
                <option value="zh">Chinese</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="ar">Arabic</option>
                <option value="hi">Hindi</option>
                <option value="pl">Polish</option>
                <option value="tr">Turkish</option>
                <option value="sv">Swedish</option>
                <option value="da">Danish</option>
                <option value="no">Norwegian</option>
                <option value="fi">Finnish</option>
                <option value="uk">Ukrainian</option>
              </select>
            </div>
          </div>
        </div>

        {/* Transcription prompt hint */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Transcription Prompt</label>
          <p className="text-muted-foreground text-xs">
            Hint for the speech model — list domain terms, names, or jargon to
            improve accuracy.
          </p>
          <input
            type="text"
            value={transcriptionPrompt}
            onChange={(e) => {
              setTranscriptionPrompt(e.target.value);
            }}
            onBlur={() => {
              getClient()
                .api.settings[":key"].$put({
                  param: { key: "transcription_prompt" },
                  json: { value: transcriptionPrompt },
                })
                .catch(() => {});
            }}
            placeholder="e.g. TypeScript, React, Kubernetes, JIRA..."
            className="border-border bg-card text-foreground w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        {/* Sound toggle - inline row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {soundEnabled ? (
              <Volume2 className="text-muted-foreground h-4 w-4 shrink-0" />
            ) : (
              <VolumeOff className="text-muted-foreground h-4 w-4 shrink-0" />
            )}
            <span className="text-sm font-medium">Sound feedback</span>
            <span className="text-muted-foreground text-xs">
              Play tones on record start/stop
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleSoundToggle(!soundEnabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
              soundEnabled ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                soundEnabled ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        </div>
      </div>

      {/* ── Display ───────────────────────────────────────────── */}
      <div className="space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Display
        </h2>

        {/* Appearance + Widget Position side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Theme</label>
            <div className="flex gap-2">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleThemeChange(option.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors",
                    theme === option.value
                      ? "border-primary bg-accent text-accent-foreground font-medium"
                      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <option.icon className="h-3.5 w-3.5" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Widget Position</label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: "bottom-center", label: "Bottom Center" },
                { value: "bottom-right", label: "Bottom Right" },
                { value: "top-center", label: "Top Center" },
                { value: "top-right", label: "Top Right" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handlePillPositionChange(opt.value)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                    pillPosition === opt.value
                      ? "border-primary bg-accent text-accent-foreground font-medium"
                      : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
