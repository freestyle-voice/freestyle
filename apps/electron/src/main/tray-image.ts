type TemplateImage = {
  setTemplateImage(template: boolean): void;
};

/**
 * Load the template image without resizing it. Electron preserves the adjacent
 * @2x representation, which lets macOS draw a crisp 16-point menu-bar mark.
 */
export function createTrayImage<T extends TemplateImage>(
  nativeImage: { createFromPath(path: string): T },
  trayIconPath: string,
): T {
  const trayImage = nativeImage.createFromPath(trayIconPath);
  trayImage.setTemplateImage(true);
  return trayImage;
}
