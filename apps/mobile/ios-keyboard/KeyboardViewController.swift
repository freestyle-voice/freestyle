import UIKit

/// Freestyle voice keyboard.
///
/// A single voice panel (no QWERTY): a large centered transcription area, a
/// thin level-driven waveform, a status line, cancel/commit controls, and — only
/// when the host needs it — a next-keyboard switch. It captures mic audio with
/// `AudioEngineCapture`, streams PCM16/16k/mono frames to Freestyle Cloud over
/// `CloudStreamSession` (`/v2/stream`), shows live partials in-panel, and inserts
/// the committed final transcript into the host text field.
///
/// `CloudTranscriber` (batch `POST /v2/transcribe`) ships alongside as a
/// fallback for when the socket can't open; wiring it requires buffering the
/// captured audio to a file, which is a deliberate follow-up so we don't pay the
/// memory cost on the streaming happy path.
///
/// Visual language: neutral, system-native keyboard chrome (no warm-paper tint)
/// so it blends with the host keyboard; the only accent is the olive commit/mic.
final class KeyboardViewController: UIInputViewController {
    // Neutral palette resolved per light/dark. Backgrounds track the system
    // keyboard greys rather than the app's warm paper, so we sit naturally next
    // to the OS keyboard. Olive is the single accent (commit + active mic).
    private enum Palette {
        static func background(_ dark: Bool) -> UIColor {
            dark ? UIColor(white: 0.11, alpha: 1) : UIColor(white: 0.94, alpha: 1)
        }
        static func surface(_ dark: Bool) -> UIColor {
            dark ? UIColor(white: 0.17, alpha: 1) : UIColor(white: 1, alpha: 1)
        }
        static func foreground(_ dark: Bool) -> UIColor {
            dark ? UIColor(white: 0.96, alpha: 1) : UIColor(white: 0.10, alpha: 1)
        }
        static func muted(_ dark: Bool) -> UIColor {
            dark ? UIColor(white: 0.62, alpha: 1) : UIColor(white: 0.45, alpha: 1)
        }
        static func accent(_ dark: Bool) -> UIColor {
            dark ? UIColor(red: 0.54, green: 0.71, blue: 0.16, alpha: 1)
                 : UIColor(red: 0.42, green: 0.56, blue: 0.07, alpha: 1)
        }
        static func destructive(_ dark: Bool) -> UIColor {
            dark ? UIColor(red: 0.88, green: 0.50, blue: 0.37, alpha: 1)
                 : UIColor(red: 0.87, green: 0.43, blue: 0.31, alpha: 1)
        }
    }

    private enum Mode {
        case noAccess
        case idle
        case streaming
        case finalizing
        case error(String)
    }

    private var mode: Mode = .idle

