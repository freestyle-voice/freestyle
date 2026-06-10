/**
 * macOS Audio Duck
 *
 * Reads and writes the default output device volume through CoreAudio.
 *
 * Commands:
 *   macos-audio-duck get
 *   macos-audio-duck set <volume> [deviceId]
 *
 * Output:
 *   get -> {"deviceId":123,"volume":0.5}
 *
 * Compile:
 *   swiftc -O macos-audio-duck.swift -o macos-audio-duck \
 *     -framework CoreAudio -framework Foundation
 */

import CoreAudio
import Foundation

enum AudioDuckError: Error, CustomStringConvertible {
    case invalidArguments
    case invalidVolume
    case noDefaultOutputDevice(OSStatus)
    case invalidDevice(String)
    case readFailed(OSStatus)
    case writeFailed(OSStatus)
    case volumeUnavailable

    var description: String {
        switch self {
        case .invalidArguments:
            return "usage: macos-audio-duck get | set <volume> [deviceId]"
        case .invalidVolume:
            return "volume must be a number between 0.0 and 1.0"
        case .noDefaultOutputDevice(let status):
            return "failed to read default output device: \(status)"
        case .invalidDevice(let value):
            return "invalid device id: \(value)"
        case .readFailed(let status):
            return "failed to read output volume: \(status)"
        case .writeFailed(let status):
            return "failed to set output volume: \(status)"
        case .volumeUnavailable:
            return "output volume is not available for this device"
        }
    }
}

func emitError(_ message: String) {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
}

func outputDevice(selector: AudioObjectPropertySelector) throws -> AudioDeviceID {
    var address = AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var deviceID = AudioDeviceID(0)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    let status = AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &address,
        0,
        nil,
        &size,
        &deviceID
    )
    guard status == noErr else { throw AudioDuckError.noDefaultOutputDevice(status) }
    return deviceID
}

func defaultOutputDevice() throws -> AudioDeviceID {
    let candidates = [
        kAudioHardwarePropertyDefaultOutputDevice,
        kAudioHardwarePropertyDefaultSystemOutputDevice,
    ]

    var lastStatus: OSStatus = noErr
    for selector in candidates {
        do {
            let deviceID = try outputDevice(selector: selector)
            if deviceID != kAudioObjectUnknown {
                return deviceID
            }
        } catch AudioDuckError.noDefaultOutputDevice(let status) {
            lastStatus = status
        }
    }

    throw AudioDuckError.noDefaultOutputDevice(lastStatus)
}

func parseDevice(_ value: String?) throws -> AudioDeviceID {
    guard let value else { return try defaultOutputDevice() }
    guard let parsed = UInt32(value) else { throw AudioDuckError.invalidDevice(value) }
    return AudioDeviceID(parsed)
}

func makeVolumeAddress(element: AudioObjectPropertyElement) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyVolumeScalar,
        mScope: kAudioDevicePropertyScopeOutput,
        mElement: element
    )
}

func hasVolume(_ deviceID: AudioDeviceID, _ element: AudioObjectPropertyElement) -> Bool {
    var address = makeVolumeAddress(element: element)
    return AudioObjectHasProperty(deviceID, &address)
}

func readVolumeElement(_ deviceID: AudioDeviceID, _ element: AudioObjectPropertyElement) throws -> Float32 {
    var address = makeVolumeAddress(element: element)
    var value: Float32 = 0
    var size = UInt32(MemoryLayout<Float32>.size)
    let status = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &value)
    guard status == noErr else { throw AudioDuckError.readFailed(status) }
    return value
}

func setVolumeElement(
    _ deviceID: AudioDeviceID,
    _ element: AudioObjectPropertyElement,
    _ volume: Float32
) throws {
    var address = makeVolumeAddress(element: element)
    var settable = DarwinBoolean(false)
    var settableAddress = address
    let settableStatus = AudioObjectIsPropertySettable(deviceID, &settableAddress, &settable)
    guard settableStatus == noErr, settable.boolValue else {
        throw AudioDuckError.writeFailed(settableStatus)
    }

    var value = volume
    let status = AudioObjectSetPropertyData(
        deviceID,
        &address,
        0,
        nil,
        UInt32(MemoryLayout<Float32>.size),
        &value
    )
    guard status == noErr else { throw AudioDuckError.writeFailed(status) }
}

