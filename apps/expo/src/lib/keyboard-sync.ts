/**
 * Syncs settings from the main app's SQLite/SecureStore to the shared
 * App Group UserDefaults, so the iOS keyboard extension can read them.
 *
 * This module is iOS-only. On Android it's a no-op.
 *
 * The keyboard extension (native Swift) reads from:
 *   UserDefaults(suiteName: "group.com.freestylevoice.app.shared")
 *
 * The main app writes to the same suite after any settings change.
 *
 * NOTE: This requires a native module to write to the App Group UserDefaults.
 * For now, we provide the interface and a placeholder implementation.
 * The actual native bridge will be added when the keyboard extension is
 * integrated via `expo prebuild`.
 */
import { Platform } from "react-native";
import { getAllDictionaryEntries, getDefaultModel, getSetting } from "./db";
import { getApiKey, PROVIDERS } from "./storage";

const APP_GROUP_ID = "group.com.freestylevoice.app.shared";

/**
 * Sync all settings from the main app to the App Group UserDefaults.
 * Call this after any settings change (API key saved, model changed, etc.)
 */
export async function syncSettingsToKeyboard(): Promise<void> {
  if (Platform.OS !== "ios") return;

  try {
    const data: Record<string, string | boolean | null> = {};

    // Sync API keys
    for (const provider of PROVIDERS) {
      const key = await getApiKey(provider.id);
      data[`apikey_${provider.id}`] = key;
    }

    // Sync default voice model
    const voiceModel = await getDefaultModel("voice");
    if (voiceModel) {
      data["default_voice_provider"] = voiceModel.provider;
      data["default_voice_model_id"] = voiceModel.model_id;
      data["default_voice_model_name"] = voiceModel.model_name;
    }

    // Sync default LLM model
    const llmModel = await getDefaultModel("llm");
    if (llmModel) {
      data["default_llm_provider"] = llmModel.provider;
      data["default_llm_model_id"] = llmModel.model_id;
    }

    // Sync language setting
    const language = await getSetting("language");
    data["language"] = language ?? "auto";

    // Sync LLM cleanup setting
    const llmCleanup = await getSetting("llm_cleanup");
    data["llm_cleanup"] = llmCleanup === "true";

    // Sync onboarding status
    const onboarded = await getSetting("onboarding_complete");
    data["onboarding_complete"] = onboarded === "true";

    // Sync dictionary entries as JSON
    const dictEntries = await getAllDictionaryEntries();
    const dictJson = JSON.stringify(
      dictEntries.map((e) => ({ key: e.key, value: e.value })),
    );

    // Write to App Group UserDefaults via native module
    // TODO: Implement native module for UserDefaults(suiteName:) access.
    // For now, this is a placeholder. The native bridge will be implemented
    // using an Expo Module when the keyboard extension is fully integrated.
    //
    // The native module API will look like:
    //   import { FreestyleKeyboardBridge } from './native/FreestyleKeyboardBridge';
    //   await FreestyleKeyboardBridge.syncToAppGroup(APP_GROUP_ID, data, dictJson);
    //
    console.log("[keyboard-sync] Settings prepared for App Group sync", {
      providers: Object.keys(data).filter((k) => k.startsWith("apikey_"))
        .length,
      hasVoiceModel: !!voiceModel,
      hasLLMModel: !!llmModel,
      dictionaryEntries: dictEntries.length,
    });
  } catch (err) {
    console.error("[keyboard-sync] Failed to sync settings:", err);
  }
}
