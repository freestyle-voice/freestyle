/**
 * Expo config plugin that adds an iOS Action Extension for voice capture.
 *
 * The extension shows a minimal recording UI when triggered from the
 * Share Sheet or iOS Shortcuts. It records audio, transcribes it via
 * the configured provider API, and copies the result to the clipboard.
 *
 * Uses App Groups to read API keys and model config from the main app.
 */
const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const EXTENSION_NAME = "FreestyleShare";
const APP_GROUP_ID = "group.com.freestylevoice.app.shared";

function withShareExtension(config) {
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.security.application-groups"] = [APP_GROUP_ID];
    return mod;
  });

  config = withInfoPlist(config, (mod) => {
    mod.modResults.FreestyleAppGroup = APP_GROUP_ID;
    return mod;
  });

  config = withXcodeProject(config, async (mod) => {
    const xcodeProject = mod.modResults;
    const projectRoot = mod.modRequest.projectRoot;
    const mainBundleId =
      config.ios?.bundleIdentifier ?? "com.freestylevoice.app";
    const extBundleId = `${mainBundleId}.share`;

    const iosDir = path.join(projectRoot, "ios");
    const extDir = path.join(iosDir, EXTENSION_NAME);

    if (!fs.existsSync(extDir)) {
      fs.mkdirSync(extDir, { recursive: true });
    }

    // Copy Swift source
    const srcFile = path.join(
      projectRoot,
      "ios-share-extension",
      "ShareViewController.swift",
    );
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, path.join(extDir, "ShareViewController.swift"));
    }

    // Write Info.plist
    fs.writeFileSync(
      path.join(extDir, "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Freestyle Dictate</string>
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
      <key>NSExtensionActivationRule</key>
      <string>TRUEPREDICATE</string>
    </dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.ui-services</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
  </dict>
  <key>NSMicrophoneUsageDescription</key>
  <string>Freestyle needs microphone access to transcribe your voice.</string>
</dict>
</plist>`,
    );

    // Write entitlements
    fs.writeFileSync(
      path.join(extDir, `${EXTENSION_NAME}.entitlements`),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP_ID}</string>
  </array>
</dict>
</plist>`,
    );

    // Check idempotent
    if (xcodeProject.pbxTargetByName(EXTENSION_NAME)) {
      return mod;
    }

    // Add target
    const target = xcodeProject.addTarget(
      EXTENSION_NAME,
      "app_extension",
      EXTENSION_NAME,
      extBundleId,
    );

    // Add PBX group
    const group = xcodeProject.addPbxGroup(
      ["ShareViewController.swift", "Info.plist"],
      EXTENSION_NAME,
      EXTENSION_NAME,
    );

    const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.addToPbxGroup(group.uuid, mainGroupId);

    // Add source file
    xcodeProject.addSourceFile(
      "ShareViewController.swift",
      { target: target.uuid },
      group.uuid,
    );

    // Build settings
    const configs = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configs) {
      const cfg = configs[key];
      if (
        typeof cfg === "object" &&
        cfg.buildSettings &&
        cfg.buildSettings.PRODUCT_NAME === `"${EXTENSION_NAME}"`
      ) {
        cfg.buildSettings.SWIFT_VERSION = "5.0";
        cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "16.0";
        cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1"';
        cfg.buildSettings.CODE_SIGN_ENTITLEMENTS = `${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`;
        cfg.buildSettings.INFOPLIST_FILE = `${EXTENSION_NAME}/Info.plist`;
        cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${extBundleId}"`;
        cfg.buildSettings.GENERATE_INFOPLIST_FILE = "NO";
        cfg.buildSettings.CURRENT_PROJECT_VERSION = "1";
        cfg.buildSettings.MARKETING_VERSION = "1.0";
        cfg.buildSettings.CLANG_ENABLE_MODULES = "YES";
      }
    }

    // Target dependency
    const mainTarget = xcodeProject.getFirstTarget();
    if (mainTarget && target) {
      xcodeProject.addTargetDependency(mainTarget.firstTarget.uuid, [
        target.uuid,
      ]);
    }

    return mod;
  });

  return config;
}

module.exports = withShareExtension;
