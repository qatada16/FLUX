import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { runCatchUpScan } from './scanner';
import { ensureStoresHydrated } from './hydrate';
import { useSettingsStore } from '../store/settingsStore';

export const CATCH_UP_TASK = 'flux-daily-catch-up-scan';

// WorkManager treats this as "no more often than", and defers it to a
// battery-friendly moment (and only runs it with a network connection), so
// real gaps are often longer. A run is a single inbox query plus parsing —
// cheap enough to do a few times a day so alerts don't lag by a whole day.
export const BACKGROUND_INTERVAL_MINUTES = 120;

// A background run right after the app itself checked has nothing to add.
const SKIP_IF_SCANNED_WITHIN_MS = 30 * 60 * 1000;

// Defined at module scope: the OS starts the app headless to run this, with no
// component tree. index.ts imports this file before the router so the
// definition exists in that headless start — defining it from a screen or
// layout would leave Android with a task name and no task.
TaskManager.defineTask(CATCH_UP_TASK, async () => {
  try {
    await ensureStoresHydrated();
    const { lastScanAt } = useSettingsStore.getState();
    if (Date.now() - lastScanAt < SKIP_IF_SCANNED_WITHIN_MS) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    const result = await runCatchUpScan('auto');
    return result.error
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.error('[Scan] background task failed:', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Ask Android to run the catch-up scan periodically.
 *
 * Registration is persistent, so this is idempotent across launches — calling
 * it again just updates the existing work request (and its interval).
 */
export async function registerBackgroundScan(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      // Background work is disallowed for this app (battery restrictions).
      // Scans on open and on pull-to-refresh still cover everything.
      return false;
    }
    await BackgroundTask.registerTaskAsync(CATCH_UP_TASK, {
      minimumInterval: BACKGROUND_INTERVAL_MINUTES,
    });
    return true;
  } catch (err) {
    console.error('[Scan] could not register background task:', err);
    return false;
  }
}

/** Whether Android currently allows Flux's background check to run. */
export async function backgroundScanAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    return await TaskManager.isTaskRegisteredAsync(CATCH_UP_TASK);
  } catch {
    return false;
  }
}

export async function unregisterBackgroundScan(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(CATCH_UP_TASK)) {
      await BackgroundTask.unregisterTaskAsync(CATCH_UP_TASK);
    }
  } catch {
    // Nothing to undo.
  }
}
