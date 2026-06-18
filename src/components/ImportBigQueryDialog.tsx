import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  FormControl,
  InputLabel,
} from '@mui/material'
import { connectionsApi, type ConnectionMeta } from '../lib/api'
import { useDatasetsStore } from '../stores/datasetsStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function ImportBigQueryDialog({ open, onClose }: Props) {
  const navigate = useNavigate()
  const { refresh } = useDatasetsStore()

  const [connections, setConnections] = useState<ConnectionMeta[]>([])
  const [loadingConns, setLoadingConns] = useState(false)

  const [connectionId, setConnectionId] = useState('')
  const [sql, setSql] = useState('')
  const [datasetName, setDatasetName] = useState('bigquery_import')

  const [preview, setPreview] = useState<{ columns: { title: string }[]; data: (string | number)[][] } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoadingConns(true)
    connectionsApi.list()
      .then((list) => {
        setConnections(list.filter((c) => c.type === 'bigquery'))
      })
      .finally(() => setLoadingConns(false))
  }, [open])

  function handleClose() {
    setPreview(null)
    setPreviewError(null)
    setImportError(null)
    setSql('')
    setConnectionId('')
    setDatasetName('bigquery_import')
    onClose()
  }

  async function handlePreview() {
    if (!connectionId || !sql.trim()) return
    setPreviewing(true)
    setPreviewError(null)
    setPreview(null)
    try {
      const result = await connectionsApi.preview(connectionId, sql)
      setPreview(result)
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Erro na query')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleImport() {
    if (!connectionId || !sql.trim() || !datasetName.trim()) return
    setImporting(true)
    setImportError(null)
    try {
      await connectionsApi.ingest(connectionId, sql, datasetName.trim())
      await refresh()
      handleClose()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Erro ao importar')
    } finally {
      setImporting(false)
    }
  }

  const noBqConnections = !loadingConns && connections.length === 0

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>Importar do BigQuery</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {noBqConnections ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Nenhuma conexão BigQuery cadastrada.
            </Typography>
            <Button variant="outlined" onClick={() => { handleClose(); navigate('/connections') }}>
              Ir para Conexões
            </Button>
          </Box>
        ) : (
          <>
            <FormControl size="small" fullWidth>
              <InputLabel>Conexão</InputLabel>
              <Select
                value={connectionId}
                label="Conexão"
                onChange={(e) => setConnectionId(e.target.value)}
                disabled={loadingConns}
              >
                {connections.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name} — {c.config.projectId}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="SQL"
              placeholder="SELECT * FROM `projeto.dataset.tabela` LIMIT 1000"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              multiline
              rows={4}
              fullWidth
              size="small"
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
            />

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                onClick={handlePreview}
                disabled={!connectionId || !sql.trim() || previewing}
                startIcon={previewing ? <CircularProgress size={14} /> : null}
              >
                {previewing ? 'Consultando…' : 'Pré-visualizar'}
              </Button>
            </Box>

            {previewError && (
              <Box sx={{ p: 1.5, bgcolor: '#fce8e6', borderRadius: 1 }}>
                <Typography variant="body2" color="error" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                  {previewError}
                </Typography>
              </Box>
            )}

            {preview && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Pré-visualização — {preview.data.length} linha(s), {preview.columns.length} coluna(s)
                </Typography>
                <TableContainer sx={{ maxHeight: 240, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {preview.columns.map((col, i) => (
                          <TableCell key={i} sx={{ fontWeight: 600, fontSize: 12 }}>{col.title}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.data.map((row, ri) => (
                        <TableRow key={ri}>
                          {row.map((cell, ci) => (
                            <TableCell key={ci} sx={{ fontSize: 12, fontFamily: 'monospace' }}>
                              {String(cell)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <TextField
                  label="Nome do dataset"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ mt: 2 }}
                />
              </Box>
            )}

            {importError && (
              <Typography variant="body2" color="error">{importError}</Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancelar</Button>
        {!noBqConnections && preview && (
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={importing || !datasetName.trim()}
            startIcon={importing ? <CircularProgress size={14} color="inherit" /> : null}
          >
            {importing ? 'Importando…' : 'Importar'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
