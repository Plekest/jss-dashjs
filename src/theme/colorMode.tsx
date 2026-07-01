import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { PaletteMode } from '@mui/material/styles'

const STORAGE_KEY = 'jss-color-mode'

function readStoredMode(): PaletteMode {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'dark' ? 'dark' : 'light'
}

interface ColorModeContextValue {
  mode: PaletteMode
  toggle: () => void
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null)

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>(readStoredMode)

  const value = useMemo<ColorModeContextValue>(
    () => ({
      mode,
      toggle: () =>
        setMode((prev) => {
          const next = prev === 'light' ? 'dark' : 'light'
          window.localStorage.setItem(STORAGE_KEY, next)
          return next
        }),
    }),
    [mode],
  )

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>
}

export function useColorMode() {
  const ctx = useContext(ColorModeContext)
  if (!ctx) throw new Error('useColorMode must be used within a ColorModeProvider')
  return ctx
}
