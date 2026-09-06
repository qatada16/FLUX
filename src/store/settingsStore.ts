import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'dark' | 'light';

// How far back a catch-up scan is willing to look. This is a ceiling, not a
// replay instruction: messages already applied are never applied twice, so a
// wider window only helps when the app hasn't been opened for a while.
export const REFRESH_WINDOW_OPTIONS = [7, 15, 30, 60, 90] as const;
export type RefreshWindowDays = (typeof REFRESH_WINDOW_OPTIONS)[number];

export const DEFAULT_REFRESH_WINDOW_DAYS: RefreshWindowDays = 7;

// Unattended scans run about once a day via WorkManager; the app also scans
// whenever it is opened or pulled to refresh.
export const AUTO_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface SettingsState {
  themeMode: ThemeMode;
  // Size of the catch-up window used by every scan.
  refreshWindowDays: RefreshWindowDays;
  // When the last successful scan finished (epoch ms), 0 if never.
  lastScanAt: number;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  setRefreshWindowDays: (days: RefreshWindowDays) => void;
  recordScan: (at: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'dark' as ThemeMode,
      refreshWindowDays: DEFAULT_REFRESH_WINDOW_DAYS,
      lastScanAt: 0,

      setThemeMode: (mode) => set({ themeMode: mode }),

      toggleTheme: () =>
        set((state) => ({
          themeMode: state.themeMode === 'dark' ? 'light' : 'dark',
        })),

      setRefreshWindowDays: (days) => set({ refreshWindowDays: days }),

      recordScan: (at) => set({ lastScanAt: at }),
    }),
    {
      name: 'flux-settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<SettingsState> & {
          batteryPromptCount?: number;
        };
        // v1 carried a battery-optimisation nag counter; the app no longer
        // needs a background exemption, so the field is dropped.
        delete s.batteryPromptCount;
        if (s.refreshWindowDays === undefined) {
          s.refreshWindowDays = DEFAULT_REFRESH_WINDOW_DAYS;
        }
        if (s.lastScanAt === undefined) s.lastScanAt = 0;
        return s as SettingsState;
      },
    }
  )
);
