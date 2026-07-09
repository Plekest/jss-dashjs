import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  TextField,
  Typography,
} from '@mui/material'
import { authApi } from '../lib/api'
import { useAuth } from '../stores/authStore'

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useAuth()
  const [name, setName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(user?.name ?? '')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError(null)
    }
  }, [open, user])

  async function handleSave() {
    setError(null)
    if (newPassword && newPassword !== confirmPassword) {
      setError('As senhas não conferem.')
      return
    }
    if (newPassword && !currentPassword) {
      setError('Informe a senha atual para definir uma nova senha.')
      return
    }
    setSaving(true)
    try {
      await authApi.updateProfile({
        name: name.trim() || undefined,
        currentPassword: newPassword ? currentPassword : undefined,
        newPassword: newPassword || undefined,
      })
      await refresh()
      onClose()
    } catch (e) {
      setError(e instanceof Error && e.message.includes('401') ? 'Senha atual incorreta.' : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Meu perfil</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="E-mail"
          value={user?.email ?? ''}
          fullWidth
          disabled
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <Divider sx={{ my: 1 }} />
        <Typography variant="subtitle2" color="text.secondary">
          Alterar senha (opcional)
        </Typography>
        <TextField
          label="Senha atual"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          fullWidth
        />
        <TextField
          label="Nova senha"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          fullWidth
        />
        <TextField
          label="Confirmar nova senha"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  )
}
