import UIKit

/// Freestyle voice keyboard — Phase 1 shell.
///
/// Renders the Soniox-style voice panel (cancel / commit, a large centered
/// transcription area, a status line, a mode label, and the globe/next-keyboard
/// button) but does **not** yet capture audio or talk to the cloud. This proves
/// the extension target builds, embeds, and loads system-wide before wiring the
/// mic + streaming in later phases.
final class KeyboardViewController: UIInputViewController {
    // Freestyle palette (mirrors the RN app's theme.ts). Resolved per light/dark.
    private enum Palette {
        static func background(_ dark: Bool) -> UIColor {
            dark ? UIColor(red: 0.09, green: 0.08, blue: 0.06, alpha: 1)
                 : UIColor(red: 0.96, green: 0.94, blue: 0.89, alpha: 1)
        }
        static func foreground(_ dark: Bool) -> UIColor {
            dark ? UIColor(red: 0.93, green: 0.91, blue: 0.84, alpha: 1)
                 : UIColor(red: 0.09, green: 0.08, blue: 0.06, alpha: 1)
        }
        static func muted(_ dark: Bool) -> UIColor {
            dark ? UIColor(red: 0.62, green: 0.59, blue: 0.50, alpha: 1)
                 : UIColor(red: 0.48, green: 0.45, blue: 0.38, alpha: 1)
        }
        static func primary(_ dark: Bool) -> UIColor {
            dark ? UIColor(red: 0.54, green: 0.71, blue: 0.16, alpha: 1)
                 : UIColor(red: 0.42, green: 0.56, blue: 0.07, alpha: 1)
        }
    }

    private let transcriptLabel = UILabel()
    private let statusLabel = UILabel()
    private let modeLabel = UILabel()
    private let cancelButton = UIButton(type: .system)
    private let commitButton = UIButton(type: .system)
    private let globeButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        buildUI()
        applyColors()
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        applyColors()
    }

    private var isDark: Bool {
        traitCollection.userInterfaceStyle == .dark
    }

    private func buildUI() {
        // The keyboard needs an explicit height; the standard area is ~260pt.
        let heightConstraint = view.heightAnchor.constraint(equalToConstant: 268)
        heightConstraint.priority = .defaultHigh
        heightConstraint.isActive = true

        transcriptLabel.numberOfLines = 3
        transcriptLabel.textAlignment = .center
        transcriptLabel.font = .systemFont(ofSize: 22, weight: .regular)
        transcriptLabel.text = "Tap to speak"

        statusLabel.textAlignment = .center
        statusLabel.font = .systemFont(ofSize: 14, weight: .regular)
        statusLabel.text = ""

        modeLabel.textAlignment = .center
        modeLabel.font = .systemFont(ofSize: 11, weight: .medium)
        modeLabel.text = "VOICE KEYBOARD"

        configureCircle(cancelButton, systemName: "xmark")
        configureCircle(commitButton, systemName: "checkmark")
        configureCircle(globeButton, systemName: "globe")
        globeButton.addTarget(
            self,
            action: #selector(handleGlobe),
            for: .touchUpInside
        )

        let center = UIStackView(arrangedSubviews: [transcriptLabel, statusLabel])
        center.axis = .vertical
        center.spacing = 10
        center.alignment = .fill
        center.translatesAutoresizingMaskIntoConstraints = false

        for v in [cancelButton, commitButton, globeButton, modeLabel, center] {
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
            center.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            center.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),

            modeLabel.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -12),
            modeLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            globeButton.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -8),
            globeButton.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 8),
        ])
    }

    private func configureCircle(_ button: UIButton, systemName: String) {
        button.setImage(UIImage(systemName: systemName), for: .normal)
        button.layer.cornerRadius = 20
        button.widthAnchor.constraint(equalToConstant: 40).isActive = true
        button.heightAnchor.constraint(equalToConstant: 40).isActive = true
    }

    private func applyColors() {
        let dark = isDark
        view.backgroundColor = Palette.background(dark)
        transcriptLabel.textColor = Palette.muted(dark)
        statusLabel.textColor = Palette.muted(dark)
        modeLabel.textColor = Palette.muted(dark)
        cancelButton.tintColor = Palette.foreground(dark)
        cancelButton.backgroundColor = Palette.foreground(dark).withAlphaComponent(0.08)
        globeButton.tintColor = Palette.foreground(dark)
        globeButton.backgroundColor = .clear
        commitButton.tintColor = Palette.background(dark)
        commitButton.backgroundColor = Palette.primary(dark)
    }

    @objc private func handleGlobe() {
        advanceToNextInputMode()
    }
}
