import UIKit

/// Freestyle voice keyboard.
///
/// iOS keyboard extensions **cannot access the microphone**, even with "Allow
/// Full Access" (Full Access only grants network + the shared App Group
/// container). So dictation is delegated to the containing app: tapping the mic
/// opens Freestyle via a deep link, the app records + streams to the cloud and
/// writes the final transcript into the App Group, and when the user returns to
/// the host app this keyboard reads that transcript and inserts it into the
/// active text field.
///
/// Visual language: neutral, system-native keyboard chrome (no warm-paper tint)
/// so it blends with the host keyboard; the only accent is the olive mic.
final class KeyboardViewController: UIInputViewController {
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
    }

    private let titleLabel = UILabel()
    private let hintLabel = UILabel()
    private let micButton = UIButton(type: .system)
    private let nextKeyboardButton = UIButton(type: .system)
    private let deleteButton = UIButton(type: .system)
    private let spaceButton = UIButton(type: .system)
    private let returnButton = UIButton(type: .system)

    /// Timestamp of the last transcript we inserted, so we don't re-insert the
    /// same result when the keyboard reappears repeatedly.
    private var lastInsertedAt: Double = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        buildUI()
        applyColors()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // Returning from the app after dictating: pull the fresh transcript.
        insertPendingTranscriptIfAny()
    }

    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        applyColors()
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        applyColors()
    }

    private var isDark: Bool {
        traitCollection.userInterfaceStyle == .dark
    }

    // MARK: - Layout

    private func buildUI() {
        let heightConstraint = view.heightAnchor.constraint(equalToConstant: 240)
        heightConstraint.priority = .defaultHigh
        heightConstraint.isActive = true

        titleLabel.textAlignment = .center
        titleLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        titleLabel.text = "Tap to dictate"

        hintLabel.textAlignment = .center
        hintLabel.font = .systemFont(ofSize: 12, weight: .regular)
        hintLabel.numberOfLines = 2
        hintLabel.text = "Freestyle opens to capture your voice, then drops the text right here."

        // Center mic — the hero control.
        let micConfig = UIImage.SymbolConfiguration(pointSize: 30, weight: .semibold)
        micButton.setImage(UIImage(systemName: "mic.fill", withConfiguration: micConfig), for: .normal)
        micButton.layer.cornerRadius = 36
        micButton.widthAnchor.constraint(equalToConstant: 72).isActive = true
        micButton.heightAnchor.constraint(equalToConstant: 72).isActive = true
        micButton.addTarget(self, action: #selector(handleMic), for: .touchUpInside)

        configurePill(deleteButton, systemName: "delete.left")
        deleteButton.addTarget(self, action: #selector(handleDelete), for: .touchUpInside)

        spaceButton.setTitle("space", for: .normal)
        spaceButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .regular)
        spaceButton.layer.cornerRadius = 8
        spaceButton.addTarget(self, action: #selector(handleSpace), for: .touchUpInside)

        configurePill(returnButton, systemName: "return")
        returnButton.addTarget(self, action: #selector(handleReturn), for: .touchUpInside)

        nextKeyboardButton.setImage(
            UIImage(systemName: "globe"),
            for: .normal
        )
        nextKeyboardButton.addTarget(
            self,
            action: #selector(handleAdvanceToNextInputMode),
            for: .touchUpInside
        )
        nextKeyboardButton.isHidden = !needsInputModeSwitchKey

        let textStack = UIStackView(arrangedSubviews: [titleLabel, hintLabel])
        textStack.axis = .vertical
        textStack.spacing = 6
        textStack.alignment = .fill

        // Bottom utility row: globe | delete | space | return.
        let bottomRow = UIStackView(arrangedSubviews: [
            nextKeyboardButton, deleteButton, spaceButton, returnButton,
        ])
        bottomRow.axis = .horizontal
        bottomRow.spacing = 8
        bottomRow.distribution = .fill
        spaceButton.setContentHuggingPriority(.defaultLow, for: .horizontal)

        for v in [textStack, micButton, bottomRow] {
            v.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(v)
        }

        let g = view.layoutMarginsGuide
        NSLayoutConstraint.activate([
            textStack.topAnchor.constraint(equalTo: g.topAnchor, constant: 18),
            textStack.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 20),
            textStack.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -20),

            micButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            micButton.topAnchor.constraint(equalTo: textStack.bottomAnchor, constant: 16),

            bottomRow.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 6),
            bottomRow.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -6),
            bottomRow.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -6),
            bottomRow.heightAnchor.constraint(equalToConstant: 42),
        ])
    }

    private func configurePill(_ button: UIButton, systemName: String) {
        button.setImage(UIImage(systemName: systemName), for: .normal)
        button.layer.cornerRadius = 8
        button.widthAnchor.constraint(equalToConstant: 52).isActive = true
    }

    private func applyColors() {
        let dark = isDark
        view.backgroundColor = Palette.background(dark)
        titleLabel.textColor = Palette.foreground(dark)
        hintLabel.textColor = Palette.muted(dark)

        micButton.tintColor = dark ? UIColor(white: 0.10, alpha: 1) : .white
        micButton.backgroundColor = Palette.accent(dark)

        for b in [deleteButton, returnButton, spaceButton] {
            b.tintColor = Palette.foreground(dark)
            b.setTitleColor(Palette.foreground(dark), for: .normal)
            b.backgroundColor = Palette.surface(dark)
        }
        nextKeyboardButton.tintColor = Palette.foreground(dark)
        nextKeyboardButton.backgroundColor = .clear
        nextKeyboardButton.widthAnchor.constraint(equalToConstant: 40).isActive = true
    }

    // MARK: - Actions

    @objc private func handleMic() {
        // Hand off to the app for capture; it returns the transcript via the
        // App Group, which we insert in `viewWillAppear` when the user comes
        // back to the host app.
        titleLabel.text = "Opening Freestyle…"
        openApp()
    }

    @objc private func handleAdvanceToNextInputMode() { advanceToNextInputMode() }

    @objc private func handleDelete() { textDocumentProxy.deleteBackward() }

    @objc private func handleSpace() { textDocumentProxy.insertText(" ") }

    @objc private func handleReturn() { textDocumentProxy.insertText("\n") }

    // MARK: - App handoff + insertion

    private func openApp() {
        guard let url = URL(string: "freestyle://dictate") else { return }
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

    private func insertPendingTranscriptIfAny() {
        guard let pending = SharedStore.pendingTranscript(),
              pending.timestamp > lastInsertedAt,
              !pending.text.isEmpty
        else {
            titleLabel.text = "Tap to dictate"
            return
        }

        lastInsertedAt = pending.timestamp
        SharedStore.clearPendingTranscript()

        let before = textDocumentProxy.documentContextBeforeInput ?? ""
        if let last = before.last, !last.isWhitespace {
            textDocumentProxy.insertText(" ")
        }
        textDocumentProxy.insertText(pending.text)
        titleLabel.text = "Inserted ✓"
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { [weak self] in
            self?.titleLabel.text = "Tap to dictate"
        }
    }
}
