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
import { AuthProvider } from './stores/authStore'
import { ConnectionsPage } from './pages/ConnectionsPage'
import { PublicDashboardView } from './pages/PublicDashboardView'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { AcceptInvitePage } from './pages/AcceptInvitePage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { MembersPage } from './pages/MembersPage'

function ThemedApp() {
  const { mode } = useColorMode()
  const theme = useMemo(() => createAppTheme(mode), [mode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
            <Route path="/view/:slug" element={<PublicDashboardView />} />
            <Route element={<ProtectedRoute />}>
              <Route
                path="/"
                element={
                  <DatasetsProvider>
                    <CommandPaletteProvider>
                      <AppShell />
                    </CommandPaletteProvider>
                  </DatasetsProvider>
                }
              >
                <Route index element={<HomePage />} />
                <Route path="data" element={<DataPage />} />
                <Route path="connections" element={<ConnectionsPage />} />
                <Route path="sheets" element={<SheetsPage />} />
                <Route path="dashboards" element={<DashboardsPage />} />
                <Route path="dashboards/:id" element={<DashboardEditorPage />} />
                <Route path="settings/members" element={<MembersPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
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
