import Foundation

/// Reads the dictation transcript the containing app shares with the keyboard
/// through the App Group container (`group.com.freestylevoice.app`).
///
/// The keyboard can't use the microphone (iOS blocks mic capture in keyboard
/// extensions), so the mic button deep-links into the app, which records +
/// streams and writes the final transcript here. When the keyboard reappears it
/// inserts that text and clears the slot.
enum SharedStore {
    static let appGroup = "group.com.freestylevoice.app"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroup)
    }

    struct PendingTranscript {
        let text: String
        let timestamp: Double
    }

    /// The most recent dictation result, or nil when none is waiting.
    static func pendingTranscript() -> PendingTranscript? {
        guard let store = defaults,
              let text = store.string(forKey: "pendingTranscript"),
              !text.isEmpty
        else { return nil }
        let ts = store.double(forKey: "pendingTranscriptAt")
        return PendingTranscript(text: text, timestamp: ts)
    }

    static func clearPendingTranscript() {
        defaults?.removeObject(forKey: "pendingTranscript")
        defaults?.removeObject(forKey: "pendingTranscriptAt")
    }
}
