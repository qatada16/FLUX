import React, { createContext, useContext } from 'react';
import { darkTheme, lightTheme, type Theme } from './colors';

export { darkTheme, lightTheme, chartPalette } from './colors';
export type { Theme } from './colors';

type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  mode: 'dark',
});

export const useTheme = () => useContext(ThemeContext);
