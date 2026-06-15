export const SETTINGS_KEYS = {
  hotkey: "hotkey",
  hotkeyMode: "hotkey_mode",
  language: "language",
  llmCleanup: "llm_cleanup",
  localLlmApiKey: "local_llm_api_key",
  localLlmUrl: "local_llm_url",
  micDeviceId: "mic_device_id",
  mlxAsrKeepAliveMinutes: "mlx_asr_keep_alive_minutes",
  outputMode: "output_mode",
  soundEnabled: "sound_enabled",
  theme: "theme",
  transcriptionPrompt: "transcription_prompt",
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];
