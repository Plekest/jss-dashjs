import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, CircularProgress, TextField, Typography } from '@mui/material'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import { authApi, type InvitePreview } from '../lib/api'
import { useAuth } from '../stores/authStore'

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) return
    authApi
      .getInvite(token)
      .then(setInvite)
      .catch(() => setNotFound(true))
  }, [token])

  async function handleAcceptNew(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setError(null)
    setLoading(true)
    try {
      await authApi.acceptInvite(token, { name, password })
      await refresh()
      navigate('/')
    } catch {
      setError('Não foi possível aceitar o convite.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAcceptExisting() {
    if (!token) return
    setError(null)
    setLoading(true)
    try {
      await authApi.acceptInviteExisting(token)
      await refresh()
      navigate('/')
    } catch {
      setError('Não foi possível aceitar o convite com a conta logada.')
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
      <Card sx={{ width: 400 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <AnalyticsIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6" fontWeight={700}>
              Convite
            </Typography>
          </Box>

          {notFound ? (
            <Alert severity="error">Convite não encontrado ou expirado.</Alert>
          ) : !invite ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Você foi convidado para o time <b>{invite.tenantName}</b> como <b>{invite.role}</b>.
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              {invite.hasAccount ? (
                user && user.email === invite.email ? (
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={handleAcceptExisting}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
                  >
                    Entrar no time
                  </Button>
                ) : (
                  <Alert severity="info">
                    Já existe uma conta com o e-mail {invite.email}. Faça login com essa conta e volte a este link
                    para aceitar o convite.
                  </Alert>
                )
              ) : (
                <Box component="form" onSubmit={handleAcceptNew} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField label="Seu nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth required />
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
                    Criar conta e entrar no time
                  </Button>
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
