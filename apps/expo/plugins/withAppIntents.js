/**
 * Expo config plugin that adds App Intents (Siri Shortcuts) to the main app.
 *
 * Copies FreestyleIntents.swift into the main app target so the
 * DictateIntent is registered with the system. Users can then:
 * - Say "Hey Siri, Dictate with Freestyle"
 * - Add it to Shortcuts app
 * - Assign to Back Tap or Action Button
 */
const { withXcodeProject } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withAppIntents(config) {
  return withXcodeProject(config, async (mod) => {
    const xcodeProject = mod.modResults;
    const projectRoot = mod.modRequest.projectRoot;
    const projectName = mod.modRequest.projectName;

    const iosDir = path.join(projectRoot, "ios");
    const appDir = path.join(iosDir, projectName);

    // Copy the intents Swift file into the main app directory
    const srcFile = path.join(
      projectRoot,
      "ios-intents",
      "FreestyleIntents.swift",
    );
    const dstFile = path.join(appDir, "FreestyleIntents.swift");

    if (fs.existsSync(srcFile) && fs.existsSync(appDir)) {
      fs.copyFileSync(srcFile, dstFile);

      // Add to the main target's compile sources
      // Find the main app group
      const mainTarget = xcodeProject.getFirstTarget();
      if (mainTarget) {
        const mainGroup = xcodeProject.getFirstProject().firstProject.mainGroup;

        // Find the app's source group (named after the project)
        const groups = xcodeProject.hash.project.objects.PBXGroup;
        let appGroupKey = null;
        for (const key in groups) {
          if (
            typeof groups[key] === "object" &&
            groups[key].name === projectName
          ) {
            appGroupKey = key;
            break;
          }
          if (
            typeof groups[key] === "object" &&
            groups[key].path === projectName
          ) {
            appGroupKey = key;
            break;
          }
        }

        if (appGroupKey) {
          // Check if already added
          const children = groups[appGroupKey].children || [];
          const alreadyAdded = children.some(
            (c) => c.comment === "FreestyleIntents.swift",
          );

          if (!alreadyAdded) {
            xcodeProject.addSourceFile(
              "FreestyleIntents.swift",
              { target: mainTarget.firstTarget.uuid },
              appGroupKey,
            );
          }
        }
      }
    }

    return mod;
  });
}

module.exports = withAppIntents;
