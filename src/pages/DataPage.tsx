import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import StorageIcon from '@mui/icons-material/Storage'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useDatasetsStore } from '../stores/datasetsStore'
import { AddDataSourceWizard } from '../components/AddDataSourceWizard'
import { connectionsApi, datasetsApi, type ConnectionMeta } from '../lib/api'
import { useAuth } from '../stores/authStore'

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatRows(n: number) {
  return n.toLocaleString('pt-BR')
}

export function DataPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { datasets, loading, removeDataset, refresh, setActiveDataset } = useDatasetsStore()
  const { role } = useAuth()
  const canEdit = role !== 'viewer'
  const [wizardOpen, setWizardOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [refreshingNow, setRefreshingNow] = useState(false)
  const [savingInterval, setSavingInterval] = useState(false)
  const [connections, setConnections] = useState<ConnectionMeta[]>([])

  useEffect(() => {
    connectionsApi.list().then(setConnections)
  }, [])
  // Tracks a select param mid-flight: setSelectedId and setSearchParams don't
  // land in the same commit (react-router dispatches its own re-render), so
  // the fallback-to-first-item check below must wait for selectedId to
  // actually catch up before running, or it clobbers the pending selection.
  const pendingSelectRef = useRef<string | null>(null)

  useEffect(() => {
    if (!datasets.length) {
      setSelectedId(null)
      return
    }
    const selectParam = searchParams.get('select')
    if (selectParam && datasets.some((d) => d.id === selectParam)) {
      pendingSelectRef.current = selectParam
      setSelectedId(selectParam)
      setSearchParams(
        (params) => {
          params.delete('select')
          return params
        },
        { replace: true },
      )
      return
    }
    if (pendingSelectRef.current && pendingSelectRef.current !== selectedId) {
      return
    }
    pendingSelectRef.current = null
    if (!selectedId || !datasets.some((d) => d.id === selectedId)) {
      setSelectedId(datasets[0].id)
    }
  }, [datasets, selectedId, searchParams, setSearchParams])

  const selected = datasets.find((d) => d.id === selectedId) ?? null

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover dataset "${name}"?`)) return
    await removeDataset(id)
    await refresh()
  }

  async function handleRefreshNow(id: string) {
    setRefreshingNow(true)
    try {
      await datasetsApi.refreshNow(id)
      await refresh()
    } finally {
      setRefreshingNow(false)
    }
  }

  async function handleRefreshIntervalChange(id: string, minutes: number | null) {
    setSavingInterval(true)
    try {
      await datasetsApi.updateRefreshSchedule(id, minutes)
      await refresh()
    } finally {
      setSavingInterval(false)
    }
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, flexShrink: 0 }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 600 }}>
          Dados
        </Typography>
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setWizardOpen(true)}>
            Nova fonte de dados
          </Button>
        )}
      </Box>

      <AddDataSourceWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      {loading && !datasets.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
          <CircularProgress />
        </Box>
      ) : datasets.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 10,
            gap: 2,
            color: 'text.secondary',
          }}
        >
          <StorageIcon sx={{ fontSize: 72, opacity: 0.2 }} />
          <Typography variant="h6" color="text.secondary">
            Nenhuma base de dados ainda
          </Typography>
          <Typography variant="body2" color="text.disabled" textAlign="center" maxWidth={360}>
            Envie um arquivo CSV, Excel, JSON ou TSV, ou conecte um BigQuery/Postgres via SQL.
          </Typography>
          {canEdit && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setWizardOpen(true)}>
              Nova fonte de dados
            </Button>
          )}
        </Box>
      ) : (
        <Box
          sx={{
            flexGrow: 1,
            minHeight: 0,
            display: 'flex',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          {/* List */}
          <Box
            sx={{
              width: 260,
              flexShrink: 0,
              borderRight: '1px solid',
              borderColor: 'divider',
              overflow: 'auto',
              bgcolor: 'background.default',
            }}
          >
            {datasets.map((ds) => {
              const active = ds.id === selectedId
              return (
                <Box
                  key={ds.id}
                  onClick={() => setSelectedId(ds.id)}
                  sx={{
                    px: 2,
                    py: 1.25,
                    cursor: 'pointer',
                    borderLeft: '3px solid',
                    borderLeftColor: active ? 'primary.main' : 'transparent',
                    bgcolor: active ? 'background.paper' : 'transparent',
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  <Typography variant="body2" noWrap fontWeight={active ? 600 : 500}>
                    {ds.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                    {ds.sourceType}
                  </Typography>
                </Box>
              )
            })}
          </Box>

          {/* Detail */}
          {selected && (
            <Box sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: 'background.paper' }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                {selected.name}
              </Typography>

              <Tabs
                value={0}
                onChange={(_, value) => {
                  if (value !== 1) return
                  // Sheets doesn't take a dataset via URL — it reads
                  // activeDataset from the store, so this must run first.
                  setActiveDataset(selected.id)
                  navigate('/sheets')
                }}
                sx={{ mb: 2, minHeight: 36 }}
              >
                <Tab label="Overview" sx={{ minHeight: 36 }} />
                <Tab label="Planilha" sx={{ minHeight: 36 }} />
              </Tabs>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr',
                  rowGap: 1.25,
                  columnGap: 2,
                  mb: 3,
                  maxWidth: 480,
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  Tipo
                </Typography>
                <Typography variant="body2">{selected.sourceType.toUpperCase()}</Typography>

                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  Linhas
                </Typography>
                <Typography variant="body2">{formatRows(selected.rowCount)}</Typography>

                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  Atualizado
                </Typography>
                <Typography variant="body2">{formatDate(selected.updatedAt)}</Typography>
              </Box>

              {selected.connectionId && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Criado de:{' '}
                  <Box
                    component="span"
                    onClick={() => navigate(`/connections?select=${selected.connectionId}`)}
                    sx={{ color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                  >
                    Conexão {connections.find((c) => c.id === selected.connectionId)?.name ?? selected.connectionId}
                  </Box>
                </Typography>
              )}

              {selected.connectionId && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3, maxWidth: 480 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {selected.lastRefreshError ? (
                      <Chip size="small" color="error" label={`Erro: ${selected.lastRefreshError}`} />
                    ) : selected.lastRefreshedAt ? (
                      <Chip size="small" color="success" label={`Atualizado às ${formatDate(selected.lastRefreshedAt)}`} />
                    ) : (
                      <Chip size="small" label="Nunca atualizado automaticamente" />
                    )}
                    <Button
                      size="small"
                      startIcon={refreshingNow ? <CircularProgress size={14} /> : <RefreshIcon />}
                      onClick={() => handleRefreshNow(selected.id)}
                      disabled={refreshingNow}
                    >
                      Atualizar agora
                    </Button>
                  </Box>

                  <FormControl size="small" sx={{ maxWidth: 240 }}>
                    <InputLabel>Atualizar automaticamente</InputLabel>
                    <Select
                      label="Atualizar automaticamente"
                      value={selected.refreshIntervalMinutes ?? ''}
                      disabled={savingInterval}
                      onChange={(e) =>
                        handleRefreshIntervalChange(selected.id, e.target.value === '' ? null : Number(e.target.value))
                      }
                    >
                      <MenuItem value="">Nunca</MenuItem>
                      <MenuItem value={15}>15 min</MenuItem>
                      <MenuItem value={60}>1 hora</MenuItem>
                      <MenuItem value={360}>6 horas</MenuItem>
                      <MenuItem value={1440}>24 horas</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              )}

              {canEdit && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteOutlineIcon />}
                    onClick={() => handleDelete(selected.id, selected.name)}
                  >
                    Remover
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
