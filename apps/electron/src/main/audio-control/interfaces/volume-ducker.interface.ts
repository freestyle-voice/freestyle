export interface VolumeDucker {
  isActive(): boolean;
  duck(): Promise<boolean>;
  restore(): Promise<void>;
  restoreSync(): boolean;
  snapshotForRecovery(): unknown;
  recoverFromSnapshot(snapshot: unknown): Promise<boolean>;
}
