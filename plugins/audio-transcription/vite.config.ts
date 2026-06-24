import { resolve } from "node:path";
import { defineConfig } from "vite";

// Builds the plugin's UI page (ui/index.html) into dist/ui, alongside the
// pkgroll-built hooks at dist/index.js — so all output lives under dist/. The
// page is plain static HTML/CSS/TS served by the host over the
// freestyle-plugin:// protocol, so it must use relative asset paths
// (base: "./").
export default defineConfig({
  root: resolve(__dirname, "ui"),
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist/ui"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "ui/index.html"),
    },
  },
});
