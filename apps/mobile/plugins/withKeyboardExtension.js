/**
 * Expo config plugin: adds the Freestyle voice keyboard as an iOS Custom
 * Keyboard Extension target during `expo prebuild`.
 *
 * Phase 1 scope: create the target, copy the Swift source, configure the
 * Info.plist (keyboard service + Full Access request + mic usage string) and
 * entitlements (App Group + shared keychain access group for the session
 * token), and embed the .appex in the host app. No mic/cloud code yet.
 *
 * The App Group + keychain access group let the main app share the signed-in
 * session with the keyboard (used in a later phase); we wire the entitlements
 * now so the target is provisioned correctly from the start.
 */
const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
} = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const EXT_NAME = "FreestyleKeyboard";
const APP_GROUP = "group.com.freestylevoice.app";
const KEYCHAIN_GROUP = "com.freestylevoice.app.shared";
const SOURCE_FILES = ["KeyboardViewController.swift"];
const DEPLOYMENT_TARGET = "16.0";

function withKeyboardExtension(config) {
  config = withMainAppEntitlements(config);
  config = withMainAppInfoPlist(config);
  config = withKeyboardXcodeProject(config);
  return config;
}

/** App Group + keychain access group on the host app, so it can share the
 * session with the keyboard. */
function withMainAppEntitlements(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.security.application-groups"] = [APP_GROUP];
    mod.modResults["keychain-access-groups"] = [
      `$(AppIdentifierPrefix)${KEYCHAIN_GROUP}`,
    ];
    return mod;
  });
}

/** Expose the App Group id to JS so the bridge can target the same suite. */
function withMainAppInfoPlist(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.FreestyleAppGroup = APP_GROUP;
    return mod;
  });
}

function withKeyboardXcodeProject(config) {
  return withXcodeProject(config, (mod) => {
    const proj = mod.modResults;
    const { projectRoot } = mod.modRequest;
    const mainBundleId =
      config.ios?.bundleIdentifier ?? "com.freestylevoice.app";
    const keyboardBundleId = `${mainBundleId}.keyboard`;

    const iosDir = path.join(projectRoot, "ios");
    const extDir = path.join(iosDir, EXT_NAME);
    if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });

    // Copy Swift sources from the template dir into ios/<EXT_NAME>/.
    const srcDir = path.join(projectRoot, "ios-keyboard");
    for (const file of SOURCE_FILES) {
      const from = path.join(srcDir, file);
      if (fs.existsSync(from)) {
        fs.copyFileSync(from, path.join(extDir, file));
      }
    }
    fs.writeFileSync(path.join(extDir, "Info.plist"), keyboardInfoPlist());
    fs.writeFileSync(
      path.join(extDir, `${EXT_NAME}.entitlements`),
      keyboardEntitlements(),
    );

    // Idempotent: bail if the target already exists (re-runs of prebuild).
    if (proj.pbxTargetByName(EXT_NAME)) return mod;

    const target = proj.addTarget(
      EXT_NAME,
      "app_extension",
      EXT_NAME,
      keyboardBundleId,
    );

    const group = proj.addPbxGroup(
      [...SOURCE_FILES, "Info.plist"],
      EXT_NAME,
      EXT_NAME,
    );
    const mainGroup = proj.getFirstProject().firstProject.mainGroup;
    proj.addToPbxGroup(group.uuid, mainGroup);

    for (const file of SOURCE_FILES) {
      proj.addSourceFile(
        `${EXT_NAME}/${file}`,
        { target: target.uuid },
        group.uuid,
      );
    }

    const configs = proj.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const c = configs[key];
      if (
        typeof c === "object" &&
        c.buildSettings &&
        c.buildSettings.PRODUCT_NAME === `"${EXT_NAME}"`
      ) {
        c.buildSettings.SWIFT_VERSION = "5.0";
        c.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
        c.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        c.buildSettings.CODE_SIGN_ENTITLEMENTS = `${EXT_NAME}/${EXT_NAME}.entitlements`;
        c.buildSettings.INFOPLIST_FILE = `${EXT_NAME}/Info.plist`;
        c.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${keyboardBundleId}"`;
        c.buildSettings.GENERATE_INFOPLIST_FILE = "NO";
        c.buildSettings.CURRENT_PROJECT_VERSION = "1";
        c.buildSettings.MARKETING_VERSION = "1.0";
        c.buildSettings.CLANG_ENABLE_MODULES = "YES";
        c.buildSettings.SWIFT_EMIT_LOC_STRINGS = "YES";
      }
    }

    // Embed the .appex in the host app.
    const mainTarget = proj.getFirstTarget();
    if (mainTarget) {
      proj.addBuildPhase(
        [`${EXT_NAME}.appex`],
        "PBXCopyFilesBuildPhase",
        "Embed App Extensions",
        mainTarget.firstTarget.uuid,
        "app_extension",
      );
    }

    return mod;
  });
}

function keyboardInfoPlist() {
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

function keyboardEntitlements() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP}</string>
  </array>
  <key>keychain-access-groups</key>
  <array>
    <string>$(AppIdentifierPrefix)${KEYCHAIN_GROUP}</string>
  </array>
</dict>
</plist>`;
}

module.exports = withKeyboardExtension;
