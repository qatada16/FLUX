import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { runCatchUpScan, isAutoScanDue } from './scanner';

export const CATCH_UP_TASK = 'flux-daily-catch-up-scan';

// WorkManager treats this as "no more often than", and defers it to a
// battery-friendly moment — so a daily scan may land a few hours late. Opening
// the app scans immediately, so this is the floor for an untouched phone, not
// the only path.
const DAILY_MINUTES = 24 * 60;

// Defined at module scope: the OS starts the app headless to run this, with no
// component tree, so registration must exist as a side effect of the import.
TaskManager.defineTask(CATCH_UP_TASK, async () => {
  try {
    if (!isAutoScanDue()) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    await runCatchUpScan('auto');
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.error('[Scan] daily task failed:', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Ask Android to run the catch-up scan about once a day.
 *
 * Registration is persistent, so this is idempotent across launches — calling
 * it again just updates the existing work request.
 */
export async function registerDailyScan(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      // Background work is disallowed for this app (battery restrictions).
      // Scans on open and on pull-to-refresh still cover everything.
      return false;
    }
    await BackgroundTask.registerTaskAsync(CATCH_UP_TASK, {
      minimumInterval: DAILY_MINUTES,
    });
    return true;
  } catch (err) {
    console.error('[Scan] could not register daily task:', err);
    return false;
  }
}

export async function unregisterDailyScan(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(CATCH_UP_TASK)) {
      await BackgroundTask.unregisterTaskAsync(CATCH_UP_TASK);
    }
  } catch {
    // Nothing to undo.
  }
}
