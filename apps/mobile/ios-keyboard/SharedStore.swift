import Foundation

/// Reads the shared state the main app writes into the App Group container
/// (`group.com.freestylevoice.app`) via `keyboard-bridge.ts`: the better-auth
/// session token used as `Authorization: Bearer …`, the cloud base URL, and the
/// non-secret cleanup/language preferences.
///
/// We use the App Group `UserDefaults` (not the keychain) as the cross-process
/// channel — it needs no Apple Team ID at runtime and is sandboxed to Freestyle's
/// own app + extension.
enum SharedStore {
    static let appGroup = "group.com.freestylevoice.app"
    private static let defaultBaseURL = "https://service.freestylevoice.com"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroup)
    }

    /// The better-auth session token, or nil when the user isn't signed in.
    static func sessionToken() -> String? {
        guard let token = defaults?.string(forKey: "sessionToken"),
              !token.isEmpty
        else { return nil }
        return token
    }

    static func cloudBaseURL() -> String {
        let value = defaults?.string(forKey: "cloudBaseURL")
        guard let value, !value.isEmpty else { return defaultBaseURL }
        return value.hasSuffix("/") ? String(value.dropLast()) : value
    }

    /// Cleanup / language preferences mirrored from the app's settings.
    static func streamPreferences() -> CloudStreamSession.Preferences {
        let d = defaults
        return CloudStreamSession.Preferences(
            language: nonEmpty(d?.string(forKey: "language")),
            skipPostProcess: d?.bool(forKey: "skipPostProcess") ?? false,
            intensity: nonEmpty(d?.string(forKey: "intensity")),
            personalTone: nonEmpty(d?.string(forKey: "personalTone")),
            workTone: nonEmpty(d?.string(forKey: "workTone")),
            emailTone: nonEmpty(d?.string(forKey: "emailTone")),
            overallTone: nonEmpty(d?.string(forKey: "overallTone"))
        )
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        return value
    }
}
