import SwiftUI
import UIKit

/// Freestyle's design tokens, mirrored from `apps/mobile/src/constants/theme.ts`
/// (which is itself lifted from `DESIGN.md`). A keyboard extension can't share
/// code with the React Native app, so the palette is duplicated here as raw hex.
/// Warm paper substrate, near-black ink, olive accent — never pure white/black.
private enum Freestyle {
    struct Palette {
        let background: UIColor
        let foreground: UIColor
        let card: UIColor
        let primary: UIColor
        let primaryForeground: UIColor
        let secondary: UIColor
        let mutedForeground: UIColor
        let border: UIColor
        let destructive: UIColor
    }

    static let light = Palette(
        background: UIColor(hex: 0xF4F0E4),
        foreground: UIColor(hex: 0x16140F),
        card: UIColor(hex: 0xFBF8EE),
        primary: UIColor(hex: 0x6B8F12),
        primaryForeground: UIColor(hex: 0xFBF8EE),
        secondary: UIColor(hex: 0xECE7D6),
        mutedForeground: UIColor(hex: 0x7B7461),
        border: UIColor(hex: 0xD6CDB8),
        destructive: UIColor(hex: 0xDD6E4E)
    )

    static let dark = Palette(
        background: UIColor(hex: 0x16140F),
        foreground: UIColor(hex: 0xECE7D6),
        card: UIColor(hex: 0x1E1C16),
        primary: UIColor(hex: 0x8AB62A),
        primaryForeground: UIColor(hex: 0x16140F),
        secondary: UIColor(hex: 0x2A2720),
        mutedForeground: UIColor(hex: 0x9E977F),
        border: UIColor(hex: 0x3A362D),
        destructive: UIColor(hex: 0xE0805F)
    )

    static func palette(dark: Bool) -> Palette { dark ? Self.dark : Self.light }
}

extension UIColor {
    /// Build a color from a 24-bit RGB hex literal (e.g. `0x6B8F12`).
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

extension Color {
    /// SwiftUI mirror of `UIColor(hex:)` for the mic control.
    init(hex: UInt32) { self.init(UIColor(hex: hex)) }
}

/// Freestyle voice keyboard — a minimal, mic-focused keyboard extension.
///
/// iOS blocks microphone capture inside keyboard extensions (every capture API —
/// AVAudioEngine, RemoteIO, AVAudioRecorder — fails on-device, matching Apple's
/// app-extension restriction). So the app owns the mic and the keyboard drives
/// it over the App Group via `FreestyleDictationBridge`:
///
///   • First mic tap (session not alive) sends a `start` command and opens the
///     app once via a SwiftUI `Link` (the only mechanism that reliably launches
///     the host app from a keyboard on iOS 18+). The app arms a resident mic
///     session and publishes `armed`.
///   • Once armed, the mic tap toggles capture in place: `beginCapture` while
///     armed, `commit` while capturing — no app relaunch. The keyboard shows
///     live status + partials read from the state channel.
///   • On a `ready` state the keyboard inserts the final transcript (guarded by
///     `insertionToken` so each result inserts exactly once) and acks it.
///
/// Users switch to their normal system keyboard (via the globe key) for regular
/// typing. This keyboard exists solely for voice dictation.
final class KeyboardViewController: UIInputViewController {

    // MARK: - Bridge / session state

    private let bridge = FreestyleDictationBridge()
    private var statePollTimer: Timer?
    private var lastInsertedToken = ""
    /// Cached so we only rebuild the mic control when the phase or liveness
    /// actually changes, not on every 0.3s poll tick.
    private var lastRenderedPhase: FreestyleDictationState.Phase?
    private var lastRenderedAlive = false

    // MARK: - Keys / UI state

    private var deleteTimer: Timer?
    private var deleteRepeatCount = 0

