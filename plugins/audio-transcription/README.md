# Audio Transcription

Transcribe audio files by dropping them into Freestyle — no microphone needed.

This is a first-party Freestyle plugin. It adds a **Transcribe Files** page where
you can drop or pick audio files and get clean text back, using the same local
or cloud transcription model you've configured for dictation.

## Usage

1. Open **Plugins → Audio Transcription → Open**.
2. Drop one or more audio files onto the page (or click to choose).
3. Each file is transcribed and cleaned up; copy the result with one click.

Supported formats include `wav`, `mp3`, `m4a`, `ogg`, and `flac`. Files are
decoded and resampled to 16 kHz mono in the page before being sent to your
local server, so any common format works regardless of the provider.

## Privacy

Audio is sent only to the Freestyle server you've configured — your local
machine by default. Nothing leaves your device unless you've set up a cloud
provider.

## How it works

The plugin's page talks to the server's `/api/transcribe` endpoint through the
Freestyle plugin bridge (`window.freestyle.api`). It ships no model of its own
and reuses your configured voice model and cleanup settings.
