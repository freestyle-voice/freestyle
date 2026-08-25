import { describe, expect, it } from "vitest";
import { createTrayImage } from "./tray-image";

describe("createTrayImage", () => {
  it("keeps the native template image intact so macOS can select its Retina representation", () => {
    let loadedPath: string | undefined;
    const image = {
      isTemplate: false,
      setTemplateImage(template: boolean) {
        this.isTemplate = template;
      },
    };

    const trayImage = createTrayImage(
      {
        createFromPath(path) {
          loadedPath = path;
          return image;
        },
      },
      "/app/resources/tray/logoTemplate.png",
    );

    expect(loadedPath).toBe("/app/resources/tray/logoTemplate.png");
    expect(trayImage).toBe(image);
    expect(image.isTemplate).toBe(true);
  });
});
