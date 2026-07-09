import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, CircularProgress, Link, TextField, Typography } from '@mui/material'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import { authApi } from '../lib/api'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
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
              Esqueci minha senha
            </Typography>
          </Box>

          {sent ? (
            <Alert severity="success">
              Se esse e-mail estiver cadastrado, enviamos um link para redefinir a senha.
            </Alert>
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
              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                Enviar link
              </Button>
            </Box>
          )}
          <Link component={RouterLink} to="/login" variant="body2" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
            Voltar para o login
          </Link>
        </CardContent>
      </Card>
    </Box>
  )
}
