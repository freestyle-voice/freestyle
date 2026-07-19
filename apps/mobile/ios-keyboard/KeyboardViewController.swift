import SwiftUI
import UIKit

/// Freestyle voice keyboard — a full QWERTY keyboard (à la Apple's) with a mic
/// button in the top-right toolbar for voice dictation.
///
/// Dictation can't happen here: iOS blocks microphone capture inside keyboard
/// extensions (every capture API — AVAudioEngine, RemoteIO, AVAudioRecorder —
/// fails on-device, matching Apple's app-extension restriction). So the mic
/// button deep-links into the Freestyle app (via a SwiftUI `Link`, the only
/// mechanism that reliably opens the host app from a keyboard on iOS 18+), which
/// records + streams to the cloud and writes the transcript into the App Group.
/// When the keyboard reappears, `insertPendingTranscriptIfAny()` inserts it.
final class KeyboardViewController: UIInputViewController {
    // MARK: - Palette

    private enum Palette {
        static func background(_ dark: Bool) -> UIColor {
            dark ? UIColor(white: 0.09, alpha: 1) : UIColor(red: 0.82, green: 0.83, blue: 0.85, alpha: 1)
        }
        static func key(_ dark: Bool) -> UIColor {
            dark ? UIColor(white: 0.35, alpha: 1) : .white
        }
        static func specialKey(_ dark: Bool) -> UIColor {
            dark ? UIColor(white: 0.20, alpha: 1) : UIColor(red: 0.68, green: 0.70, blue: 0.73, alpha: 1)
        }
        /// The engaged/active key (matches Apple's lit shift key): a light key
        /// with a dark glyph, in both light and dark appearances.
        static func activeKey(_ dark: Bool) -> UIColor { .white }
        static func activeGlyph(_ dark: Bool) -> UIColor { UIColor(white: 0.05, alpha: 1) }
        static func keyText(_ dark: Bool) -> UIColor {
            dark ? .white : UIColor(white: 0.05, alpha: 1)
        }
        static func muted(_ dark: Bool) -> UIColor {
            dark ? UIColor(white: 0.6, alpha: 1) : UIColor(white: 0.35, alpha: 1)
        }
        static func accent(_ dark: Bool) -> UIColor {
            dark ? UIColor(red: 0.54, green: 0.71, blue: 0.16, alpha: 1)
                 : UIColor(red: 0.42, green: 0.56, blue: 0.07, alpha: 1)
        }
    }

    // MARK: - State

    private enum Layer { case letters, numbers, symbols }
    private enum ShiftState { case off, on, capsLock }

    private var layer: Layer = .letters
    private var shift: ShiftState = .on  // start capitalized (sentence start)

    /// Letter buttons whose case flips with shift, keyed by their base char.
    private var letterButtons: [(button: UIButton, base: String)] = []
    private var shiftButton: UIButton?

    private var lastShiftTapAt: TimeInterval = 0
    private var deleteTimer: Timer?
    private var deleteRepeatCount = 0
    private var lastInsertedAt: Double = 0

    private let toolbar = UIView()
    private let brandLabel = UILabel()
    private let statusLabel = UILabel()
    private let keysContainer = UIStackView()
    private var micHost: UIHostingController<MicLink>?

    // MARK: - Metrics

    private let rowHeight: CGFloat = 46
    private let rowSpacing: CGFloat = 9
    private let keySpacing: CGFloat = 6
    private let toolbarHeight: CGFloat = 44

    // MARK: - Lifecycle

    override init(nibName nibNameOrNil: String?, bundle nibBundleOrNil: Bundle?) {
        super.init(nibName: nibNameOrNil, bundle: nibBundleOrNil)
        configureDictationBehavior()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configureDictationBehavior()
    }

