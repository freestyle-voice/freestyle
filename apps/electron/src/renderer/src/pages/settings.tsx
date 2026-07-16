import {
  HISTORY_RETENTION_DAYS_MAX,
  type NetworkSettingsForm,
  networkSettingsFormSchema,
  parseRetentionDays,
  serverUrlSchema,
} from "@freestyle-voice/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { DragSpacer } from "@renderer/components/drag-spacer";
import { KeyComboDisplay } from "@renderer/components/key-combo";
import { LanguageSelector } from "@renderer/components/language-selector";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@renderer/components/ui/input-group";
import { RevealToggle } from "@renderer/components/ui/reveal-toggle";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { Switch } from "@renderer/components/ui/switch";
import {
  comboDisplayKeys,
  formatAcceleratorKeys,
  keyDisplayLabel,
  useHotkeyRecorder,
} from "@renderer/hooks/use-hotkey-recorder";
import {
  checkServerAuth,
  checkServerHealth,
  getClient,
  getLocalApiBase,
  refreshApiBase,
} from "@renderer/lib/api";
import { LANGUAGES } from "@renderer/lib/languages";
import { requestMicAccess, resolveMicStatus } from "@renderer/lib/permissions";
import { IS_LINUX, IS_MAC, IS_WINDOWS } from "@renderer/lib/platform";
import {
  CONFIG_QUERY_KEY,
  configQueryOptions,
  type FreestyleConfig,
  SETTINGS_QUERY_KEY,
  settingsQueryOptions,
} from "@renderer/lib/query";
import { cn } from "@renderer/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Download,
  ExternalLink,
  FlaskConical,
  FolderOpen,
  Info,
  Key,
  Keyboard,
  Languages,
  Mic,
  Monitor,
  Moon,
  Pause,
  Server,
  Sun,
  Trash2,
  Volume2,
  VolumeOff,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Controller,
  type ControllerRenderProps,
  useForm,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  type AudioPlaybackMode,
  normalizeAudioPlaybackMode,
} from "../../../shared/audio-playback";
import { getDefaultHotkey } from "../../../shared/hotkey-defaults";
import { SETTINGS_KEYS } from "../../../shared/settings-keys";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const audioPlaybackOptions = [
  { id: "off", label: "Off", icon: VolumeOff },
  { id: "duck", label: "Duck", icon: Volume2 },
  { id: "pause", label: "Pause", icon: Pause },
] as const;

const settingsSectionIds = [
  "recording",
  "application",
  "display",
  "permissions",
  "data",
  "network",
  "experimental",
] as const;

type SettingsSectionId = (typeof settingsSectionIds)[number];

