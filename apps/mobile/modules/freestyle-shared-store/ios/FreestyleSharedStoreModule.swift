import ExpoModulesCore

/// Writes the dictation result the keyboard extension reads from the App Group
/// container (`group.com.freestylevoice.app`). The keyboard can't use the
/// microphone, so the app captures + transcribes and hands the final text off
/// here; the keyboard inserts it when it reappears.
///
/// The App Group `UserDefaults` is the cross-process channel between the app and
/// the keyboard — it needs no Apple Team ID at runtime and is sandboxed to
/// Freestyle's own targets.
public class FreestyleSharedStoreModule: Module {
  private let appGroup = "group.com.freestylevoice.app"

  private var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroup)
  }

  public func definition() -> ModuleDefinition {
    Name("FreestyleSharedStore")

    // Store the transcript with a timestamp so the keyboard only inserts a
    // *new* result (not a stale one) when it next becomes active.
    Function("setPendingTranscript") { (text: String) -> Void in
      guard let store = self.defaults else { return }
      store.set(text, forKey: "pendingTranscript")
      store.set(Date().timeIntervalSince1970, forKey: "pendingTranscriptAt")
    }

    Function("clear") { () -> Void in
      guard let store = self.defaults else { return }
      for key in ["pendingTranscript", "pendingTranscriptAt"] {
        store.removeObject(forKey: key)
      }
    }
  }
}
