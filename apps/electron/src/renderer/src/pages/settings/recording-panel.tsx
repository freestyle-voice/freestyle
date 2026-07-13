import {
  type RecordingSettingsForm,
  recordingSettingsFormSchema,
} from "@freestyle-voice/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyComboDisplay } from "@renderer/components/key-combo";
import { Button } from "@renderer/components/ui/button";
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
import { getClient } from "@renderer/lib/api";
import { LANGUAGES } from "@renderer/lib/languages";
import { IS_LINUX, IS_MAC, IS_WINDOWS } from "@renderer/lib/platform";
import { settingsQueryOptions } from "@renderer/lib/query";
import { useQuery } from "@tanstack/react-query";
import { Keyboard, Languages, Mic, Volume2, VolumeOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { normalizeAudioPlaybackMode } from "../../../../shared/audio-playback";
import { getDefaultHotkey } from "../../../../shared/hotkey-defaults";
import { SETTINGS_KEYS } from "../../../../shared/settings-keys";
import { Row, Segment, SettingsPanel } from "./components";
import {
  type AudioDevice,
  audioPlaybackOptions,
  SYSTEM_DEFAULT_MIC,
} from "./constants";
import { useSettingsForm } from "./use-settings-form";

export function RecordingPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const supportsBackgroundAudio = IS_MAC || IS_LINUX || IS_WINDOWS;

  const form = useForm<RecordingSettingsForm>({
    resolver: zodResolver(recordingSettingsFormSchema),
    defaultValues: {
      micDeviceId: "",
      hotkey: window.api?.defaultHotkey ?? getDefaultHotkey(),
      hotkeyMode: "hold",
      language: "auto",
      outputMode: "paste",
      soundEnabled: true,
      audioPlaybackMode: "off",
    },
    mode: "onChange",
  });
  const { control, reset, setValue, watch } = form;
  const { persistField, markSeeded } = useSettingsForm(form);

  const hotkey = watch("hotkey");
  const hotkeyMode = watch("hotkeyMode");
  const soundEnabled = watch("soundEnabled");

  // Enumerated audio input devices — transient device state, not a setting.
  const [devices, setDevices] = useState<AudioDevice[]>([]);

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

  // Seed once from the shared settings cache.
  const settingsQuery = useQuery(settingsQueryOptions());
  const seeded = useRef(false);
  useEffect(() => {
    const s = settingsQuery.data;
    if (!s || seeded.current) return;
    seeded.current = true;

    let audioPlaybackMode = normalizeAudioPlaybackMode(
      s.audio_playback_mode ?? "",
    );
    if (!s.audio_playback_mode) {
      // Legacy fallback chain (new key → paused → duck).
      if (s.pause_playback_while_recording === "true")
        audioPlaybackMode = "pause";
      else if (s.audio_ducking_enabled === "true") audioPlaybackMode = "duck";
    }

    const next: RecordingSettingsForm = {
      micDeviceId: s[SETTINGS_KEYS.micDeviceId] ?? "",
      hotkey:
        s[SETTINGS_KEYS.hotkey] ||
        (window.api?.defaultHotkey ?? getDefaultHotkey()),
      hotkeyMode: s[SETTINGS_KEYS.hotkeyMode] === "toggle" ? "toggle" : "hold",
      language: s[SETTINGS_KEYS.language] || "auto",
      outputMode:
        s[SETTINGS_KEYS.outputMode] === "clipboard" ? "clipboard" : "paste",
      soundEnabled: s[SETTINGS_KEYS.soundEnabled] !== "false",
      audioPlaybackMode,
    };
    reset(next);
    markSeeded(next);
  }, [settingsQuery.data, reset, markSeeded]);

  // Load available audio input devices.
  useEffect(() => {
    (async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
          for (const tr of s.getTracks()) tr.stop();
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

  const handleHotkeyRecorded = useCallback(
    (accelerator: string) => {
      setValue("hotkey", accelerator);
      void persistField("hotkey", { key: SETTINGS_KEYS.hotkey });
    },
    [setValue, persistField],
  );

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

  const liveKeys = liveModifiers.map(keyDisplayLabel);
  const draftKeys = capturedCombo ? comboDisplayKeys(capturedCombo) : liveKeys;
  const captureHint = needsModifierOrMouseButton
    ? "Add a modifier or side mouse button · Esc to cancel"
    : canSaveRecording
      ? "Release to save · Esc to cancel"
      : "Press a modifier or side mouse button... · Esc to cancel";

  return (
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
        <Controller
          control={control}
          name="hotkeyMode"
          render={({ field }) => (
            <Segment
              options={[
                { id: "hold", label: t("settings.recording.activationHold") },
                {
                  id: "toggle",
                  label: t("settings.recording.activationToggle"),
                },
              ]}
              active={field.value}
              onSelect={(v) => {
                const mode = v === "toggle" ? "toggle" : "hold";
                field.onChange(mode);
                void persistField("hotkeyMode", {
                  key: SETTINGS_KEYS.hotkeyMode,
                  after: () => window.api?.setHotkeyMode(mode),
                });
              }}
            />
          )}
        />
      </Row>

      <Row
        label={t("settings.recording.microphone")}
        desc={t("settings.recording.microphoneDesc")}
      >
        <Controller
          control={control}
          name="micDeviceId"
          render={({ field }) => (
            <Select
              value={field.value === "" ? SYSTEM_DEFAULT_MIC : field.value}
              onValueChange={(v) => {
                const deviceId = v === SYSTEM_DEFAULT_MIC ? "" : v;
                field.onChange(deviceId);
                void persistField("micDeviceId", {
                  key: SETTINGS_KEYS.micDeviceId,
                });
              }}
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
          )}
        />
      </Row>

      <Row
        label={t("settings.recording.language")}
        desc={t("settings.recording.languageDesc")}
      >
        <Controller
          control={control}
          name="language"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(v) => {
                field.onChange(v);
                void persistField("language", { key: SETTINGS_KEYS.language });
              }}
            >
              <SelectTrigger id="settings-language" className="w-full max-w-md">
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
          )}
        />
      </Row>

      <Row
        label={t("settings.recording.outputMode")}
        desc={t("settings.recording.outputModeDesc")}
      >
        <Controller
          control={control}
          name="outputMode"
          render={({ field }) => (
            <Segment
              compact
              options={[
                { id: "paste", label: t("settings.recording.outputModePaste") },
                {
                  id: "clipboard",
                  label: t("settings.recording.outputModeClipboard"),
                },
              ]}
              active={field.value}
              onSelect={(v) => {
                const mode = v === "clipboard" ? "clipboard" : "paste";
                field.onChange(mode);
                void persistField("outputMode", {
                  key: SETTINGS_KEYS.outputMode,
                  after: () => window.api?.sendOutputModeChanged(mode),
                });
              }}
            />
          )}
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
          <Controller
            control={control}
            name="soundEnabled"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={(enabled) => {
                  field.onChange(enabled);
                  void persistField("soundEnabled", {
                    key: SETTINGS_KEYS.soundEnabled,
                  });
                }}
              />
            )}
          />
        </div>
      </Row>

      {supportsBackgroundAudio ? (
        <Row
          label="Background audio"
          desc={
            IS_LINUX
              ? "Duck lowers system volume. Pause pauses MPRIS media and lowers volume."
              : "Duck lowers volume. Pause pauses current media and lowers volume."
          }
          last
        >
          <Controller
            control={control}
            name="audioPlaybackMode"
            render={({ field }) => (
              <Segment
                compact
                options={audioPlaybackOptions}
                active={field.value}
                onSelect={(v) => {
                  const mode = normalizeAudioPlaybackMode(v);
                  field.onChange(mode);
                  void persistField("audioPlaybackMode", {
                    key: "audio_playback_mode",
                    after: () => {
                      window.api?.sendAudioPlaybackModeChanged(mode);
                      // Keep the legacy ducking flag in sync for older readers.
                      getClient()
                        .api.settings[":key"].$put({
                          param: { key: "audio_ducking_enabled" },
                          json: { value: String(mode === "duck") },
                        })
                        .catch(() => {});
                    },
                  });
                }}
              />
            )}
          />
        </Row>
      ) : null}
    </SettingsPanel>
  );
}