    /// Setting `hasDictationKey = true` tells iOS we provide our own dictation
    /// (the toolbar mic → app hand-off), so the system drops its redundant
    /// dictation mic from the bottom bar. It has to be re-applied across the
    /// lifecycle — setting it only in `viewDidLoad` doesn't take effect.
    private func configureDictationBehavior() {
        hasDictationKey = true
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureDictationBehavior()
        buildLayout()
        renderKeys()
        applyColors()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        configureDictationBehavior()
        insertPendingTranscriptIfAny()
        applyAutoCap()
    }

    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        // Only refresh auto-capitalization here — this fires on every keystroke,
        // so re-coloring the whole key tree / rebuilding the SwiftUI mic host
        // (as `applyColors()` does) would add per-keystroke lag. Appearance
        // changes are handled by `traitCollectionDidChange`.
        applyAutoCap()
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        applyColors()
    }

    private var isDark: Bool { traitCollection.userInterfaceStyle == .dark }

    // MARK: - Layout

    private func buildLayout() {
        let totalHeight = toolbarHeight + rowSpacing
            + rowHeight * 4 + rowSpacing * 3 + rowSpacing
        let heightConstraint = view.heightAnchor.constraint(equalToConstant: totalHeight)
        heightConstraint.priority = .required - 1
        heightConstraint.isActive = true

        // Toolbar: brand/status on the left, mic on the right.
        toolbar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(toolbar)

        brandLabel.text = "Freestyle"
        brandLabel.font = .systemFont(ofSize: 13, weight: .semibold)
        statusLabel.font = .systemFont(ofSize: 12, weight: .regular)
        statusLabel.text = ""
        let brandStack = UIStackView(arrangedSubviews: [brandLabel, statusLabel])
        brandStack.axis = .horizontal
        brandStack.spacing = 8
        brandStack.alignment = .firstBaseline
        brandStack.translatesAutoresizingMaskIntoConstraints = false
        toolbar.addSubview(brandStack)

        let mic = UIHostingController(
            rootView: MicLink(destination: URL(string: "freestyle://dictate")!, dark: isDark)
        )
        mic.view.backgroundColor = .clear
        mic.view.translatesAutoresizingMaskIntoConstraints = false
        addChild(mic)
        toolbar.addSubview(mic.view)
        mic.didMove(toParent: self)
        micHost = mic

        keysContainer.axis = .vertical
        keysContainer.spacing = rowSpacing
        keysContainer.alignment = .fill
        keysContainer.distribution = .fillEqually
        keysContainer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(keysContainer)

        let g = view.layoutMarginsGuide
        NSLayoutConstraint.activate([
            toolbar.topAnchor.constraint(equalTo: view.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            toolbar.heightAnchor.constraint(equalToConstant: toolbarHeight),

            brandStack.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 6),
            brandStack.centerYAnchor.constraint(equalTo: toolbar.centerYAnchor),

            mic.view.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -4),
            mic.view.centerYAnchor.constraint(equalTo: toolbar.centerYAnchor),
            mic.view.widthAnchor.constraint(equalToConstant: 34),
            mic.view.heightAnchor.constraint(equalToConstant: 34),

            keysContainer.topAnchor.constraint(equalTo: toolbar.bottomAnchor, constant: rowSpacing),
            keysContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 3),
            keysContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -3),
            keysContainer.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -rowSpacing),
        ])
    }

    // MARK: - Key rendering

    private func renderKeys() {
        letterButtons.removeAll()
        shiftButton = nil
        keysContainer.arrangedSubviews.forEach {
            keysContainer.removeArrangedSubview($0)
            $0.removeFromSuperview()
        }

        switch layer {
        case .letters:
            keysContainer.addArrangedSubview(letterRow(["q","w","e","r","t","y","u","i","o","p"]))
            keysContainer.addArrangedSubview(insetRow(["a","s","d","f","g","h","j","k","l"]))
            keysContainer.addArrangedSubview(shiftRow(["z","x","c","v","b","n","m"]))
        case .numbers:
            keysContainer.addArrangedSubview(letterRow(["1","2","3","4","5","6","7","8","9","0"]))
            keysContainer.addArrangedSubview(letterRow(["-","/",":",";","(",")","$","&","@","\""]))
            keysContainer.addArrangedSubview(symbolRow(toggleTitle: "#+=", toggleLayer: .symbols,
                                                        keys: [".",",","?","!","'"]))
        case .symbols:
            keysContainer.addArrangedSubview(letterRow(["[","]","{","}","#","%","^","*","+","="]))
            keysContainer.addArrangedSubview(letterRow(["_","\\","|","~","<",">","€","£","¥","•"]))
            keysContainer.addArrangedSubview(symbolRow(toggleTitle: "123", toggleLayer: .numbers,
                                                        keys: [".",",","?","!","'"]))
        }
        keysContainer.addArrangedSubview(bottomRow())
        updateLetterCase()
    }

    /// A full-width row of equal character keys.
    private func letterRow(_ chars: [String]) -> UIStackView {
        let row = hStack()
        for c in chars { row.addArrangedSubview(charKey(c)) }
        return row
    }

    /// A row inset on both sides (like Apple's home row) so keys stay aligned.
    private func insetRow(_ chars: [String]) -> UIStackView {
        let row = hStack(equal: false)
        row.addArrangedSubview(spacer())
        let inner = hStack()
        for c in chars { inner.addArrangedSubview(charKey(c)) }
        row.addArrangedSubview(inner)
        row.addArrangedSubview(spacer())
        return row
    }

    /// The letters row prefixed with shift and suffixed with delete.
    private func shiftRow(_ chars: [String]) -> UIStackView {
        let row = hStack(equal: false)
        let shiftKey = specialKey(image: shiftSymbolName())
        shiftKey.addTarget(self, action: #selector(handleShift), for: .touchUpInside)
        shiftKey.widthAnchor.constraint(equalToConstant: 46).isActive = true
        shiftButton = shiftKey
        row.addArrangedSubview(shiftKey)

        let inner = hStack()
        for c in chars { inner.addArrangedSubview(charKey(c)) }
        row.addArrangedSubview(inner)

        let del = specialKey(image: "delete.left")
        del.widthAnchor.constraint(equalToConstant: 46).isActive = true
        addDeleteBehavior(del)
        row.addArrangedSubview(del)
        return row
    }

    /// Row 3 for number/symbol layers: layer toggle + punctuation + delete.
    private func symbolRow(toggleTitle: String, toggleLayer: Layer, keys: [String]) -> UIStackView {
        let row = hStack(equal: false)
        let toggle = specialKey(title: toggleTitle)
        toggle.widthAnchor.constraint(equalToConstant: 46).isActive = true
        toggle.addAction(UIAction { [weak self] _ in self?.switchTo(toggleLayer) }, for: .touchUpInside)
        row.addArrangedSubview(toggle)

        let inner = hStack()
        for c in keys { inner.addArrangedSubview(charKey(c)) }
        row.addArrangedSubview(inner)

        let del = specialKey(image: "delete.left")
        del.widthAnchor.constraint(equalToConstant: 46).isActive = true
        addDeleteBehavior(del)
        row.addArrangedSubview(del)
        return row
    }

    /// The bottom row: layer switch, globe, space, return.
    private func bottomRow() -> UIStackView {
        let row = hStack(equal: false)

        let layerTitle = layer == .letters ? "123" : "ABC"
        let layerKey = specialKey(title: layerTitle)
        layerKey.widthAnchor.constraint(equalToConstant: 92).isActive = true
        layerKey.addAction(UIAction { [weak self] _ in
            self?.switchTo(self?.layer == .letters ? .numbers : .letters)
        }, for: .touchUpInside)
        row.addArrangedSubview(layerKey)

        if needsInputModeSwitchKey {
            let globe = specialKey(image: "globe")
            globe.widthAnchor.constraint(equalToConstant: 44).isActive = true
            globe.addTarget(self, action: #selector(handleNextKeyboard), for: .touchUpInside)
            row.addArrangedSubview(globe)
        }

        let space = charKey(" ", title: "space")
        row.addArrangedSubview(space)

        let ret = specialKey(title: "return")
        ret.widthAnchor.constraint(equalToConstant: 100).isActive = true
        ret.addAction(UIAction { [weak self] _ in
            self?.textDocumentProxy.insertText("\n")
            self?.applyAutoCap()
        }, for: .touchUpInside)
        row.addArrangedSubview(ret)
        return row
    }

    // MARK: - Key factories

    /// A horizontal row. `equal` (default) distributes width evenly across every
    /// arranged view; pass `false` for rows that mix fixed-width special keys
    /// with a flexible letter group, so only the group stretches to fill.
    private func hStack(equal: Bool = true) -> UIStackView {
        let s = UIStackView()
        s.axis = .horizontal
        s.spacing = keySpacing
        s.distribution = equal ? .fillEqually : .fill
        s.alignment = .fill
        return s
    }

    private func spacer() -> UIView {
        let v = UIView()
        v.widthAnchor.constraint(equalToConstant: 16).isActive = true
        return v
    }

    private func charKey(_ char: String, title: String? = nil) -> UIButton {
        let b = baseButton()
        b.setTitle(title ?? char, for: .normal)
        b.titleLabel?.font = .systemFont(ofSize: title == nil ? 22 : 15, weight: .regular)
        b.backgroundColor = Palette.key(isDark)
        b.addAction(UIAction { [weak self] _ in self?.insertChar(char) }, for: .touchUpInside)
        if title == nil, char.rangeOfCharacter(from: .letters) != nil, char.count == 1 {
            letterButtons.append((b, char))
        }
        return b
    }

    private func specialKey(title: String? = nil, image: String? = nil) -> UIButton {
        let b = baseButton()
        if let title {
            b.setTitle(title, for: .normal)
            b.titleLabel?.font = .systemFont(ofSize: 15, weight: .regular)
        }
        if let image {
            b.setImage(UIImage(systemName: image), for: .normal)
        }
        b.backgroundColor = Palette.specialKey(isDark)
        return b
    }

    private func baseButton() -> UIButton {
        let b = UIButton(type: .system)
        b.layer.cornerRadius = 6
        b.layer.shadowColor = UIColor.black.cgColor
        b.layer.shadowOpacity = 0.28
        b.layer.shadowOffset = CGSize(width: 0, height: 1)
        b.layer.shadowRadius = 0
        b.tintColor = Palette.keyText(isDark)
        b.setTitleColor(Palette.keyText(isDark), for: .normal)
        return b
    }

    // MARK: - Delete (with hold-to-repeat)

    private func addDeleteBehavior(_ button: UIButton) {
        button.addTarget(self, action: #selector(handleDeleteDown), for: .touchDown)
        for event: UIControl.Event in [.touchUpInside, .touchUpOutside, .touchCancel] {
            button.addTarget(self, action: #selector(handleDeleteUp), for: event)
        }
    }

    /// iOS-style backspace: a tap deletes one character; holding auto-repeats
    /// character-by-character after a short delay, then — once the user keeps
    /// holding — switches to deleting whole words on a slower ~0.5s cadence so
    /// it stays easy to stop before deleting too much.
    @objc private func handleDeleteDown() {
        textDocumentProxy.deleteBackward()
        deleteRepeatCount = 0
        deleteTimer?.invalidate()
        // Initial hold delay before auto-repeat kicks in.
        deleteTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: false) { [weak self] _ in
            self?.startCharDeleteRepeat()
        }
    }

    private func startCharDeleteRepeat() {
        deleteTimer?.invalidate()
        deleteTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.deleteRepeatCount += 1
            // After ~1.8s of char deletes (18 × 0.1s), escalate to word deletes.
            if self.deleteRepeatCount >= 18 {
                self.startWordDeleteRepeat()
            } else {
                self.textDocumentProxy.deleteBackward()
            }
        }
    }

    private func startWordDeleteRepeat() {
        deleteTimer?.invalidate()
        deleteWordBackward()
        deleteTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.deleteWordBackward()
        }
    }

    /// Delete the trailing whitespace run plus the word before the cursor.
    private func deleteWordBackward() {
        guard let before = textDocumentProxy.documentContextBeforeInput, !before.isEmpty else {
            textDocumentProxy.deleteBackward()
            return
        }
        func isBreak(_ c: Character) -> Bool { c == " " || c == "\n" || c == "\t" }

        var chars = Array(before)
        var count = 0
        while let last = chars.last, isBreak(last) { chars.removeLast(); count += 1 }
        while let last = chars.last, !isBreak(last) { chars.removeLast(); count += 1 }
        for _ in 0..<max(count, 1) { textDocumentProxy.deleteBackward() }
    }

    @objc private func handleDeleteUp() {
        deleteTimer?.invalidate()
        deleteTimer = nil
        deleteRepeatCount = 0
        applyAutoCap()
    }

    // MARK: - Actions

    private func insertChar(_ char: String) {
        let out: String
        if char.count == 1, char.rangeOfCharacter(from: .letters) != nil {
            out = shift == .off ? char : char.uppercased()
        } else {
            out = char
        }
        textDocumentProxy.insertText(out)

        // A one-shot shift falls back to lowercase after a letter.
        if shift == .on {
            shift = .off
            updateLetterCase()
            updateShiftAppearance()
        }
    }

    @objc private func handleShift() {
        let now = Date().timeIntervalSince1970
        if now - lastShiftTapAt < 0.3 {
            shift = .capsLock
        } else {
            shift = (shift == .off) ? .on : .off
        }
        lastShiftTapAt = now
        updateLetterCase()
        updateShiftAppearance()
    }

    @objc private func handleNextKeyboard() { advanceToNextInputMode() }

    private func switchTo(_ newLayer: Layer) {
        layer = newLayer
        renderKeys()
        applyColors()
    }

    /// Capitalize sentence starts (unless caps lock or the user forced shift off).
    private func applyAutoCap() {
        guard layer == .letters, shift != .capsLock else { return }
        let before = textDocumentProxy.documentContextBeforeInput ?? ""
        let trimmed = before.trimmingCharacters(in: .whitespaces)
        let atSentenceStart = before.isEmpty
            || trimmed.isEmpty
            || before.hasSuffix(". ")
            || before.hasSuffix("? ")
            || before.hasSuffix("! ")
            || before.hasSuffix("\n")
        let newShift: ShiftState = atSentenceStart ? .on : .off
        if newShift != shift {
            shift = newShift
            updateLetterCase()
            updateShiftAppearance()
        }
    }

    // MARK: - Appearance

    private func updateLetterCase() {
        let upper = shift != .off
        for (button, base) in letterButtons {
            button.setTitle(upper ? base.uppercased() : base, for: .normal)
        }
    }

    private func shiftSymbolName() -> String {
        switch shift {
        case .off: return "shift"
        case .on: return "shift.fill"
        case .capsLock: return "capslock.fill"
        }
    }

    private func updateShiftAppearance() {
        guard let shiftButton else { return }
        shiftButton.setImage(UIImage(systemName: shiftSymbolName()), for: .normal)
        let active = shift != .off
        shiftButton.backgroundColor = active ? Palette.activeKey(isDark) : Palette.specialKey(isDark)
        shiftButton.tintColor = active ? Palette.activeGlyph(isDark) : Palette.keyText(isDark)
    }

    private func applyColors() {
        let dark = isDark
        view.backgroundColor = Palette.background(dark)
        brandLabel.textColor = Palette.muted(dark)
        statusLabel.textColor = Palette.muted(dark)
        micHost?.rootView = MicLink(destination: URL(string: "freestyle://dictate")!, dark: dark)
        renderKeyColors(in: keysContainer, dark: dark)
        updateShiftAppearance()
    }

    private func renderKeyColors(in stack: UIStackView, dark: Bool) {
        for view in stack.arrangedSubviews {
            if let inner = view as? UIStackView {
                renderKeyColors(in: inner, dark: dark)
            } else if let button = view as? UIButton {
                let isSpecial = button.currentImage != nil
                    || ["space", "return", "123", "ABC", "#+="].contains(button.currentTitle ?? "")
                if button.currentTitle == "space" {
                    button.backgroundColor = Palette.key(dark)
                } else {
                    button.backgroundColor = isSpecial ? Palette.specialKey(dark) : Palette.key(dark)
                }
                button.tintColor = Palette.keyText(dark)
                button.setTitleColor(Palette.keyText(dark), for: .normal)
            }
        }
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

        statusLabel.text = "Inserted ✓"
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { [weak self] in
            self?.statusLabel.text = ""
        }
    }
}

/// The mic control. A SwiftUI `Link` is the only mechanism that reliably opens
/// the containing app from a keyboard extension on iOS 18+ (the old
/// `openURL:` responder-chain hack force-returns false).
struct MicLink: View {
    let destination: URL
    let dark: Bool

    var body: some View {
        Link(destination: destination) {
            Image(systemName: "mic.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(dark ? Color(white: 0.10) : .white)
                .frame(width: 34, height: 34)
                .background(
                    dark
                        ? Color(red: 0.54, green: 0.71, blue: 0.16)
                        : Color(red: 0.42, green: 0.56, blue: 0.07)
                )
                .clipShape(Circle())
                .contentShape(Circle())
        }
    }
}
