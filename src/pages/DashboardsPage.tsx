import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DashboardIcon from '@mui/icons-material/Dashboard'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import {
  listDashboards,
  createAndSaveDashboard,
  deleteDashboard,
  type DashboardMeta,
} from '../lib/dashboardsStorage'

export function DashboardsPage() {
  const navigate = useNavigate()
  const [dashboards, setDashboards] = useState<DashboardMeta[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const reload = useCallback(async () => {
    setLoadingList(true)
    try {
      setDashboards(await listDashboards())
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { id } = await createAndSaveDashboard(newName.trim())
      setNewDialogOpen(false)
      setNewName('')
      navigate(`/dashboards/${id}`)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Remover este dashboard?')) return
    await deleteDashboard(id)
    await reload()
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 600 }}>
          Dashboards
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setNewDialogOpen(true)}
        >
          Novo Dashboard
        </Button>
      </Box>

      {loadingList && !dashboards.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
          <CircularProgress />
        </Box>
      ) : dashboards.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 8,
            gap: 2,
            color: 'text.secondary',
          }}
        >
          <DashboardIcon sx={{ fontSize: 72, opacity: 0.25 }} />
          <Typography variant="h6" color="text.secondary">
            Nenhum dashboard ainda
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewDialogOpen(true)}>
            Criar primeiro dashboard
          </Button>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {dashboards.map((d) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={d.id}>
              <Card variant="outlined" sx={{ position: 'relative', '&:hover': { boxShadow: 3 } }}>
                <CardActionArea onClick={() => navigate(`/dashboards/${d.id}`)}>
                  <CardContent>
                    <DashboardIcon sx={{ color: '#1a73e8', mb: 1, fontSize: 32 }} />
                    <Typography variant="subtitle1" fontWeight={600} noWrap>
                      {d.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Abrir editor
                    </Typography>
                  </CardContent>
                </CardActionArea>
                <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5 }}>
                  <Tooltip title="Abrir">
                    <IconButton size="small" onClick={() => navigate(`/dashboards/${d.id}`)}>
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remover">
                    <IconButton size="small" onClick={(e) => handleDelete(d.id, e)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={newDialogOpen} onClose={() => setNewDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Novo Dashboard</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nome do dashboard"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            startIcon={creating ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Criar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
