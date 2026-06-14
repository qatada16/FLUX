export const darkTheme = {
  background: '#0B0E14',
  surface: '#151823',
  surfaceElevated: '#1E2330',
  border: '#2A2F3D',

  textPrimary: '#F5F7FA',
  textSecondary: '#8B95A7',

  accentPrimary: '#00F5A0',
  accentSecondary: '#7B5CFA',
  accentTertiary: '#4DA3FF',

  success: '#00F5A0',
  danger: '#FF5C7A',
  warning: '#FFB84D',
};

// Chart palette — one per wallet, cycles if more than 8
export const chartPalette = [
  '#00F5A0', // mint
  '#7B5CFA', // purple
  '#4DA3FF', // blue
  '#FFB84D', // amber
  '#FF5C7A', // coral
  '#36CFC9', // cyan
  '#FF8FE0', // pink
  '#C2FF5C', // lime
];

// For future light theme support
export const lightTheme = {
  ...darkTheme,
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceElevated: '#F0F2F5',
  border: '#E2E5EB',
  textPrimary: '#0B0E14',
  textSecondary: '#5A6378',
};

export type Theme = typeof darkTheme;