    private let transcriptLabel = UILabel()
    private let statusLabel = UILabel()
    private let hintButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)
    private let commitButton = UIButton(type: .system)
    private let nextKeyboardButton = UIButton(type: .system)
    private let waveform = WaveformView()

    private let capture = AudioEngineCapture()
    private var session: CloudStreamSession?
    private var partialText = ""
    private var recordingStartedAt: Date?

    override func viewDidLoad() {
        super.viewDidLoad()
        buildUI()
        capture.onLevel = { [weak self] level in
            self?.waveform.setLevel(level)
        }
        capture.onFrame = { [weak self] frame in
            self?.session?.sendAudio(frame)
        }
        refreshMode()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        // The extension can be torn down at any time; release the engine + socket
        // promptly to respect the tight keyboard memory budget.
        teardown(cancel: true)
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        applyColors()
    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        teardown(cancel: true)
        setMode(.idle)
    }

    private var isDark: Bool {
        traitCollection.userInterfaceStyle == .dark
    }

    // MARK: - Layout

    private func buildUI() {
        let heightConstraint = view.heightAnchor.constraint(equalToConstant: 268)
        heightConstraint.priority = .defaultHigh
        heightConstraint.isActive = true

        transcriptLabel.numberOfLines = 4
        transcriptLabel.textAlignment = .center
        transcriptLabel.font = .systemFont(ofSize: 22, weight: .regular)
        transcriptLabel.adjustsFontSizeToFitWidth = true
        transcriptLabel.minimumScaleFactor = 0.7

        statusLabel.textAlignment = .center
        statusLabel.font = .systemFont(ofSize: 11, weight: .semibold)
        statusLabel.numberOfLines = 2

        hintButton.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
        hintButton.titleLabel?.textAlignment = .center
        hintButton.titleLabel?.numberOfLines = 2
        hintButton.addTarget(self, action: #selector(handleHint), for: .touchUpInside)
        hintButton.isHidden = true

        configureCircle(cancelButton, systemName: "xmark")
        configureCircle(commitButton, systemName: "checkmark")
        cancelButton.addTarget(self, action: #selector(handleCancel), for: .touchUpInside)
        commitButton.addTarget(self, action: #selector(handleCommit), for: .touchUpInside)

        // Only show our own switch button when the host actually needs one; in
        // many contexts iOS draws its own globe, so a second one is redundant.
        configureCircle(nextKeyboardButton, systemName: "globe")
        nextKeyboardButton.addTarget(
            self,
            action: #selector(handleAdvanceToNextInputMode),
            for: .touchUpInside
        )
        nextKeyboardButton.isHidden = !needsInputModeSwitchKey

        // A tap anywhere on the center starts/stops dictation.
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleCenterTap))
        transcriptLabel.isUserInteractionEnabled = true
        transcriptLabel.addGestureRecognizer(tap)

        let center = UIStackView(arrangedSubviews: [transcriptLabel, waveform, statusLabel])
        center.axis = .vertical
        center.spacing = 12
        center.alignment = .fill

        for v in [cancelButton, commitButton, nextKeyboardButton, hintButton, center] {
            v.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(v)
        }

        let g = view.layoutMarginsGuide
        NSLayoutConstraint.activate([
            cancelButton.topAnchor.constraint(equalTo: g.topAnchor, constant: 12),
            cancelButton.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 8),
            commitButton.topAnchor.constraint(equalTo: g.topAnchor, constant: 12),
            commitButton.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -8),

            center.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            center.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 20),
            center.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -20),
            waveform.heightAnchor.constraint(equalToConstant: 28),

            hintButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hintButton.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            hintButton.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 24),
            hintButton.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -24),

            nextKeyboardButton.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -8),
            nextKeyboardButton.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 8),
        ])
    }

    private func configureCircle(_ button: UIButton, systemName: String) {
        let cfg = UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
        button.setImage(UIImage(systemName: systemName, withConfiguration: cfg), for: .normal)
        button.layer.cornerRadius = 20
        button.widthAnchor.constraint(equalToConstant: 40).isActive = true
        button.heightAnchor.constraint(equalToConstant: 40).isActive = true
    }

    private func applyColors() {
        let dark = isDark
        view.backgroundColor = Palette.background(dark)
        transcriptLabel.textColor = statusTextColor(dark)
        statusLabel.textColor = Palette.muted(dark)
        hintButton.setTitleColor(Palette.foreground(dark), for: .normal)

        cancelButton.tintColor = Palette.foreground(dark)
        cancelButton.backgroundColor = Palette.surface(dark)
        nextKeyboardButton.tintColor = Palette.foreground(dark)
        nextKeyboardButton.backgroundColor = .clear
        commitButton.tintColor = dark ? UIColor(white: 0.10, alpha: 1) : .white
        commitButton.backgroundColor = Palette.accent(dark)

        waveform.barColor = Palette.accent(dark)
    }

    private func statusTextColor(_ dark: Bool) -> UIColor {
        switch mode {
        case .idle, .noAccess: return Palette.muted(dark)
        case .error: return Palette.destructive(dark)
        default: return Palette.foreground(dark)
        }
    }

    // MARK: - Mode

    private func refreshMode() {
        setMode(hasFullAccess ? .idle : .noAccess)
    }

    private func setMode(_ newMode: Mode) {
        mode = newMode
        let dark = isDark

        switch newMode {
        case .noAccess:
            hintButton.isHidden = false
            hintButton.setTitle(
                "Enable “Allow Full Access” for Freestyle in Settings to dictate.",
                for: .normal
            )
            setPanelHidden(true)
            waveform.setActive(false)
        case .idle:
            hintButton.isHidden = true
            setPanelHidden(false)
            transcriptLabel.text = "Tap to speak"
            statusLabel.text = ""
            waveform.setActive(false)
        case .streaming:
            hintButton.isHidden = true
            setPanelHidden(false)
            statusLabel.text = "LISTENING"
            waveform.setActive(true)
        case .finalizing:
            statusLabel.text = "POLISHING"
            waveform.setActive(false)
        case let .error(message):
            hintButton.isHidden = true
            setPanelHidden(false)
            transcriptLabel.text = message
            statusLabel.text = ""
            waveform.setActive(false)
        }

        transcriptLabel.textColor = statusTextColor(dark)

        let active: Bool
        switch newMode {
        case .streaming, .finalizing: active = true
        default: active = false
        }
        commitButton.isEnabled = active
        cancelButton.isEnabled = active
        commitButton.alpha = active ? 1 : 0.35
        cancelButton.alpha = active ? 1 : 0.35
    }

    private func setPanelHidden(_ hidden: Bool) {
        transcriptLabel.isHidden = hidden
        statusLabel.isHidden = hidden
        waveform.isHidden = hidden
    }

    // MARK: - Actions

    @objc private func handleCenterTap() {
        guard hasFullAccess else { openHostSettings(); return }
        switch mode {
        case .idle, .error:
            startDictation()
        case .streaming:
            commitDictation()
        default:
            break
        }
    }

    @objc private func handleCommit() { commitDictation() }

    @objc private func handleCancel() {
        teardown(cancel: true)
        setMode(.idle)
    }

    @objc private func handleHint() { openHostSettings() }

    @objc private func handleAdvanceToNextInputMode() { advanceToNextInputMode() }

    // MARK: - Dictation lifecycle

    private func startDictation() {
        guard let token = SharedStore.sessionToken() else {
            setMode(.error("Open Freestyle to sign in"))
            return
        }

        partialText = ""
        transcriptLabel.text = ""
        recordingStartedAt = Date()
        setMode(.streaming)

        let prefs = SharedStore.streamPreferences()
        session = CloudStreamSession(
            baseURL: SharedStore.cloudBaseURL(),
            token: token,
            preferences: prefs,
            handler: { [weak self] event in
                DispatchQueue.main.async { self?.handle(event) }
            }
        )
        session?.start()

        do {
            try capture.start()
        } catch {
            teardown(cancel: true)
            setMode(.error("Couldn’t start the microphone"))
        }
    }

    private func commitDictation() {
        guard case .streaming = mode else { return }
        capture.stop()
        waveform.setActive(false)
        let elapsed = recordingStartedAt.map { Date().timeIntervalSince($0) } ?? 0
        // Ignore accidental taps that produced essentially no audio.
        if elapsed < 0.35 {
            teardown(cancel: true)
            setMode(.idle)
            return
        }
        setMode(.finalizing)
        session?.commit(audioDurationMs: Int(elapsed * 1000))
    }

    private func handle(_ event: CloudStreamSession.Event) {
        switch event {
        case .ready:
            break
        case let .partial(text):
            guard case .streaming = mode else { return }
            partialText = text
            transcriptLabel.text = text.isEmpty ? "…" : text
        case let .final(text):
            insertFinal(text)
            teardown(cancel: false)
            setMode(.idle)
        case let .error(message, code):
            teardown(cancel: true)
            setMode(.error(errorMessage(message, code)))
        case .closed:
            if case .finalizing = mode { setMode(.idle) }
        }
    }

    private func insertFinal(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        // Add a leading space when the field already has trailing non-space text,
        // so successive dictations don't run together.
        let before = textDocumentProxy.documentContextBeforeInput ?? ""
        if let last = before.last, !last.isWhitespace {
            textDocumentProxy.insertText(" ")
        }
        textDocumentProxy.insertText(trimmed)
    }

    private func errorMessage(_ message: String, _ code: String?) -> String {
        switch code {
        case "usage_exceeded": return "Out of Freestyle credits"
        case "unauthorized": return "Open Freestyle to sign in"
        default: return message.isEmpty ? "Transcription failed" : message
        }
    }

    private func teardown(cancel: Bool) {
        capture.stop()
        if cancel { session?.cancel() }
        session?.close()
        session = nil
        recordingStartedAt = nil
        waveform.setActive(false)
    }

    private func openHostSettings() {
        // Extensions can't open Settings directly; deep-link the host app, which
        // routes users to the keyboard setup screen.
        guard let url = URL(string: "freestyle://keyboard-setup") else { return }
        var responder: UIResponder? = self
        let selector = sel_registerName("openURL:")
        while let r = responder {
            if r.responds(to: selector) {
                _ = r.perform(selector, with: url)
                return
            }
            responder = r.next
        }
    }
}
