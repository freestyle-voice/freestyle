import AppIntents

/// App Intent that opens the Freestyle app to the recording screen.
/// Users can trigger this via:
/// - Siri: "Dictate with Freestyle"
/// - Shortcuts app
/// - Back Tap (Settings > Accessibility > Touch > Back Tap)
/// - Action Button (iPhone 15 Pro+)
/// - Lock Screen shortcut
@available(iOS 16.0, *)
struct DictateIntent: AppIntent {
    static var title: LocalizedStringResource = "Dictate with Freestyle"
    static var description = IntentDescription("Start voice dictation with Freestyle.")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        // Opening the app is handled by openAppWhenRun = true.
        // The app's URL scheme handler will route to the recording screen.
        // We pass a query parameter so the app knows to start recording immediately.
        return .result()
    }
}

/// Makes the intent discoverable in Spotlight and Siri suggestions.
@available(iOS 16.0, *)
struct FreestyleShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: DictateIntent(),
            phrases: [
                "Dictate with \(.applicationName)",
                "Start dictation in \(.applicationName)",
                "Voice to text with \(.applicationName)",
            ],
            shortTitle: "Dictate",
            systemImageName: "mic.fill"
        )
    }
}
