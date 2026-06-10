/**
 * macOS Media Control
 *
 * Controls the currently playing media session through MediaRemote.
 *
 * Commands:
 *   macos-media-control status
 *   macos-media-control pause
 *   macos-media-control resume
 *
 * Output:
 *   status -> {"playing":true}
 *   pause  -> {"paused":true}
 *   resume -> {"resumed":true}
 *
 * Compile:
 *   swiftc -O macos-media-control.swift -o macos-media-control \
 *     -framework AppKit -framework Foundation
 */

import AppKit
import Dispatch
import Foundation

private let mediaRemotePath =
    "/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote"
private let commandPlay: Int32 = 0
private let commandPause: Int32 = 1
private let commandTogglePlayPause: Int32 = 2

// IOKit hidsystem constants used to synthesize the hardware Play/Pause key.
private let nxKeyDown = 10
private let nxKeyUp = 11
private let nxSubtypeAuxControlButtons = 8
private let nxKeyTypePlay = 16

enum MediaControlError: Error, CustomStringConvertible {
    case invalidArguments
    case frameworkUnavailable
    case symbolUnavailable(String)
    case statusUnavailable
    case noActivePlayback
    case pauseDidNotTakeEffect
    case resumeDidNotTakeEffect

    var description: String {
        switch self {
        case .invalidArguments:
            return "usage: macos-media-control status | pause | resume"
        case .frameworkUnavailable:
            return "MediaRemote framework is unavailable"
        case .symbolUnavailable(let symbol):
            return "MediaRemote symbol is unavailable: \(symbol)"
        case .statusUnavailable:
            return "failed to read media playback status"
        case .noActivePlayback:
            return "no active playing media session"
        case .pauseDidNotTakeEffect:
            return "media session is still playing after pause command"
        case .resumeDidNotTakeEffect:
            return "media session is still paused after resume command"
        }
    }
}

typealias IsPlayingCompletion = @convention(block) (Bool) -> Void
typealias GetIsPlayingFunction =
    @convention(c) (DispatchQueue, @escaping IsPlayingCompletion) -> Void
typealias SendCommandFunction = @convention(c) (Int32, CFDictionary?) -> Void

func emitError(_ message: String) {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
}

final class MediaRemote {
    private let handle: UnsafeMutableRawPointer
    private let getIsPlaying: GetIsPlayingFunction
    private let sendCommand: SendCommandFunction

    init() throws {
        guard let handle = dlopen(mediaRemotePath, RTLD_LAZY) else {
            throw MediaControlError.frameworkUnavailable
        }
        self.handle = handle

        guard let getIsPlayingSymbol = dlsym(
            handle,
            "MRMediaRemoteGetNowPlayingApplicationIsPlaying"
        ) else {
            throw MediaControlError.symbolUnavailable(
                "MRMediaRemoteGetNowPlayingApplicationIsPlaying"
            )
        }
        guard let sendCommandSymbol = dlsym(handle, "MRMediaRemoteSendCommand") else {
            throw MediaControlError.symbolUnavailable("MRMediaRemoteSendCommand")
        }

        self.getIsPlaying = unsafeBitCast(
            getIsPlayingSymbol,
            to: GetIsPlayingFunction.self
        )
        self.sendCommand = unsafeBitCast(
            sendCommandSymbol,
            to: SendCommandFunction.self
        )
    }

    deinit {
        dlclose(handle)
    }

    func isPlaying(timeoutSeconds: Double = 1.0) -> Bool? {
        let semaphore = DispatchSemaphore(value: 0)
        let queue = DispatchQueue.global(qos: .userInitiated)
        var result: Bool?

        getIsPlaying(queue) { playing in
            result = playing
            semaphore.signal()
        }

        let timeout = DispatchTime.now() + timeoutSeconds
        guard semaphore.wait(timeout: timeout) == .success else { return nil }
        return result
    }

    func pause() throws {
        guard let playing = isPlaying() else {
            throw MediaControlError.statusUnavailable
        }
        guard playing else {
            throw MediaControlError.noActivePlayback
        }
        sendCommand(commandPause, nil)
        guard waitForPlaybackState(false, timeoutSeconds: 1.2) else {
            throw MediaControlError.pauseDidNotTakeEffect
        }
    }

    func resume() throws {
        if let playing = isPlaying(timeoutSeconds: 0.5), playing {
            return
        }

        sendCommand(commandPlay, nil)
        if waitForPlaybackState(true, timeoutSeconds: 1.2) {
            return
        }

        sendCommand(commandTogglePlayPause, nil)
        if waitForPlaybackState(true, timeoutSeconds: 1.2) {
            return
        }

        sendMediaPlayPauseKey()
        guard waitForPlaybackState(true, timeoutSeconds: 1.2) else {
            throw MediaControlError.resumeDidNotTakeEffect
        }
    }

    private func waitForPlaybackState(_ expected: Bool, timeoutSeconds: Double) -> Bool {
        let deadline = Date().addingTimeInterval(timeoutSeconds)

        while Date() < deadline {
            Thread.sleep(forTimeInterval: 0.12)
            if let playing = isPlaying(timeoutSeconds: 0.25), playing == expected {
                return true
            }
        }

        return false
    }

    private func sendMediaPlayPauseKey() {
        postMediaKeyEvent(keyState: nxKeyDown)
        postMediaKeyEvent(keyState: nxKeyUp)
    }

    private func postMediaKeyEvent(keyState: Int) {
        let flags = NSEvent.ModifierFlags(rawValue: UInt(keyState << 16))
        let data1 = (nxKeyTypePlay << 16) | ((keyState == nxKeyDown ? 0xA : 0xB) << 8)

        let event = NSEvent.otherEvent(
            with: .systemDefined,
            location: .zero,
            modifierFlags: flags,
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            subtype: Int16(nxSubtypeAuxControlButtons),
            data1: data1,
            data2: -1
        )
        event?.cgEvent?.post(tap: .cghidEventTap)
    }
}

func run() throws {
    guard CommandLine.arguments.count == 2 else {
        throw MediaControlError.invalidArguments
    }

    let mediaRemote = try MediaRemote()
    switch CommandLine.arguments[1] {
    case "status":
        guard let playing = mediaRemote.isPlaying() else {
            throw MediaControlError.statusUnavailable
        }
        let jsonValue = playing ? "true" : "false"
        print("{\"playing\":\(jsonValue)}")
    case "pause":
        try mediaRemote.pause()
        print("{\"paused\":true}")
    case "resume":
        try mediaRemote.resume()
        print("{\"resumed\":true}")
    default:
        throw MediaControlError.invalidArguments
    }
}

do {
    try run()
} catch {
    emitError(String(describing: error))
    if case MediaControlError.noActivePlayback = error {
        exit(2)
    }
    if case MediaControlError.pauseDidNotTakeEffect = error {
        exit(2)
    }
    if case MediaControlError.resumeDidNotTakeEffect = error {
        exit(2)
    }
    exit(1)
}
