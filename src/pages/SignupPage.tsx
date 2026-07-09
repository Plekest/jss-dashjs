import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, CircularProgress, Link, TextField, Typography } from '@mui/material'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import { useAuth } from '../stores/authStore'

export function SignupPage() {
  const navigate = useNavigate()
  const { signup } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signup({ name, email, password, tenantName })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error && err.message.includes('409') ? 'Este e-mail já está cadastrado.' : 'Não foi possível criar a conta.')
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
              Criar conta
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Seu nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth required />
            <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth required />
            <TextField
              label="Senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Nome da empresa"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              fullWidth
              required
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              Criar conta
            </Button>
            <Link component={RouterLink} to="/login" variant="body2" sx={{ textAlign: 'center' }}>
              Já tenho uma conta
            </Link>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
