export interface VolumeDucker {
  isActive(): boolean;
  duck(): Promise<boolean>;
  restore(): Promise<void>;
  restoreSync(): boolean;
  /**
   * Pre-duck snapshot for crash recovery, persisted to disk by the facade.
   * Null when not ducked.
   */
  snapshotForRecovery(): unknown;
  /**
   * Restore volume from a snapshot persisted by a previous run that died
   * while ducked. Implementations must verify the system still looks ducked
   * before applying (the user may have fixed the volume by hand). Returns
   * true when the volume was restored.
   */
  recoverFromSnapshot(snapshot: unknown): Promise<boolean>;
}
