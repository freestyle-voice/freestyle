# Royal-blue branding refresh

**Branch:** `pr/branding-icons`  
**Base:** `main`

## What this PR does

Updates Freestyle's visual identity from the old olive-green accent to a royal-blue accent. This includes the application icon set, in-app theme colors, the idle-state orb, and marketing logo assets.

## Files changed

### Icons and logos

- `apps/electron/build/icon.icns`
- `apps/electron/build/icon.ico`
- `apps/electron/build/icon.png`
- `apps/electron/build/icons/` (16×16 through 512×512)
- `apps/electron/resources/icon.png`
- `media/freestyle-logo-full-dark.png`
- `media/freestyle-logo-full-light.png`
- `media/freestyle-logo-square.png`

### In-app theme

- `apps/electron/src/renderer/src/globals.css`
  - Light-mode primary/ring/chart/sidebar colors: `#435595`
  - Dark-mode primary/ring/chart/sidebar colors: `#5A6FAD`
  - Accent and selection colors updated to the blue family.
- `apps/electron/src/renderer/src/pages/app.tsx`
  - Idle Orb gradient changed from olive green to royal blue.
- `apps/electron/src/renderer/src/assets/mark-light.svg`
  - Wave-mark stroke changed from green to royal blue.

## How to test

1. Build the Windows installer (`pnpm build:win`) and confirm the installer and `Freestyle.exe` show the blue icon.
2. Launch the app and verify buttons, focus rings, selection highlights, and the idle Orb use the blue accent instead of green.
3. Toggle dark mode and confirm the blue accent remains consistent.

## Checklist

- [x] macOS, Windows, and Linux icon assets recolored.
- [x] In-app CSS theme recolored.
- [x] SVG wave mark recolored.
- [x] Orb idle state recolored.
- [x] Marketing logo assets recolored.
- [x] No functional logic changes.
