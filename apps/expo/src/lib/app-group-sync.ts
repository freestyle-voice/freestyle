/**
 * Syncs settings from the main app's SQLite/SecureStore to the shared
 * App Group UserDefaults so the iOS Share Extension can read them.
 *
 * The Share Extension reads from:
 *   UserDefaults(suiteName: "group.com.freestylevoice.app.shared")
 *
 * This module provides the JS-side sync interface. The actual write
 * to App Group UserDefaults requires a native module bridge (TBD).
 * For now, the Share Extension will show a "configure in app" message
 * if the shared defaults are empty.
 *
 * When a native Expo Module is added, this function will call it to
 * write the settings to the shared suite.
 */
import { Platform } from "react-native";
import { getAllDictionaryEntries, getDefaultModel, getSetting } from "./db";
import { getApiKey, PROVIDERS } from "./storage";

export async function syncToAppGroup(): Promise<void> {
  if (Platform.OS !== "ios") return;

  try {
    const data: Record<string, string | boolean | null> = {};

    for (const provider of PROVIDERS) {
      const key = await getApiKey(provider.id);
      if (key) data[`apikey_${provider.id}`] = key;
    }

    const voiceModel = await getDefaultModel("voice");
    if (voiceModel) {
      data.default_voice_provider = voiceModel.provider;
      data.default_voice_model_id = voiceModel.model_id;
      data.default_voice_model_name = voiceModel.model_name;
    }

    const llmModel = await getDefaultModel("llm");
    if (llmModel) {
      data.default_llm_provider = llmModel.provider;
      data.default_llm_model_id = llmModel.model_id;
    }

    data.language = (await getSetting("language")) ?? "auto";
    data.llm_cleanup = (await getSetting("llm_cleanup")) === "true";
    data.onboarding_complete =
      (await getSetting("onboarding_complete")) === "true";

    const dictEntries = await getAllDictionaryEntries();
    const dictJson = JSON.stringify(
      dictEntries.map((e) => ({ key: e.key, value: e.value })),
    );

    // TODO: Call native module to write to UserDefaults(suiteName:)
    // import { FreestyleNative } from './native-bridge';
    // await FreestyleNative.writeToAppGroup(
    //   "group.com.freestylevoice.app.shared",
    //   data,
    //   dictJson
    // );

    console.log("[app-group-sync] Prepared data for App Group sync:", {
      providers: Object.keys(data).filter((k) => k.startsWith("apikey_"))
        .length,
      hasVoiceModel: !!voiceModel,
      dictionaryEntries: dictEntries.length,
    });
  } catch (err) {
    console.error("[app-group-sync] Sync failed:", err);
  }
}
