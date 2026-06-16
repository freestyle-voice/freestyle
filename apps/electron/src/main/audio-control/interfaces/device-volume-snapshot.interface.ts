export interface DeviceVolumeSnapshot<DeviceId extends string | number> {
  deviceId: DeviceId;
  previousVolume: number;
}
