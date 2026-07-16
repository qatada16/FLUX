import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'dark' | 'light';

// Show the battery-optimization prompt at most this many times, and only
// while a required permission is still missing. Prevents the nag-on-every-open
// behaviour once the user is set up (or has clearly seen it enough).
export const MAX_BATTERY_PROMPTS = 3;

interface SettingsState {
  themeMode: ThemeMode;
  // How many times the battery-optimization prompt has been shown.
  batteryPromptCount: number;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  recordBatteryPromptShown: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'dark' as ThemeMode,
      batteryPromptCount: 0,

      setThemeMode: (mode) => set({ themeMode: mode }),

      toggleTheme: () =>
        set((state) => ({
          themeMode: state.themeMode === 'dark' ? 'light' : 'dark',
        })),

      recordBatteryPromptShown: () =>
        set((state) => ({ batteryPromptCount: state.batteryPromptCount + 1 })),
    }),
    {
      name: 'flux-settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (persisted) => {
        const s = persisted as Partial<SettingsState>;
        if (s && s.batteryPromptCount === undefined) s.batteryPromptCount = 0;
        return s as SettingsState;
      },
    }
  )
);
