import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Two UI entries, each emitted to its own dir so the manifest can point at
// `dist/pill/index.html` (the chat panel) and `dist/settings/index.html`
// (the config page). `root` is `ui/`, so the html files keep their `pill/`
// and `settings/` subpaths under `outDir`.
export default defineConfig({
  root: resolve(__dirname, "ui"),
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist"),
    // pkgroll already emitted the server bundle (dist/index.js) by the time
    // vite runs; don't wipe dist, only add the UI entries under pill/ + settings/.
    emptyOutDir: false,
    rollupOptions: {
      input: {
        pill: resolve(__dirname, "ui/pill/index.html"),
        settings: resolve(__dirname, "ui/settings/index.html"),
      },
    },
  },
});
