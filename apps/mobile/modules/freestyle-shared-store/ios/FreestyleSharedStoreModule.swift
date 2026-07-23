import CoreFoundation
import ExpoModulesCore

/// Bridges the app ⇄ keyboard-extension dictation protocol to JavaScript.
///
/// iOS blocks microphone capture inside keyboard extensions, so the app owns the
/// mic and the keyboard drives it over the App Group. This module is the app's
/// side of `FreestyleDictationBridge` (see `DictationBridge.swift`, duplicated
/// verbatim from the keyboard target). It lets the React Native layer:
///   • publish session state for the keyboard (`writeState`),
///   • read the keyboard's latest command (`loadCommand`) + clear it,
///   • reset state on sign-out (`resetState`),
///   • and receive an `onCommand` event the instant the keyboard posts one (via
///     a Darwin notification) so the app reacts without polling.
///
/// The App Group `UserDefaults` is the cross-process channel — it needs no Apple
/// Team ID at runtime and is sandboxed to Freestyle's own targets.
public class FreestyleSharedStoreModule: Module {
    private let bridge = FreestyleDictationBridge()
    /// Retained so the CFNotificationCenter observer can be removed on teardown.
    private var observing = false

    public func definition() -> ModuleDefinition {
        Name("FreestyleSharedStore")

        Events("onCommand")

        // MARK: State channel (app → keyboard)

        /// Publish a session snapshot for the keyboard. The heartbeat is stamped
        /// here so the keyboard's liveness check sees a fresh timestamp on every
        /// write; callers should write at least every few seconds while a
        /// session is live (see the JS heartbeat).
        Function("writeState") { (state: DictationStateRecord) -> Void in
            self.bridge.writeState { current in
                current.phase = FreestyleDictationState.Phase(rawValue: state.phase) ?? .idle
                current.sessionID = state.sessionID
                current.partialTranscript = state.partialTranscript
                current.finalTranscript = state.finalTranscript
                current.insertionToken = state.insertionToken
                current.statusMessage = state.statusMessage
                current.level = state.level
                current.heartbeat = Date().timeIntervalSince1970
            }
        }

        /// Refresh only the mic level + heartbeat. Called frequently while
        /// capturing (per audio frame), so it avoids rewriting the whole state.
        Function("updateLevel") { (level: Double) -> Void in
            self.bridge.writeState { state in
                state.level = level
                state.heartbeat = Date().timeIntervalSince1970
            }
        }

        /// Refresh only the heartbeat (cheap keep-alive between full writes).
        Function("touchHeartbeat") { () -> Void in
            self.bridge.writeState { $0.heartbeat = Date().timeIntervalSince1970 }
        }

        Function("resetState") { () -> Void in
            self.bridge.resetState()
        }

        // MARK: Command channel (keyboard → app)

        /// Return the keyboard's latest command as a plain dict, or nil when the
        /// channel is empty (`kind == "none"`).
        Function("loadCommand") { () -> [String: Any]? in
            let command = self.bridge.loadCommand()
            guard command.kind != .none, !command.token.isEmpty else { return nil }
            return [
                "kind": command.kind.rawValue,
                "token": command.token,
                "ackInsertionToken": command.ackInsertionToken,
                "updatedAt": command.updatedAt,
            ]
        }

        Function("clearCommand") { () -> Void in
            self.bridge.clearCommand()
        }

        // MARK: Legacy one-shot hand-off (kept for the non-resident flow)

        /// Publish a ready transcript directly, without a full session. Used by
        /// the in-app dictate screen fallback. Writes a `ready` state carrying a
        /// fresh insertion token so the keyboard inserts it exactly once.
        Function("setPendingTranscript") { (text: String) -> Void in
            self.bridge.writeState { state in
                state.phase = .ready
                state.finalTranscript = text
                state.partialTranscript = text
                state.insertionToken = UUID().uuidString
                state.heartbeat = Date().timeIntervalSince1970
            }
        }

        Function("clear") { () -> Void in
            self.bridge.resetState()
            self.bridge.clearCommand()
        }

        // MARK: Darwin command notification → JS event

        OnStartObserving("onCommand") {
            self.startObservingCommands()
        }

        OnStopObserving("onCommand") {
            self.stopObservingCommands()
        }

        OnDestroy {
            self.stopObservingCommands()
        }
    }

    // MARK: - CFNotificationCenter wiring

    private func startObservingCommands() {
        guard !observing else { return }
        observing = true
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        // Pass an unretained pointer to self; the process owns the module for
        // its lifetime and we remove the observer in OnStopObserving/OnDestroy.
        let observer = Unmanaged.passUnretained(self).toOpaque()
        CFNotificationCenterAddObserver(
            center,
            observer,
            { (_, observer, _, _, _) in
                guard let observer else { return }
                let module = Unmanaged<FreestyleSharedStoreModule>
                    .fromOpaque(observer)
                    .takeUnretainedValue()
                module.emitCommand()
            },
            FreestyleDictationBridge.commandDarwinName,
            nil,
            .deliverImmediately
        )
    }

    private func stopObservingCommands() {
        guard observing else { return }
        observing = false
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = Unmanaged.passUnretained(self).toOpaque()
        CFNotificationCenterRemoveEveryObserver(center, observer)
    }

    private func emitCommand() {
        let command = self.bridge.loadCommand()
        guard command.kind != .none, !command.token.isEmpty else { return }
        sendEvent("onCommand", [
            "kind": command.kind.rawValue,
            "token": command.token,
            "ackInsertionToken": command.ackInsertionToken,
            "updatedAt": command.updatedAt,
        ])
    }
}

/// JS-supplied session snapshot. Mirrors `FreestyleDictationState` minus the
/// heartbeat/updatedAt, which the native side stamps.
struct DictationStateRecord: Record {
    @Field var phase: String = "idle"
    @Field var sessionID: String = ""
    @Field var partialTranscript: String = ""
    @Field var finalTranscript: String = ""
    @Field var insertionToken: String = ""
    @Field var statusMessage: String = ""
    @Field var level: Double = 0
}
