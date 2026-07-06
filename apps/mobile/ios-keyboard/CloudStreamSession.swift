import Foundation

/// Real-time streaming STT client for Freestyle Cloud (`WSS /v2/stream`), the
/// native-Swift twin of the app's `CloudStreamSession` (`src/lib/cloud/stream.ts`).
///
/// Protocol (mirrors the app exactly):
///   - Client → server JSON: `start`, `commit`, `cancel`.
///   - Client → server binary: raw PCM16LE, 16 kHz, mono frames.
///   - Server → client JSON: `config`, `session.ready`, `partial`, `final`,
///     `error`.
///
/// Auth is the better-auth **bearer session token** (`Authorization: Bearer …`)
/// — the simplest cross-process credential, read from the App Group by
/// `SharedStore`. If the socket can't open before `session.ready`, callers can
/// fall back to `CloudTranscriber` (batch POST).
final class CloudStreamSession {
    struct Preferences {
        var language: String?
        var skipPostProcess: Bool
        var intensity: String?
        var personalTone: String?
        var workTone: String?
        var emailTone: String?
        var overallTone: String?
    }

    enum Event {
        case ready
        case partial(String)
        case final(String)
        case error(message: String, code: String?)
        case closed
    }

    private let baseURL: String
    private let token: String
    private let preferences: Preferences
    private let handler: (Event) -> Void

    private var task: URLSessionWebSocketTask?
    private lazy var urlSession = URLSession(configuration: .ephemeral)

    private var ready = false
    private var closed = false
    private var commitPending = false
    private var pendingAudio: [Data] = []
    private var pendingCommitDurationMs: Int = 0

    init(
        baseURL: String,
        token: String,
        preferences: Preferences,
        handler: @escaping (Event) -> Void
    ) {
        self.baseURL = baseURL
        self.token = token
        self.preferences = preferences
        self.handler = handler
    }

    // MARK: - Lifecycle

    func start() {
        guard let url = wsURL() else {
            handler(.error(message: "Invalid cloud URL", code: nil))
            return
        }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let task = urlSession.webSocketTask(with: request)
        self.task = task
        task.resume()
        receive()
        sendStart()
    }

    /// Feed a raw PCM16LE/16 kHz/mono frame. Buffered until `session.ready`.
    func sendAudio(_ frame: Data) {
        guard !closed else { return }
        guard ready, let task else {
            pendingAudio.append(frame)
            return
        }
        task.send(.data(frame)) { [weak self] error in
            if error != nil { self?.fail("Connection lost") }
        }
    }

    /// Finish and request the final (cleaned) transcript.
    func commit(audioDurationMs: Int) {
        guard !closed else { return }
        guard ready else {
            commitPending = true
            pendingCommitDurationMs = audioDurationMs
            return
        }
        flushPending()
        send(json: ["type": "commit", "audioDurationMs": audioDurationMs])
    }

    /// Abandon the utterance without producing a final.
    func cancel() {
        guard !closed else { return }
        send(json: ["type": "cancel"])
    }

    func close() {
        guard !closed else { return }
        closed = true
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        pendingAudio.removeAll()
    }

    // MARK: - Internals

    private func wsURL() -> URL? {
        var s = baseURL
        if s.hasPrefix("https") { s = "wss" + s.dropFirst("https".count) }
        else if s.hasPrefix("http") { s = "ws" + s.dropFirst("http".count) }
        return URL(string: s + "/v2/stream")
    }

    private func sendStart() {
        var message: [String: Any] = [
            "type": "start",
            "skipPostProcess": preferences.skipPostProcess,
        ]
        if let language = preferences.language { message["language"] = language }
        if !preferences.skipPostProcess {
            if let v = preferences.intensity { message["intensity"] = v }
            if let v = preferences.personalTone { message["personalTone"] = v }
            if let v = preferences.workTone { message["workTone"] = v }
            if let v = preferences.emailTone { message["emailTone"] = v }
            if let v = preferences.overallTone { message["overallTone"] = v }
        }
        send(json: message)
    }

    private func flushPending() {
        guard ready, let task else { return }
        for frame in pendingAudio {
            task.send(.data(frame)) { _ in }
        }
        pendingAudio.removeAll()
    }

    private func send(json: [String: Any]) {
        guard
            let task,
            let data = try? JSONSerialization.data(withJSONObject: json),
            let string = String(data: data, encoding: .utf8)
        else { return }
        task.send(.string(string)) { [weak self] error in
            if error != nil { self?.fail("Connection lost") }
        }
    }

    private func receive() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case let .success(message):
                if case let .string(text) = message {
                    self.handle(text)
                }
                if !self.closed { self.receive() }
            case .failure:
                if !self.closed {
                    self.closed = true
                    self.handler(.closed)
                }
            }
        }
    }

    private func handle(_ raw: String) {
        guard
            let data = raw.data(using: .utf8),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = obj["type"] as? String
        else { return }

        switch type {
        case "config":
            break
        case "session.ready":
            ready = true
            flushPending()
            handler(.ready)
            if commitPending {
                commitPending = false
                send(json: ["type": "commit", "audioDurationMs": pendingCommitDurationMs])
            }
        case "partial":
            handler(.partial((obj["text"] as? String) ?? ""))
        case "final":
            handler(.final((obj["text"] as? String) ?? ""))
        case "error":
            handler(.error(
                message: (obj["message"] as? String) ?? "Unknown cloud error",
                code: obj["code"] as? String
            ))
        default:
            break
        }
    }

    private func fail(_ message: String) {
        guard !closed else { return }
        handler(.error(message: message, code: nil))
    }
}
