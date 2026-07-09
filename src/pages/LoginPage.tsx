import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Link,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import { useAuth } from '../stores/authStore'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, selectTenant } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenants, setTenants] = useState<{ id: string; name: string }[] | null>(null)
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await login(email, password)
      if ('needsTenantSelection' in result) {
        setTenants(result.tenants)
      } else {
        navigate('/')
      }
    } catch {
      setError('E-mail ou senha inválidos.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectTenant(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTenantId) return
    setError(null)
    setLoading(true)
    try {
      await selectTenant(selectedTenantId)
      navigate('/')
    } catch {
      setError('Não foi possível entrar nesse tenant.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ width: 380 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <AnalyticsIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6" fontWeight={700}>
              JSS Analytics
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {tenants ? (
            <Box component="form" onSubmit={handleSelectTenant} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Você tem acesso a mais de um tenant. Escolha um para continuar.
              </Typography>
              <TextField
                select
                label="Tenant"
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                fullWidth
              >
                {tenants.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                type="submit"
                variant="contained"
                disabled={!selectedTenantId || loading}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                Continuar
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                fullWidth
                required
              />
              <TextField
                label="Senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                required
              />
              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                Entrar
              </Button>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Link component={RouterLink} to="/forgot-password" variant="body2">
                  Esqueci minha senha
                </Link>
                <Link component={RouterLink} to="/signup" variant="body2">
                  Criar conta
                </Link>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
