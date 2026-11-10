<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="media/freestyle-logo-full-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="media/freestyle-logo-full-light.png">
    <img alt="Freestyle" src="media/freestyle-logo-full-light.png" width="420">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/freestyle-voice/freestyle/releases/latest"><img src="https://img.shields.io/github/v/release/freestyle-voice/freestyle?style=for-the-badge&sort=semver&color=blue" alt="Release" /></a>
  <a href="https://github.com/freestyle-voice/freestyle/releases/latest"><img src="https://img.shields.io/badge/Download-Latest-brightgreen.svg?style=for-the-badge" alt="Download" /></a>
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=for-the-badge" alt="Platform" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License" /></a>
  <a href="https://discord.gg/Fmgt5yZCDu"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2.svg?style=for-the-badge&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

Freestyle is an open-source voice dictation app. Hold a hotkey, speak, and
release to paste polished text into the app you were already using. Choose
cloud transcription, a local speech model, or your own provider, and shape the
result with cleanup, vocabulary, dictionary replacements, and app-specific formats.

### Features

- **Voice dictation** — Hold a hotkey, speak, and release to paste text into the app you were already using. Choose push-to-talk or toggle activation, paste or copy output, and configure models to fit your setup.
- **Language and translation** — Dictate in your chosen language, or select one output language and enable translation.
- **Shape your text** — AI cleanup, custom prompts, app-specific formats, vocabulary, and dictionary replacements turn raw speech into the text you meant to write.
- **Plugins** — Extend the transcription pipeline with plugins and the Freestyle SDK.

For the detailed dictation workflow, models, cleanup, dictionary, and formats,
see the [documentation](https://docs.freestylevoice.com/user-guide).

<p align="center">
  <img src="media/home-page-demo.png" alt="Freestyle dashboard showing a dictation session and recent activity" width="800" />
</p>

## Download

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | [`.dmg`](https://github.com/freestyle-voice/freestyle/releases/latest) |
| macOS (Intel) | [`.dmg`](https://github.com/freestyle-voice/freestyle/releases/latest) |
| Windows | [`.exe`](https://github.com/freestyle-voice/freestyle/releases/latest) |
| Linux | [`.AppImage`](https://github.com/freestyle-voice/freestyle/releases/latest) / [`.deb`](https://github.com/freestyle-voice/freestyle/releases/latest) |

Mobile support on iOS and Android is coming soon. 

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, local development, and opening up a PR. 

For UI work without launching Electron, run `pnpm dev:browser`. See [browser development](apps/electron/BROWSER_DEVELOPMENT.md) for fixture scenarios, a separate development backend, and browser tests.

Consider joining our [Discord server](https://discord.gg/Fmgt5yZCDu)! That's where project contributors communicate.

## License

[MIT](LICENSE)
