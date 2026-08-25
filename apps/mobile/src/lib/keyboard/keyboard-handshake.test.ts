import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const generatedBridge = new URL(
  "../../../ios/FreestyleKeyboard/DictationBridge.swift",
  import.meta.url,
);
// ios/FreestyleKeyboard is generated immediately before a device build. It is
// intentionally absent from a fresh checkout, so keep the source-contract
// test runnable before that sync while still checking a generated copy when it
// is present locally.
const extensionBridge = existsSync(generatedBridge)
  ? readFileSync(generatedBridge, "utf8")
  : null;
const moduleBridge = readFileSync(
  new URL(
    "../../../modules/freestyle-shared-store/ios/DictationBridge.swift",
    import.meta.url,
  ),
  "utf8",
);
const mirroredBridge = readFileSync(
  new URL("../../../ios-keyboard/DictationBridge.swift", import.meta.url),
  "utf8",
);
const sharedStoreModule = readFileSync(
  new URL(
    "../../../modules/freestyle-shared-store/ios/FreestyleSharedStoreModule.swift",
    import.meta.url,
  ),
  "utf8",
);
const generatedController = new URL(
  "../../../ios/FreestyleKeyboard/KeyboardViewController.swift",
  import.meta.url,
);
const keyboardController = existsSync(generatedController)
  ? readFileSync(generatedController, "utf8")
  : null;
const mirroredKeyboardController = readFileSync(
  new URL(
    "../../../ios-keyboard/KeyboardViewController.swift",
    import.meta.url,
  ),
  "utf8",
);
const mobilePackage = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };

describe("keyboard readiness handshake", () => {
  it("keeps the app and keyboard copies of the wire protocol identical", () => {
    expect(moduleBridge).toBe(mirroredBridge);
    if (extensionBridge) expect(extensionBridge).toBe(mirroredBridge);
  });

  it("keeps keyboard preference optional chains valid Swift", () => {
    expect(mirroredKeyboardController).toMatch(
      /UserDefaults\(suiteName: FreestyleDictationBridge\.appGroupID\)\?\s*\.string/,
    );
    expect(mirroredKeyboardController).toMatch(
      /UserDefaults\(suiteName: FreestyleDictationBridge\.appGroupID\)\?\s*\.set/,
    );
  });

  it("syncs the generated extension source before an iOS build", () => {
    expect(mobilePackage.scripts.ios).toContain(
      "./scripts/sync-keyboard-extension.js",
    );
  });

  it("restamps after Full Access can change and synchronizes both processes", () => {
    for (const controller of [mirroredKeyboardController, keyboardController]) {
      if (!controller) continue;
      expect(controller).toMatch(
        /override func viewWillAppear[\s\S]*?bridge\.markKeyboardActive\(\)/,
      );
    }
    for (const source of [moduleBridge, mirroredBridge, extensionBridge]) {
      if (!source) continue;
      expect(source).toMatch(
        /func markKeyboardActive[\s\S]*?defaults\.synchronize\(\)/,
      );
      expect(source).toMatch(
        /func keyboardLastActive[\s\S]*?defaults\.synchronize\(\)/,
      );
      expect(source).toMatch(
        /func keyboardLastActive[\s\S]*?return defaults\.double\(forKey: Self\.keyboardActiveKey\)/,
      );
    }
  });

  it("delivers a final transcript immediately instead of waiting for the keyboard poll", () => {
    for (const source of [moduleBridge, mirroredBridge, extensionBridge]) {
      if (!source) continue;
      expect(source).toMatch(
        /static let stateDarwinName = "com\.freestylevoice\.dictation\.state" as CFString/,
      );
      expect(source).toMatch(
        /func writeState\([\s\S]*?defaults\.synchronize\(\)[\s\S]*?Self\.postStateNotification\(\)/,
      );
    }

    for (const controller of [mirroredKeyboardController, keyboardController]) {
      if (!controller) continue;
      expect(controller).toMatch(
        /override func viewDidAppear[\s\S]*?startObservingSharedState\(\)/,
      );
      expect(controller).toMatch(
        /func startObservingSharedState\(\)[\s\S]*?CFNotificationCenterAddObserver[\s\S]*?FreestyleDictationBridge\.stateDarwinName/,
      );
    }

    expect(sharedStoreModule).toMatch(
      /Function\("updateLevel"\)[\s\S]*?notifyKeyboard: false/,
    );
  });
});