    private var micHost: UIHostingController<MicControl>?
    private let statusLabel = UILabel()
    private var hintLabel: UILabel?
    private let meterTrack = UIView()
    private let meterFill = UIView()
    private var meterFillWidth: NSLayoutConstraint?
    private var globeButton: UIButton?
    private var spaceButton: UIButton?
    private var deleteButton: UIButton?
    private var commaButton: UIButton?
    private var periodButton: UIButton?
    private var returnButton: UIButton?

    // MARK: - Lifecycle

    override init(nibName nibNameOrNil: String?, bundle nibBundleOrNil: Bundle?) {
        super.init(nibName: nibNameOrNil, bundle: nibBundleOrNil)
        hasDictationKey = true
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        hasDictationKey = true
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        hasDictationKey = true
        buildLayout()
        applyColors()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        hasDictationKey = true
        syncSharedState()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startPollingSharedState()
        syncSharedState()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopPollingSharedState()
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        applyColors()
    }

    private var isDark: Bool { traitCollection.userInterfaceStyle == .dark }

    // MARK: - Layout

    /// Standard iOS keyboard height (4 rows × 46pt + 3 gaps × 9pt + toolbar 44pt
    /// + top/bottom spacing). Matches the system keyboard so the transition
    /// between Freestyle and the user's normal keyboard doesn't jump.
    private func buildLayout() {
        let keyboardHeight: CGFloat = 291
        let heightConstraint = view.heightAnchor.constraint(equalToConstant: keyboardHeight)
        heightConstraint.priority = .required - 1
        heightConstraint.isActive = true

        // --- Status label (top area) — live dictation status, briefly reused
        // for the "inserted" confirmation.
        statusLabel.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 2
        statusLabel.text = ""
        statusLabel.isHidden = true
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusLabel)

        // --- Mic control (center, prominent). Depending on session state it
        // either deep-links (SwiftUI `Link`, to arm the session) or toggles
        // capture in place (a button that posts commands to the app).
        let mic = UIHostingController(rootView: makeMicControl(dark: isDark))
        mic.view.backgroundColor = .clear
        mic.view.translatesAutoresizingMaskIntoConstraints = false
        addChild(mic)
        view.addSubview(mic.view)
        mic.didMove(toParent: self)
        micHost = mic

        // --- Hint below the mic (mono eyebrow, mirrors the app's status text)
        let hint = UILabel()
        hint.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        hint.attributedText = NSAttributedString(
            string: "TAP TO DICTATE",
            attributes: [.kern: 1.2]
        )
        hint.textAlignment = .center
        hint.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hint)
        hintLabel = hint

        // --- Mic level meter — a thin bar under the hint, shown while capturing.
        meterTrack.layer.cornerRadius = 2
        meterTrack.clipsToBounds = true
        meterTrack.isHidden = true
        meterTrack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(meterTrack)

        meterFill.layer.cornerRadius = 2
        meterFill.translatesAutoresizingMaskIntoConstraints = false
        meterTrack.addSubview(meterFill)