func preferredStereoChannels(_ deviceID: AudioDeviceID) -> [AudioObjectPropertyElement] {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyPreferredChannelsForStereo,
        mScope: kAudioDevicePropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain
    )
    guard AudioObjectHasProperty(deviceID, &address) else { return [1, 2] }

    var channels = [UInt32](repeating: 0, count: 2)
    var size = UInt32(MemoryLayout<UInt32>.size * channels.count)
    let status = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &channels)
    guard status == noErr else { return [1, 2] }
    return channels
        .filter { $0 > 0 }
        .map { AudioObjectPropertyElement($0) }
}

func readableVolumeElements(_ deviceID: AudioDeviceID) -> [AudioObjectPropertyElement] {
    if hasVolume(deviceID, kAudioObjectPropertyElementMain) {
        return [kAudioObjectPropertyElementMain]
    }

    let stereo = preferredStereoChannels(deviceID).filter { hasVolume(deviceID, $0) }
    if !stereo.isEmpty { return stereo }

    return [1, 2].filter { hasVolume(deviceID, AudioObjectPropertyElement($0)) }
        .map { AudioObjectPropertyElement($0) }
}

func readVolume(_ deviceID: AudioDeviceID) throws -> Float32 {
    let elements = readableVolumeElements(deviceID)
    guard !elements.isEmpty else { throw AudioDuckError.volumeUnavailable }

    var values: [Float32] = []
    for element in elements {
        values.append(try readVolumeElement(deviceID, element))
    }
    return values.reduce(0, +) / Float32(values.count)
}

func setVolume(_ deviceID: AudioDeviceID, _ volume: Float32) throws {
    if hasVolume(deviceID, kAudioObjectPropertyElementMain) {
        do {
            try setVolumeElement(deviceID, kAudioObjectPropertyElementMain, volume)
            return
        } catch {
            // Fall back to the preferred stereo channels below.
        }
    }

    var seen = Set<AudioObjectPropertyElement>()
    let elements = (preferredStereoChannels(deviceID) + [1, 2])
        .filter { seen.insert($0).inserted }
        .filter { hasVolume(deviceID, $0) }
    guard !elements.isEmpty else { throw AudioDuckError.volumeUnavailable }

    var lastError: Error?
    var didSet = false
    for element in elements {
        do {
            try setVolumeElement(deviceID, element, volume)
            didSet = true
        } catch {
            lastError = error
        }
    }

    if !didSet {
        throw lastError ?? AudioDuckError.volumeUnavailable
    }
}

func parseVolume(_ value: String) throws -> Float32 {
    guard let volume = Float32(value), volume >= 0, volume <= 1 else {
        throw AudioDuckError.invalidVolume
    }
    return volume
}

func run() throws {
    guard CommandLine.arguments.count >= 2 else {
        throw AudioDuckError.invalidArguments
    }

    let command = CommandLine.arguments[1]
    switch command {
    case "get":
        guard CommandLine.arguments.count == 2 else {
            throw AudioDuckError.invalidArguments
        }
        let deviceID = try defaultOutputDevice()
        let volume = try readVolume(deviceID)
        print("{\"deviceId\":\(deviceID),\"volume\":\(volume)}")
    case "set":
        guard CommandLine.arguments.count == 3 || CommandLine.arguments.count == 4 else {
            throw AudioDuckError.invalidArguments
        }
        let targetVolume = try parseVolume(CommandLine.arguments[2])
        let deviceID = try parseDevice(CommandLine.arguments.count == 4 ? CommandLine.arguments[3] : nil)
        try setVolume(deviceID, targetVolume)
    default:
        throw AudioDuckError.invalidArguments
    }
}

do {
    try run()
} catch {
    emitError(String(describing: error))
    exit(1)
}
