import { NativeModule, requireNativeModule } from "expo";

declare class FreestyleSharedStoreModule extends NativeModule {
  /** Hand a freshly-dictated transcript to the keyboard (timestamped). */
  setPendingTranscript(text: string): void;
  /** Remove every shared key (used on sign-out). */
  clear(): void;
}

// Loads the native module object from the JSI.
export default requireNativeModule<FreestyleSharedStoreModule>(
  "FreestyleSharedStore",
);
