import CoreAudio
import Foundation

// Freestyle macOS volume control helper.
// Replaces AppleScript osascript calls with synchronous CoreAudio APIs.
//
// Commands:
//   get              -> prints "<volume>|<muted>" where volume is 0..1
//   set <volume>     -> set output volume (0..1)
//   mute             -> mute default output device
//   unmute           -> unmute default output device

enum VolumeError: Error {
    case invalidCommand
    case audioObjectError(OSStatus)
    case missingDefaultDevice
}

func defaultOutputDeviceID() throws -> AudioDeviceID {
    var id = AudioDeviceID(0)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    let status = AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &address,
        0,
        nil,
        &size,
        &id
    )
    guard status == noErr else {
        throw VolumeError.audioObjectError(status)
    }
    guard id != kAudioDeviceUnknown else {
        throw VolumeError.missingDefaultDevice
    }
    return id
}

func getVolume(deviceID: AudioDeviceID) throws -> Float {
    var volume: Float = 0
    var size = UInt32(MemoryLayout<Float>.size)
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwareServiceDeviceProperty_VirtualMasterVolume,
        mScope: kAudioDevicePropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain
    )
    let status = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &volume)
    guard status == noErr else {
        throw VolumeError.audioObjectError(status)
    }
    return volume
}

func setVolume(deviceID: AudioDeviceID, value: Float) throws {
    var volume = max(0, min(1, value))
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwareServiceDeviceProperty_VirtualMasterVolume,
        mScope: kAudioDevicePropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain
    )
    let status = AudioObjectSetPropertyData(
        deviceID,
        &address,
        0,
        nil,
        UInt32(MemoryLayout<Float>.size),
        &volume
    )
    guard status == noErr else {
        throw VolumeError.audioObjectError(status)
    }
}

func getMute(deviceID: AudioDeviceID) throws -> Bool {
    var muted: UInt32 = 0
    var size = UInt32(MemoryLayout<UInt32>.size)
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyMute,
        mScope: kAudioDevicePropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain
    )
    let status = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &muted)
    guard status == noErr else {
        throw VolumeError.audioObjectError(status)
    }
    return muted != 0
}

func setMute(deviceID: AudioDeviceID, muted: Bool) throws {
    var value: UInt32 = muted ? 1 : 0
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyMute,
        mScope: kAudioDevicePropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain
    )
    let status = AudioObjectSetPropertyData(
        deviceID,
        &address,
        0,
        nil,
        UInt32(MemoryLayout<UInt32>.size),
        &value
    )
    guard status == noErr else {
        throw VolumeError.audioObjectError(status)
    }
}

func run() throws {
    let args = CommandLine.arguments.dropFirst()
    guard let command = args.first else {
        throw VolumeError.invalidCommand
    }

    let deviceID = try defaultOutputDeviceID()

    switch command {
    case "get":
        let volume = try getVolume(deviceID: deviceID)
        let muted = try getMute(deviceID: deviceID)
        print("\(volume)|\(muted)")
    case "set":
        guard args.count >= 2, let value = Float(args.dropFirst().first!) else {
            throw VolumeError.invalidCommand
        }
        try setVolume(deviceID: deviceID, value: value)
    case "mute":
        try setMute(deviceID: deviceID, muted: true)
    case "unmute":
        try setMute(deviceID: deviceID, muted: false)
    default:
        throw VolumeError.invalidCommand
    }
}

do {
    try run()
} catch {
    fputs("error: \(error)\n", stderr)
    exit(1)
}
