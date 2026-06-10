import { KeyComboDisplay } from "@renderer/components/key-combo";
import {
  comboDisplayKeys,
  formatAcceleratorKeys,
  keyDisplayLabel,
  useHotkeyRecorder,
} from "@renderer/hooks/use-hotkey-recorder";
import { getClient } from "@renderer/lib/api";
import { requestMicAccess, resolveMicStatus } from "@renderer/lib/permissions";
import { cn } from "@renderer/lib/utils";
import {
  Check,
  Download,
  ExternalLink,
  Keyboard,
  Languages,
  Mic,
  Monitor,
  Moon,
  Sun,
  Trash2,
  Volume2,
  VolumeOff,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function normalizePillPos(pos: string): string {
  return pos.startsWith("custom") ? "custom" : pos;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [hotkey, setHotkey] = useState(
    window.api?.defaultHotkey ?? "Alt+Space",
  );
  const [hotkeyMode, setHotkeyMode] = useState<"hold" | "toggle">("hold");
  const [language, setLanguage] = useState("auto");
  const [outputMode, setOutputMode] = useState("paste");
  const [pillPosition, setPillPosition] = useState("bottom-center");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [transcriptionPrompt, setTranscriptionPrompt] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [showOnLaunch, setShowOnLaunch] = useState(true);

  // Permissions
  type MicStatus =
    | "unknown"
    | "granted"
    | "denied"
    | "restricted"
    | "not-determined";
  const [micStatus, setMicStatus] = useState<MicStatus>("unknown");
  const [accessibilityStatus, setAccessibilityStatus] = useState<
    boolean | null
  >(null);
  const micPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accessibilityPollRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const isMac = navigator.userAgent.includes("Mac");
  // macOS and Windows can deep-link to the OS mic privacy settings.
  const canOpenMicSettings = isMac || window.api?.platform === "win32";

  const checkPermissions = useCallback(async () => {
    try {
      const mic = await resolveMicStatus();
      if (mic) setMicStatus(mic as MicStatus);
    } catch {}
    try {
      const acc = await window.api?.checkAccessibilityPermission();
      if (acc !== undefined) setAccessibilityStatus(acc);
    } catch {}
  }, []);

  const requestMic = useCallback(async () => {
    const status = await requestMicAccess();
    if (status) setMicStatus(status as MicStatus);
  }, []);

  const openMicSettings = useCallback(() => {
    window.api?.openMicSettings();
    if (micPollRef.current) clearInterval(micPollRef.current);
    micPollRef.current = setInterval(async () => {
      const mic = await window.api?.checkMicPermission();
      if (mic === "granted") {
        setMicStatus("granted");
        if (micPollRef.current) clearInterval(micPollRef.current);
        micPollRef.current = null;
      }
    }, 1000);
    setTimeout(() => {
      if (micPollRef.current) {
        clearInterval(micPollRef.current);
        micPollRef.current = null;
      }
    }, 30000);
  }, []);

  const openAccessibility = useCallback(() => {
    window.api?.openAccessibilitySettings();
    if (accessibilityPollRef.current)
      clearInterval(accessibilityPollRef.current);
    accessibilityPollRef.current = setInterval(async () => {
      const ok = await window.api?.checkAccessibilityPermission();
      if (ok) {
        setAccessibilityStatus(true);
        if (accessibilityPollRef.current)
          clearInterval(accessibilityPollRef.current);
        accessibilityPollRef.current = null;
      }
    }, 1000);
    setTimeout(() => {
      if (accessibilityPollRef.current) {
        clearInterval(accessibilityPollRef.current);
        accessibilityPollRef.current = null;
      }
    }, 30000);
  }, []);

  const handleHotkeyModeChange = useCallback((mode: "hold" | "toggle") => {
    setHotkeyMode(mode);
    window.api?.setHotkeyMode(mode);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "hotkey_mode" },
        json: { value: mode },
      })
      .catch(() => {});
  }, []);

  const handleHotkeyRecorded = useCallback((accelerator: string) => {
    setHotkey(accelerator);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "hotkey" },
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
    invalidReleaseNotice,
    startRecording: startHotkeyRecording,
    cancelRecording: cancelHotkeyRecording,
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
      .api.settings[":key"].$get({ param: { key: "hotkey_mode" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value === "toggle") setHotkeyMode("toggle");
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: "language" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setLanguage(data.value);
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: "output_mode" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setOutputMode(data.value);
      })
      .catch(() => {});
    window.api
      ?.getPillPosition()
      .then((pos) => setPillPosition(normalizePillPos(pos)))
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

    // Launch at startup setting
    window.api
      ?.getLaunchAtStartup()
      .then((v) => setLaunchAtStartup(v))
      .catch(() => {});

    // Show dashboard on launch setting
    window.api
      ?.getShowDashboardOnLaunch()
      .then((v) => setShowOnLaunch(v))
      .catch(() => {});

    // Auto-updater events
    const removeAvail = window.api?.onUpdateAvailable((info) => {
      setUpdateAvailable(info.version);
    });
    const removeDownloading = window.api?.onUpdateDownloading(() => {
      setDownloading(true);
      setUpdateError(null);
    });
    const removeDownloaded = window.api?.onUpdateDownloaded(() => {
      setUpdateDownloaded(true);
      setDownloading(false);
    });
    const removeError = window.api?.onUpdateError((info) => {
      setDownloading(false);
      setUpdateError(info.message);
    });
    window.api
      ?.checkForUpdate()
      .then((result) => {
        if (result) {
          setUpdateAvailable(result.version);
          if (result.downloadState === "downloading") {
            setDownloading(true);
          } else if (result.downloadState === "downloaded") {
            setUpdateDownloaded(true);
          }
        }
      })
      .catch(() => {});

    // Pill position live changes
    const removePillPos = window.api?.onPillPositionChanged((pos) => {
      setPillPosition(normalizePillPos(pos));
    });

    checkPermissions();

    return () => {
      removeAvail?.();
      removeDownloading?.();
      removeDownloaded?.();
      removeError?.();
      removePillPos?.();
      if (micPollRef.current) clearInterval(micPollRef.current);
      if (accessibilityPollRef.current)
        clearInterval(accessibilityPollRef.current);
    };
  }, [checkPermissions]);

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

  const handleOutputModeChange = useCallback((value: string) => {
    setOutputMode(value);
    window.api?.sendOutputModeChanged(value);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "output_mode" },
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

  const handleLaunchAtStartupToggle = useCallback((enabled: boolean) => {
    setLaunchAtStartup(enabled);
    window.api?.setLaunchAtStartup(enabled);
  }, []);

  const handleShowOnLaunchToggle = useCallback((enabled: boolean) => {
    setShowOnLaunch(enabled);
    window.api?.setShowDashboardOnLaunch(enabled);
  }, []);

  const clearHistory = useCallback(async () => {
    if (
      !confirm(
        "Clear all transcription history? This permanently deletes every saved session.",
      )
    ) {
      return;
    }
    await getClient().api.history.$delete();
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
  const draftKeys = capturedCombo ? comboDisplayKeys(capturedCombo) : liveKeys;
  const captureHint = needsModifierOrMouseButton
    ? "Add a modifier or side mouse button · Esc to cancel"
    : canSaveRecording
      ? "Release to save · Esc to cancel"
      : "Press a modifier or side mouse button... · Esc to cancel";

  const positionOptions = useMemo<SegmentOption[]>(() => {
    const opts: SegmentOption[] = [
      { id: "bottom-center", label: "Bottom · Center" },
      { id: "bottom-right", label: "Bottom · Right" },
      { id: "top-center", label: "Top · Center" },
      { id: "top-right", label: "Top · Right" },
    ];
    if (pillPosition === "custom") opts.push({ id: "custom", label: "Custom" });
    return opts;
  }, [pillPosition]);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="h-9 shrink-0" />
      <div
        className="responsive-page-scroll flex-1 overflow-auto"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div className="mb-7">
          <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
            <span className="serif-italic text-primary">Settings</span>
            <span>. </span>
          </h1>
        </div>

        {updateAvailable && (
          <div className="border-primary/30 bg-primary/5 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Download className="text-primary h-4 w-4" />
              <span className="min-w-0 text-sm">
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
                  setUpdateError(null);
                  window.api?.downloadUpdate();
                }}
                disabled={downloading}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
              >
                {downloading ? "Downloading..." : "Download"}
              </button>
            )}
            {updateError && (
              <span className="text-destructive w-full text-xs">
                {updateError}
              </span>
            )}
          </div>
        )}

        <Section label="Application">
          <Row
            label="Automatic updates"
            desc="Download new versions in the background as soon as they ship."
          >
            <Toggle on={autoUpdate} onChange={handleAutoUpdateToggle} />
          </Row>
          <Row
            label="Launch at startup"
            desc="Automatically start Freestyle when you log in to your computer."
          >
            <Toggle
              on={launchAtStartup}
              onChange={handleLaunchAtStartupToggle}
            />
          </Row>
          <Row
            label="Show dashboard on launch"
            desc="Open the dashboard window when Freestyle starts."
            last
          >
            <Toggle on={showOnLaunch} onChange={handleShowOnLaunchToggle} />
          </Row>
        </Section>

        <Section label="Recording">
          <Row
            label="Hotkey"
            desc={
              hotkeyMode === "toggle"
                ? "Press the shortcut once to start, press again to stop."
                : "Hold the shortcut to record, release to transcribe."
            }
          >
            {recorderState === "idle" ? (
              <div className="relative inline-flex">
                <button
                  type="button"
                  onClick={startHotkeyRecording}
                  className="border-border hover:bg-secondary inline-flex max-w-full flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2 transition-colors"
                >
                  <Keyboard className="text-muted-foreground h-4 w-4 shrink-0" />
                  <KeyComboDisplay keys={formatAcceleratorKeys(hotkey)} />
                  <span className="text-muted-foreground ml-1 text-xs">
                    Change
                  </span>
                </button>
                {invalidReleaseNotice && (
                  <div className="bg-popover text-popover-foreground border-border shadow-soft absolute top-[calc(100%+6px)] right-0 z-20 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs">
                    Hotkeys need a modifier or side mouse button
                  </div>
                )}
              </div>
            ) : (
              <div className="border-primary/60 bg-primary/5 relative inline-flex max-w-full flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2">
                <Keyboard className="text-primary h-4 w-4 shrink-0" />
                {draftKeys.length > 0 ? (
                  <>
                    <KeyComboDisplay keys={draftKeys} variant="dim" />
                    <span className="text-muted-foreground text-xs">
                      {captureHint}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground animate-pulse text-sm">
                    {captureHint}
                  </span>
                )}
                {invalidReleaseNotice && (
                  <div className="bg-popover text-popover-foreground border-border shadow-soft absolute top-[calc(100%+6px)] right-0 z-20 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs">
                    Hotkeys need a modifier or side mouse button
                  </div>
                )}
                <button
                  type="button"
                  onClick={cancelHotkeyRecording}
                  className="border-border hover:bg-secondary ml-1 rounded-md border px-2.5 py-1 text-xs"
                >
                  Cancel
                </button>
              </div>
            )}
          </Row>

          <Row
            label="Activation"
            desc={
              hotkeyMode === "toggle"
                ? "Press the shortcut once to start, again to stop."
                : "Push-to-talk while the shortcut is held."
            }
          >
            <div className="border-border bg-card inline-flex w-fit shrink-0 rounded-lg border p-0.5 text-sm">
              <button
                type="button"
                onClick={() => handleHotkeyModeChange("hold")}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  hotkeyMode === "hold"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Hold
              </button>
              <button
                type="button"
                onClick={() => handleHotkeyModeChange("toggle")}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  hotkeyMode === "toggle"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Toggle
              </button>
            </div>
          </Row>

          <Row label="Microphone" desc="Select your audio input device.">
            <div className="border-border bg-card text-foreground flex w-full max-w-md items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <Mic className="text-muted-foreground h-4 w-4 shrink-0" />
              <select
                id="settings-microphone"
                value={selectedDevice}
                onChange={(e) => handleDeviceChange(e.target.value)}
                className="w-full min-w-0 truncate bg-transparent pr-6 outline-none"
              >
                <option value="">System default</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </Row>

          <Row label="Language" desc="Hint for the transcription model.">
            <div className="border-border bg-card text-foreground flex w-full max-w-xs items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <Languages className="text-muted-foreground h-4 w-4 shrink-0" />
              <select
                id="settings-language"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="w-full min-w-0 truncate bg-transparent pr-6 outline-none"
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
          </Row>

          <Row
            label="Output mode"
            desc="Paste into the active app, or copy to clipboard."
          >
            <Segment
              compact
              options={[
                { id: "paste", label: "Paste into app" },
                { id: "clipboard", label: "Copy to clipboard" },
              ]}
              active={outputMode}
              onSelect={handleOutputModeChange}
            />
          </Row>

          <Row
            label="Transcription prompt"
            desc="List domain terms, names, or jargon to nudge the speech model toward better accuracy."
          >
            <input
              id="settings-transcription-prompt"
              type="text"
              value={transcriptionPrompt}
              onChange={(e) => setTranscriptionPrompt(e.target.value)}
              onBlur={() => {
                getClient()
                  .api.settings[":key"].$put({
                    param: { key: "transcription_prompt" },
                    json: { value: transcriptionPrompt },
                  })
                  .catch(() => {});
              }}
              placeholder="e.g. TypeScript, React, Kubernetes, JIRA…"
              className="border-border bg-card text-foreground w-full max-w-md rounded-lg border px-3 py-2 text-sm"
            />
          </Row>

          <Row
            label="Sound feedback"
            desc="Soft chimes at the start and end of recording."
            last
          >
            <div className="flex items-center gap-2.5">
              {soundEnabled ? (
                <Volume2 className="text-muted-foreground h-4 w-4 shrink-0" />
              ) : (
                <VolumeOff className="text-muted-foreground h-4 w-4 shrink-0" />
              )}
              <Toggle on={soundEnabled} onChange={handleSoundToggle} />
            </div>
          </Row>
        </Section>

        <Section label="Display">
          <Row label="Theme" desc="Light, dark, or follow your system.">
            <Segment
              options={themeOptions.map((o) => ({
                id: o.value,
                label: o.label,
                icon: o.icon,
              }))}
              active={theme ?? "system"}
              onSelect={handleThemeChange}
            />
          </Row>
          <Row
            label="Widget position"
            desc="Where the floating pill appears on your screen."
            last
          >
            <Segment
              compact
              options={positionOptions}
              active={pillPosition}
              onSelect={handlePillPositionChange}
            />
          </Row>
        </Section>

        <Section label="Permissions">
          <Row
            label="Microphone"
            desc="Required to capture audio for transcription."
          >
            <PermissionControl
              granted={micStatus === "granted"}
              checking={micStatus === "unknown"}
              actionLabel={
                micStatus === "denied" && canOpenMicSettings
                  ? "Open Settings"
                  : micStatus === "granted"
                    ? null
                    : "Allow"
              }
              external={micStatus === "denied" && canOpenMicSettings}
              onAction={
                micStatus === "denied" && canOpenMicSettings
                  ? openMicSettings
                  : requestMic
              }
              onManage={canOpenMicSettings ? openMicSettings : undefined}
            />
          </Row>
          <Row
            label="Accessibility"
            desc={
              isMac
                ? "Required to detect the global hotkey and paste into other apps. Toggle Freestyle on under System Settings › Privacy & Security › Accessibility."
                : "Required to detect the global hotkey and paste into other apps."
            }
            last
          >
            <PermissionControl
              granted={accessibilityStatus === true}
              checking={accessibilityStatus === null}
              actionLabel={
                accessibilityStatus === true
                  ? null
                  : isMac
                    ? "Open Settings"
                    : null
              }
              external={isMac}
              onAction={openAccessibility}
              onManage={isMac ? openAccessibility : undefined}
              note={
                !isMac && accessibilityStatus !== true
                  ? "Auto-granted"
                  : undefined
              }
            />
          </Row>
        </Section>

        <Section label="Data" tight>
          <Row
            label="Transcription history"
            desc="Permanently delete every saved session — this can't be undone."
            last
          >
            <button
              type="button"
              onClick={clearHistory}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear history
            </button>
          </Row>
        </Section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives — Section / Row pattern from r-settings.jsx GeneralP1
