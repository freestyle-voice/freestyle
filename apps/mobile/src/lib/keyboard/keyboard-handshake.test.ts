import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const extensionBridge = readFileSync(
  new URL(
    "../../../ios/FreestyleKeyboard/DictationBridge.swift",
    import.meta.url,
  ),
  "utf8",
);
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
const keyboardController = readFileSync(
  new URL(
    "../../../ios/FreestyleKeyboard/KeyboardViewController.swift",
    import.meta.url,
  ),
  "utf8",
);
const mirroredKeyboardController = readFileSync(
  new URL(
    "../../../ios-keyboard/KeyboardViewController.swift",
    import.meta.url,
  ),
  "utf8",
);

describe("keyboard readiness handshake", () => {
  it("restamps after Full Access can change and synchronizes both processes", () => {
    for (const controller of [keyboardController, mirroredKeyboardController]) {
      expect(controller).toMatch(
        /override func viewWillAppear[\s\S]*?bridge\.markKeyboardActive\(\)/,
      );
    }
    for (const source of [extensionBridge, moduleBridge, mirroredBridge]) {
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
});
