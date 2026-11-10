import type { ElectronAPI } from "@electron-toolkit/preload";
import type { PlatformApi } from "./index";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: PlatformApi;
  }
}
