#!/usr/bin/env node

/**
 * Keep a prebuilt iOS keyboard target in sync with its tracked template.
 *
 * Expo intentionally ignores `ios/`, so pulling a Swift keyboard fix would
 * otherwise leave an existing local prebuild compiling stale extension files.
 * `expo prebuild` already copies these files through the config plugin; this
 * script covers the common `expo run:ios` path when that project exists.
 */
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(projectRoot, "ios-keyboard");
const extensionDir = path.join(projectRoot, "ios", "FreestyleKeyboard");
const sourceFiles = ["KeyboardViewController.swift", "DictationBridge.swift"];

if (!fs.existsSync(extensionDir)) {
  // `expo run:ios` will prebuild a missing native project, where the config
  // plugin copies the same sources. Nothing exists to synchronize yet.
  process.exit(0);
}

for (const file of sourceFiles) {
  const source = path.join(sourceDir, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing keyboard extension template: ${source}`);
  }
  fs.copyFileSync(source, path.join(extensionDir, file));
}

console.log("Synchronized Freestyle keyboard extension sources.");
