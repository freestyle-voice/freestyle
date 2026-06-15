export interface VolumeDucker {
  isActive(): boolean;
  duck(): Promise<boolean>;
  restore(): Promise<void>;
  restoreSync(): void;
}
