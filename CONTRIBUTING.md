<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="media/freestyle-logo-full-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="media/freestyle-logo-full-light.png">
    <img alt="Freestyle" src="media/freestyle-logo-full-light.png" width="420">
  </picture>
</p>

# Contributing

First, thank you so much for considering contributing to the project. Contributors mean a lot to us, it's people like you that grow our community and make this project so fun to work on. 

## Join our Discord

<p align="left">
  <a href="https://discord.gg/Fmgt5yZCDu"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2.svg?style=for-the-badge&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

Please consider joining our Discord server. This is where contributors communicate. We have all project discussions there. 

If you have any questions, our Discord server is the place to ask. 

## Prerequisites

- **Node.js 22+**
- **pnpm 10+**

## Setup

1. Fork and clone the repo

   ```bash
   git clone https://github.com/freestyle-voice/freestyle.git
   cd freestyle
   ```

2. Install dependencies

   ```bash
   pnpm install
   ```

3. Start development

   ```bash
   pnpm dev
   ```

   This starts the Electron app with hot-reloading via `electron-vite`. The embedded Hono server starts automatically on a local port.

   On first launch, macOS will prompt for:
   1. **Microphone** access
   2. **Accessibility** access (required for paste simulation and global key listener)

## Build

```bash
# macOS
pnpm --filter @freestyle/electron build:mac

# Windows
pnpm --filter @freestyle/electron build:win

# Linux
pnpm --filter @freestyle/electron build:linux
```

## Project structure

- `apps/electron` — Electron desktop app (main process + React renderer)
- `apps/server` — Hono API server (embedded in the Electron app)

## Development workflow

1. Create a branch from `main`
2. Make your changes
3. Run `pnpm biome check .` to verify lint and formatting
4. Run `pnpm --filter @freestyle/electron typecheck:web` to verify types
5. Commit — husky runs biome on staged files automatically
6. Open a PR against `main`

## Code style

- **Biome** for linting and formatting (not ESLint/Prettier)
- 2-space indentation, 80-char line width
- Imports are auto-sorted by Biome

## Commit messages

Follow conventional commits:

```
feat: add new feature
fix: resolve a bug
chore: maintenance task
```

## Freestyle Cloud backend (managed STT)

Only needed if you're working on the **Freestyle Cloud** transcription provider. It's a separate Cloudflare Worker (the `cloud` repository) that exposes the `/v1/transcribe` endpoint, and the desktop app calls it when "Freestyle Cloud" is the selected voice model.

1. In the cloud repo's `apps/server`, create local secrets from the template and add a Groq API key:

   ```bash
   cp apps/server/.dev.vars.example apps/server/.dev.vars
   # set GROQ_API_KEY=... in .dev.vars
   ```

2. Start the Worker with Wrangler (defaults to `http://localhost:8787`):

   ```bash
   pnpm dev   # runs `wrangler dev`
   ```

3. Point the desktop app at it by setting this in `apps/electron/.env.local`, then restart `pnpm dev`:

   ```
   FREESTYLE_CLOUD_URL=http://localhost:8787
   ```

`.dev.vars` is gitignored — never commit real keys. For a deployed Worker, set secrets with `wrangler secret put GROQ_API_KEY` instead.