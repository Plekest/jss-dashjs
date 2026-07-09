import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ShareIcon from '@mui/icons-material/Share'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import HistoryIcon from '@mui/icons-material/History'
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd'
import { DashjsMount } from '../components/DashjsMount'
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog'
import { VersionsPanel } from '../components/VersionsPanel'
import { useDatasetsStore } from '../stores/datasetsStore'
import { buildDataSource } from '../lib/buildDataSource'
import { loadDashboard, createEmptyDashboard } from '../lib/dashboardsStorage'
import { licenseKey } from '../lib/license'
import { dashboardsApi, dashboardTemplatesApi, datasetsApi, type Dataset } from '../lib/api'
import type { DashJsInstance, DashJsOptions, DashboardFull } from 'dashjs'
import { GA4_COMING_SOON } from '../connectors/ga4Connector'
import { useAuth } from '../stores/authStore'

export function DashboardEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { datasets } = useDatasetsStore()
  const { role } = useAuth()
  const isViewer = role === 'viewer'

  const [dashboard, setDashboard] = useState<DashboardFull | null>(null)
  // True until both dashboard + saved dataset (if any) have loaded.
  // DashjsMount is not rendered until this is false — ensures dashjs
  // calls listFields() only after activeDataset is already set.
  const [loading, setLoading] = useState(true)

  const [selectedSource, setSelectedSource] = useState<string>('none')
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(null)
  const [loadingDataset, setLoadingDataset] = useState(false)

  const [shareOpen, setShareOpen] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [shareInfo, setShareInfo] = useState<{ slug: string | null; published: boolean } | null>(null)
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Unsaved-changes guard for in-app navigation away from the editor (e.g.
  // the "Dashboards" back button). Real tab/window close is guarded
  // separately by dashjs's own beforeunload handler.
  const instanceRef = useRef<DashJsInstance | null>(null)
  const isDirtyRef = useRef(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [savingBeforeLeave, setSavingBeforeLeave] = useState(false)
  const pendingLeaveRef = useRef<(() => void) | null>(null)

  const stableOnReady = useCallback((instance: DashJsInstance) => {
    instanceRef.current = instance
  }, [])

  const stableOnDirtyChange = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty
  }, [])

  // Runs `action` immediately if there are no unsaved changes, otherwise
  // opens the confirm dialog and defers `action` until the user picks
  // Save or Discard.
  const attemptLeave = useCallback((action: () => void) => {
    if (!isDirtyRef.current) {
      action()
      return
    }
    pendingLeaveRef.current = action
    setLeaveDialogOpen(true)
  }, [])

  const handleDiscardAndLeave = useCallback(() => {
    // Flush the latest edits to the recovery draft before discarding, so
    // they're still there to restore next time this dashboard is opened.
    instanceRef.current?.flushDraft()
    setLeaveDialogOpen(false)
    pendingLeaveRef.current?.()
    pendingLeaveRef.current = null
  }, [])

  const handleSaveAndLeave = useCallback(async () => {
    setSavingBeforeLeave(true)
    try {
      await instanceRef.current?.save()
      if (instanceRef.current?.isDirty()) {
        // save() logs its own errors and never rethrows — a still-dirty
        // instance after awaiting it means onSave failed. Stay put.
        return
      }
      setLeaveDialogOpen(false)
      pendingLeaveRef.current?.()
      pendingLeaveRef.current = null
    } finally {
      setSavingBeforeLeave(false)
    }
  }, [])

  const handleCancelLeave = useCallback(() => {
    setLeaveDialogOpen(false)
    pendingLeaveRef.current = null
  }, [])

  // Bumped when the user switches datasets — forces a clean re-mount of
  // DashjsMount so dashjs re-runs loadFields() with the new dataSource.
  const [mountKey, setMountKey] = useState(0)

  // Load dashboard + its saved dataset in one shot before showing the editor
  useEffect(() => {
    if (!id) {
      setDashboard(createEmptyDashboard('Sem título'))
      setLoading(false)
      return
    }
    Promise.all([loadDashboard(id), dashboardsApi.get(id)])
      .then(([dash, row]) => {
        setDashboard(dash ?? createEmptyDashboard('Sem título'))
        setShareInfo({ slug: row.slug, published: row.published })
        if (row.datasetId) {
          return datasetsApi.get(row.datasetId).then((ds) => {
            setActiveDataset(ds)
            setSelectedSource(`dataset:${ds.id}`)
          })
        }
      })
      .catch(() => setDashboard(createEmptyDashboard('Sem título')))
      .finally(() => setLoading(false))
  }, [id])

  // dataSource reads from a ref so it stays stable (never re-mounts dashjs
  // on re-render) while always returning the latest dataset values.
  const activeDatasetRef = useRef<Dataset | null>(activeDataset)
  activeDatasetRef.current = activeDataset

  const dataSource = useMemo(
    () =>
      buildDataSource({
        get columns() {
          return activeDatasetRef.current?.columns ?? []
        },
        get data() {
          return activeDatasetRef.current?.data ?? []
        },
      }),
    // Intentionally empty: the getter always reads the ref; mountKey bump
    // is responsible for re-initialising dashjs when the dataset changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Stable refs so onSave always captures the latest id and selectedSource
  // without needing to re-mount the editor.
  const idRef = useRef(id)
  idRef.current = id
  const selectedSourceRef = useRef(selectedSource)
  selectedSourceRef.current = selectedSource

  const stableOnSave = useCallback(async (d: DashboardFull) => {
    if (!idRef.current) return
    const datasetId = selectedSourceRef.current.startsWith('dataset:')
      ? selectedSourceRef.current.replace('dataset:', '')
      : null
    await dashboardsApi.update(idRef.current, { definition: d, datasetId })
  }, [])

  // dashjs sends dashboard_id: 0 to mean "new" — this host assigns its own
  // ids via the API, so that field is ignored here; the definition itself
  // (pages/charts/filters/etc.) is what actually gets copied.
  const stableOnMakeCopy = useCallback(async (d: DashboardFull) => {
    const datasetId = selectedSourceRef.current.startsWith('dataset:')
      ? selectedSourceRef.current.replace('dataset:', '')
      : null
    const row = await dashboardsApi.create({ name: d.dashboard_name, definition: d, datasetId })
    navigate(`/dashboards/${row.id}`)
  }, [navigate])

  const options: DashJsOptions = useMemo(
    () => ({
      dashboard: dashboard ?? createEmptyDashboard('Sem título'),
      dataSource,
      onSave: stableOnSave,
      onMakeCopy: stableOnMakeCopy,
      // dashjs bundles its own formula-pro; pass the key so its engine is
      // licensed too. undefined = degraded mode, same as today.
      license: licenseKey,
      initialPanels: { data: true, properties: true },
      onDirtyChange: stableOnDirtyChange,
      readOnly: isViewer,
    }),
    // Re-create only when dashboard changes (e.g. on initial load).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dashboard, isViewer],
  )

  async function handleSourceChange(value: string) {
    setSelectedSource(value)
    if (value.startsWith('dataset:')) {
      const dsId = value.replace('dataset:', '')
      setLoadingDataset(true)
      try {
        const ds = await datasetsApi.get(dsId)
        // Update state AND ref before bumping mountKey so that when dashjs
        // mounts fresh it immediately reads the correct dataset via the getter.
        setActiveDataset(ds)
        activeDatasetRef.current = ds
        setMountKey((k) => k + 1)
      } finally {
        setLoadingDataset(false)
      }
    } else {
      setActiveDataset(null)
      activeDatasetRef.current = null
      setMountKey((k) => k + 1)
    }
  }

  async function handleTogglePublish() {
    if (!idRef.current) return
    setSharing(true)
    try {
      const updated = shareInfo?.published
        ? await dashboardsApi.unpublish(idRef.current)
        : await dashboardsApi.publish(idRef.current)
      setShareInfo({ slug: updated.slug, published: updated.published })
    } finally {
      setSharing(false)
    }
  }

  async function handleCopyLink() {
    if (!shareInfo?.slug) return
    await navigator.clipboard.writeText(`${window.location.origin}/view/${shareInfo.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleOpenSaveTemplate() {
    if (instanceRef.current?.isDirty()) {
      await instanceRef.current.save()
      if (instanceRef.current.isDirty()) return
    }
    setTemplateName(dashboard?.dashboard_name ?? '')
    setTemplateDescription('')
    setSaveTemplateOpen(true)
  }

  async function handleSaveTemplate() {
    if (!idRef.current || !templateName.trim()) return
    setSavingTemplate(true)
    try {
      await dashboardTemplatesApi.create(idRef.current, {
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
      })
      setSaveTemplateOpen(false)
    } finally {
      setSavingTemplate(false)
    }
  }

  if (loading || !dashboard) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <Box
        sx={{
          px: 2,
          py: 0.75,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={() => attemptLeave(() => navigate('/dashboards'))}
          sx={{ mr: 1 }}
        >
          Dashboards
        </Button>

        <Typography variant="subtitle2" sx={{ color: 'text.secondary', mr: 1 }}>
          Fonte de dados:
        </Typography>

        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Fonte</InputLabel>
          <Select
            label="Fonte"
            value={selectedSource}
            onChange={(e) => handleSourceChange(e.target.value)}
          >
            <MenuItem value="none">
              <em>Nenhuma</em>
            </MenuItem>
            {datasets.map((ds) => (
              <MenuItem key={ds.id} value={`dataset:${ds.id}`}>
                {ds.name}
                <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                  ({ds.rowCount.toLocaleString('pt-BR')} linhas)
                </Typography>
              </MenuItem>
            ))}
            <Tooltip title="Em breve — integração GA4 (fase 2)" placement="right">
              <span>
                <MenuItem value="ga4" disabled={GA4_COMING_SOON}>
                  Google Analytics
                  <Typography variant="caption" sx={{ ml: 1, color: 'warning.main' }}>
                    Em breve
                  </Typography>
                </MenuItem>
              </span>
            </Tooltip>
          </Select>
        </FormControl>

        {loadingDataset && <CircularProgress size={16} />}
        {activeDataset && !loadingDataset && (
          <Typography variant="caption" color="text.secondary">
            {activeDataset.columns.length} campos disponíveis
          </Typography>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {id && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<HistoryIcon />}
            onClick={() => setVersionsOpen(true)}
          >
            Versões
          </Button>
        )}

        {id && !isViewer && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<BookmarkAddIcon />}
            onClick={handleOpenSaveTemplate}
          >
            Salvar como template
          </Button>
        )}

        {id && !isViewer && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<ShareIcon />}
            onClick={() => setShareOpen(true)}
          >
            Compartilhar
          </Button>
        )}
      </Box>

      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Compartilhar dashboard</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={!!shareInfo?.published}
                onChange={handleTogglePublish}
                disabled={sharing}
              />
            }
            label={shareInfo?.published ? 'Publicado' : 'Não publicado'}
          />
          {shareInfo?.published && shareInfo.slug && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                fullWidth
                size="small"
                value={`${window.location.origin}/view/${shareInfo.slug}`}
                slotProps={{ input: { readOnly: true } }}
              />
              <Tooltip title={copied ? 'Copiado!' : 'Copiar link'}>
                <IconButton onClick={handleCopyLink}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={saveTemplateOpen} onClose={() => setSaveTemplateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Salvar como template</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            autoFocus
            fullWidth
            label="Nome do template"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Descrição (opcional)"
            value={templateDescription}
            onChange={(e) => setTemplateDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveTemplateOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleSaveTemplate}
            disabled={!templateName.trim() || savingTemplate}
            startIcon={savingTemplate ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      {id && (
        <VersionsPanel
          open={versionsOpen}
          onClose={() => setVersionsOpen(false)}
          dashboardId={id}
          canEdit={!isViewer}
        />
      )}

      <UnsavedChangesDialog
        open={leaveDialogOpen}
        saving={savingBeforeLeave}
        onSave={handleSaveAndLeave}
        onDiscard={handleDiscardAndLeave}
        onCancel={handleCancelLeave}
      />

      {/* dashjs editor — key = id + mountKey ensures a clean re-mount
          whenever the user switches the data source.
          isolation:isolate creates a stacking context so dashjs internal
          z-indices don't compete with MUI portals (e.g. the Fonte dropdown). */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden', isolation: 'isolate' }}>
        <DashjsMount
          key={`${id ?? 'new'}-${mountKey}`}
          options={options}
          style={{ height: '100%' }}
          onReady={stableOnReady}
        />
      </Box>
    </Box>
  )
}
