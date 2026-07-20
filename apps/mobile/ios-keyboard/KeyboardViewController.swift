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
/// app-extension restriction). So the mic button deep-links into the Freestyle
/// app (via a SwiftUI `Link`, the only mechanism that reliably opens the host
/// app from a keyboard on iOS 18+), which records + streams to the cloud and
/// writes the transcript into the App Group. When the keyboard reappears,
/// `insertPendingTranscriptIfAny()` inserts it.
///
/// Users switch to their normal system keyboard (via the globe key) for regular
/// typing. This keyboard exists solely for voice dictation.
final class KeyboardViewController: UIInputViewController {

    // MARK: - State

    private var deleteTimer: Timer?
    private var deleteRepeatCount = 0
    private var lastInsertedAt: Double = 0

    private var micHost: UIHostingController<MicLink>?
    private let statusLabel = UILabel()
    private var hintLabel: UILabel?
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
        insertPendingTranscriptIfAny()
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

        // --- Status label (top area, shown briefly after transcript insertion)
        statusLabel.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        statusLabel.textAlignment = .center
        statusLabel.text = ""
        statusLabel.isHidden = true
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusLabel)

        // --- Mic button (center, prominent) — deep-links to the app
        let mic = UIHostingController(
            rootView: MicLink(destination: URL(string: "freestyle://dictate")!, dark: isDark)
        )
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
            statusLabel.topAnchor.constraint(equalTo: view.topAnchor, constant: 16),

            // Mic — centered in the upper 2/3 of the keyboard area.
            mic.view.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            mic.view.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -30),
            mic.view.widthAnchor.constraint(equalToConstant: micSize),
            mic.view.heightAnchor.constraint(equalToConstant: micSize),

            // Hint — just below the mic.
            hint.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hint.topAnchor.constraint(equalTo: mic.view.bottomAnchor, constant: 12),

            // Bottom row — pinned to bottom with standard keyboard margins.
            bottomRow.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 3),
            bottomRow.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -3),
            bottomRow.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -9),
            bottomRow.heightAnchor.constraint(equalToConstant: 46),
        ])
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

    // MARK: - Appearance

    private func applyColors() {
        let dark = isDark
        let c = Freestyle.palette(dark: dark)

        // Warm paper canvas — never the stock iOS gray.
        view.backgroundColor = c.background

        // Character keys (space, comma, period) sit on the card surface with
        // ink-colored text and a hairline border, echoing the app's cards.
        let charKeys = [spaceButton, commaButton, periodButton]
        for key in charKeys {
            key?.backgroundColor = c.card
            key?.setTitleColor(c.foreground, for: .normal)
            key?.layer.borderWidth = 1
            key?.layer.borderColor = c.border.cgColor
            // A whisper of depth in light mode; flat in dark (DESIGN.md §4).
            key?.layer.shadowColor = UIColor.black.cgColor
            key?.layer.shadowOpacity = dark ? 0 : 0.08
            key?.layer.shadowOffset = CGSize(width: 0, height: 1)
            key?.layer.shadowRadius = 1
        }

        // Special keys (globe, delete, return) use the subtle secondary fill
        // with muted-ink icons.
        let specialKeys = [globeButton, deleteButton, returnButton]
        for key in specialKeys {
            key?.backgroundColor = c.secondary
            key?.tintColor = c.mutedForeground
            key?.layer.borderWidth = 1
            key?.layer.borderColor = c.border.cgColor
        }

        // Mono micro-labels in muted ink (DESIGN.md §3).
        statusLabel.textColor = c.mutedForeground
        hintLabel?.textColor = c.mutedForeground

        micHost?.rootView = MicLink(destination: URL(string: "freestyle://dictate")!, dark: dark)
    }

    // MARK: - App-handoff transcript insertion

    private func insertPendingTranscriptIfAny() {
        guard let pending = SharedStore.pendingTranscript(),
              pending.timestamp > lastInsertedAt,
              !pending.text.isEmpty
        else { return }

        lastInsertedAt = pending.timestamp
        SharedStore.clearPendingTranscript()

        let before = textDocumentProxy.documentContextBeforeInput ?? ""
        if let last = before.last, !last.isWhitespace {
            textDocumentProxy.insertText(" ")
        }
        textDocumentProxy.insertText(pending.text)

        statusLabel.isHidden = false
        statusLabel.attributedText = NSAttributedString(
            string: "INSERTED ✓",
            attributes: [.kern: 1.2]
        )
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { [weak self] in
            guard let self else { return }
            self.statusLabel.attributedText = nil
            self.statusLabel.text = ""
            self.statusLabel.isHidden = true
        }
    }
}

/// Enables the system key-click sound/haptic (`playInputClick()`), which fires
/// only while the keyboard is visible and, for haptics, when Full Access is on.
extension KeyboardViewController: UIInputViewAudioFeedback {
    var enableInputClicksWhenVisible: Bool { true }
}

/// The mic control. A SwiftUI `Link` is the only mechanism that reliably opens
/// the containing app from a keyboard extension on iOS 18+ (the old
/// `openURL:` responder-chain hack force-returns false).
struct MicLink: View {
    let destination: URL
    let dark: Bool

    /// Olive accent, matching `mic-button.tsx` and DESIGN.md `--primary`.
    private var olive: Color { Color(hex: dark ? 0x8AB62A : 0x6B8F12) }
    private var iconColor: Color { Color(hex: dark ? 0x16140F : 0xFBF8EE) }

    var body: some View {
        Link(destination: destination) {
            Image(systemName: "mic.fill")
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(iconColor)
                .frame(width: 64, height: 64)
                .background(olive)
                .clipShape(Circle())
                .contentShape(Circle())
                // Soft olive glow lifts the mic off the paper (mirrors the
                // shadow on the app's MicButton).
                .shadow(color: olive.opacity(0.45), radius: 12, x: 0, y: 5)
        }
    }
}
