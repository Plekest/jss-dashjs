import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { theme } from './theme'
import { AppShell } from './layout/AppShell'
import { DataPage } from './pages/DataPage'
import { SheetsPage } from './pages/SheetsPage'
import { DashboardsPage } from './pages/DashboardsPage'
import { DashboardEditorPage } from './pages/DashboardEditorPage'
import { DatasetsProvider } from './stores/datasetsStore'
import { ConnectionsPage } from './pages/ConnectionsPage'

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DatasetsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<Navigate to="/data" replace />} />
              <Route path="data" element={<DataPage />} />
              <Route path="connections" element={<ConnectionsPage />} />
              <Route path="sheets" element={<SheetsPage />} />
              <Route path="dashboards" element={<DashboardsPage />} />
              <Route path="dashboards/:id" element={<DashboardEditorPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DatasetsProvider>
    </ThemeProvider>
  )
}
