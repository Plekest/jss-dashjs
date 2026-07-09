import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import HistoryIcon from '@mui/icons-material/History'
import RestoreIcon from '@mui/icons-material/Restore'
import { dashboardVersionsApi, type DashboardVersionMeta } from '../lib/api'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function VersionsPanel({
  open,
  onClose,
  dashboardId,
  canEdit,
}: {
  open: boolean
  onClose: () => void
  dashboardId: string
  canEdit: boolean
}) {
  const [versions, setVersions] = useState<DashboardVersionMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setVersions(await dashboardVersionsApi.list(dashboardId))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dashboardId])

  async function handleSave() {
    setSaving(true)
    try {
      await dashboardVersionsApi.create(dashboardId, newName.trim() || undefined)
      setNewName('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleRestore(versionId: string, name: string | null) {
    if (!confirm(`Restaurar a versão "${name ?? formatDate(versions.find((v) => v.id === versionId)!.createdAt)}"? O estado atual será salvo automaticamente antes.`)) {
      return
    }
    setRestoringId(versionId)
    try {
      await dashboardVersionsApi.restore(dashboardId, versionId)
      window.location.reload()
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 380, p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <HistoryIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            Versões
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {canEdit && (
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              size="small"
              placeholder="Nome (opcional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              fullWidth
            />
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Salvar versão
            </Button>
          </Box>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : versions.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ mt: 2 }}>
            Nenhuma versão salva ainda.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' }}>
            {versions.map((v) => (
              <Box
                key={v.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1.5,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                }}
              >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {v.name || 'Sem nome'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {formatDate(v.createdAt)}
                    {v.createdByName ? ` · ${v.createdByName}` : ''}
                  </Typography>
                </Box>
                {canEdit && (
                  <Tooltip title="Restaurar">
                    <IconButton
                      size="small"
                      onClick={() => handleRestore(v.id, v.name)}
                      disabled={restoringId === v.id}
                    >
                      {restoringId === v.id ? <CircularProgress size={16} /> : <RestoreIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Drawer>
  )
}
