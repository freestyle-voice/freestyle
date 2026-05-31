import UIKit
import AVFoundation
import MobileCoreServices

/// Share Extension / Action Extension for Freestyle.
///
/// When invoked (via Share Sheet, Shortcut, or Action Extension),
/// it presents a minimal recording UI. The user taps to record,
/// taps again to stop. The audio is sent to the transcription API,
/// and the result is copied to the clipboard so the user can paste it.
///
/// This extension uses App Groups to read API keys and model config
/// written by the main Freestyle app.
class ShareViewController: UIViewController {

    // MARK: - Config

    private let appGroupId = "group.com.freestylevoice.app.shared"

    // MARK: - State

    private var audioRecorder: AVAudioRecorder?
    private var recordingURL: URL?
    private var isRecording = false

    // MARK: - UI

    private let containerView = UIView()
    private let micButton = UIButton(type: .custom)
    private let statusLabel = UILabel()
    private let titleLabel = UILabel()
    private let cancelButton = UIButton(type: .system)
    private let resultLabel = UILabel()

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }

    // MARK: - UI Setup

    private func setupUI() {
        let dark = traitCollection.userInterfaceStyle == .dark
        view.backgroundColor = UIColor.black.withAlphaComponent(0.4)

        // Card container
        containerView.backgroundColor = dark
            ? UIColor(red: 0.118, green: 0.110, blue: 0.086, alpha: 1)
            : UIColor(red: 0.984, green: 0.973, blue: 0.933, alpha: 1)
        containerView.layer.cornerRadius = 20
        containerView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(containerView)

        // Title
        titleLabel.text = "Freestyle"
        titleLabel.font = UIFont(name: "Georgia-Italic", size: 20) ?? .italicSystemFont(ofSize: 20)
        titleLabel.textColor = dark
            ? UIColor(red: 0.541, green: 0.714, blue: 0.165, alpha: 1)
            : UIColor(red: 0.420, green: 0.561, blue: 0.071, alpha: 1)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(titleLabel)

        // Status
        statusLabel.text = "Tap to start recording"
        statusLabel.font = .systemFont(ofSize: 13, weight: .medium)
        statusLabel.textColor = dark
            ? UIColor(red: 0.620, green: 0.592, blue: 0.498, alpha: 1)
            : UIColor(red: 0.482, green: 0.455, blue: 0.380, alpha: 1)
        statusLabel.textAlignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(statusLabel)

        // Mic button
        let olive: UIColor = dark
            ? UIColor(red: 0.541, green: 0.714, blue: 0.165, alpha: 1)
            : UIColor(red: 0.420, green: 0.561, blue: 0.071, alpha: 1)
        micButton.backgroundColor = olive
        micButton.layer.cornerRadius = 36
        let micCfg = UIImage.SymbolConfiguration(pointSize: 24, weight: .semibold)
        micButton.setImage(UIImage(systemName: "mic.fill", withConfiguration: micCfg), for: .normal)
        micButton.tintColor = UIColor(red: 0.984, green: 0.973, blue: 0.933, alpha: 1)
        micButton.addTarget(self, action: #selector(micTapped), for: .touchUpInside)
        micButton.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(micButton)

        // Result label (shown after transcription)
        resultLabel.text = ""
        resultLabel.font = .systemFont(ofSize: 15, weight: .regular)
        resultLabel.textColor = dark
            ? UIColor(red: 0.925, green: 0.906, blue: 0.839, alpha: 1)
            : UIColor(red: 0.086, green: 0.078, blue: 0.059, alpha: 1)
        resultLabel.textAlignment = .center
        resultLabel.numberOfLines = 4
        resultLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(resultLabel)

        // Cancel button
        cancelButton.setTitle("Done", for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .medium)
        cancelButton.setTitleColor(olive, for: .normal)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(cancelButton)

        NSLayoutConstraint.activate([
            containerView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            containerView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            containerView.widthAnchor.constraint(equalTo: view.widthAnchor, constant: -48),
            containerView.heightAnchor.constraint(equalToConstant: 320),

            titleLabel.topAnchor.constraint(equalTo: containerView.topAnchor, constant: 24),
            titleLabel.centerXAnchor.constraint(equalTo: containerView.centerXAnchor),

            statusLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            statusLabel.centerXAnchor.constraint(equalTo: containerView.centerXAnchor),
            statusLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 24),
            statusLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -24),

            micButton.centerXAnchor.constraint(equalTo: containerView.centerXAnchor),
            micButton.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 24),
            micButton.widthAnchor.constraint(equalToConstant: 72),
            micButton.heightAnchor.constraint(equalToConstant: 72),

            resultLabel.topAnchor.constraint(equalTo: micButton.bottomAnchor, constant: 20),
            resultLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 24),
            resultLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -24),

            cancelButton.bottomAnchor.constraint(equalTo: containerView.bottomAnchor, constant: -16),
            cancelButton.centerXAnchor.constraint(equalTo: containerView.centerXAnchor),
        ])
    }

    // MARK: - Actions

    @objc private func micTapped() {
        if isRecording {
            stopAndTranscribe()
        } else {
            startRecording()
        }
    }

    @objc private func cancelTapped() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    private func startRecording() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
        } catch {
            statusLabel.text = "Microphone access denied"
            return
        }

        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent("freestyle_share_\(UUID().uuidString).m4a")
        recordingURL = fileURL

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            AVEncoderBitRateKey: 128000,
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: fileURL, settings: settings)
            audioRecorder?.record()
            isRecording = true

            let danger = UIColor(red: 0.867, green: 0.431, blue: 0.306, alpha: 1)
            UIView.animate(withDuration: 0.2) {
                self.micButton.backgroundColor = danger
                self.micButton.transform = CGAffineTransform(scaleX: 0.9, y: 0.9)
            } completion: { _ in
                UIView.animate(withDuration: 0.1) { self.micButton.transform = .identity }
            }

            statusLabel.text = "Recording... tap to stop"
            resultLabel.text = ""
        } catch {
            statusLabel.text = "Failed to start recording"
        }
    }

    private func stopAndTranscribe() {
        audioRecorder?.stop()
        isRecording = false

        let dark = traitCollection.userInterfaceStyle == .dark
        let olive: UIColor = dark
            ? UIColor(red: 0.541, green: 0.714, blue: 0.165, alpha: 1)
            : UIColor(red: 0.420, green: 0.561, blue: 0.071, alpha: 1)

        UIView.animate(withDuration: 0.2) {
            self.micButton.backgroundColor = olive
        }

        guard let audioURL = recordingURL else {
            statusLabel.text = "No audio recorded"
            return
        }

        statusLabel.text = "Transcribing..."
        micButton.isEnabled = false
        micButton.alpha = 0.5

        Task {
            do {
                let text = try await transcribe(audioURL: audioURL)
                await MainActor.run {
                    if text.isEmpty {
                        self.statusLabel.text = "No speech detected"
                    } else {
                        UIPasteboard.general.string = text
                        self.resultLabel.text = text
                        self.statusLabel.text = "Copied to clipboard ✓"
                        self.cancelButton.setTitle("Done", for: .normal)
                    }
                    self.micButton.isEnabled = true
                    self.micButton.alpha = 1
                }
                try? FileManager.default.removeItem(at: audioURL)
            } catch {
                await MainActor.run {
                    self.statusLabel.text = "Error"
                    self.resultLabel.text = error.localizedDescription
                    self.micButton.isEnabled = true
                    self.micButton.alpha = 1
                }
            }
        }

        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false)
    }

    // MARK: - Transcription

    /// Reads API config from the shared App Group and calls the transcription API.
    private func transcribe(audioURL: URL) async throws -> String {
        let defaults = UserDefaults(suiteName: appGroupId)

        guard let provider = defaults?.string(forKey: "default_voice_provider"),
              let modelId = defaults?.string(forKey: "default_voice_model_id"),
              let apiKey = defaults?.string(forKey: "apikey_\(provider)")
        else {
            throw NSError(domain: "Freestyle", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Open the Freestyle app to configure your API key and model."])
        }

        let strippedModel = stripPrefix(modelId)
        let audioData = try Data(contentsOf: audioURL)

        switch provider {
        case "openai":
            return try await transcribeMultipart(
                url: URL(string: "https://api.openai.com/v1/audio/transcriptions")!,
                audioData: audioData,
                headers: ["Authorization": "Bearer \(apiKey)"],
                fields: ["model": strippedModel]
            )
        case "groq":
            return try await transcribeMultipart(
                url: URL(string: "https://api.groq.com/openai/v1/audio/transcriptions")!,
                audioData: audioData,
                headers: ["Authorization": "Bearer \(apiKey)"],
                fields: ["model": strippedModel]
            )
        default:
            return try await transcribeMultipart(
                url: URL(string: "https://api.openai.com/v1/audio/transcriptions")!,
                audioData: audioData,
                headers: ["Authorization": "Bearer \(apiKey)"],
                fields: ["model": strippedModel]
            )
        }
    }

    private func transcribeMultipart(
        url: URL,
        audioData: Data,
        headers: [String: String],
        fields: [String: String]
    ) async throws -> String {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        for (k, v) in headers { request.setValue(v, forHTTPHeaderField: k) }

        var body = Data()
        for (k, v) in fields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(k)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(v)\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"recording.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/mp4\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let msg = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw NSError(domain: "Freestyle", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: msg])
        }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return (json?["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func stripPrefix(_ modelId: String) -> String {
        guard let idx = modelId.firstIndex(of: "/") else { return modelId }
        return String(modelId[modelId.index(after: idx)...])
    }
}
