import AVFoundation

/// Captures microphone audio with `AVAudioEngine`, converts it to the format
/// Freestyle Cloud expects — **PCM16, 16 kHz, mono** — and emits small frames as
/// they arrive. Native conversion via `AVAudioConverter` is far lighter than the
/// JS resampler and keeps us inside the keyboard extension's memory budget: we
/// never buffer the whole recording, only a small reusable output buffer.
final class AudioEngineCapture {
    /// Emits a raw PCM16LE/16 kHz/mono frame as `Data`.
    var onFrame: ((Data) -> Void)?
    /// Emits a smoothed, normalized 0…1 input level for the waveform.
    var onLevel: ((CGFloat) -> Void)?

    private let engine = AVAudioEngine()
    private var converter: AVAudioConverter?
    private let targetSampleRate: Double = 16_000
    private var outputFormat: AVAudioFormat?
    private var smoothedLevel: Float = 0
    private var running = false

    func start() throws {
        guard !running else { return }

        // Configure + activate the session first. `.record` with `.default` mode
        // is the most broadly compatible recording setup inside a keyboard
        // extension; the exotic `.measurement`/bluetooth options can make
        // `setCategory` throw on some devices.
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .default, options: [])
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        // Read the hardware input format only *after* the session is active, so
        // the route (and thus sample rate/channel count) is established. Reading
        // it too early can yield a 0 Hz format, which makes `engine.start()`
        // throw or the tap deliver nothing.
        let input = engine.inputNode
        // The tap delivers buffers in the node's *output* format; build the
        // converter from that exact format so conversion never mismatches.
        let tapFormat = input.outputFormat(forBus: 0)
        guard tapFormat.sampleRate > 0, tapFormat.channelCount > 0 else {
            throw NSError(
                domain: "AudioEngineCapture",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "No audio input available"]
            )
        }

        guard
            let outFormat = AVAudioFormat(
                commonFormat: .pcmFormatInt16,
                sampleRate: targetSampleRate,
                channels: 1,
                interleaved: true
            )
        else {
            throw NSError(
                domain: "AudioEngineCapture",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Unsupported audio format"]
            )
        }
        outputFormat = outFormat
        converter = AVAudioConverter(from: tapFormat, to: outFormat)

        // Install the tap with the node's native format (nil = use it).
        input.installTap(onBus: 0, bufferSize: 2_048, format: nil) {
            [weak self] buffer, _ in
            self?.process(buffer)
        }

        engine.prepare()
        try engine.start()
        running = true
    }

    func stop() {
        guard running else { return }
        running = false
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        converter = nil
        outputFormat = nil
        smoothedLevel = 0
        try? AVAudioSession.sharedInstance().setActive(
            false,
            options: .notifyOthersOnDeactivation
        )
    }

    private func process(_ buffer: AVAudioPCMBuffer) {
        publishLevel(from: buffer)

        guard
            let converter,
            let outputFormat,
            running
        else { return }

        // Size the output buffer for the resampled frame count.
        let ratio = targetSampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 1)
        guard
            let outBuffer = AVAudioPCMBuffer(
                pcmFormat: outputFormat,
                frameCapacity: capacity
            )
        else { return }

        var fed = false
        var error: NSError?
        let status = converter.convert(to: outBuffer, error: &error) { _, inputStatus in
            if fed {
                inputStatus.pointee = .noDataNow
                return nil
            }
            fed = true
            inputStatus.pointee = .haveData
            return buffer
        }

        guard status != .error, error == nil, outBuffer.frameLength > 0,
              let channelData = outBuffer.int16ChannelData
        else { return }

        let byteCount = Int(outBuffer.frameLength) * MemoryLayout<Int16>.size
        let data = Data(bytes: channelData[0], count: byteCount)
        onFrame?(data)
    }

    private func publishLevel(from buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData else { return }
        let frameLength = Int(buffer.frameLength)
        guard frameLength > 0 else { return }

        var sum: Float = 0
        let samples = channelData[0]
        for i in 0..<frameLength {
            let s = samples[i]
            sum += s * s
        }
        let rms = sqrt(sum / Float(frameLength))
        // Map RMS to a perceptual 0…1 range and smooth it a touch.
        let normalized = min(1, max(0, rms * 6))
        smoothedLevel += (normalized - smoothedLevel) * 0.35
        let level = CGFloat(smoothedLevel)
        DispatchQueue.main.async { [weak self] in self?.onLevel?(level) }
    }
}
