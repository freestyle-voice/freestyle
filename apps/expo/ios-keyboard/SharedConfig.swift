import Foundation

/// Shared configuration and data bridge between the main Freestyle app
/// and the keyboard extension, using App Groups UserDefaults.
struct SharedConfig {
    static let appGroupIdentifier = "group.com.freestylevoice.app.shared"

    private static var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }

    // MARK: - API Keys

    static func getApiKey(for provider: String) -> String? {
        sharedDefaults?.string(forKey: "apikey_\(provider)")
    }

    static func setApiKey(_ key: String, for provider: String) {
        sharedDefaults?.set(key, forKey: "apikey_\(provider)")
    }

    // MARK: - Voice Model

    struct VoiceModel {
        let provider: String
        let modelId: String
        let modelName: String
    }

    static func getDefaultVoiceModel() -> VoiceModel? {
        guard let provider = sharedDefaults?.string(forKey: "default_voice_provider"),
              let modelId = sharedDefaults?.string(forKey: "default_voice_model_id"),
              let modelName = sharedDefaults?.string(forKey: "default_voice_model_name")
        else { return nil }
        return VoiceModel(provider: provider, modelId: modelId, modelName: modelName)
    }

    static func setDefaultVoiceModel(_ model: VoiceModel) {
        sharedDefaults?.set(model.provider, forKey: "default_voice_provider")
        sharedDefaults?.set(model.modelId, forKey: "default_voice_model_id")
        sharedDefaults?.set(model.modelName, forKey: "default_voice_model_name")
    }

    // MARK: - Language

    static var language: String {
        get { sharedDefaults?.string(forKey: "language") ?? "auto" }
        set { sharedDefaults?.set(newValue, forKey: "language") }
    }

    // MARK: - LLM Cleanup

    static var llmCleanupEnabled: Bool {
        get { sharedDefaults?.bool(forKey: "llm_cleanup") ?? false }
        set { sharedDefaults?.set(newValue, forKey: "llm_cleanup") }
    }

    struct LLMModel {
        let provider: String
        let modelId: String
    }

    static func getDefaultLLMModel() -> LLMModel? {
        guard let provider = sharedDefaults?.string(forKey: "default_llm_provider"),
              let modelId = sharedDefaults?.string(forKey: "default_llm_model_id")
        else { return nil }
        return LLMModel(provider: provider, modelId: modelId)
    }

    // MARK: - Dictionary

    struct DictionaryEntry {
        let key: String
        let value: String
    }

    static func getDictionary() -> [DictionaryEntry] {
        guard let data = sharedDefaults?.data(forKey: "dictionary"),
              let entries = try? JSONDecoder().decode([[String: String]].self, from: data)
        else { return [] }
        return entries.compactMap { dict in
            guard let key = dict["key"], let value = dict["value"] else { return nil }
            return DictionaryEntry(key: key, value: value)
        }
    }

    // MARK: - Onboarding

    static var isOnboardingComplete: Bool {
        get { sharedDefaults?.bool(forKey: "onboarding_complete") ?? false }
        set { sharedDefaults?.set(newValue, forKey: "onboarding_complete") }
    }
}
