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
  Typography,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import StorageIcon from '@mui/icons-material/Storage'
import CloudDownloadIcon from '@mui/icons-material/CloudDownload'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useDatasetsStore } from '../stores/datasetsStore'
import { parseFile } from '../lib/parseFile'
import { ImportSqlDialog } from '../components/ImportSqlDialog'
import { datasetsApi } from '../lib/api'

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
  const { datasets, loading, createDataset, removeDataset, refresh, setActiveDataset } = useDatasetsStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bqDialogOpen, setBqDialogOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [refreshingNow, setRefreshingNow] = useState(false)
  const [savingInterval, setSavingInterval] = useState(false)
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const parsed = await parseFile(file)
      await createDataset({
        name: file.name.replace(/\.[^.]+$/, ''),
        sourceType: parsed.sourceType,
        columns: parsed.columns,
        data: parsed.data,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

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
          Data
        </Typography>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.json,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <Button
          variant="outlined"
          startIcon={<CloudDownloadIcon />}
          onClick={() => setBqDialogOpen(true)}
          sx={{ mr: 1 }}
        >
          Importar via SQL
        </Button>
        <Button
          variant="contained"
          startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadFileIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Enviando…' : 'Enviar arquivo'}
        </Button>
      </Box>

      <ImportSqlDialog open={bqDialogOpen} onClose={() => setBqDialogOpen(false)} />

      {error && (
        <Box sx={{ mb: 2, p: 1.5, bgcolor: '#fce8e6', borderRadius: 1 }}>
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        </Box>
      )}

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
            Envie um arquivo CSV, Excel, JSON ou TSV. Ele ficará disponível em Planilhas e Dashboards.
          </Typography>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
          >
            Enviar primeiro arquivo
          </Button>
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

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<OpenInNewIcon />}
                  onClick={() => {
                    // SheetsPage reads the dataset to show from the store's
                    // activeDataset, not the URL — without this it lands on
                    // /sheets with whatever was active before (or nothing).
                    setActiveDataset(selected.id)
                    navigate('/sheets')
                  }}
                >
                  Abrir em Planilhas
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => handleDelete(selected.id, selected.name)}
                >
                  Remover
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
