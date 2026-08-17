import { is } from "@electron-toolkit/utils";

export function rendererUrl(file: string): string {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/${file}`;
  }
  return `app://renderer/${file}`;
}