function parseSettingsSection(hash: string): SettingsSectionId {
  const id = hash.replace(/^#/, "");
  return (settingsSectionIds as readonly string[]).includes(id)
    ? (id as SettingsSectionId)
    : "recording";
}

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
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [hotkey, setHotkey] = useState(
    window.api?.defaultHotkey ?? getDefaultHotkey(),
  );
  const [hotkeyMode, setHotkeyMode] = useState<"hold" | "toggle">("hold");
  const [language, setLanguage] = useState("auto");
  const [outputMode, setOutputMode] = useState("paste");
  const [pillPosition, setPillPosition] = useState("bottom-center");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [historyPaused, setHistoryPaused] = useState(false);
  const [historyRetention, setHistoryRetention] = useState<
    "never" | "7" | "30" | "custom"
  >("never");
  const [customRetentionDays, setCustomRetentionDays] = useState("90");
  const [audioPlaybackMode, setAudioPlaybackMode] =
    useState<AudioPlaybackMode>("off");
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [showOnLaunch, setShowOnLaunch] = useState(true);
  const [streamingAudio, setStreamingAudio] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() =>
    parseSettingsSection(window.location.hash),
  );
  // Radix SelectItem cannot use an empty-string value, so the "system default"
  // microphone (stored as "") is represented by this sentinel at the Select
  // boundary only. Use an unlikely string to avoid colliding with a real
  // deviceId of "default".
  const SYSTEM_DEFAULT_MIC = "__system_default_mic__";
  const microphoneOptions = useMemo(
    () => [
      { value: "", label: t("settings.recording.microphoneDefault") },
      ...devices.map((d) => ({ value: d.deviceId, label: d.label })),
    ],
    [devices, t],
  );

  const languageOptions = useMemo(
    () => [
      {
        value: "auto",
        label:
          t("settings.recording.transcriptionLanguages.auto") || "Auto-detect",
      },
      ...LANGUAGES.map((l) => ({
        value: l.id,
        label:
          t(`settings.recording.transcriptionLanguages.${l.id}`) || l.label,
      })),
    ],
    [t],
  );

  const retentionOptions = useMemo(
    () => [
      { value: "never", label: t("settings.data.autoDeleteNever") },
      { value: "7", label: t("settings.data.autoDelete7") },
      { value: "30", label: t("settings.data.autoDelete30") },
      { value: "custom", label: t("settings.data.autoDeleteCustom") },
    ],
    [t],
  );

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
  const isMac = IS_MAC;
  const isLinux = IS_LINUX;
  const isWindows = IS_WINDOWS;
  const supportsBackgroundAudio = isMac || isLinux || isWindows;
  // macOS and Windows can deep-link to the OS mic privacy settings.
  const canOpenMicSettings = isMac || isWindows;

  const selectSection = useCallback((id: SettingsSectionId) => {
    setActiveSection(id);
    const nextHash = `#${id}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setActiveSection(parseSettingsSection(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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
        param: { key: SETTINGS_KEYS.hotkeyMode },
        json: { value: mode },
      })
      .catch(() => {});
  }, []);

  const handleHotkeyRecorded = useCallback((accelerator: string) => {
    setHotkey(accelerator);
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
    invalidReleaseNotice,
    startRecording: startHotkeyRecording,
    cancelRecording: cancelHotkeyRecording,
  } = useHotkeyRecorder(handleHotkeyRecorded);

  const queryClient = useQueryClient();

  // All persisted settings in one request (replaces ~10 individual GETs).
  const settingsQuery = useQuery(settingsQueryOptions());

  // Seed local form state from the batch once it first resolves. Handlers
  // persist changes directly, so we only seed once (guarded) to avoid
  // clobbering edits if the query is later invalidated.
  const settingsSeeded = useRef(false);
  useEffect(() => {
    const s = settingsQuery.data;
    if (!s || settingsSeeded.current) return;
    settingsSeeded.current = true;

    if (s[SETTINGS_KEYS.micDeviceId])
      setSelectedDevice(s[SETTINGS_KEYS.micDeviceId]);
    if (s[SETTINGS_KEYS.hotkey]) setHotkey(s[SETTINGS_KEYS.hotkey]);
    if (s[SETTINGS_KEYS.hotkeyMode] === "toggle") setHotkeyMode("toggle");
    if (s[SETTINGS_KEYS.language]) setLanguage(s[SETTINGS_KEYS.language]);
    if (s[SETTINGS_KEYS.outputMode]) setOutputMode(s[SETTINGS_KEYS.outputMode]);
    if (s[SETTINGS_KEYS.soundEnabled] === "false") setSoundEnabled(false);
    if (s[SETTINGS_KEYS.historyPaused] === "true") setHistoryPaused(true);

    const retentionDays = parseRetentionDays(
      s[SETTINGS_KEYS.historyRetentionDays],
    );
    if (retentionDays !== null) {
      if (retentionDays === 7 || retentionDays === 30) {
        setHistoryRetention(String(retentionDays) as "7" | "30");
      } else {
        setHistoryRetention("custom");
        setCustomRetentionDays(String(retentionDays));
      }
    }

    // Audio playback mode with legacy fallback chain (new key → paused → duck).
    if (s.audio_playback_mode) {
      setAudioPlaybackMode(normalizeAudioPlaybackMode(s.audio_playback_mode));
    } else if (s.pause_playback_while_recording === "true") {
      setAudioPlaybackMode("pause");
    } else if (s.audio_ducking_enabled === "true") {
      setAudioPlaybackMode("duck");
    }
  }, [settingsQuery.data]);

  // Experimental flags from config.freestyle.json, cached alongside the rest of
  // the settings page rather than re-fetched on every visit.
  const configQuery = useQuery(configQueryOptions());
  useEffect(() => {
    if (configQuery.data) {
      setStreamingAudio(configQuery.data.flags.streaming_audio === true);
    }
  }, [configQuery.data]);

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

  // Load window/IPC-backed settings and subscribe to auto-updater events.
  // (Server-persisted settings are seeded from the batch query above.)
  useEffect(() => {
    window.api
      ?.getPillPosition()
      .then((pos) => setPillPosition(normalizePillPos(pos)))
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
        param: { key: SETTINGS_KEYS.micDeviceId },
        json: { value: deviceId },
      })
      .catch(() => {});
  }, []);

  const handleThemeChange = useCallback(
    (value: string) => {
      setTheme(value);
      getClient()
        .api.settings[":key"].$put({
          param: { key: SETTINGS_KEYS.theme },
          json: { value },
        })
        .catch(() => {});
    },
    [setTheme],
  );

  const handleLanguageChange = useCallback((value: string) => {
    setLanguage(value);
    getClient()
      .api.settings[":key"].$put({
        param: { key: SETTINGS_KEYS.language },
        json: { value },
      })
      .catch(() => {});
  }, []);

  const handleOutputModeChange = useCallback((value: string) => {
    setOutputMode(value);
    window.api?.sendOutputModeChanged(value);
    getClient()
      .api.settings[":key"].$put({
        param: { key: SETTINGS_KEYS.outputMode },
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
    if (!confirm(t("settings.data.clearHistoryConfirm"))) {
      return;
    }
    await getClient().api.history.$delete();
    void queryClient.invalidateQueries({ queryKey: ["history"] });
    void queryClient.invalidateQueries({ queryKey: ["today-history"] });
  }, [t, queryClient]);

  const handleSoundToggle = useCallback((enabled: boolean) => {
    setSoundEnabled(enabled);
    getClient()
      .api.settings[":key"].$put({
        param: { key: SETTINGS_KEYS.soundEnabled },
        json: { value: String(enabled) },
      })
      .catch(() => {});
  }, []);

  const handleHistoryPausedToggle = useCallback((paused: boolean) => {
    setHistoryPaused(paused);
    getClient()
      .api.settings[":key"].$put({
        param: { key: SETTINGS_KEYS.historyPaused },
        json: { value: String(paused) },
      })
      .catch(() => {});
  }, []);

  const saveHistoryRetention = useCallback((days: string) => {
    getClient()
      .api.settings[":key"].$put({
        param: { key: SETTINGS_KEYS.historyRetentionDays },
        json: { value: days },
      })
      .catch(() => {});
  }, []);

  const handleHistoryRetentionChange = useCallback(
    (value: string) => {
      const preset = value as "never" | "7" | "30" | "custom";
      setHistoryRetention(preset);
      if (preset === "never") {
        saveHistoryRetention("");
      } else if (preset === "custom") {
        if (parseRetentionDays(customRetentionDays) !== null) {
          saveHistoryRetention(customRetentionDays);
        }
      } else {
        saveHistoryRetention(preset);
      }
    },
    [customRetentionDays, saveHistoryRetention],
  );

  const handleCustomRetentionDaysChange = useCallback(
    (raw: string) => {
      const digits = raw.replace(/\D/g, "").slice(0, 4);
      const clamped =
        digits === ""
          ? ""
          : String(Math.min(Number(digits), HISTORY_RETENTION_DAYS_MAX));
      setCustomRetentionDays(clamped);
      if (parseRetentionDays(clamped) !== null) {
        saveHistoryRetention(clamped);
      }
    },
    [saveHistoryRetention],
  );

  const handleStreamingAudioToggle = useCallback(
    (enabled: boolean) => {
      setStreamingAudio(enabled);
      window.api?.sendStreamingAudioChanged(enabled);
      getClient()
        .api.config.flags[":key"].$put({
          param: { key: "streaming_audio" },
          json: { value: enabled },
        })
        .then(() => {
          queryClient.setQueryData<FreestyleConfig>(CONFIG_QUERY_KEY, (prev) =>
            prev
              ? { ...prev, flags: { ...prev.flags, streaming_audio: enabled } }
              : prev,
          );
        })
        .catch(() => {});
    },
    [queryClient],
  );

  const handleAudioPlaybackModeChange = useCallback((value: string) => {
    const mode = normalizeAudioPlaybackMode(value);
    setAudioPlaybackMode(mode);
    window.api?.sendAudioPlaybackModeChanged(mode);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "audio_playback_mode" },
        json: { value: mode },
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$put({
        param: { key: "audio_ducking_enabled" },
        json: { value: String(mode === "duck") },
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

  const activeSectionLabel = t(`settings.sections.${activeSection}`);

  const positionOptions = useMemo<SegmentOption[]>(() => {
    const opts: SegmentOption[] = [
      { id: "top-center", label: t("settings.display.positionTopCenter") },
      { id: "top-right", label: t("settings.display.positionTopRight") },
      {
        id: "bottom-center",
        label: t("settings.display.positionBottomCenter"),
      },
      { id: "bottom-right", label: t("settings.display.positionBottomRight") },
    ];
    if (pillPosition === "custom")
      opts.push({ id: "custom", label: t("settings.display.positionCustom") });
    return opts;
  }, [pillPosition, t]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DragSpacer />
      <div className="responsive-page-scroll grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-x-10 gap-y-6 !pb-0 min-[900px]:grid-cols-[180px_minmax(0,1fr)]">
        <div className="min-[900px]:col-span-2">
          <div className="mb-7">
            <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
              <span className="serif-italic text-primary">
                {t("settings.title")}
              </span>
              <span>. </span>
            </h1>
          </div>

          {updateAvailable && (
            <div className="border-primary/30 bg-primary/5 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Download className="text-primary h-4 w-4" />
                <span className="min-w-0 text-sm">
                  {updateDownloaded
                    ? t("settings.updateReady", { version: updateAvailable })
                    : t("settings.updateAvailable", {
                        version: updateAvailable,
                      })}
                </span>
              </div>
              {updateDownloaded ? (
                <button
                  type="button"
                  onClick={() => window.api?.installUpdate()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium"
                >
                  {t("common.restartAndUpdate")}
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
                  {downloading ? t("common.downloading") : t("common.download")}
                </button>
              )}
              {updateError && (
                <span className="text-destructive w-full text-xs">
                  {updateError}
                </span>
              )}
            </div>
          )}
        </div>

        <SettingsSidebar active={activeSection} onSelect={selectSection} />

        <div className="min-h-0 overflow-y-auto px-1 -mx-1">
          <h2 className="text-foreground mb-6 text-[22px] font-medium tracking-[-0.02em]">
            {activeSectionLabel}
          </h2>

          {activeSection === "application" && (
            <SettingsPanel>
              <Row
                label={t("settings.interfaceLanguage.label")}
                desc={t("settings.interfaceLanguage.desc")}
              >
                <LanguageSelector />
              </Row>
              <Row
                label={t("settings.application.autoUpdate")}
                desc={t("settings.application.autoUpdateDesc")}
              >
                <Switch
                  checked={autoUpdate}
                  onCheckedChange={handleAutoUpdateToggle}
                />
              </Row>
              <Row
                label={t("settings.application.launchAtStartup")}
                desc={t("settings.application.launchAtStartupDesc")}
              >
                <Switch
                  checked={launchAtStartup}
                  onCheckedChange={handleLaunchAtStartupToggle}
                />
              </Row>
              <Row
                label={t("settings.application.showOnLaunch")}
                desc={t("settings.application.showOnLaunchDesc")}
                last
              >
                <Switch
                  checked={showOnLaunch}
                  onCheckedChange={handleShowOnLaunchToggle}
                />
              </Row>
            </SettingsPanel>
          )}

          {activeSection === "recording" && (
            <SettingsPanel>
              <Row
                label={t("settings.recording.hotkey")}
                desc={
                  hotkeyMode === "toggle"
                    ? t("settings.recording.hotkeyDescToggle")
                    : t("settings.recording.hotkeyDescHold")
                }
              >
                {recorderState === "idle" ? (
                  <div className="relative inline-flex">
                    <Button
                      variant="outline"
                      onClick={startHotkeyRecording}
                      className="h-auto max-w-full flex-wrap gap-3 px-3.5 py-2"
                    >
                      <Keyboard className="text-muted-foreground size-4 shrink-0" />
                      <KeyComboDisplay keys={formatAcceleratorKeys(hotkey)} />
                      <span className="text-muted-foreground ml-1 text-xs">
                        {t("common.change")}
                      </span>
                    </Button>
                    {invalidReleaseNotice && (
                      <div className="bg-popover text-popover-foreground border-border shadow-soft absolute top-[calc(100%+6px)] right-0 z-20 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs">
                        {t("settings.recording.needsModifier")}
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
                        {t("settings.recording.needsModifier")}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelHotkeyRecording}
                      className="ml-1"
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                )}
              </Row>

              <Row
                label={t("settings.recording.activation")}
                desc={
                  hotkeyMode === "toggle"
                    ? t("settings.recording.activationDescToggle")
                    : t("settings.recording.activationDescHold")
                }
              >
                <SegmentedControl
                  value={hotkeyMode}
                  onValueChange={(v) =>
                    handleHotkeyModeChange(v as "hold" | "toggle")
                  }
                  options={[
                    {
                      value: "hold",
                      label: t("settings.recording.activationHold"),
                    },
                    {
                      value: "toggle",
                      label: t("settings.recording.activationToggle"),
                    },
                  ]}
                />
              </Row>

              <Row
                label={t("settings.recording.microphone")}
                desc={t("settings.recording.microphoneDesc")}
              >
                <Select
                  value={
                    selectedDevice === "" ? SYSTEM_DEFAULT_MIC : selectedDevice
                  }
                  onValueChange={(v) =>
                    handleDeviceChange(v === SYSTEM_DEFAULT_MIC ? "" : v)
                  }
                >
                  <SelectTrigger
                    id="settings-microphone"
                    className="w-full max-w-md"
                  >
                    <Mic className="text-muted-foreground size-4 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {microphoneOptions.map((o) => (
                      <SelectItem
                        key={o.value}
                        value={o.value === "" ? SYSTEM_DEFAULT_MIC : o.value}
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>

              <Row
                label={t("settings.recording.language")}
                desc={t("settings.recording.languageDesc")}
              >
                <Select value={language} onValueChange={handleLanguageChange}>
                  <SelectTrigger
                    id="settings-language"
                    className="w-full max-w-md"
                  >
                    <Languages className="text-muted-foreground size-4 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languageOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>

              <Row
                label={t("settings.recording.outputMode")}
                desc={t("settings.recording.outputModeDesc")}
              >
                <Segment
                  compact
                  options={[
                    {
                      id: "paste",
                      label: t("settings.recording.outputModePaste"),
                    },
                    {
                      id: "clipboard",
                      label: t("settings.recording.outputModeClipboard"),
                    },
                  ]}
                  active={outputMode}
                  onSelect={handleOutputModeChange}
                />
              </Row>

              <Row
                last={!supportsBackgroundAudio}
                label={t("settings.recording.sound")}
                desc={t("settings.recording.soundDesc")}
              >
                <div className="flex items-center gap-2.5">
                  {soundEnabled ? (
                    <Volume2 className="text-muted-foreground h-4 w-4 shrink-0" />
                  ) : (
                    <VolumeOff className="text-muted-foreground h-4 w-4 shrink-0" />
                  )}
                  <Switch
                    checked={soundEnabled}
                    onCheckedChange={handleSoundToggle}
                  />
                </div>
              </Row>

              {supportsBackgroundAudio ? (
                <Row
                  label="Background audio"
                  desc={
                    isLinux
                      ? "Duck lowers system volume. Pause pauses MPRIS media and lowers volume."
                      : "Duck lowers volume. Pause pauses current media and lowers volume."
                  }
                  last
                >
                  <Segment
                    compact
                    options={audioPlaybackOptions}
                    active={audioPlaybackMode}
                    onSelect={handleAudioPlaybackModeChange}
                  />
                </Row>
              ) : null}
            </SettingsPanel>
          )}

          {activeSection === "display" && (
            <SettingsPanel>
              <Row
                label={t("settings.display.theme")}
                desc={t("settings.display.themeDesc")}
              >
                <Segment
                  options={themeOptions.map((o) => ({
                    id: o.value,
                    label: t(
                      `settings.display.theme${o.value.charAt(0).toUpperCase()}${o.value.slice(1)}`,
                    ),
                    icon: o.icon,
                  }))}
                  active={theme ?? "system"}
                  onSelect={handleThemeChange}
                />
              </Row>
              <Row
                label={t("settings.display.widgetPosition")}
                desc={t("settings.display.widgetPositionDesc")}
                last
              >
                <Segment
                  compact
                  wrap
                  options={positionOptions}
                  active={pillPosition}
                  onSelect={handlePillPositionChange}
                />
              </Row>
            </SettingsPanel>
          )}

          {activeSection === "permissions" && (
            <SettingsPanel>
              <Row
                label={t("settings.permissions.microphone")}
                desc={t("settings.permissions.microphoneDesc")}
              >
                <PermissionControl
                  granted={micStatus === "granted"}
                  checking={micStatus === "unknown"}
                  actionLabel={
                    micStatus === "denied" && canOpenMicSettings
                      ? t("common.openSettings")
                      : micStatus === "granted"
                        ? null
                        : t("common.allow")
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
                label={t("settings.permissions.accessibility")}
                desc={
                  isMac
                    ? t("settings.permissions.accessibilityDescMac")
                    : t("settings.permissions.accessibilityDescOther")
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
                        ? t("common.openSettings")
                        : null
                  }
                  external={isMac}
                  onAction={openAccessibility}
                  onManage={isMac ? openAccessibility : undefined}
                  note={
                    !isMac && accessibilityStatus !== true
                      ? t("settings.permissions.autoGranted")
                      : undefined
                  }
                />
              </Row>
            </SettingsPanel>
          )}
          {activeSection === "data" && (
            <SettingsPanel>
              <Row
                label={t("settings.data.pauseHistory")}
                desc={t("settings.data.pauseHistoryDesc")}
              >
                <Switch
                  checked={historyPaused}
                  onCheckedChange={handleHistoryPausedToggle}
                />
              </Row>
              <Row
                label={t("settings.data.autoDelete")}
                desc={t("settings.data.autoDeleteDesc")}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Select
                    value={historyRetention}
                    onValueChange={handleHistoryRetentionChange}
                  >
                    <SelectTrigger
                      id="settings-history-retention"
                      className="w-36"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {retentionOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {historyRetention === "custom" && (
                    <>
                      <Input
                        inputMode="numeric"
                        value={customRetentionDays}
                        onChange={(e) =>
                          handleCustomRetentionDaysChange(e.target.value)
                        }
                        className="w-16 text-center"
                        aria-label={t("settings.data.autoDeleteDays")}
                      />
                      <span className="text-muted-foreground text-xs">
                        {t("settings.data.autoDeleteDays")}
                      </span>
                    </>
                  )}
                </div>
              </Row>
              <Row
                label={t("settings.data.history")}
                desc={t("settings.data.historyDesc")}
              >
                <Button variant="destructive" size="sm" onClick={clearHistory}>
                  <Trash2 data-icon="inline-start" />
                  {t("settings.data.clearHistory")}
                </Button>
              </Row>
              <Row
                label={t("settings.data.logs")}
                desc={t("settings.data.logsDesc")}
                last
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void window.api.openLogsFolder();
                  }}
                >
                  <FolderOpen data-icon="inline-start" />
                  {t("settings.data.openLogs")}
                </Button>
              </Row>
            </SettingsPanel>
          )}

          {activeSection === "network" && <NetworkPanel />}

          {activeSection === "experimental" && (
            <SettingsPanel>
              <div className="border-border bg-secondary/40 text-muted-foreground mb-4 flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[12px] leading-[1.55]">
                <FlaskConical className="mt-px h-3.5 w-3.5 shrink-0 opacity-70" />
                <span>
                  These features are experimental and may change or be removed
                  in future releases. Enable them to try new capabilities early.
                </span>
              </div>
              <Row
                label="Streaming audio"
                desc="Stream audio in real-time for lower-latency dictation. Supported by Freestyle Transcribe, OpenAI, Deepgram, ElevenLabs, and Soniox."
                last
              >
                <Switch
                  checked={streamingAudio}
                  onCheckedChange={handleStreamingAudioToggle}
                />
              </Row>
            </SettingsPanel>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives — Section / Row pattern from r-settings.jsx GeneralP1
// ---------------------------------------------------------------------------

function SettingsSidebar({
  active,
  onSelect,
}: {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <nav className="border-border flex h-full min-h-0 shrink-0 gap-1 overflow-x-auto pb-1 min-[900px]:flex-col min-[900px]:overflow-visible min-[900px]:border-r min-[900px]:pr-4 min-[900px]:pb-0">
      {settingsSectionIds.map((id) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={cn(
              "shrink-0 rounded-[7px] border px-2.5 py-1.5 text-left text-[13px] transition-colors min-[900px]:w-full",
              isActive
                ? "border-border bg-card text-foreground font-medium"
                : "text-secondary-foreground/80 hover:bg-card/50 border-transparent font-normal",
            )}
          >
            {t(`settings.sections.${id}`)}
          </button>
        );
      })}
    </nav>
  );
}

function SettingsPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

function Row({
  label,
  desc,
  children,
  last,
  stacked,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
  last?: boolean;
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start gap-3 py-[22px] min-[1080px]:grid-cols-[220px_minmax(0,1fr)] min-[1080px]:gap-8 min-[1280px]:grid-cols-[280px_minmax(0,1fr)] min-[1280px]:gap-9",
        stacked &&
          "min-[1080px]:grid-cols-1 min-[1080px]:gap-4 min-[1280px]:grid-cols-1 min-[1280px]:gap-4",
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
// Network — enterprise proxy / custom CA configuration
// ---------------------------------------------------------------------------

/** Load a single string setting from the server ("" when unset/unreachable). */
function NetworkPanel(): React.JSX.Element {
  const { t } = useTranslation();
  // Single source of truth: the same zod schema the server enforces per-key,
  // so inline validation here matches exactly what the API will accept.
  const queryClient = useQueryClient();
  const {
    control,
    reset,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<NetworkSettingsForm>({
    resolver: zodResolver(networkSettingsFormSchema),
    defaultValues: { proxyUrl: "", caCertPath: "" },
    mode: "onBlur",
  });
  const [savedField, setSavedField] = useState<
    keyof NetworkSettingsForm | null
  >(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the last value that was actually persisted so we skip redundant saves
  // (and the "Saved" flash) when the user blurs without changing anything.
  const lastCommitted = useRef<NetworkSettingsForm>({
    proxyUrl: "",
    caCertPath: "",
  });

  // Hydrate from the shared settings cache (deduped with every other
  // ["settings-all"] consumer) instead of two dedicated single-key GETs.
  const { data: settings } = useQuery(settingsQueryOptions());

  // Seed the form once, when the settings first resolve. react-hook-form then
  // owns the state; later cache changes don't re-seed (mutations patch the
  // cache in place below, keeping it consistent without clobbering edits).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!settings || seededRef.current) return;
    seededRef.current = true;
    const proxyUrl = settings[SETTINGS_KEYS.networkProxyUrl] ?? "";
    const caCertPath = settings[SETTINGS_KEYS.networkCaCertPath] ?? "";
    reset({ proxyUrl, caCertPath });
    lastCommitted.current = { proxyUrl, caCertPath };
  }, [settings, reset]);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const flashSaved = useCallback((field: keyof NetworkSettingsForm) => {
    setSavedField(field);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedField(null), 1500);
  }, []);

  // Persist on blur — only when the value actually changed and passes the
  // shared schema, so we never send redundant or invalid requests.
  const persistField = useCallback(
    async (field: keyof NetworkSettingsForm, key: string) => {
      const value = getValues(field).trim();
      if (value === lastCommitted.current[field]) return;

      const valid = await trigger(field);
      if (!valid) return;
      try {
        const res = await getClient().api.settings[":key"].$put({
          param: { key },
          json: { value },
        });
        if (res.ok) {
          lastCommitted.current[field] = value;
          // Keep the shared settings cache truthful without a refetch.
          queryClient.setQueryData<Record<string, string>>(
            SETTINGS_QUERY_KEY,
            (prev) => ({ ...(prev ?? {}), [key]: value }),
          );
          flashSaved(field);
        }
      } catch {
        // Network/API errors surface via the field's onChange retry; swallow.
      }
    },
    [trigger, getValues, flashSaved, queryClient],
  );

  return (
    <SettingsPanel>
      <p className="text-muted-foreground border-border border-b pb-5 text-[13px] leading-[1.6]">
        {t("settings.network.intro")}
      </p>
      <Row
        label={t("settings.network.proxy")}
        desc={t("settings.network.proxyDesc")}
        stacked
      >
        <Controller
          control={control}
          name="proxyUrl"
          render={({ field }) => (
            <NetworkField
              id="settings-network-proxy"
              field={field}
              placeholder={t("settings.network.proxyPlaceholder")}
              error={
                errors.proxyUrl ? t("settings.network.invalidProxy") : undefined
              }
              saved={savedField === "proxyUrl"}
              savedLabel={t("settings.network.saved")}
              onCommit={() =>
                persistField("proxyUrl", SETTINGS_KEYS.networkProxyUrl)
              }
            />
          )}
        />
      </Row>
      <Row
        label={t("settings.network.caCert")}
        desc={t("settings.network.caCertDesc")}
        stacked
        last
      >
        <Controller
          control={control}
          name="caCertPath"
          render={({ field }) => (
            <NetworkField
              id="settings-network-ca-cert"
              field={field}
              placeholder={t("settings.network.caCertPlaceholder")}
              error={
                errors.caCertPath
                  ? t("settings.network.invalidCaCert")
                  : undefined
              }
              saved={savedField === "caCertPath"}
              savedLabel={t("settings.network.saved")}
              onCommit={() =>
                persistField("caCertPath", SETTINGS_KEYS.networkCaCertPath)
              }
            />
          )}
        />
      </Row>
      <div className="border-border bg-secondary/40 text-muted-foreground mt-1 mb-4 flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[12px] leading-[1.55]">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 opacity-70" />
        <span>{t("settings.network.envNote")}</span>
      </div>
      <Row
        label={t("settings.network.server")}
        desc={t("settings.network.serverDesc")}
        stacked
        last
      >
        <ServerConnection />
      </Row>
    </SettingsPanel>
  );
}

/**
 * A single Network text setting: input + inline validation + a transient
 * "Saved" confirmation. Kept local so both rows share the exact same behavior.
 */
function NetworkField({
  id,
  field,
  placeholder,
  error,
  saved,
  savedLabel,
  onCommit,
}: {
  id: string;
  field: ControllerRenderProps<NetworkSettingsForm, keyof NetworkSettingsForm>;
  placeholder: string;
  error?: string;
  saved: boolean;
  savedLabel: string;
  onCommit: () => void;
}): React.JSX.Element {
  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <Input
        id={id}
        type="text"
        spellCheck={false}
        autoComplete="off"
        name={field.name}
        ref={field.ref}
        value={field.value}
        onChange={field.onChange}
        onBlur={() => {
          field.onBlur();
          onCommit();
        }}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
      />
      <div className="flex min-h-[16px] items-center">
        {error ? (
          <span className="text-destructive text-xs">{error}</span>
        ) : saved ? (
          <span className="text-primary inline-flex items-center gap-1 text-xs">
            <Check className="h-3 w-3" />
            {savedLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

type ServerTestState =
  | "idle"
  | "testing"
  | "ok"
  | "unreachable"
  | "unauthorized";

/**
 * Connect the desktop app to a self-hosted Freestyle server (or the built-in
 * local one). The URL/token live in the app's local settings.json (client-side
 * config — they can't live on the server they point at), read/written via IPC.
 *
 * Saving takes effect immediately without an app restart: this window re-points
 * its API client and refetches, and the main process broadcasts the change to
 * the pill window (which re-points on its next recording).
 */
function ServerConnection(): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [serverUrlInput, setServerUrlInput] = useState("");
  const [savedServerUrl, setSavedServerUrl] = useState("");
  const [serverTokenInput, setServerTokenInput] = useState("");
  const [savedServerToken, setSavedServerToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [serverUrlError, setServerUrlError] = useState<string | null>(null);
  const [serverTest, setServerTest] = useState<ServerTestState>("idle");

  useEffect(() => {
    window.api
      ?.getServerUrl()
      .then((url) => {
        setSavedServerUrl(url);
        setServerUrlInput(url);
      })
      .catch(() => {});
    window.api
      ?.getServerToken()
      .then((token) => {
        setSavedServerToken(token);
        setServerTokenInput(token);
      })
      .catch(() => {});
  }, []);

  const testServer = useCallback(async (rawUrl: string, token: string) => {
    const parsed = serverUrlSchema.safeParse(rawUrl);
    if (!parsed.success) {
      setServerUrlError(parsed.error.issues[0].message);
      setServerTest("idle");
      return;
    }
    const base = parsed.data || getLocalApiBase();
    setServerTest("testing");
    if (!(await checkServerHealth(base, 5000))) {
      setServerTest("unreachable");
      return;
    }
    // Always probe an authenticated endpoint so we catch both a wrong token and
    // a server that requires a token when none was entered.
    if (!(await checkServerAuth(base, token.trim(), 5000))) {
      setServerTest("unauthorized");
      return;
    }
    setServerTest("ok");
  }, []);

  // Persist the new target, re-point this window's client, and refetch every
  // query against the new server — all without an app restart. The main process
  // broadcasts "server:changed" so the pill window re-points too.
  const applyServerTarget = useCallback(
    async (url: string, token: string) => {
      const savedUrl = (await window.api?.setServerUrl(url)) ?? url;
      const savedToken =
        (await window.api?.setServerToken(token)) ?? token.trim();
      setSavedServerUrl(savedUrl);
      setServerUrlInput(savedUrl);
      setSavedServerToken(savedToken);
      setServerTokenInput(savedToken);
      await refreshApiBase();
      await queryClient.invalidateQueries();
      return { savedUrl, savedToken };
    },
    [queryClient],
  );

  const handleSaveServer = useCallback(async () => {
    const parsed = serverUrlSchema.safeParse(serverUrlInput);
    if (!parsed.success) {
      setServerUrlError(parsed.error.issues[0].message);
      return;
    }
    setServerUrlError(null);
    const { savedUrl, savedToken } = await applyServerTarget(
      parsed.data,
      serverTokenInput,
    );
    await testServer(savedUrl, savedToken);
  }, [serverUrlInput, serverTokenInput, applyServerTarget, testServer]);

  const handleResetServer = useCallback(async () => {
    await applyServerTarget("", "");
    setServerUrlError(null);
    setServerTest("idle");
  }, [applyServerTarget]);

  const urlChanged = serverUrlInput.trim() !== savedServerUrl.trim();
  const tokenChanged = serverTokenInput.trim() !== savedServerToken.trim();
  const canReset =
    !!savedServerUrl ||
    !!savedServerToken ||
    !!serverUrlInput.trim() ||
    !!serverTokenInput.trim();
  const usingLocal = !savedServerUrl;

  return (
    <div className="border-border bg-card w-full max-w-md rounded-[14px] border p-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.14em]",
              usingLocal
                ? "bg-accent text-accent-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                usingLocal ? "bg-primary" : "bg-muted-foreground",
              )}
            />
            {usingLocal
              ? t("settings.network.localServer")
              : t("settings.network.remoteServer")}
          </span>
          {savedServerUrl && (
            <span className="text-muted-foreground min-w-0 truncate text-[12px]">
              {savedServerUrl}
            </span>
          )}
        </div>
        <ServerConnectionStatus state={serverTest} />
      </div>

      <div className="space-y-2.5">
        <InputGroup>
          <InputGroupInput
            id="settings-server-url"
            type="text"
            value={serverUrlInput}
            aria-invalid={!!serverUrlError}
            onChange={(e) => {
              setServerUrlInput(e.target.value);
              setServerTest("idle");
              setServerUrlError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveServer();
            }}
            placeholder="http://127.0.0.1:4649"
          />
          <InputGroupAddon>
            <Server />
          </InputGroupAddon>
        </InputGroup>

        <InputGroup className={cn(!serverUrlInput.trim() && "opacity-60")}>
          <InputGroupInput
            id="settings-server-token"
            type={showToken ? "text" : "password"}
            value={serverTokenInput}
            onChange={(e) => {
              setServerTokenInput(e.target.value);
              setServerTest("idle");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveServer();
            }}
            placeholder={t("settings.network.serverTokenPlaceholder")}
          />
          <InputGroupAddon>
            <Key />
          </InputGroupAddon>
          {serverTokenInput && (
            <RevealToggle
              revealed={showToken}
              onToggle={() => setShowToken((v) => !v)}
              label="token"
            />
          )}
        </InputGroup>

        {serverUrlError && (
          <p className="text-destructive text-[12px]">{serverUrlError}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="ink"
            size="sm"
            onClick={handleSaveServer}
            disabled={!urlChanged && !tokenChanged}
          >
            {t("common.save")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => testServer(serverUrlInput, serverTokenInput)}
            disabled={serverTest === "testing"}
          >
            {t("settings.network.testConnection")}
          </Button>
          {canReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetServer}
              className="text-muted-foreground"
            >
              {t("settings.network.resetToLocal")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ServerConnectionStatus({
  state,
}: {
  state: ServerTestState;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (state === "idle") return null;
  const map: Record<
    Exclude<ServerTestState, "idle">,
    { label: string; className: string }
  > = {
    testing: {
      label: t("settings.network.statusTesting"),
      className: "text-muted-foreground",
    },
    ok: { label: t("settings.network.statusOk"), className: "text-primary" },
    unreachable: {
      label: t("settings.network.statusUnreachable"),
      className: "text-destructive",
    },
    unauthorized: {
      label: t("settings.network.statusUnauthorized"),
      className: "text-destructive",
    },
  };
  const { label, className } = map[state];
  return <span className={cn("text-[11.5px]", className)}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Reusable controls
// ---------------------------------------------------------------------------

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
  wrap,
}: {
  options: readonly SegmentOption[];
  active: string;
  onSelect: (id: string) => void;
  compact?: boolean;
  wrap?: boolean;
}) {
  return (
    <SegmentedControl
      options={options.map((o) => ({
        value: o.id,
        label: o.label,
        icon: o.icon,
      }))}
      value={active}
      onValueChange={onSelect}
      size={compact ? "sm" : "default"}
      wrap={wrap}
    />
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
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <StatusDot granted={granted} checking={checking} />
      {granted ? (
        <>
          <Check className="text-primary h-4 w-4" />
          {onManage && (
            <Button variant="outline" size="sm" onClick={onManage}>
              {t("common.manage")}
              <ExternalLink data-icon="inline-end" />
            </Button>
          )}
        </>
      ) : note ? (
        <span className="text-muted-foreground text-xs">{note}</span>
      ) : actionLabel && onAction ? (
        <Button variant="ink" size="sm" onClick={onAction}>
          {actionLabel}
          {external && <ExternalLink data-icon="inline-end" />}
        </Button>
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
  const { t } = useTranslation();

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
      {granted
        ? t("common.granted")
        : checking
          ? t("common.checking")
          : t("common.needed")}
    </span>
  );
}
