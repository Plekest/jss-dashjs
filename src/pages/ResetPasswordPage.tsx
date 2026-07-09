import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, CircularProgress, TextField, Typography } from '@mui/material'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import { authApi } from '../lib/api'

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setError(null)
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      navigate('/login')
    } catch {
      setError('Link inválido ou expirado. Peça um novo link.')
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
              Redefinir senha
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Nova senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              Redefinir senha
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
