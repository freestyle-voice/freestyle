import UIKit

class KeyboardViewController: UIInputViewController {

    private var isUppercase = true
    private var keyButtons: [UIButton] = []
    private var shiftButton: UIButton!
    private var deleteButton: UIButton!
    private var deleteRepeatTimer: Timer?

    private let rows: [[String]] = [
        ["q","w","e","r","t","y","u","i","o","p"],
        ["a","s","d","f","g","h","j","k","l"],
        ["z","x","c","v","b","n","m"],
    ]

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

        let h = iv.heightAnchor.constraint(equalToConstant: 260)
        h.priority = .init(999)
        h.isActive = true

        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 6
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        iv.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: iv.topAnchor, constant: 8),
            stack.leadingAnchor.constraint(equalTo: iv.leadingAnchor, constant: 3),
            stack.trailingAnchor.constraint(equalTo: iv.trailingAnchor, constant: -3),
            stack.bottomAnchor.constraint(equalTo: iv.bottomAnchor, constant: -4),
        ])

        // Rows 1-2: plain letter rows
        for (i, row) in rows.enumerated() where i < 2 {
            let rs = UIStackView()
            rs.axis = .horizontal
            rs.spacing = 5
            rs.distribution = .fillEqually

            for ch in row {
                let btn = makeLetterKey(ch)
                rs.addArrangedSubview(btn)
                keyButtons.append(btn)
            }

            rs.translatesAutoresizingMaskIntoConstraints = false
            stack.addArrangedSubview(rs)
            let mult: CGFloat = i == 1 ? 0.88 : 1.0
            rs.widthAnchor.constraint(equalTo: stack.widthAnchor, multiplier: mult).isActive = true
        }

        // Row 3: shift + letters + delete
        let r3 = UIStackView()
        r3.axis = .horizontal
        r3.spacing = 5
        r3.alignment = .fill
        r3.translatesAutoresizingMaskIntoConstraints = false

        shiftButton = makeSpecialKey("shift")
        shiftButton.addTarget(self, action: #selector(shiftTapped), for: .touchUpInside)
        r3.addArrangedSubview(shiftButton)

        let letters3 = UIStackView()
        letters3.axis = .horizontal
        letters3.spacing = 5
        letters3.distribution = .fillEqually
        for ch in rows[2] {
            let btn = makeLetterKey(ch)
            letters3.addArrangedSubview(btn)
            keyButtons.append(btn)
        }
        r3.addArrangedSubview(letters3)

        deleteButton = makeSpecialKey("delete.left")
        deleteButton.addTarget(self, action: #selector(deleteTapped), for: .touchUpInside)
        let lp = UILongPressGestureRecognizer(target: self, action: #selector(deleteLong(_:)))
        lp.minimumPressDuration = 0.3
        deleteButton.addGestureRecognizer(lp)
        r3.addArrangedSubview(deleteButton)

        stack.addArrangedSubview(r3)
        r3.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true

        // Row 4: globe, space, return
        let r4 = UIStackView()
        r4.axis = .horizontal
        r4.spacing = 5
        r4.alignment = .fill
        r4.translatesAutoresizingMaskIntoConstraints = false

        let globe = makeSpecialKey("globe")
        globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        globe.widthAnchor.constraint(equalToConstant: 44).isActive = true
        r4.addArrangedSubview(globe)

        let space = UIButton(type: .system)
        space.setTitle("space", for: .normal)
        space.titleLabel?.font = .systemFont(ofSize: 15)
        space.layer.cornerRadius = 6
        space.layer.shadowColor = UIColor.black.cgColor
        space.layer.shadowOffset = CGSize(width: 0, height: 1)
        space.layer.shadowOpacity = 0.12
        space.layer.shadowRadius = 0.5
        space.heightAnchor.constraint(equalToConstant: 44).isActive = true
        space.addTarget(self, action: #selector(spaceTapped), for: .touchUpInside)
        space.tag = 100
        r4.addArrangedSubview(space)

        let ret = UIButton(type: .system)
        ret.setTitle("return", for: .normal)
        ret.titleLabel?.font = .systemFont(ofSize: 15)
        ret.layer.cornerRadius = 6
        ret.layer.shadowColor = UIColor.black.cgColor
        ret.layer.shadowOffset = CGSize(width: 0, height: 1)
        ret.layer.shadowOpacity = 0.12
        ret.layer.shadowRadius = 0.5
        ret.heightAnchor.constraint(equalToConstant: 44).isActive = true
        ret.widthAnchor.constraint(equalToConstant: 80).isActive = true
        ret.addTarget(self, action: #selector(returnTapped), for: .touchUpInside)
        ret.tag = 101
        r4.addArrangedSubview(ret)

        stack.addArrangedSubview(r4)
        r4.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true

        applyTheme()
        updateShift()
    }

    // MARK: - Factories

    private func makeLetterKey(_ ch: String) -> UIButton {
        let btn = UIButton(type: .system)
        btn.setTitle(ch.uppercased(), for: .normal)
        btn.titleLabel?.font = .systemFont(ofSize: 22)
        btn.layer.cornerRadius = 6
        btn.layer.shadowColor = UIColor.black.cgColor
        btn.layer.shadowOffset = CGSize(width: 0, height: 1)
        btn.layer.shadowOpacity = 0.15
        btn.layer.shadowRadius = 0.5
        btn.heightAnchor.constraint(equalToConstant: 44).isActive = true
        btn.addTarget(self, action: #selector(letterTapped(_:)), for: .touchUpInside)
        return btn
    }

    private func makeSpecialKey(_ symbol: String) -> UIButton {
        let btn = UIButton(type: .system)
        let cfg = UIImage.SymbolConfiguration(pointSize: 15, weight: .medium)
        btn.setImage(UIImage(systemName: symbol, withConfiguration: cfg), for: .normal)
        btn.layer.cornerRadius = 6
        btn.layer.shadowColor = UIColor.black.cgColor
        btn.layer.shadowOffset = CGSize(width: 0, height: 1)
        btn.layer.shadowOpacity = 0.12
        btn.layer.shadowRadius = 0.5
        btn.widthAnchor.constraint(equalToConstant: 42).isActive = true
        btn.heightAnchor.constraint(equalToConstant: 44).isActive = true
        return btn
    }

    // MARK: - Theme

    private func applyTheme() {
        let dark = traitCollection.userInterfaceStyle == .dark
        let bg: UIColor = dark ? .init(white: 0.13, alpha: 1) : .init(red: 0.82, green: 0.82, blue: 0.84, alpha: 1)
        let keyBg: UIColor = dark ? .init(white: 0.26, alpha: 1) : .white
        let specialBg: UIColor = dark ? .init(white: 0.18, alpha: 1) : .init(red: 0.68, green: 0.70, blue: 0.73, alpha: 1)
        let text: UIColor = dark ? .white : .black

        inputView?.backgroundColor = bg

        for btn in keyButtons {
            btn.backgroundColor = keyBg
            btn.setTitleColor(text, for: .normal)
        }

        for btn in [shiftButton, deleteButton] {
            btn?.backgroundColor = specialBg
            btn?.tintColor = text
        }

        // globe is the first subview of the last row
        if let r4 = inputView?.subviews.first?.arrangedSubviews?.last as? UIStackView,
           let globe = r4.arrangedSubviews.first {
            (globe as? UIButton)?.backgroundColor = specialBg
            (globe as? UIButton)?.tintColor = text
        }

        // space and return by tag
        if let space = inputView?.viewWithTag(100) as? UIButton {
            space.backgroundColor = keyBg
            space.setTitleColor(text, for: .normal)
        }
        if let ret = inputView?.viewWithTag(101) as? UIButton {
            ret.backgroundColor = specialBg
            ret.setTitleColor(text, for: .normal)
        }
    }

    // MARK: - Actions

    @objc private func letterTapped(_ sender: UIButton) {
        guard let letter = sender.titleLabel?.text else { return }
        textDocumentProxy.insertText(isUppercase ? letter : letter.lowercased())
        if isUppercase {
            isUppercase = false
            updateShift()
        }
    }

    @objc private func shiftTapped() {
        isUppercase.toggle()
        updateShift()
    }

    @objc private func deleteTapped() {
        textDocumentProxy.deleteBackward()
    }

    @objc private func deleteLong(_ g: UILongPressGestureRecognizer) {
        switch g.state {
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

    private func updateShift() {
        let sym = isUppercase ? "shift.fill" : "shift"
        let cfg = UIImage.SymbolConfiguration(pointSize: 15, weight: .medium)
        shiftButton.setImage(UIImage(systemName: sym, withConfiguration: cfg), for: .normal)
        for btn in keyButtons {
            let t = btn.titleLabel?.text ?? ""
            btn.setTitle(isUppercase ? t.uppercased() : t.lowercased(), for: .normal)
        }
    }

    deinit { deleteRepeatTimer?.invalidate() }
}
