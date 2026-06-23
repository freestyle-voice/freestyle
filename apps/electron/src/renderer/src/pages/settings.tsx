import { serverUrlSchema } from "@freestyle/validations";
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
  getApiBase,
  getClient,
  getLocalApiBase,
  getServerToken,
  refreshApiBase,
} from "@renderer/lib/api";
import { LANGUAGES } from "@renderer/lib/languages";
import { requestMicAccess, resolveMicStatus } from "@renderer/lib/permissions";
import { cn } from "@renderer/lib/utils";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
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
  "interface",
  "application",
  "recording",
  "display",
  "permissions",
  "data",
  "developer",
] as const;

type SettingsSectionId = (typeof settingsSectionIds)[number];

function parseSettingsSection(hash: string): SettingsSectionId {
  const id = hash.replace(/^#/, "");
  return (settingsSectionIds as readonly string[]).includes(id)
    ? (id as SettingsSectionId)
    : "application";
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
  const [audioPlaybackMode, setAudioPlaybackMode] =
    useState<AudioPlaybackMode>("off");
  const [transcriptionPrompt, setTranscriptionPrompt] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [showOnLaunch, setShowOnLaunch] = useState(true);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() =>
    parseSettingsSection(window.location.hash),
  );
  const [serverUrlInput, setServerUrlInput] = useState("");
  const [savedServerUrl, setSavedServerUrl] = useState("");
  const [serverTokenInput, setServerTokenInput] = useState("");
  const [savedServerToken, setSavedServerToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [serverUrlError, setServerUrlError] = useState<string | null>(null);
  const [serverTest, setServerTest] = useState<
    "idle" | "testing" | "ok" | "unreachable" | "unauthorized"
  >("idle");

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
  const isLinux = window.api?.platform === "linux";
  const isWindows = window.api?.platform === "win32";
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
      .api.settings[":key"].$get({ param: { key: SETTINGS_KEYS.micDeviceId } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setSelectedDevice(data.value);
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: SETTINGS_KEYS.hotkey } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setHotkey(data.value);
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: SETTINGS_KEYS.hotkeyMode } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value === "toggle") setHotkeyMode("toggle");
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: SETTINGS_KEYS.language } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setLanguage(data.value);
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: SETTINGS_KEYS.outputMode } })
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
      .api.settings[":key"].$get({ param: { key: SETTINGS_KEYS.soundEnabled } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value === "false") setSoundEnabled(false);
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({
        param: { key: SETTINGS_KEYS.historyPaused },
      })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value === "true") setHistoryPaused(true);
      })
      .catch(() => {});
    void (async () => {
      try {
        const modeResponse = await getClient().api.settings[":key"].$get({
          param: { key: "audio_playback_mode" },
        });
        const modeData = modeResponse.ok ? await modeResponse.json() : null;
        if (modeData?.value) {
          setAudioPlaybackMode(normalizeAudioPlaybackMode(modeData.value));
          return;
        }

        const legacyPauseResponse = await getClient().api.settings[":key"].$get(
          {
            param: { key: "pause_playback_while_recording" },
          },
        );
        const legacyPauseData = legacyPauseResponse.ok
          ? await legacyPauseResponse.json()
          : null;
        if (legacyPauseData?.value === "true") {
          setAudioPlaybackMode("pause");
          return;
        }

        const legacyDuckResponse = await getClient().api.settings[":key"].$get({
          param: { key: "audio_ducking_enabled" },
        });
        const legacyDuckData = legacyDuckResponse.ok
          ? await legacyDuckResponse.json()
          : null;
        setAudioPlaybackMode(legacyDuckData?.value === "true" ? "duck" : "off");
      } catch {}
    })();
    getClient()
      .api.settings[":key"].$get({
        param: { key: SETTINGS_KEYS.transcriptionPrompt },
      })
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

    // Server URL + token ("" = local server / no auth)
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

  const handleSaveServer = useCallback(async () => {
    const parsed = serverUrlSchema.safeParse(serverUrlInput);
    if (!parsed.success) {
      setServerUrlError(parsed.error.issues[0].message);
      return;
    }
    setServerUrlError(null);
    const savedUrl =
      (await window.api?.setServerUrl(parsed.data)) ?? parsed.data;
    const savedToken =
      (await window.api?.setServerToken(serverTokenInput)) ??
      serverTokenInput.trim();
    setSavedServerUrl(savedUrl);
    setServerUrlInput(savedUrl);
    setSavedServerToken(savedToken);
    setServerTokenInput(savedToken);
    // Apply the new base/token to this window's client immediately. Switching
    // the local server on/off still needs a restart (see the row description).
    await refreshApiBase();
    await testServer(savedUrl, savedToken);
  }, [serverUrlInput, serverTokenInput, testServer]);

  const handleResetServer = useCallback(async () => {
    const savedUrl = (await window.api?.setServerUrl("")) ?? "";
    const savedToken = (await window.api?.setServerToken("")) ?? "";
    setSavedServerUrl(savedUrl);
    setServerUrlInput(savedUrl);
    setSavedServerToken(savedToken);
    setServerTokenInput(savedToken);
    setServerUrlError(null);
    setServerTest("idle");
    await refreshApiBase();
  }, []);

  const clearHistory = useCallback(async () => {
    if (!confirm(t("settings.data.clearHistoryConfirm"))) {
      return;
    }
    await getClient().api.history.$delete();
  }, [t]);

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
      {
        id: "bottom-center",
        label: t("settings.display.positionBottomCenter"),
      },
      { id: "bottom-right", label: t("settings.display.positionBottomRight") },
      { id: "top-center", label: t("settings.display.positionTopCenter") },
      { id: "top-right", label: t("settings.display.positionTopRight") },
    ];
    if (pillPosition === "custom")
      opts.push({ id: "custom", label: t("settings.display.positionCustom") });
    return opts;
  }, [pillPosition, t]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="h-7 shrink-0" />
      <div
        className="responsive-page-scroll grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-x-10 gap-y-6 min-[900px]:grid-cols-[180px_minmax(0,1fr)]"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
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

        <div className="min-h-0 overflow-y-auto">
          <h2 className="text-foreground mb-6 text-[22px] font-medium tracking-[-0.02em]">
            {activeSectionLabel}
          </h2>

          {activeSection === "interface" && (
            <SettingsPanel>
              <Row
                label={t("settings.interfaceLanguage.label")}
                desc={t("settings.interfaceLanguage.desc")}
                last
              >
                <LanguageSelector />
              </Row>
            </SettingsPanel>
          )}

          {activeSection === "application" && (
            <SettingsPanel>
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
              >
                <Switch
                  checked={showOnLaunch}
                  onCheckedChange={handleShowOnLaunchToggle}
                />
              </Row>
              <Row
                label="Server URL"
                desc="Use the built-in server, or point Freestyle at a self-hosted server. Restart the app after changing this."
                stacked
                last
              >
                <ServerConnectionCard
                  savedServerUrl={savedServerUrl}
                  savedServerToken={savedServerToken}
                  serverUrlInput={serverUrlInput}
                  serverTokenInput={serverTokenInput}
                  serverUrlError={serverUrlError}
                  serverTest={serverTest}
                  showToken={showToken}
                  onUrlChange={(value) => {
                    setServerUrlInput(value);
                    setServerTest("idle");
                    setServerUrlError(null);
                  }}
                  onTokenChange={(value) => {
                    setServerTokenInput(value);
                    setServerTest("idle");
                  }}
                  onToggleToken={() => setShowToken((v) => !v)}
                  onSave={handleSaveServer}
                  onTest={() => testServer(serverUrlInput, serverTokenInput)}
                  onReset={handleResetServer}
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
                label={t("settings.recording.transcriptionPrompt")}
                desc={t("settings.recording.transcriptionPromptDesc")}
              >
                <Input
                  id="settings-transcription-prompt"
                  type="text"
                  value={transcriptionPrompt}
                  onChange={(e) => setTranscriptionPrompt(e.target.value)}
                  onBlur={() => {
                    getClient()
                      .api.settings[":key"].$put({
                        param: { key: SETTINGS_KEYS.transcriptionPrompt },
                        json: { value: transcriptionPrompt },
                      })
                      .catch(() => {});
                  }}
                  placeholder={t(
                    "settings.recording.transcriptionPromptPlaceholder",
                  )}
                  className="max-w-md"
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

          {activeSection === "developer" && (
            <SettingsPanel>
              <Row
                label={t("settings.developer.mcp")}
                desc={t("settings.developer.mcpDesc")}
                stacked
                last
              >
                <McpConnect />
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

type ServerTestState =
  | "idle"
  | "testing"
  | "ok"
  | "unreachable"
  | "unauthorized";

function ServerConnectionCard({
  savedServerUrl,
  savedServerToken,
  serverUrlInput,
  serverTokenInput,
  serverUrlError,
  serverTest,
  showToken,
  onUrlChange,
  onTokenChange,
  onToggleToken,
  onSave,
  onTest,
  onReset,
}: {
  savedServerUrl: string;
  savedServerToken: string;
  serverUrlInput: string;
  serverTokenInput: string;
  serverUrlError: string | null;
  serverTest: ServerTestState;
  showToken: boolean;
  onUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onToggleToken: () => void;
  onSave: () => void;
  onTest: () => void;
  onReset: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const urlChanged = serverUrlInput.trim() !== savedServerUrl.trim();
  const tokenChanged = serverTokenInput.trim() !== savedServerToken.trim();
  const canReset =
    !!savedServerUrl ||
    !!savedServerToken ||
    !!serverUrlInput.trim() ||
    !!serverTokenInput.trim();
  const usingLocal = !savedServerUrl;

  return (
    <div className="border-border bg-card w-full rounded-[14px] border p-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "mono inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.14em]",
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
            {usingLocal ? "Local server" : "Remote server"}
          </span>
          {savedServerUrl && (
            <span className="text-muted-foreground min-w-0 truncate text-[12px]">
              {savedServerUrl}
            </span>
          )}
        </div>
        <ConnectionStatus state={serverTest} />
      </div>

      <div className="space-y-2.5">
        <ServerFieldRow label="Endpoint">
          <InputGroup>
            <InputGroupInput
              id="settings-server-url"
              type="text"
              value={serverUrlInput}
              aria-invalid={!!serverUrlError}
              onChange={(e) => onUrlChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
              }}
              placeholder="http://127.0.0.1:4649"
            />
            <InputGroupAddon>
              <Server />
            </InputGroupAddon>
          </InputGroup>
        </ServerFieldRow>

        <ServerFieldRow label="Token">
          <InputGroup className={cn(!serverUrlInput.trim() && "opacity-60")}>
            <InputGroupInput
              id="settings-server-token"
              type={showToken ? "text" : "password"}
              value={serverTokenInput}
              onChange={(e) => onTokenChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
              }}
              placeholder="Optional access token"
            />
            <InputGroupAddon>
              <Key />
            </InputGroupAddon>
            {serverTokenInput && (
              <RevealToggle
                revealed={showToken}
                onToggle={onToggleToken}
                label="token"
              />
            )}
          </InputGroup>
        </ServerFieldRow>

        {serverUrlError && (
          <p className="text-destructive pl-0 text-[12px] min-[760px]:pl-[104px]">
            {serverUrlError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1 min-[760px]:pl-[104px]">
          <Button
            variant="ink"
            size="sm"
            onClick={onSave}
            disabled={!urlChanged && !tokenChanged}
          >
            {t("common.save")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={serverTest === "testing"}
          >
            Test connection
          </Button>
          {canReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="text-muted-foreground"
            >
              Reset to local
            </Button>
          )}
          {(urlChanged || tokenChanged) && (
            <span className="text-muted-foreground ml-auto text-[11.5px]">
              Restart required after saving
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ServerFieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="grid items-center gap-1.5 min-[760px]:grid-cols-[88px_minmax(0,1fr)] min-[760px]:gap-4">
      <div className="mono text-muted-foreground text-[10px] uppercase tracking-[0.14em]">
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ConnectionStatus({ state }: { state: ServerTestState }) {
  if (state === "idle") return null;
  if (state === "testing") {
    return (
      <span className="text-muted-foreground text-[12px]">Testing...</span>
    );
  }
  if (state === "ok") {
    return (
      <span className="text-primary inline-flex items-center gap-1 text-[12px]">
        <Check className="size-3.5" /> Connected
      </span>
    );
  }
  return (
    <span className="text-destructive text-[12px]">
      {state === "unauthorized" ? "Token rejected" : "Unreachable"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// MCP connection — how to point an AI agent at the local server
// ---------------------------------------------------------------------------

function useCopy(): [boolean, (value: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((value: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }, []);
  return [copied, copy];
}

function CopyButton({
  value,
  className,
}: {
  value: string;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className={cn(
        "mono text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-[10.5px] font-medium tracking-[0.08em] uppercase transition-colors",
        className,
      )}
    >
      {copied ? (
        <Check className="text-primary h-3 w-3" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? t("settings.developer.copied") : t("settings.developer.copy")}
    </button>
  );
}

function CopyValueButton({
  value,
  children,
  variant = "outline",
}: {
  value: string;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
}): React.JSX.Element {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();
  return (
    <Button variant={variant} size="sm" onClick={() => copy(value)}>
      {copied ? (
        <Check data-icon="inline-start" />
      ) : (
        <Copy data-icon="inline-start" />
      )}
      {copied ? t("settings.developer.copied") : children}
    </Button>
  );
}

function CopyField({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="border-border bg-secondary/45 flex min-w-0 items-center gap-3 rounded-[10px] border px-3 py-2.5">
      <div className="mono text-muted-foreground hidden shrink-0 text-[10.5px] tracking-[0.14em] uppercase min-[760px]:block">
        {label}
      </div>
      <div className="bg-background/45 border-border flex min-w-0 flex-1 items-center rounded-md border px-3 py-2">
        <code className="mono text-foreground min-w-0 flex-1 truncate text-[12.5px]">
          {value}
        </code>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

function CodeBlock({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}): React.JSX.Element {
  return (
    <div className="border-border bg-secondary/45 overflow-hidden rounded-[12px] border">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-3 py-2.5">
        <div className="min-w-0">
          <div className="mono text-muted-foreground text-[10.5px] tracking-[0.14em] uppercase">
            {label}
          </div>
          {note && (
            <p className="text-muted-foreground mt-1 text-[12px] leading-[1.45]">
              {note}
            </p>
          )}
        </div>
        <CopyButton value={value} className="mt-0.5" />
      </div>
      <pre className="text-foreground mono max-h-[240px] overflow-auto bg-background/35 p-3 text-[12px] leading-[1.55]">
        {value}
      </pre>
    </div>
  );
}

function McpConnect(): React.JSX.Element {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"http" | "stdio">("http");
  const [showConfig, setShowConfig] = useState(false);
  const mcpUrl = `${getApiBase()}/mcp`;
  const serverToken = getServerToken();
  const httpConfig = JSON.stringify(
    {
      mcpServers: {
        freestyle: {
          type: "http",
          url: mcpUrl,
          ...(serverToken
            ? { headers: { Authorization: `Bearer ${serverToken}` } }
            : {}),
        },
      },
    },
    null,
    2,
  );
  const remoteConfig = JSON.stringify(
    {
      mcpServers: {
        freestyle: {
          command: "npx",
          args: [
            "-y",
            "mcp-remote",
            mcpUrl,
            ...(serverToken
              ? ["--header", `Authorization: Bearer ${serverToken}`]
              : []),
          ],
        },
      },
    },
    null,
    2,
  );
  const activeConfig = mode === "http" ? httpConfig : remoteConfig;
  const activeLabel =
    mode === "http"
      ? t("settings.developer.mcpConfig")
      : t("settings.developer.mcpRemoteConfig");
  const activeNote =
    mode === "http"
      ? "Use this for Claude, Cursor, and clients that support streamable HTTP."
      : t("settings.developer.mcpRemoteNote");
  const modeTitle = mode === "http" ? "Streamable HTTP" : "stdio bridge";
  const modeDesc =
    mode === "http"
      ? "Best for clients that accept an MCP server URL directly."
      : "Use when the client asks for a command instead of a URL.";

  return (
    <div className="border-border bg-card w-full rounded-[14px] border p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-start min-[760px]:justify-between">
          <div className="min-w-0">
            <div className="mono text-primary text-[10px] uppercase tracking-[0.16em]">
              Connect an MCP client
            </div>
            <p className="text-muted-foreground mt-1.5 max-w-[620px] text-[12.5px] leading-relaxed">
              Pick the client style, then copy the ready-to-paste config. The
              JSON is available if you want to inspect it.
            </p>
          </div>
          <div className="bg-secondary/45 border-border inline-flex shrink-0 rounded-[10px] border p-1">
            <Button
              variant={mode === "http" ? "default" : "ghost"}
              size="xs"
              onClick={() => setMode("http")}
              className="rounded-[7px]"
            >
              HTTP
            </Button>
            <Button
              variant={mode === "stdio" ? "default" : "ghost"}
              size="xs"
              onClick={() => setMode("stdio")}
              className="rounded-[7px]"
            >
              stdio bridge
            </Button>
          </div>
        </div>

        <CopyField label={t("settings.developer.mcpUrl")} value={mcpUrl} />

        <div className="border-border bg-secondary/35 flex flex-col gap-3 rounded-[12px] border p-3 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
          <div className="min-w-0">
            <div className="text-foreground text-[13.5px] font-medium">
              {modeTitle}
            </div>
            <p className="text-muted-foreground mt-0.5 text-[12px] leading-relaxed">
              {modeDesc}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <CopyValueButton value={activeConfig} variant="ink">
              Copy config
            </CopyValueButton>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfig((v) => !v)}
            >
              {showConfig ? "Hide config" : "Show config"}
            </Button>
          </div>
        </div>
      </div>

      {showConfig && (
        <div className="mt-3">
          <CodeBlock
            label={activeLabel}
            value={activeConfig}
            note={activeNote}
          />
        </div>
      )}
    </div>
  );
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
