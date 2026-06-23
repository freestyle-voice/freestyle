export const SETTINGS_KEYS = {
  cleanupCustomPrompt: "cleanup_custom_prompt",
  cleanupIntensity: "cleanup_intensity",
  freestyleCloudPanelExpanded: "freestyle_cloud_panel_expanded",
  hotkey: "hotkey",
  hotkeyMode: "hotkey_mode",
  historyPaused: "history_paused",
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
