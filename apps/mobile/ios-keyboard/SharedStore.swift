import Foundation

/// Reads the transcript the containing app hands off through the App Group
/// container (`group.com.freestylevoice.app`) after dictating.
///
/// The keyboard extension can't use the microphone, so the app does the capture
/// + cloud streaming and writes the final transcript here; the keyboard reads it
/// when it reappears and inserts it into the host text field. The App Group is
/// the cross-process channel — no Apple Team ID needed at runtime.
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
