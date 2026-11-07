import { MD3LightTheme } from 'react-native-paper';

/**
 * Premium palette: deep emerald brand, gold for "Pro" and highlights, green for money received,
 * amber for pending, red only for overdue/disputed (PRD design system).
 */
export const brand = {
  primary: '#0F5C4D',
  primaryDeep: '#073B32',
  primaryBright: '#19A27F',
  primarySoft: '#DCEFE8',
  gold: '#D9A441',
  goldSoft: '#FBF1DA',
  money: '#14935F', // received
  moneySoft: '#DDF4E9',
  pending: '#B7791F', // amber
  pendingSoft: '#FBF0DC',
  danger: '#C0392B', // overdue / disputed only
  dangerSoft: '#FBE3E0',
  bg: '#F4F2EC',
  surface: '#FFFFFF',
  ink: '#14211D',
  muted: '#68756F',
  line: '#E6E1D6',
  tint: '#EEEAE0',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.72)',
  glass: 'rgba(255,255,255,0.12)',
  glassLine: 'rgba(255,255,255,0.18)',
};

/** Gradients (top-left -> bottom-right). */
export const gradients = {
  hero: ['#0A4A3E', '#0F5C4D', '#137A63'] as const,
  night: ['#062B25', '#0A4A3E'] as const,
  gold: ['#F1C66B', '#D9A441', '#B98326'] as const,
  money: ['#17A36A', '#0F7F52'] as const,
  running: ['#0B4F42', '#108266'] as const,
};

export const radius = { sm: 12, md: 18, lg: 24, xl: 32, pill: 999 };

/** Type scale from the PRD: 28 / 22 / 18 / 16 / 14, plus a display size for hero numbers. */
export const type = {
  display: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1 },
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 16 },
  small: { fontSize: 14 },
  label: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const },
};

export const lightTheme = {
  ...MD3LightTheme,
  roundness: 5,
  colors: {
    ...MD3LightTheme.colors,
    primary: brand.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: brand.primarySoft,
    onPrimaryContainer: brand.primary,
    secondary: brand.primary,
    secondaryContainer: brand.primarySoft,
    onSecondaryContainer: brand.primary,
    background: brand.bg,
    surface: brand.surface,
    surfaceVariant: brand.tint,
    surfaceDisabled: '#D8D4CA',
    onSurface: brand.ink,
    onSurfaceVariant: brand.muted,
    outline: '#CFC9BB',
    outlineVariant: brand.line,
    elevation: { level0: 'transparent', level1: '#FFFFFF', level2: '#FFFFFF', level3: '#FFFFFF', level4: '#FFFFFF', level5: '#FFFFFF' },
  },
};

export const tabular = { fontVariant: ['tabular-nums' as const] };

export const softShadow = {
  shadowColor: '#1C2A22',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

export const liftShadow = {
  shadowColor: '#073B32',
  shadowOpacity: 0.28,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 10 },
  elevation: 8,
};
