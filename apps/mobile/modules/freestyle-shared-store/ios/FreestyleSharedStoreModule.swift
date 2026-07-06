import ExpoModulesCore

/// Writes the shared state the keyboard extension reads from the App Group
/// container (`group.com.freestylevoice.app`): the better-auth session token,
/// the cloud base URL, and non-secret cleanup/language preferences.
///
/// The App Group `UserDefaults` is the cross-process channel between the app and
/// the keyboard — it needs no Apple Team ID at runtime (unlike a keychain access
/// group) and is sandboxed to Freestyle's own targets.
public class FreestyleSharedStoreModule: Module {
  private let appGroup = "group.com.freestylevoice.app"

  private var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroup)
  }

  public func definition() -> ModuleDefinition {
    Name("FreestyleSharedStore")

    // Merge a dictionary of string values into the shared store. A nil/absent
    // value removes the key (used to clear the token on sign-out).
    Function("setValues") { (values: [String: String?]) -> Void in
      guard let store = self.defaults else { return }
      for (key, value) in values {
        if let value = value {
          store.set(value, forKey: key)
        } else {
          store.removeObject(forKey: key)
        }
      }
    }

    Function("setBool") { (key: String, value: Bool) -> Void in
      self.defaults?.set(value, forKey: key)
    }

    Function("clear") { () -> Void in
      guard let store = self.defaults else { return }
      for key in [
        "sessionToken", "cloudBaseURL", "language", "skipPostProcess",
        "intensity", "personalTone", "workTone", "emailTone", "overallTone",
      ] {
        store.removeObject(forKey: key)
      }
    }
  }
}
