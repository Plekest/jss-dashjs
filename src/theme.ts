import { createTheme, type PaletteMode } from '@mui/material/styles'

const displayFont = '"Space Grotesk", "Inter", "Segoe UI", sans-serif'

const tokens = {
  light: {
    primary: '#BD5B3D',
    secondary: '#6B8A6E',
    bg: '#FAF9F7',
    paper: '#FFFFFF',
    text: '#211F1C',
    divider: '#E7E3DC',
  },
  dark: {
    primary: '#D0765A',
    secondary: '#89A88C',
    bg: '#1B1A18',
    paper: '#232120',
    text: '#ECE8E1',
    divider: '#38342E',
  },
} as const

export function createAppTheme(mode: PaletteMode) {
  const t = tokens[mode]
  return createTheme({
    palette: {
      mode,
      primary: { main: t.primary },
      secondary: { main: t.secondary },
      background: { default: t.bg, paper: t.paper },
      text: { primary: t.text },
      divider: t.divider,
    },
    typography: {
      fontFamily: '"Inter", "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif',
      h1: { fontFamily: displayFont, letterSpacing: '-0.01em' },
      h2: { fontFamily: displayFont, letterSpacing: '-0.01em' },
      h3: { fontFamily: displayFont, letterSpacing: '-0.01em' },
      h4: { fontFamily: displayFont, letterSpacing: '-0.01em' },
      h5: { fontFamily: displayFont, letterSpacing: '-0.01em', fontWeight: 600 },
      h6: { fontFamily: displayFont, letterSpacing: '-0.01em', fontWeight: 600 },
    },
    shape: {
      borderRadius: 12,
    },
    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: t.paper,
            color: t.text,
            boxShadow: 'none',
            borderBottom: `1px solid ${t.divider}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: `1px solid ${t.divider}`,
            backgroundColor: t.bg,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow:
              mode === 'light'
                ? '0 1px 2px rgba(0,0,0,0.04), 0 8px 20px -12px rgba(0,0,0,0.08)'
                : '0 1px 2px rgba(0,0,0,0.4), 0 8px 20px -12px rgba(0,0,0,0.6)',
          },
        },
      },
    },
  })
}
