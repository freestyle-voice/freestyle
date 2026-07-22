export interface FactoryResetHotkeyManager {
  pause(): void;
  resume(): Promise<void>;
  stop(): void;
  getState(): { paused: boolean; destroyed: boolean };
}

export interface FactoryResetLifecycleOptions {
  manager: FactoryResetHotkeyManager;
  performReset: () => Promise<void>;
  scheduleRelaunch: () => void;
  exit: () => void;
  logResumeFailure: (error: unknown) => void;
}

export async function runFactoryResetLifecycle({
  manager,
  performReset,
  scheduleRelaunch,
  exit,
  logResumeFailure,
}: FactoryResetLifecycleOptions): Promise<void> {
  manager.pause();

  try {
    await performReset();
    manager.stop();
    scheduleRelaunch();
    exit();
  } catch (resetError) {
    const { paused, destroyed } = manager.getState();
    if (paused && !destroyed) {
      try {
        await manager.resume();
      } catch (resumeError) {
        logResumeFailure(resumeError);
      }
    }
    throw resetError;
  }
}
