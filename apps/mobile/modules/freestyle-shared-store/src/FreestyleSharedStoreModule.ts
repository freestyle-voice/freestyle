import { NativeModule, requireNativeModule } from "expo";

declare class FreestyleSharedStoreModule extends NativeModule {
  /**
   * Merge string values into the App Group store. A null value removes the key.
   */
  setValues(values: Record<string, string | null>): void;
  setBool(key: string, value: boolean): void;
  /** Remove every shared key (used on sign-out). */
  clear(): void;
}

// Loads the native module object from the JSI.
export default requireNativeModule<FreestyleSharedStoreModule>(
  "FreestyleSharedStore",
);