// ---------------------------------------------------------------------------

function Section({
  label,
  tight,
  children,
}: {
  label: string;
  tight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(tight ? "mt-7" : "mt-8")}>
      <h2 className="mono text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
        {label}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Row({
  label,
  desc,
  children,
  last,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start gap-3 py-[22px] min-[1080px]:grid-cols-[220px_minmax(0,1fr)] min-[1080px]:gap-8 min-[1280px]:grid-cols-[280px_minmax(0,1fr)] min-[1280px]:gap-9",
        !last && "border-border border-b",
      )}
    >
      <div>
        <div className="text-foreground text-[15px] font-medium">{label}</div>
        <p className="text-muted-foreground mt-0.5 text-[12.5px] leading-[1.5]">
          {desc}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable controls
// ---------------------------------------------------------------------------

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={cn(
        "relative h-[22px] w-10 shrink-0 rounded-full border transition-colors",
        on ? "bg-primary border-primary/80" : "bg-secondary border-border",
      )}
    >
      <span
        className={cn(
          "absolute top-[1px] block h-[18px] w-[18px] rounded-full transition-transform",
          on ? "bg-primary-foreground" : "bg-muted-foreground/70",
        )}
        style={{ transform: on ? "translateX(19px)" : "translateX(2px)" }}
      />
    </button>
  );
}