        // --- Bottom row: globe | , | . | space | return | delete
        let bottomRow = UIStackView()
        bottomRow.axis = .horizontal
        bottomRow.spacing = 6
        bottomRow.alignment = .fill
        bottomRow.distribution = .fill
        bottomRow.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bottomRow)

        // Globe key — switch keyboards
        let globe = UIButton(type: .system)
        globe.setImage(UIImage(systemName: "globe"), for: .normal)
        globe.addTarget(self, action: #selector(handleNextKeyboard), for: .touchUpInside)
        globe.isHidden = !needsInputModeSwitchKey
        globe.layer.cornerRadius = 8
        globe.widthAnchor.constraint(equalToConstant: 44).isActive = true
        bottomRow.addArrangedSubview(globe)
        globeButton = globe

        // Comma & period — grouped on the left for quick punctuation
        // without switching keyboards.
        let comma = makeCharKey(",")
        comma.widthAnchor.constraint(equalToConstant: 40).isActive = true
        bottomRow.addArrangedSubview(comma)
        commaButton = comma

        let period = makeCharKey(".")
        period.widthAnchor.constraint(equalToConstant: 40).isActive = true
        bottomRow.addArrangedSubview(period)
        periodButton = period

        // Space bar — wide, stretches to fill
        let space = UIButton(type: .system)
        space.setTitle("space", for: .normal)
        space.titleLabel?.font = .systemFont(ofSize: 16, weight: .regular)
        space.layer.cornerRadius = 8
        space.addAction(UIAction { [weak self] _ in
            UIDevice.current.playInputClick()
            self?.textDocumentProxy.insertText(" ")
        }, for: .touchDown)
        bottomRow.addArrangedSubview(space)
        spaceButton = space

        // Return key — insert a newline without switching keyboards
        let ret = UIButton(type: .system)
        ret.setImage(UIImage(systemName: "return.left"), for: .normal)
        ret.layer.cornerRadius = 8
        ret.addAction(UIAction { [weak self] _ in
            UIDevice.current.playInputClick()
            self?.textDocumentProxy.insertText("\n")
        }, for: .touchUpInside)
        ret.widthAnchor.constraint(equalToConstant: 48).isActive = true
        bottomRow.addArrangedSubview(ret)
        returnButton = ret

        // Delete key — with hold-to-repeat. Kept as the rightmost key so it's
        // where the thumb expects it, matching the system keyboard.
        let del = UIButton(type: .system)
        del.setImage(UIImage(systemName: "delete.left"), for: .normal)
        del.layer.cornerRadius = 8
        del.addTarget(self, action: #selector(handleDeleteDown), for: .touchDown)
        for event: UIControl.Event in [.touchUpInside, .touchUpOutside, .touchCancel] {
            del.addTarget(self, action: #selector(handleDeleteUp), for: event)
        }
        del.widthAnchor.constraint(equalToConstant: 44).isActive = true
        bottomRow.addArrangedSubview(del)
        deleteButton = del

        // --- Constraints
        let micSize: CGFloat = 64

        NSLayoutConstraint.activate([
            // Status label — centered near the top.
            statusLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            statusLabel.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 16),
            statusLabel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -16),
            statusLabel.topAnchor.constraint(equalTo: view.topAnchor, constant: 12),

            // Mic — centered in the upper 2/3 of the keyboard area.
            mic.view.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            mic.view.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -30),
            mic.view.widthAnchor.constraint(equalToConstant: micSize),
            mic.view.heightAnchor.constraint(equalToConstant: micSize),

            // Hint — just below the mic.
            hint.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hint.topAnchor.constraint(equalTo: mic.view.bottomAnchor, constant: 12),

            // Meter — a fixed-width track just below the hint.
            meterTrack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            meterTrack.topAnchor.constraint(equalTo: hint.bottomAnchor, constant: 10),
            meterTrack.widthAnchor.constraint(equalToConstant: 140),
            meterTrack.heightAnchor.constraint(equalToConstant: 4),

            // Meter fill — pinned to the leading edge, width driven by level.
            meterFill.leadingAnchor.constraint(equalTo: meterTrack.leadingAnchor),
            meterFill.topAnchor.constraint(equalTo: meterTrack.topAnchor),
            meterFill.bottomAnchor.constraint(equalTo: meterTrack.bottomAnchor),

            // Bottom row — pinned to bottom with standard keyboard margins.
            bottomRow.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 3),
            bottomRow.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -3),
            bottomRow.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -9),
            bottomRow.heightAnchor.constraint(equalToConstant: 46),
        ])

        // Dynamic meter-fill width, updated as the level changes.
        let fillWidth = meterFill.widthAnchor.constraint(equalToConstant: 0)
        fillWidth.isActive = true
        meterFillWidth = fillWidth
    }

    /// A punctuation key styled like the space bar. Inserts on touch-down to
    /// match the delete key and avoid dropped taps during fast entry.
    private func makeCharKey(_ char: String) -> UIButton {
        let key = UIButton(type: .system)
        key.setTitle(char, for: .normal)
        key.titleLabel?.font = .systemFont(ofSize: 18, weight: .regular)
        key.layer.cornerRadius = 8
        key.addAction(UIAction { [weak self] _ in
            UIDevice.current.playInputClick()
            self?.textDocumentProxy.insertText(char)
        }, for: .touchDown)
        return key
    }

    // MARK: - Mic control

    /// Build the mic control for the current session state.
    ///
    /// When no live session exists the control is a SwiftUI `Link` that opens
    /// the app (arming it). Once the session is alive the control is an in-place
    /// button that toggles capture via the command channel, so the user never
    /// has to leave the keyboard again for the rest of the session.
    private func makeMicControl(dark: Bool) -> MicControl {
        let state = bridge.loadState()
        let alive = bridge.isSessionAlive(state)

        if alive {
            let capturing = state.phase == .capturing
            return MicControl(
                mode: .inPlace(capturing: capturing),
                dark: dark,
                onTap: { [weak self] in self?.handleMicTapWhileArmed() }
            )
        }

        // No live session: deep-link to arm. Send the `start` command first so
        // the app has it waiting when it launches.
        return MicControl(
            mode: .link(destination: URL(string: "freestyle://dictate")!),
            dark: dark,
            onLinkActivate: { [weak self] in self?.bridge.sendCommand(.start) }
        )
    }

    /// Mic tapped while the session is alive: toggle capture in place.
    private func handleMicTapWhileArmed() {
        UIDevice.current.playInputClick()
        let state = bridge.loadState()
        switch state.phase {
        case .armed, .ready:
            // Armed (or just inserted a phrase and re-armed): the app already
            // holds the mic warm, so begin the next phrase in place — no app
            // relaunch. This is the "tap again → just records" path.
            bridge.sendCommand(.beginCapture)
        case .capturing:
            bridge.sendCommand(.commit)
        case .arming, .transcribing, .idle, .failed:
            break // busy or not ready — ignore
        }
        // Reflect the intent immediately; the poll will reconcile with truth.
        syncSharedState()
    }

    // MARK: - Actions

    @objc private func handleNextKeyboard() { advanceToNextInputMode() }

    // MARK: - Delete (with hold-to-repeat)

    /// iOS-style backspace: a tap deletes one character; holding auto-repeats
    /// with an accelerating rate (starts ~0.12s, floors at ~0.04s).
    @objc private func handleDeleteDown() {
        UIDevice.current.playInputClick()
        textDocumentProxy.deleteBackward()
        deleteRepeatCount = 0
        deleteTimer?.invalidate()
        deleteTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: false) { [weak self] _ in
            self?.scheduleNextDelete()
        }
    }

    private func scheduleNextDelete() {
        deleteTimer?.invalidate()
        let interval = max(0.04, 0.12 - Double(deleteRepeatCount) * 0.012)
        deleteTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            guard let self else { return }
            self.textDocumentProxy.deleteBackward()
            self.deleteRepeatCount += 1
            self.scheduleNextDelete()
        }
    }

    @objc private func handleDeleteUp() {
        deleteTimer?.invalidate()
        deleteTimer = nil
        deleteRepeatCount = 0
    }

    // MARK: - Shared state polling (app → keyboard)

    private func startPollingSharedState() {
        guard statePollTimer == nil else { return }
        let timer = Timer(timeInterval: 0.3, repeats: true) { [weak self] _ in
            self?.syncSharedState()
        }
        RunLoop.main.add(timer, forMode: .common)
        statePollTimer = timer
    }

    private func stopPollingSharedState() {
        statePollTimer?.invalidate()
        statePollTimer = nil
    }

    /// Read the app's published state and reconcile the keyboard UI:
    ///  1. Insert a ready transcript (exactly once, via `insertionToken`).
    ///  2. Rebuild the mic control + status text when the phase/liveness changes.
    private func syncSharedState() {
        let state = bridge.loadState()
        let alive = bridge.isSessionAlive(state)

        // 1. Insert a ready transcript, then ack so the app can re-arm.
        if alive,
           state.phase == .ready,
           !state.insertionToken.isEmpty,
           state.insertionToken != lastInsertedToken,
           !state.finalTranscript.isEmpty {
            insertTranscript(state.finalTranscript)
            lastInsertedToken = state.insertionToken
            bridge.sendCommand(.ackInsert, ackInsertionToken: state.insertionToken)
        }

        // 2. Rebuild the mic control only when something visible changed.
        if state.phase != lastRenderedPhase || alive != lastRenderedAlive {
            lastRenderedPhase = state.phase
            lastRenderedAlive = alive
            micHost?.rootView = makeMicControl(dark: isDark)
        }
        updateStatus(for: state, alive: alive)
    }

    private func insertTranscript(_ text: String) {
        let before = textDocumentProxy.documentContextBeforeInput ?? ""
        if let last = before.last, !last.isWhitespace {
            textDocumentProxy.insertText(" ")
        }
        textDocumentProxy.insertText(text)
    }

    // MARK: - Status / hint text

    private func updateStatus(for state: FreestyleDictationState, alive: Bool) {
        let capturing = alive && state.phase == .capturing
        updateMeter(level: capturing ? state.level : 0, visible: capturing)

        // Partial transcript takes over the status line while capturing.
        if capturing, !state.partialTranscript.isEmpty {
            setStatus(state.partialTranscript, mono: false)
            setHint("TAP TO STOP")
            return
        }

        let hint: String
        let status: String?
        if alive {
            switch state.phase {
            case .arming:
                status = "Waking Freestyle…"; hint = "ONE SEC"
            case .armed:
                status = nil; hint = "TAP TO SPEAK"
            case .capturing:
                status = "Listening…"; hint = "TAP TO STOP"
            case .transcribing:
                status = "Polishing…"; hint = "ONE SEC"
            case .ready:
                status = nil; hint = "INSERTED ✓"
            case .idle, .failed:
                status = nil; hint = "TAP TO DICTATE"
            }
        } else {
            status = nil
            hint = "TAP TO DICTATE"
        }

        if let status {
            setStatus(status, mono: true)
        } else {
            clearStatus()
        }
        setHint(hint)
    }

    private func setStatus(_ text: String, mono: Bool) {
        statusLabel.isHidden = false
        statusLabel.font = mono
            ? .monospacedSystemFont(ofSize: 11, weight: .medium)
            : .systemFont(ofSize: 13, weight: .regular)
        if mono {
            statusLabel.attributedText = NSAttributedString(
                string: text.uppercased(),
                attributes: [.kern: 1.2]
            )
        } else {
            statusLabel.attributedText = nil
            statusLabel.text = text
        }
    }

    private func clearStatus() {
        statusLabel.isHidden = true
        statusLabel.attributedText = nil
        statusLabel.text = ""
    }

    private func setHint(_ text: String) {
        hintLabel?.attributedText = NSAttributedString(
            string: text,
            attributes: [.kern: 1.2]
        )
    }

    /// Drive the mic-level bar. `level` is clamped to [0, 1]; the fill width is
    /// a fraction of the 140pt track. Hidden entirely when not capturing.
    private func updateMeter(level: Double, visible: Bool) {
        meterTrack.isHidden = !visible
        guard visible else {
            meterFillWidth?.constant = 0
            return
        }
        let clamped = CGFloat(max(0, min(1, level)))
        meterFillWidth?.constant = 140 * clamped
    }

    // MARK: - Appearance

    private func applyColors() {
        let dark = isDark
        let c = Freestyle.palette(dark: dark)

        // Match the default Apple keyboard appearance — use system colors for
        // the background and keys so it feels native. Only the mic button
        // keeps the Freestyle olive accent.

        // Standard iOS keyboard background.
        view.backgroundColor = dark
            ? UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1) // #1C1C1E approx
            : UIColor(red: 0.82, green: 0.84, blue: 0.86, alpha: 1) // #D1D5DB approx

        // Character keys (space, comma, period) — white/dark raised key style.
        let charKeys = [spaceButton, commaButton, periodButton]
        for key in charKeys {
            key?.backgroundColor = dark
                ? UIColor(white: 0.35, alpha: 1)
                : .white
            key?.setTitleColor(dark ? .white : .black, for: .normal)
            key?.layer.borderWidth = 0
            key?.layer.borderColor = nil
            key?.layer.shadowColor = UIColor.black.cgColor
            key?.layer.shadowOpacity = dark ? 0 : 0.15
            key?.layer.shadowOffset = CGSize(width: 0, height: 1)
            key?.layer.shadowRadius = 0.5
        }

        // Special keys (globe, delete, return) — darker/lighter fill like the
        // system keyboard's shift/backspace keys.
        let specialKeys = [globeButton, deleteButton, returnButton]
        for key in specialKeys {
            key?.backgroundColor = dark
                ? UIColor(white: 0.22, alpha: 1)
                : UIColor(red: 0.68, green: 0.71, blue: 0.74, alpha: 1) // #ADB5BD approx
            key?.tintColor = dark ? .white : .black
            key?.layer.borderWidth = 0
            key?.layer.borderColor = nil
        }

        // Labels use standard system text colors.
        statusLabel.textColor = c.mutedForeground
        hintLabel?.textColor = dark
            ? UIColor(white: 0.6, alpha: 1)
            : UIColor(white: 0.4, alpha: 1)

        // Meter — subtle track, olive fill (matches the mic accent).
        meterTrack.backgroundColor = dark
            ? UIColor(white: 1, alpha: 0.12)
            : UIColor(white: 0, alpha: 0.10)
        meterFill.backgroundColor = c.primary

        micHost?.rootView = makeMicControl(dark: dark)
    }
}

