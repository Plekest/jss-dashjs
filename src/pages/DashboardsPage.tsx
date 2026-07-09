import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
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
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DashboardIcon from '@mui/icons-material/Dashboard'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import {
  listDashboards,
  createAndSaveDashboard,
  createAndSaveDashboardFromTemplate,
  createAndSaveDashboardFromSavedTemplate,
  deleteDashboard,
  type DashboardMeta,
} from '../lib/dashboardsStorage'
import { DASHBOARD_TEMPLATES, type DashboardTemplate } from '../lib/templates'
import { dashboardTemplatesApi, type DashboardTemplateMeta } from '../lib/api'
import { useAuth } from '../stores/authStore'

export function DashboardsPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const canEdit = role !== 'viewer'
  const [searchParams, setSearchParams] = useSearchParams()
  const [dashboards, setDashboards] = useState<DashboardMeta[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newDialogStep, setNewDialogStep] = useState<'gallery' | 'name'>('gallery')
  const [selectedStart, setSelectedStart] = useState<'blank' | DashboardTemplate | DashboardTemplateMeta | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [customTemplates, setCustomTemplates] = useState<DashboardTemplateMeta[]>([])

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

  useEffect(() => {
    if (searchParams.get('new') !== '1') return
    openNewDialog()
    setSearchParams(
      (params) => {
        params.delete('new')
        return params
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function openNewDialog() {
    setNewDialogStep('gallery')
    setSelectedStart(null)
    setNewName('')
    setNewDialogOpen(true)
    dashboardTemplatesApi.list().then(setCustomTemplates)
  }

  async function handleRemoveCustomTemplate(templateId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Remover este template?')) return
    await dashboardTemplatesApi.remove(templateId)
    setCustomTemplates(await dashboardTemplatesApi.list())
  }

  function chooseBlank() {
    setSelectedStart('blank')
    setNewName('Novo dashboard')
    setNewDialogStep('name')
  }

  function chooseTemplate(template: DashboardTemplate) {
    setSelectedStart(template)
    setNewName(template.name)
    setNewDialogStep('name')
  }

  function chooseCustomTemplate(template: DashboardTemplateMeta) {
    setSelectedStart(template)
    setNewName(template.name)
    setNewDialogStep('name')
  }

  async function handleCreate() {
    if (!newName.trim() || !selectedStart) return
    setCreating(true)
    try {
      const { id } =
        selectedStart === 'blank'
          ? await createAndSaveDashboard(newName.trim())
          : 'build' in selectedStart
            ? await createAndSaveDashboardFromTemplate(newName.trim(), selectedStart)
            : await createAndSaveDashboardFromSavedTemplate(newName.trim(), selectedStart.id)
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
        {canEdit && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openNewDialog}
          >
            Novo Dashboard
          </Button>
        )}
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
          {canEdit && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openNewDialog}>
              Criar primeiro dashboard
            </Button>
          )}
        </Box>
      ) : (
        <Grid container spacing={2}>
          {dashboards.map((d) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={d.id}>
              <Card
                sx={{
                  position: 'relative',
                  transition: 'box-shadow .15s ease, transform .15s ease',
                  '&:hover': {
                    boxShadow: '0 4px 8px rgba(0,0,0,0.06), 0 16px 32px -16px rgba(0,0,0,0.14)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <CardActionArea onClick={() => navigate(`/dashboards/${d.id}`)}>
                  <CardContent>
                    <DashboardIcon sx={{ color: 'primary.main', mb: 1, fontSize: 32 }} />
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
                  {canEdit && (
                    <Tooltip title="Remover">
                      <IconButton size="small" onClick={(e) => handleDelete(d.id, e)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={newDialogOpen} onClose={() => setNewDialogOpen(false)} maxWidth="sm" fullWidth>
        {newDialogStep === 'gallery' ? (
          <>
            <DialogTitle>Novo Dashboard</DialogTitle>
            <DialogContent>
              <Grid container spacing={2} sx={{ mt: 0 }}>
                <Grid item xs={12} sm={6}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardActionArea onClick={chooseBlank} sx={{ height: '100%', p: 0.5 }}>
                      <CardContent>
                        <DashboardIcon sx={{ color: 'text.secondary', mb: 1, fontSize: 32 }} />
                        <Typography variant="subtitle1" fontWeight={600}>
                          Em branco
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Comece do zero e escolha sua própria fonte de dados.
                        </Typography>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
                {DASHBOARD_TEMPLATES.map((template) => (
                  <Grid item xs={12} sm={6} key={template.id}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardActionArea onClick={() => chooseTemplate(template)} sx={{ height: '100%', p: 0.5 }}>
                        <CardContent>
                          <DashboardIcon sx={{ color: 'primary.main', mb: 1, fontSize: 32 }} />
                          <Typography variant="subtitle1" fontWeight={600}>
                            {template.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {template.description}
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
                {customTemplates.map((template) => (
                  <Grid item xs={12} sm={6} key={template.id}>
                    <Card variant="outlined" sx={{ height: '100%', position: 'relative' }}>
                      <CardActionArea onClick={() => chooseCustomTemplate(template)} sx={{ height: '100%', p: 0.5 }}>
                        <CardContent>
                          <DashboardIcon sx={{ color: 'primary.main', mb: 1, fontSize: 32 }} />
                          <Typography variant="subtitle1" fontWeight={600}>
                            {template.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            {template.description}
                          </Typography>
                          <Chip label="Da equipe" size="small" />
                        </CardContent>
                      </CardActionArea>
                      {canEdit && (
                        <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                          <Tooltip title="Remover template">
                            <IconButton size="small" onClick={(e) => handleRemoveCustomTemplate(template.id, e)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setNewDialogOpen(false)}>Cancelar</Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton size="small" onClick={() => setNewDialogStep('gallery')}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
              Novo Dashboard
            </DialogTitle>
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
          </>
        )}
      </Dialog>
    </Box>
  )
}
