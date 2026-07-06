import UIKit

/// A thin row of level-driven bars, mirroring the standalone app's `Waveform`.
/// Bars ripple from the center outward and their height tracks the live mic
/// level. Deliberately lightweight (CALayer heights, one display link) to fit
/// the keyboard extension's memory budget.
final class WaveformView: UIView {
    var barColor: UIColor = .systemGreen {
        didSet { bars.forEach { $0.backgroundColor = barColor.cgColor } }
    }

    private let barCount = 21
    private let barWidth: CGFloat = 3
    private var bars: [CALayer] = []
    private var displayLink: CADisplayLink?
    private var level: CGFloat = 0
    private var phase: CGFloat = 0
    private var active = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        for _ in 0..<barCount {
            let layer = CALayer()
            layer.cornerRadius = barWidth / 2
            layer.backgroundColor = barColor.cgColor
            self.layer.addSublayer(layer)
            bars.append(layer)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func setActive(_ active: Bool) {
        guard active != self.active else { return }
        self.active = active
        if active {
            displayLink?.invalidate()
            let link = CADisplayLink(target: self, selector: #selector(tick))
            link.add(to: .main, forMode: .common)
            displayLink = link
        } else {
            displayLink?.invalidate()
            displayLink = nil
            level = 0
            setNeedsLayout()
            layoutIfNeeded()
        }
    }

    /// Feed a normalized 0…1 mic level; smoothed toward the target each frame.
    func setLevel(_ value: CGFloat) {
        level = max(0, min(1, value))
    }

    @objc private func tick() {
        phase += 0.18
        layoutBars()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        layoutBars()
    }

    private func layoutBars() {
        let spacing = (bounds.width - CGFloat(barCount) * barWidth) / CGFloat(barCount - 1)
        let mid = CGFloat(barCount - 1) / 2
        for (i, bar) in bars.enumerated() {
            let x = CGFloat(i) * (barWidth + spacing)
            // Distance from center → taller in the middle, tapering to the edges.
            let dist = 1 - abs(CGFloat(i) - mid) / mid
            let wave = active ? (0.5 + 0.5 * sin(phase + CGFloat(i) * 0.5)) : 0
            let minH: CGFloat = 3
            let dynamic = active ? (bounds.height - minH) * dist * (0.25 + 0.75 * level) * wave : 0
            let h = minH + dynamic
            bar.frame = CGRect(x: x, y: (bounds.height - h) / 2, width: barWidth, height: h)
        }
    }
}
