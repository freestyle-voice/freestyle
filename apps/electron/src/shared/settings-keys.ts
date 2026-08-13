export const SETTINGS_KEYS = {
  advancedMode: "advanced_mode",
  cleanupAppAssignments: "cleanup_app_assignments",
  cleanupCustomPrompt: "cleanup_custom_prompt",
  cleanupEmailTone: "cleanup_email_tone",
  cleanupIntensity: "cleanup_intensity",
  cleanupOverallTone: "cleanup_overall_tone",
  cleanupPersonalTone: "cleanup_personal_tone",
  cleanupWorkTone: "cleanup_work_tone",
  remixHotkey: "remix_hotkey",
  freestyleCloudPanelExpanded: "freestyle_cloud_panel_expanded",
  hotkey: "hotkey",
  hotkeyMode: "hotkey_mode",
  historyPaused: "history_paused",
  historyRetentionDays: "history_retention_days",
  // Legacy singular language key. Kept for one-time migration reads only;
  // the canonical setting is now `languages` (a JSON array of ISO codes).
  language: "language",
  languages: "languages",
  llmCleanup: "llm_cleanup",
  micDeviceId: "mic_device_id",
  networkCaCertPath: "network_ca_cert_path",
  networkProxyUrl: "network_proxy_url",
  outputMode: "output_mode",
  dictationDestination: "dictation_destination",
  soundEnabled: "sound_enabled",
  translateMode: "translate_mode",
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];
