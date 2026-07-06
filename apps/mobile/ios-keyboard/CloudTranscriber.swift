import Foundation

/// Batch fallback for Freestyle Cloud (`POST /v2/transcribe`), used when the
/// streaming socket can't open. Uploads a recorded clip as `multipart/form-data`
/// (field `audio`) with the same cleanup preferences and returns the `cleaned`
/// transcript. Mirrors the app's batch path and the cloud's v2 contract.
enum CloudTranscriber {
    struct Result {
        let cleaned: String
    }

    enum TranscribeError: Error {
        case unauthorized
        case usageExceeded
        case server(String)
    }

    static func transcribe(
        audioURL: URL,
        mimeType: String,
        fileName: String,
        baseURL: String,
        token: String,
        preferences: CloudStreamSession.Preferences,
        completion: @escaping (Swift.Result<Result, TranscribeError>) -> Void
    ) {
        guard let url = URL(string: baseURL + "/v2/transcribe"),
              let audioData = try? Data(contentsOf: audioURL)
        else {
            completion(.failure(.server("Could not read recording")))
            return
        }

        let boundary = "freestyle-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(
            "multipart/form-data; boundary=\(boundary)",
            forHTTPHeaderField: "Content-Type"
        )

        var fields: [String: String] = [
            "skipPostProcess": preferences.skipPostProcess ? "true" : "false"
        ]
        if let v = preferences.language { fields["language"] = v }
        if !preferences.skipPostProcess {
            if let v = preferences.intensity { fields["intensity"] = v }
            if let v = preferences.personalTone { fields["personalTone"] = v }
            if let v = preferences.workTone { fields["workTone"] = v }
            if let v = preferences.emailTone { fields["emailTone"] = v }
            if let v = preferences.overallTone { fields["overallTone"] = v }
        }

        request.httpBody = multipartBody(
            boundary: boundary,
            fields: fields,
            audio: audioData,
            mimeType: mimeType,
            fileName: fileName
        )

        URLSession(configuration: .ephemeral).dataTask(with: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 { completion(.failure(.unauthorized)); return }
            if status == 429 { completion(.failure(.usageExceeded)); return }
            guard status == 200,
                  let data,
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                completion(.failure(.server("Transcription failed")))
                return
            }
            let cleaned = (obj["cleaned"] as? String) ?? (obj["raw"] as? String) ?? ""
            completion(.success(Result(cleaned: cleaned)))
        }.resume()
    }

    private static func multipartBody(
        boundary: String,
        fields: [String: String],
        audio: Data,
        mimeType: String,
        fileName: String
    ) -> Data {
        var body = Data()
        let boundaryLine = "--\(boundary)\r\n"

        for (key, value) in fields {
            body.append(boundaryLine)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n")
            body.append("\(value)\r\n")
        }

        body.append(boundaryLine)
        body.append(
            "Content-Disposition: form-data; name=\"audio\"; filename=\"\(fileName)\"\r\n"
        )
        body.append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(audio)
        body.append("\r\n--\(boundary)--\r\n")
        return body
    }
}

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) { append(data) }
    }
}
