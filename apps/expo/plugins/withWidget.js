/**
 * Expo config plugin that adds an iOS WidgetKit extension.
 *
 * Provides Lock Screen (circular, rectangular) and Home Screen (small)
 * widgets that deep-link into the Freestyle app for voice dictation.
 */
const { withXcodeProject } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WIDGET_NAME = "FreestyleWidget";

function withWidget(config) {
  return withXcodeProject(config, async (mod) => {
    const xcodeProject = mod.modResults;
    const projectRoot = mod.modRequest.projectRoot;
    const mainBundleId =
      config.ios?.bundleIdentifier ?? "com.freestylevoice.app";
    const widgetBundleId = `${mainBundleId}.widget`;

    const iosDir = path.join(projectRoot, "ios");
    const widgetDir = path.join(iosDir, WIDGET_NAME);

    if (!fs.existsSync(widgetDir)) {
      fs.mkdirSync(widgetDir, { recursive: true });
    }

    // Copy Swift source
    const srcFile = path.join(
      projectRoot,
      "ios-widget",
      "FreestyleWidget.swift",
    );
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, path.join(widgetDir, "FreestyleWidget.swift"));
    }

    // Write Info.plist
    fs.writeFileSync(
      path.join(widgetDir, "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>
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
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>`,
    );

    // Check idempotent
    if (xcodeProject.pbxTargetByName(WIDGET_NAME)) {
      return mod;
    }

    // Add target
    const target = xcodeProject.addTarget(
      WIDGET_NAME,
      "app_extension",
      WIDGET_NAME,
      widgetBundleId,
    );

    // Add PBX group
    const group = xcodeProject.addPbxGroup(
      ["FreestyleWidget.swift", "Info.plist"],
      WIDGET_NAME,
      WIDGET_NAME,
    );

    const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.addToPbxGroup(group.uuid, mainGroupId);

    // Add source
    xcodeProject.addSourceFile(
      "FreestyleWidget.swift",
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
        cfg.buildSettings.PRODUCT_NAME === `"${WIDGET_NAME}"`
      ) {
        cfg.buildSettings.SWIFT_VERSION = "5.0";
        cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "16.0";
        cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1"';
        cfg.buildSettings.INFOPLIST_FILE = `${WIDGET_NAME}/Info.plist`;
        cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${widgetBundleId}"`;
        cfg.buildSettings.GENERATE_INFOPLIST_FILE = "NO";
        cfg.buildSettings.CURRENT_PROJECT_VERSION = "1";
        cfg.buildSettings.MARKETING_VERSION = "1.0";
        cfg.buildSettings.CLANG_ENABLE_MODULES = "YES";
        // WidgetKit requires SwiftUI
        cfg.buildSettings.LD_RUNPATH_SEARCH_PATHS =
          '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
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
}

module.exports = withWidget;
