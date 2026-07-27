/**
 * Expo config plugin: fix Xcode 14+ resource-bundle signing on EAS Build.
 *
 * Since Xcode 14, CocoaPods resource bundles (produced by deps such as
 * react-native-svg) are code-signed by default, which requires a
 * DEVELOPMENT_TEAM on every resource-bundle target. Prebuild's generated
 * Podfile doesn't set this, so the EAS build fails with:
 *   "resource bundles are signed by default, which requires setting the
 *    development team for each resource bundle target."
 *
 * The generated Podfile already has a `post_install do |installer| ... end`
 * block (added by react-native's Podfile template). We inject our resource
 * bundle signing fix *inside* that existing block rather than adding a second
 * one (two post_install blocks is fragile). Disabling code signing for
 * resource-bundle targets is the standard, safe workaround — resource bundles
 * don't need to be signed independently of the host app.
 *
 * Because ios/ is gitignored and regenerated on the EAS server, this must run
 * as a config plugin rather than a manual Podfile edit.
 */
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const ANCHOR = "resource_bundle_signing_fix";

const INJECT = `
    # ${ANCHOR}
    # Xcode 14+ signs resource bundles by default, which requires a development
    # team on every pod resource-bundle target. Prebuild's Podfile doesn't set
    # one, so EAS fails. Disable signing for resource bundles (they're signed as
    # part of the host app) and clear any team requirement.
    installer.pods_project.targets.each do |target|
      if target.respond_to?(:product_type) && target.product_type == "com.apple.product-type.bundle"
        target.build_configurations.each do |bundle_config|
          bundle_config.build_settings["CODE_SIGNING_ALLOWED"] = "NO"
          bundle_config.build_settings["CODE_SIGNING_REQUIRED"] = "NO"
          bundle_config.build_settings["CODE_SIGN_IDENTITY"] = ""
          bundle_config.build_settings["EXPANDED_CODE_SIGN_IDENTITY"] = ""
          bundle_config.build_settings["DEVELOPMENT_TEAM"] = ""
        end
      end
    end
`;

function withPodResourceBundleSigning(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile",
      );
      let contents = fs.readFileSync(podfilePath, "utf8");

      if (contents.includes(ANCHOR)) return cfg;

      const marker = "post_install do |installer|";
      const idx = contents.indexOf(marker);
      if (idx === -1) {
        throw new Error(
          "[withPodResourceBundleSigning] Could not find a `post_install do |installer|` block in the generated Podfile.",
        );
      }

      const insertAt = idx + marker.length;
      contents =
        contents.slice(0, insertAt) + INJECT + contents.slice(insertAt);

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
}

module.exports = withPodResourceBundleSigning;