type SegmentOption = {
  id: string;
  label: string;
  icon?: typeof Mic;
};

function Segment({
  options,
  active,
  onSelect,
  compact,
}: {
  options: readonly SegmentOption[];
  active: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="border-border bg-secondary inline-flex max-w-full flex-nowrap gap-[2px] rounded-[9px] border p-[3px]">
      {options.map((o) => {
        const isOn = o.id === active;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md transition-colors",
              compact
                ? "px-2.5 py-[4px] text-[12px]"
                : "px-3 py-[6px] text-[12.5px]",
              isOn
                ? "bg-card border-border text-foreground border font-medium shadow-[0_1px_2px_rgba(20,12,4,0.04)]"
                : "text-muted-foreground hover:text-foreground border border-transparent",
            )}
          >
            {Icon && (
              <Icon
                className={cn(
                  "h-3.5 w-3.5",
                  isOn ? "text-primary" : "text-muted-foreground",
                )}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function PermissionControl({
  granted,
  checking,
  actionLabel,
  external,
  onAction,
  onManage,
  note,
}: {
  granted: boolean;
  checking: boolean;
  actionLabel: string | null;
  external?: boolean;
  onAction?: () => void;
  onManage?: () => void;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <StatusDot granted={granted} checking={checking} />
      {granted ? (
        <>
          <Check className="text-primary h-4 w-4" />
          {onManage && (
            <button
              type="button"
              onClick={onManage}
              className="border-border hover:bg-secondary inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
            >
              Manage
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </>
      ) : note ? (
        <span className="text-muted-foreground text-xs">{note}</span>
      ) : actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
        >
          {actionLabel}
          {external && <ExternalLink className="h-3 w-3" />}
        </button>
      ) : null}
    </div>
  );
}

function StatusDot({
  granted,
  checking,
}: {
  granted: boolean;
  checking: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase",
        granted
          ? "text-primary"
          : checking
            ? "text-muted-foreground"
            : "text-destructive",
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          granted
            ? "bg-primary"
            : checking
              ? "bg-muted-foreground/40"
              : "bg-destructive",
        )}
      />
      {granted ? "Granted" : checking ? "Checking" : "Needed"}
    </span>
  );
}
