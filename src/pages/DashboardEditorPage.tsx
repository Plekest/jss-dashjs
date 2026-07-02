import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { DashjsMount } from '../components/DashjsMount'
import { useDatasetsStore } from '../stores/datasetsStore'
import { buildDataSource } from '../lib/buildDataSource'
import { loadDashboard, createEmptyDashboard } from '../lib/dashboardsStorage'
import { licenseKey } from '../lib/license'
import { dashboardsApi, datasetsApi, type Dataset } from '../lib/api'
import type { DashJsOptions, DashboardFull } from 'dashjs'
import { GA4_COMING_SOON } from '../connectors/ga4Connector'

export function DashboardEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { datasets } = useDatasetsStore()

  const [dashboard, setDashboard] = useState<DashboardFull | null>(null)
  // True until both dashboard + saved dataset (if any) have loaded.
  // DashjsMount is not rendered until this is false — ensures dashjs
  // calls listFields() only after activeDataset is already set.
  const [loading, setLoading] = useState(true)

  const [selectedSource, setSelectedSource] = useState<string>('none')
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(null)
  const [loadingDataset, setLoadingDataset] = useState(false)

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

  const options: DashJsOptions = useMemo(
    () => ({
      dashboard: dashboard ?? createEmptyDashboard('Sem título'),
      dataSource,
      onSave: stableOnSave,
      // dashjs bundles its own formula-pro; pass the key so its engine is
      // licensed too. undefined = degraded mode, same as today.
      license: licenseKey,
    }),
    // Re-create only when dashboard changes (e.g. on initial load).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dashboard],
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
          onClick={() => navigate('/dashboards')}
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
      </Box>

      {/* dashjs editor — key = id + mountKey ensures a clean re-mount
          whenever the user switches the data source.
          isolation:isolate creates a stacking context so dashjs internal
          z-indices don't compete with MUI portals (e.g. the Fonte dropdown). */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden', isolation: 'isolate' }}>
        <DashjsMount
          key={`${id ?? 'new'}-${mountKey}`}
          options={options}
          style={{ height: '100%' }}
        />
      </Box>
    </Box>
  )
}
