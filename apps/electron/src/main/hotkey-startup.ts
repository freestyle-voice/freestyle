/**
 * The cold-start failure has no error output (or reaches the READY deadline).
 * Permission, binary, and spawn errors are permanent until their cause changes.
 */
export function shouldRetryMacNativeListener(
  didTimeOut: boolean,
  nativeError: string,
): boolean {
  return didTimeOut || nativeError.length === 0;
}