/// Enables the system key-click sound/haptic (`playInputClick()`), which fires
/// only while the keyboard is visible and, for haptics, when Full Access is on.
extension KeyboardViewController: UIInputViewAudioFeedback {
    var enableInputClicksWhenVisible: Bool { true }
}

/// The mic control. Two modes:
///  - `.link`: a SwiftUI `Link` that opens the containing app — the only
///    mechanism that reliably launches the host app from a keyboard on iOS 18+
///    (the old `openURL:` responder-chain hack force-returns false). Used to arm
///    a fresh session.
///  - `.inPlace`: a plain button that toggles capture via the command channel
///    once the session is already alive, so the user stays in the keyboard.
struct MicControl: View {
    enum Mode {
        case link(destination: URL)
        case inPlace(capturing: Bool)
    }

    let mode: Mode
    let dark: Bool
    var onTap: (() -> Void)?
    var onLinkActivate: (() -> Void)?

    /// Olive accent, matching `mic-button.tsx` and DESIGN.md `--primary`.
    private var olive: Color { Color(hex: dark ? 0x8AB62A : 0x6B8F12) }
    private var destructive: Color { Color(hex: dark ? 0xE0805F : 0xDD6E4E) }
    private var iconColor: Color { Color(hex: dark ? 0x16140F : 0xFBF8EE) }

    var body: some View {
        switch mode {
        case let .link(destination):
            Link(destination: destination) {
                circle(systemImage: "mic.fill", fill: olive)
            }
            .simultaneousGesture(TapGesture().onEnded { onLinkActivate?() })
        case let .inPlace(capturing):
            Button(action: { onTap?() }) {
                circle(
                    systemImage: capturing ? "stop.fill" : "mic.fill",
                    fill: capturing ? destructive : olive
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func circle(systemImage: String, fill: Color) -> some View {
        Image(systemName: systemImage)
            .font(.system(size: 24, weight: .semibold))
            .foregroundColor(iconColor)
            .frame(width: 64, height: 64)
            .background(fill)
            .clipShape(Circle())
            .contentShape(Circle())
            // Soft glow lifts the mic off the paper (mirrors the app's MicButton).
            .shadow(color: fill.opacity(0.45), radius: 12, x: 0, y: 5)
    }
}
