import { useMemo } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { createAppTheme } from './theme'
import { ColorModeProvider, useColorMode } from './theme/colorMode'
import { AppShell } from './layout/AppShell'
import { HomePage } from './pages/HomePage'
import { DataPage } from './pages/DataPage'
import { SheetsPage } from './pages/SheetsPage'
import { DashboardsPage } from './pages/DashboardsPage'
import { DashboardEditorPage } from './pages/DashboardEditorPage'
import { DatasetsProvider } from './stores/datasetsStore'
import { CommandPaletteProvider } from './stores/commandPaletteStore'
import { ConnectionsPage } from './pages/ConnectionsPage'
import { PublicDashboardView } from './pages/PublicDashboardView'

function ThemedApp() {
  const { mode } = useColorMode()
  const theme = useMemo(() => createAppTheme(mode), [mode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DatasetsProvider>
        <CommandPaletteProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<AppShell />}>
                <Route index element={<HomePage />} />
                <Route path="data" element={<DataPage />} />
                <Route path="connections" element={<ConnectionsPage />} />
                <Route path="sheets" element={<SheetsPage />} />
                <Route path="dashboards" element={<DashboardsPage />} />
                <Route path="dashboards/:id" element={<DashboardEditorPage />} />
              </Route>
              <Route path="view/:slug" element={<PublicDashboardView />} />
            </Routes>
          </BrowserRouter>
        </CommandPaletteProvider>
      </DatasetsProvider>
    </ThemeProvider>
  )
}

export function App() {
  return (
    <ColorModeProvider>
      <ThemedApp />
    </ColorModeProvider>
  )
}
