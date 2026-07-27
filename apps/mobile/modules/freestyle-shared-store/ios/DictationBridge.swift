import CoreFoundation
import Foundation

/// Cross-process bridge between the Freestyle app and the keyboard extension.
///
/// iOS blocks microphone capture inside keyboard extensions, so dictation is
/// delegated to the containing app. Rather than a blind one-shot hand-off, the
/// two processes maintain a small bidirectional protocol over the shared App
/// Group container so the keyboard can drive a *resident* dictation session:
/// arm it once, then start/stop capture repeatedly without a cold app relaunch,
/// and surface live status + partial transcripts inline.
///
/// Two single-writer channels avoid read-modify-write races:
///   • State channel   — the app writes, the keyboard reads.
///   • Command channel  — the keyboard writes, the app reads.
///
/// This file is duplicated verbatim in both targets (the keyboard extension and
/// the `freestyle-shared-store` native module). It is the wire format they
/// share — if you change one copy, change the other.

// MARK: - State channel (app writes, keyboard reads)

/// A snapshot of the app's dictation session, published for the keyboard.
struct FreestyleDictationState: Codable, Equatable {
    enum Phase: String, Codable {
        case idle          // no session (app closed, or never started)
        case arming        // start received, app is booting the mic session
        case armed         // session warm and resident, not capturing
        case capturing     // actively recording + streaming a phrase
        case transcribing  // finalizing / cloud cleanup
        case ready         // a final transcript is ready to insert
        case failed
    }

    var phase: Phase = .idle
    var sessionID = ""
    var partialTranscript = ""
    var finalTranscript = ""
    /// Live mic input level in [0, 1], for the keyboard's meter while capturing.
    var level: Double = 0
    /// Unique per ready transcript so the keyboard inserts each exactly once.
    var insertionToken = ""
    var statusMessage = ""
    /// Refreshed continuously while a session is live so a stale (crashed /
    /// backgrounded) app can be detected by the keyboard.
    var heartbeat: TimeInterval = 0
    var updatedAt: TimeInterval = 0
}

// MARK: - Command channel (keyboard writes, app reads)

/// A command the keyboard sends to the app to drive the session.
struct FreestyleKeyboardCommand: Codable, Equatable {
    enum Kind: String, Codable {
        case none
        case start          // arm the resident mic session
        case beginCapture   // start a push-to-talk phrase
        case commit         // finish the phrase, transcribe + hand back
        case cancelCapture  // abort the current phrase, stay armed
        case ackInsert      // keyboard inserted the ready transcript
        case disarm         // tear the session down
    }

    var kind: Kind = .none
    /// Unique per command so the app processes each exactly once.
    var token = ""
    var ackInsertionToken = ""
    var updatedAt: TimeInterval = 0
}

// MARK: - Shared store

/// Reads/writes both channels in the App Group `UserDefaults`. Also posts a
/// Darwin notification when a command is written so the app can wake and react
/// without polling in the background.
struct FreestyleDictationBridge {
    static let appGroupID = "group.com.freestylevoice.app"
    static let stateKey = "com.freestylevoice.dictation.state"
    static let commandKey = "com.freestylevoice.dictation.command"
    static let commandDarwinName = "com.freestylevoice.dictation.command" as CFString

    /// How recently the app must have refreshed its heartbeat for the keyboard
    /// to treat the session as alive. If the app is closed the heartbeat goes
    /// stale and the keyboard falls back to the "start" affordance.
    static let livenessWindow: TimeInterval = 12

    private let defaults: UserDefaults

    init(defaults: UserDefaults? = UserDefaults(suiteName: appGroupID)) {
        self.defaults = defaults ?? .standard
    }

    // MARK: State channel

    func loadState() -> FreestyleDictationState {
        guard let data = defaults.data(forKey: Self.stateKey),
              let state = try? JSONDecoder().decode(FreestyleDictationState.self, from: data)
        else {
            return FreestyleDictationState()
        }
        return state
    }

    func writeState(_ mutate: (inout FreestyleDictationState) -> Void) {
        var state = loadState()
        mutate(&state)
        state.updatedAt = Date().timeIntervalSince1970
        if let data = try? JSONEncoder().encode(state) {
            defaults.set(data, forKey: Self.stateKey)
        }
    }

    func resetState() {
        if let data = try? JSONEncoder().encode(FreestyleDictationState()) {
            defaults.set(data, forKey: Self.stateKey)
        }
    }

    // MARK: Command channel

    func loadCommand() -> FreestyleKeyboardCommand {
        guard let data = defaults.data(forKey: Self.commandKey),
              let command = try? JSONDecoder().decode(FreestyleKeyboardCommand.self, from: data)
        else {
            return FreestyleKeyboardCommand()
        }
        return command
    }

    @discardableResult
    func sendCommand(
        _ kind: FreestyleKeyboardCommand.Kind,
        ackInsertionToken: String = ""
    ) -> FreestyleKeyboardCommand {
        var command = FreestyleKeyboardCommand()
        command.kind = kind
        command.token = UUID().uuidString
        command.ackInsertionToken = ackInsertionToken
        command.updatedAt = Date().timeIntervalSince1970

        if let data = try? JSONEncoder().encode(command) {
            defaults.set(data, forKey: Self.commandKey)
        }

        Self.postCommandNotification()
        return command
    }

    func clearCommand() {
        if let data = try? JSONEncoder().encode(FreestyleKeyboardCommand()) {
            defaults.set(data, forKey: Self.commandKey)
        }
    }

    /// Wakes or nudges the containing app when the keyboard posts a command.
    static func postCommandNotification() {
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(commandDarwinName),
            nil,
            nil,
            true
        )
    }

    // MARK: Liveness

    func isSessionAlive(
        _ state: FreestyleDictationState,
        now: TimeInterval = Date().timeIntervalSince1970
    ) -> Bool {
        switch state.phase {
        case .idle, .failed:
            return false
        case .arming, .armed, .capturing, .transcribing, .ready:
            return now - state.heartbeat < Self.livenessWindow
        }
    }
}
