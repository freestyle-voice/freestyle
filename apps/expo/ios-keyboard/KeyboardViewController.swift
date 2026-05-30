import UIKit

class KeyboardViewController: UIInputViewController {

    // MARK: - State

    private let recorder = AudioRecorder()
    private let transcriptionService = TranscriptionService()
    private var isCurrentlyRecording = false
    private var isUppercase = true
    private var pulseTimer: Timer?

    // MARK: - UI refs

    private var keyButtons: [UIButton] = []
    private var micButton: UIButton!
    private var micPulseView: UIView!
    private var statusBanner: UIView!
    private var statusLabel: UILabel!
    private var shiftButton: UIButton!
    private var deleteButton: UIButton!
    private var spaceButton: UIButton!
    private var returnButton: UIButton!
    private var nextKbButton: UIButton!
    private var rowStacks: [UIStackView] = []

    private let qwertyRows: [[String]] = [
        ["q","w","e","r","t","y","u","i","o","p"],
        ["a","s","d","f","g","h","j","k","l"],
        ["z","x","c","v","b","n","m"],
    ]

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        buildKeyboard()
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        applyTheme()
    }

    override func traitCollectionDidChange(_ prev: UITraitCollection?) {
        super.traitCollectionDidChange(prev)
        if traitCollection.hasDifferentColorAppearance(comparedTo: prev) {
            applyTheme()
        }
    }

    override func textWillChange(_ textInput: UITextInput?) {}
    override func textDidChange(_ textInput: UITextInput?) {}

    // MARK: - Build

    private func buildKeyboard() {
        guard let iv = inputView else { return }

        let h = iv.heightAnchor.constraint(equalToConstant: 300)
        h.priority = .init(999)
        h.isActive = true

        let wrapper = UIView()
        wrapper.translatesAutoresizingMaskIntoConstraints = false
        iv.addSubview(wrapper)
        NSLayoutConstraint.activate([
            wrapper.topAnchor.constraint(equalTo: iv.topAnchor),
            wrapper.leadingAnchor.constraint(equalTo: iv.leadingAnchor),
            wrapper.trailingAnchor.constraint(equalTo: iv.trailingAnchor),
            wrapper.bottomAnchor.constraint(equalTo: iv.bottomAnchor),
        ])

        // -- Status banner (hidden by default, shown during recording/transcribing) --
        statusBanner = UIView()
        statusBanner.translatesAutoresizingMaskIntoConstraints = false
        statusBanner.isHidden = true
        statusBanner.layer.cornerRadius = 8
        wrapper.addSubview(statusBanner)

        statusLabel = UILabel()
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.font = .systemFont(ofSize: 13, weight: .medium)
        statusLabel.textAlignment = .center
        statusBanner.addSubview(statusLabel)

        NSLayoutConstraint.activate([
            statusBanner.topAnchor.constraint(equalTo: wrapper.topAnchor, constant: 4),
            statusBanner.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor, constant: 4),
            statusBanner.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor, constant: -4),
            statusBanner.heightAnchor.constraint(equalToConstant: 32),
            statusLabel.centerXAnchor.constraint(equalTo: statusBanner.centerXAnchor),
            statusLabel.centerYAnchor.constraint(equalTo: statusBanner.centerYAnchor),
        ])

        // -- Keyboard rows --
        let keyboardStack = UIStackView()
        keyboardStack.translatesAutoresizingMaskIntoConstraints = false
        keyboardStack.axis = .vertical
        keyboardStack.spacing = 6
        keyboardStack.alignment = .center
        wrapper.addSubview(keyboardStack)

        NSLayoutConstraint.activate([
            keyboardStack.topAnchor.constraint(equalTo: statusBanner.bottomAnchor, constant: 4),
            keyboardStack.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor, constant: 3),
            keyboardStack.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor, constant: -3),
        ])

        // Row 1-3: letter keys
        for (rowIdx, row) in qwertyRows.enumerated() {
            let rowStack = UIStackView()
            rowStack.axis = .horizontal
            rowStack.spacing = 5
            rowStack.distribution = .fillEqually

            if rowIdx == 2 {
                // Row 3: shift + letters + delete
                let outerStack = UIStackView()
                outerStack.axis = .horizontal
                outerStack.spacing = 5
                outerStack.alignment = .fill

                shiftButton = makeSpecialKey(symbol: "shift", width: 40)
                shiftButton.addTarget(self, action: #selector(shiftTapped), for: .touchUpInside)
                outerStack.addArrangedSubview(shiftButton)

                for ch in row {
                    let btn = makeLetterKey(ch)
                    rowStack.addArrangedSubview(btn)
                    keyButtons.append(btn)
                }
                outerStack.addArrangedSubview(rowStack)

                deleteButton = makeSpecialKey(symbol: "delete.left", width: 40)
                deleteButton.addTarget(self, action: #selector(deleteTapped), for: .touchUpInside)
                let longPress = UILongPressGestureRecognizer(target: self, action: #selector(deleteLongPress(_:)))
                longPress.minimumPressDuration = 0.3
                deleteButton.addGestureRecognizer(longPress)
                outerStack.addArrangedSubview(deleteButton)

                outerStack.translatesAutoresizingMaskIntoConstraints = false
                keyboardStack.addArrangedSubview(outerStack)
                outerStack.widthAnchor.constraint(equalTo: keyboardStack.widthAnchor).isActive = true
                rowStacks.append(outerStack)
            } else {
                for ch in row {
                    let btn = makeLetterKey(ch)
                    rowStack.addArrangedSubview(btn)
                    keyButtons.append(btn)
                }
                rowStack.translatesAutoresizingMaskIntoConstraints = false
                keyboardStack.addArrangedSubview(rowStack)
                let widthMultiplier: CGFloat = rowIdx == 1 ? 0.88 : 1.0
                rowStack.widthAnchor.constraint(equalTo: keyboardStack.widthAnchor, multiplier: widthMultiplier).isActive = true
                rowStacks.append(rowStack)
            }
        }

        // Row 4: bottom row
        let bottomStack = UIStackView()
        bottomStack.axis = .horizontal
        bottomStack.spacing = 5
        bottomStack.alignment = .fill
        bottomStack.translatesAutoresizingMaskIntoConstraints = false

        // Globe
        nextKbButton = makeSpecialKey(symbol: "globe", width: 40)
        nextKbButton.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        bottomStack.addArrangedSubview(nextKbButton)

        // Mic button
        micButton = UIButton(type: .custom)
        micButton.translatesAutoresizingMaskIntoConstraints = false
        let micCfg = UIImage.SymbolConfiguration(pointSize: 16, weight: .semibold)
        micButton.setImage(UIImage(systemName: "mic.fill", withConfiguration: micCfg), for: .normal)
        micButton.tintColor = .white
        micButton.layer.cornerRadius = 10
        micButton.addTarget(self, action: #selector(micTapped), for: .touchUpInside)
        micButton.widthAnchor.constraint(equalToConstant: 44).isActive = true
        bottomStack.addArrangedSubview(micButton)

        // Space
        spaceButton = UIButton(type: .system)
        spaceButton.setTitle("space", for: .normal)
        spaceButton.titleLabel?.font = .systemFont(ofSize: 14, weight: .regular)
        spaceButton.layer.cornerRadius = 10
        spaceButton.addTarget(self, action: #selector(spaceTapped), for: .touchUpInside)
        bottomStack.addArrangedSubview(spaceButton)

        // Return
        returnButton = UIButton(type: .system)
        returnButton.setTitle("return", for: .normal)
        returnButton.titleLabel?.font = .systemFont(ofSize: 14, weight: .regular)
        returnButton.layer.cornerRadius = 10
        returnButton.addTarget(self, action: #selector(returnTapped), for: .touchUpInside)
        returnButton.widthAnchor.constraint(equalToConstant: 76).isActive = true
        bottomStack.addArrangedSubview(returnButton)

        keyboardStack.addArrangedSubview(bottomStack)
        bottomStack.widthAnchor.constraint(equalTo: keyboardStack.widthAnchor).isActive = true

        // Mic pulse (behind mic button, added to wrapper so it's not clipped)
        micPulseView = UIView()
        micPulseView.translatesAutoresizingMaskIntoConstraints = false
        micPulseView.layer.cornerRadius = 10
        micPulseView.alpha = 0
        micPulseView.isUserInteractionEnabled = false
        wrapper.insertSubview(micPulseView, belowSubview: keyboardStack)

        applyTheme()
        updateShiftAppearance()
    }

    // MARK: - Key Factories

    private func makeLetterKey(_ letter: String) -> UIButton {
        let btn = UIButton(type: .system)
        btn.setTitle(letter.uppercased(), for: .normal)
        btn.titleLabel?.font = .systemFont(ofSize: 22, weight: .regular)
        btn.layer.cornerRadius = 6
        btn.layer.shadowColor = UIColor.black.cgColor
        btn.layer.shadowOffset = CGSize(width: 0, height: 1)
        btn.layer.shadowOpacity = 0.15
        btn.layer.shadowRadius = 0.5
        btn.heightAnchor.constraint(equalToConstant: 44).isActive = true
        btn.addTarget(self, action: #selector(letterTapped(_:)), for: .touchUpInside)
        return btn
    }

    private func makeSpecialKey(symbol: String, width: CGFloat) -> UIButton {
        let btn = UIButton(type: .system)
        let cfg = UIImage.SymbolConfiguration(pointSize: 15, weight: .medium)
        btn.setImage(UIImage(systemName: symbol, withConfiguration: cfg), for: .normal)
        btn.layer.cornerRadius = 6
        btn.layer.shadowColor = UIColor.black.cgColor
        btn.layer.shadowOffset = CGSize(width: 0, height: 1)
        btn.layer.shadowOpacity = 0.12
        btn.layer.shadowRadius = 0.5
        btn.widthAnchor.constraint(equalToConstant: width).isActive = true
        btn.heightAnchor.constraint(equalToConstant: 44).isActive = true
        return btn
    }

    // MARK: - Theme

    private func applyTheme() {
        let dark = traitCollection.userInterfaceStyle == .dark
        let bg: UIColor = dark ? .init(white: 0.13, alpha: 1) : .init(red: 0.82, green: 0.82, blue: 0.84, alpha: 1)
        let keyBg: UIColor = dark ? .init(white: 0.26, alpha: 1) : .white
        let specialBg: UIColor = dark ? .init(white: 0.18, alpha: 1) : .init(red: 0.68, green: 0.70, blue: 0.73, alpha: 1)
        let textCol: UIColor = dark ? .white : .black
        let mutedCol: UIColor = dark ? .init(white: 0.6, alpha: 1) : .init(white: 0.4, alpha: 1)
        let olive: UIColor = dark
            ? UIColor(red: 0.541, green: 0.714, blue: 0.165, alpha: 1)
            : UIColor(red: 0.420, green: 0.561, blue: 0.071, alpha: 1)

        inputView?.backgroundColor = bg

        // Letter keys
        for btn in keyButtons {
            btn.backgroundColor = keyBg
            btn.setTitleColor(textCol, for: .normal)
        }

        // Special keys
        for btn in [shiftButton, deleteButton, nextKbButton] {
            btn?.backgroundColor = specialBg
            btn?.tintColor = textCol
        }

        // Space + return
        spaceButton.backgroundColor = keyBg
        spaceButton.setTitleColor(textCol, for: .normal)
        returnButton.backgroundColor = specialBg
        returnButton.setTitleColor(textCol, for: .normal)

        // Mic
        micButton.backgroundColor = isCurrentlyRecording
            ? UIColor(red: 0.867, green: 0.431, blue: 0.306, alpha: 1)
            : olive
        micPulseView.backgroundColor = isCurrentlyRecording
            ? UIColor(red: 0.867, green: 0.431, blue: 0.306, alpha: 0.2)
            : olive.withAlphaComponent(0.2)

        // Banner
        statusBanner.backgroundColor = dark ? .init(white: 0.2, alpha: 1) : .init(white: 0.92, alpha: 1)
        statusLabel.textColor = mutedCol
    }

    // MARK: - Key Actions

    @objc private func letterTapped(_ sender: UIButton) {
        guard let letter = sender.titleLabel?.text else { return }
        let text = isUppercase ? letter : letter.lowercased()
        textDocumentProxy.insertText(text)
        if isUppercase {
            isUppercase = false
            updateShiftAppearance()
        }
    }

    @objc private func shiftTapped() {
        isUppercase.toggle()
        updateShiftAppearance()
    }

    @objc private func deleteTapped() {
        textDocumentProxy.deleteBackward()
    }

    private var deleteRepeatTimer: Timer?

    @objc private func deleteLongPress(_ gesture: UILongPressGestureRecognizer) {
        switch gesture.state {
        case .began:
            deleteRepeatTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
                self?.textDocumentProxy.deleteBackward()
            }
        case .ended, .cancelled:
            deleteRepeatTimer?.invalidate()
            deleteRepeatTimer = nil
        default: break
        }
    }

    @objc private func spaceTapped() {
        textDocumentProxy.insertText(" ")
    }

    @objc private func returnTapped() {
        textDocumentProxy.insertText("\n")
    }

    private func updateShiftAppearance() {
        let symbol = isUppercase ? "shift.fill" : "shift"
        let cfg = UIImage.SymbolConfiguration(pointSize: 15, weight: .medium)
        shiftButton.setImage(UIImage(systemName: symbol, withConfiguration: cfg), for: .normal)
        for btn in keyButtons {
            let current = btn.titleLabel?.text ?? ""
            btn.setTitle(isUppercase ? current.uppercased() : current.lowercased(), for: .normal)
        }
    }

    // MARK: - Mic / Dictation

    @objc private func micTapped() {
        if isCurrentlyRecording {
            stopAndTranscribe()
        } else {
            startRecording()
        }
    }

    private func startRecording() {
        guard isFullAccessGranted else {
            showBanner("Enable Full Access in Settings → Keyboard → Freestyle")
            return
        }

        guard SharedConfig.isOnboardingComplete else {
            showBanner("Open the Freestyle app to set up your API key")
            return
        }

        do {
            try recorder.startRecording()
            isCurrentlyRecording = true

            UIView.animate(withDuration: 0.15) {
                self.micButton.backgroundColor = UIColor(red: 0.867, green: 0.431, blue: 0.306, alpha: 1)
                self.micButton.transform = CGAffineTransform(scaleX: 0.9, y: 0.9)
            } completion: { _ in
                UIView.animate(withDuration: 0.1) { self.micButton.transform = .identity }
            }

            startPulse()
            showBanner("Recording — tap mic to stop")
        } catch {
            showBanner("Microphone access denied")
        }
    }

    private func stopAndTranscribe() {
        guard let audioURL = recorder.stopRecording() else {
            isCurrentlyRecording = false
            stopPulse()
            applyTheme()
            return
        }

        isCurrentlyRecording = false
        stopPulse()
        applyTheme()
        showBanner("Transcribing...")
        micButton.isEnabled = false
        micButton.alpha = 0.5

        Task {
            do {
                let result = try await transcriptionService.transcribe(audioURL: audioURL)
                await MainActor.run {
                    let text = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !text.isEmpty {
                        self.textDocumentProxy.insertText(text)
                        self.showBanner("Inserted ✓")
                    } else {
                        self.showBanner("No speech detected")
                    }
                    self.micButton.isEnabled = true
                    self.micButton.alpha = 1
                    self.hideBannerAfterDelay()
                }
                try? FileManager.default.removeItem(at: audioURL)
            } catch {
                await MainActor.run {
                    self.showBanner("Error: \(error.localizedDescription)")
                    self.micButton.isEnabled = true
                    self.micButton.alpha = 1
                }
            }
        }
    }

    // MARK: - Banner

    private func showBanner(_ text: String) {
        statusLabel.text = text
        statusBanner.isHidden = false
        statusBanner.alpha = 0
        UIView.animate(withDuration: 0.15) { self.statusBanner.alpha = 1 }
    }

    private func hideBannerAfterDelay() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            guard let self, !self.isCurrentlyRecording else { return }
            UIView.animate(withDuration: 0.2) { self.statusBanner.alpha = 0 } completion: { _ in
                self.statusBanner.isHidden = true
            }
        }
    }

    // MARK: - Pulse

    private func startPulse() {
        // Position pulse behind mic button
        if let micFrame = micButton.superview?.convert(micButton.frame, to: inputView) {
            micPulseView.frame = micFrame.insetBy(dx: -6, dy: -6)
            micPulseView.layer.cornerRadius = micPulseView.frame.height / 2
        }
        micPulseView.alpha = 1
        pulseTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.micPulseView.transform = .identity
            self.micPulseView.alpha = 0.5
            UIView.animate(withDuration: 0.8, delay: 0, options: .curveEaseOut) {
                self.micPulseView.transform = CGAffineTransform(scaleX: 1.4, y: 1.4)
                self.micPulseView.alpha = 0
            }
        }
        pulseTimer?.fire()
    }

    private func stopPulse() {
        pulseTimer?.invalidate()
        pulseTimer = nil
        micPulseView.alpha = 0
        micPulseView.transform = .identity
    }

    // MARK: - Helpers

    private var isFullAccessGranted: Bool { super.hasFullAccess }

    deinit { pulseTimer?.invalidate() }
}
