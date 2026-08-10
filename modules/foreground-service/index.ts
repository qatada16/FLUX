import { requireOptionalNativeModule } from 'expo-modules-core';

interface ForegroundServiceNativeModule {
  start(): boolean;
  stop(): boolean;
  isRunning(): boolean;
}

const ForegroundServiceModule =
  requireOptionalNativeModule<ForegroundServiceNativeModule>('FluxForegroundService');

/** Keep the app process alive so SMS/notification listeners fire while closed. */
export function startForegroundService(): boolean {
  if (!ForegroundServiceModule) return false;
  return ForegroundServiceModule.start();
}

export function stopForegroundService(): boolean {
  if (!ForegroundServiceModule) return false;
  return ForegroundServiceModule.stop();
}

export function isForegroundServiceRunning(): boolean {
  if (!ForegroundServiceModule) return false;
  return ForegroundServiceModule.isRunning();
}

export const isAvailable = ForegroundServiceModule !== null;
