/**
 * Expo config plugin that adds an iOS Custom Keyboard Extension target
 * to the Xcode project during `expo prebuild`.
 *
 * This plugin:
 * 1. Copies Swift source files into the ios/ build directory
 * 2. Adds a new "FreestyleKeyboard" target to the Xcode project
 * 3. Configures App Groups for shared data between the main app and keyboard
 * 4. Sets the required entitlements and Info.plist for keyboard extensions
 */
const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const KEYBOARD_EXTENSION_NAME = "FreestyleKeyboard";
const APP_GROUP_IDENTIFIER = "group.com.freestylevoice.app.shared";
const KEYBOARD_BUNDLE_ID_SUFFIX = ".keyboard";

function withKeyboardExtension(config) {
  config = withMainAppEntitlements(config);
  config = withMainAppInfoPlist(config);
  config = withKeyboardXcodeProject(config);
  return config;
}

function withMainAppEntitlements(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.security.application-groups"] = [
      APP_GROUP_IDENTIFIER,
    ];
    return mod;
  });
}

function withMainAppInfoPlist(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.FreestyleAppGroup = APP_GROUP_IDENTIFIER;
    return mod;
  });
}

function withKeyboardXcodeProject(config) {
  return withXcodeProject(config, async (mod) => {
    const xcodeProject = mod.modResults;
    const projectRoot = mod.modRequest.projectRoot;
    const mainBundleId =
      config.ios?.bundleIdentifier ?? "com.freestylevoice.app";
    const keyboardBundleId = mainBundleId + KEYBOARD_BUNDLE_ID_SUFFIX;

    const iosDir = path.join(projectRoot, "ios");
    const extensionDir = path.join(iosDir, KEYBOARD_EXTENSION_NAME);

    if (!fs.existsSync(extensionDir)) {
      fs.mkdirSync(extensionDir, { recursive: true });
    }

    // Copy Swift source files
    const sourceDir = path.join(projectRoot, "ios-keyboard");
    const sourceFiles = [
      "KeyboardViewController.swift",
      "AudioRecorder.swift",
      "TranscriptionService.swift",
      "SharedConfig.swift",
    ];

    for (const file of sourceFiles) {
      const srcPath = path.join(sourceDir, file);
      const dstPath = path.join(extensionDir, file);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, dstPath);
      }
    }

    // Write Info.plist
    fs.writeFileSync(
      path.join(extensionDir, "Info.plist"),
      generateKeyboardInfoPlist(),
    );

    // Write entitlements
    fs.writeFileSync(
      path.join(extensionDir, `${KEYBOARD_EXTENSION_NAME}.entitlements`),
      generateKeyboardEntitlements(),
    );

    // Check if target already exists (idempotent)
    const existingTarget = xcodeProject.pbxTargetByName(
      KEYBOARD_EXTENSION_NAME,
    );
    if (existingTarget) {
      return mod;
    }

    // --- Add the target ---
    const target = xcodeProject.addTarget(
      KEYBOARD_EXTENSION_NAME,
      "app_extension",
      KEYBOARD_EXTENSION_NAME,
      keyboardBundleId,
    );

    // Create a PBX group for the extension files
    const group = xcodeProject.addPbxGroup(
      [
        "KeyboardViewController.swift",
        "AudioRecorder.swift",
        "TranscriptionService.swift",
        "SharedConfig.swift",
        "Info.plist",
      ],
      KEYBOARD_EXTENSION_NAME,
      KEYBOARD_EXTENSION_NAME,
    );

    // Add the group to the main project group
    const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.addToPbxGroup(group.uuid, mainGroupId);

    // Add source files to the extension target's compile sources.
    // NOTE: xcodeProject.addSourceFile() has a known bug where it does not
    // reliably add files to non-primary targets' PBXSourcesBuildPhase.
    // Instead, we use addBuildPhase() which correctly creates the build
    // phase with all source files included.
    const extensionSourceFiles = sourceFiles.map(
      (f) => `${KEYBOARD_EXTENSION_NAME}/${f}`,
    );
    xcodeProject.addBuildPhase(
      extensionSourceFiles,
      "PBXSourcesBuildPhase",
      "Sources",
      target.uuid,
    );

    // Configure build settings
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const cfg = configurations[key];
      if (
        typeof cfg === "object" &&
        cfg.buildSettings &&
        cfg.name &&
        cfg.buildSettings.PRODUCT_NAME === `"${KEYBOARD_EXTENSION_NAME}"`
      ) {
        cfg.buildSettings.SWIFT_VERSION = "5.0";
        cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "16.0";
        cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1"';
        cfg.buildSettings.CODE_SIGN_ENTITLEMENTS = `${KEYBOARD_EXTENSION_NAME}/${KEYBOARD_EXTENSION_NAME}.entitlements`;
        cfg.buildSettings.INFOPLIST_FILE = `${KEYBOARD_EXTENSION_NAME}/Info.plist`;
        cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${keyboardBundleId}"`;
        cfg.buildSettings.GENERATE_INFOPLIST_FILE = "NO";
        cfg.buildSettings.CURRENT_PROJECT_VERSION = "1";
        cfg.buildSettings.MARKETING_VERSION = "1.0";
        cfg.buildSettings.CLANG_ENABLE_MODULES = "YES";
      }
    }

    // Add a target dependency so the extension is built with the main app.
    // addTarget("app_extension") already creates a CopyFiles build phase
    // that embeds the .appex into PlugIns, so we only need the dependency.
    const mainTarget = xcodeProject.getFirstTarget();
    if (mainTarget && target) {
      const objects = xcodeProject.hash.project.objects;

      // The xcode module's addTargetDependency() silently no-ops if the
      // PBXTargetDependency / PBXContainerItemProxy sections don't already
      // exist in the project. Initialize them so the method works.
      if (!objects.PBXContainerItemProxy) {
        objects.PBXContainerItemProxy = {};
      }
      if (!objects.PBXTargetDependency) {
        objects.PBXTargetDependency = {};
      }

      xcodeProject.addTargetDependency(mainTarget.uuid, [target.uuid]);
    }

    return mod;
  });
}

function generateKeyboardInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Freestyle</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionAttributes</key>
    <dict>
      <key>IsASCIICapable</key>
      <false/>
      <key>PrefersRightToLeft</key>
      <false/>
      <key>PrimaryLanguage</key>
      <string>en-US</string>
      <key>RequestsOpenAccess</key>
      <true/>
    </dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.keyboard-service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).KeyboardViewController</string>
  </dict>
  <key>NSMicrophoneUsageDescription</key>
  <string>Freestyle needs microphone access to transcribe your voice.</string>
</dict>
</plist>`;
}

function generateKeyboardEntitlements() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP_IDENTIFIER}</string>
  </array>
</dict>
</plist>`;
}

module.exports = withKeyboardExtension;
