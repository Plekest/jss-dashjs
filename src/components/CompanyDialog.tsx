import { useEffect, useState } from 'react'
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'
import { membersApi } from '../lib/api'
import { useAuth } from '../stores/authStore'

export function CompanyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tenant, refresh } = useAuth()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(tenant?.name ?? '')
      setError(null)
    }
  }, [open, tenant])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await membersApi.updateTenant(name.trim())
      await refresh()
      onClose()
    } catch {
      setError('Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Editar empresa</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Nome da empresa"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          autoFocus
          slotProps={{ inputLabel: { shrink: true } }}
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
