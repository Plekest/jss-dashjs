import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Chip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CableIcon from '@mui/icons-material/Cable'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { connectionsApi, type ConnectionMeta } from '../lib/api'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ name: '', credentials: '', location: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [testStatus, setTestStatus] = useState<Record<string, 'testing' | 'ok' | 'error'>>({})
  const [testErrors, setTestErrors] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    try {
      setConnections(await connectionsApi.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar conexões')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleFileRead(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setForm((f) => ({ ...f, credentials: ev.target?.result as string }))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.credentials.trim()) {
      setSaveError('Nome e credenciais são obrigatórios')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await connectionsApi.create({
        name: form.name.trim(),
        type: 'bigquery',
        credentials: form.credentials,
        ...(form.location.trim() ? { location: form.location.trim() } : {}),
      })
      setDialogOpen(false)
      setForm({ name: '', credentials: '', location: '' })
      await load()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao criar conexão')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(id: string) {
    setTestStatus((s) => ({ ...s, [id]: 'testing' }))
    try {
      const res = await connectionsApi.test(id)
      if (res.ok) {
        setTestStatus((s) => ({ ...s, [id]: 'ok' }))
      } else {
        setTestStatus((s) => ({ ...s, [id]: 'error' }))
        setTestErrors((s) => ({ ...s, [id]: res.error ?? 'Falhou' }))
      }
    } catch (e) {
      setTestStatus((s) => ({ ...s, [id]: 'error' }))
      setTestErrors((s) => ({ ...s, [id]: e instanceof Error ? e.message : 'Erro' }))
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover conexão "${name}"?`)) return
    await connectionsApi.remove(id)
    await load()
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 600 }}>
          Conexões
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          Nova conexão
        </Button>
      </Box>

      {error && (
        <Box sx={{ mb: 2, p: 1.5, bgcolor: '#fce8e6', borderRadius: 1 }}>
          <Typography variant="body2" color="error">{error}</Typography>
        </Box>
      )}

      {loading && !connections.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
          <CircularProgress />
        </Box>
      ) : connections.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2, color: 'text.secondary' }}>
          <CableIcon sx={{ fontSize: 72, opacity: 0.2 }} />
          <Typography variant="h6" color="text.secondary">Nenhuma conexão ainda</Typography>
          <Typography variant="body2" color="text.disabled" textAlign="center" maxWidth={360}>
            Adicione uma conexão BigQuery usando um service account JSON para importar dados diretamente.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
            Adicionar conexão
          </Button>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
                <TableCell>NOME</TableCell>
                <TableCell>TIPO</TableCell>
                <TableCell>PROJETO</TableCell>
                <TableCell>CONTA DE SERVIÇO</TableCell>
                <TableCell>ATUALIZADO</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {connections.map((conn) => {
                const status = testStatus[conn.id]
                return (
                  <TableRow key={conn.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{conn.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: 'action.hover', fontSize: 11, fontFamily: 'monospace' }}>
                        {conn.type}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{conn.config.projectId ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{conn.config.clientEmail ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{formatDate(conn.updatedAt)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                        {status === 'ok' && (
                          <Tooltip title="Conexão OK">
                            <CheckCircleOutlineIcon fontSize="small" sx={{ color: 'success.main' }} />
                          </Tooltip>
                        )}
                        {status === 'error' && (
                          <Tooltip title={testErrors[conn.id] ?? 'Erro'}>
                            <ErrorOutlineIcon fontSize="small" sx={{ color: 'error.main' }} />
                          </Tooltip>
                        )}
                        <Chip
                          label={status === 'testing' ? 'Testando…' : 'Testar'}
                          size="small"
                          onClick={() => handleTest(conn.id)}
                          disabled={status === 'testing'}
                          variant="outlined"
                        />
                        <Tooltip title="Remover conexão">
                          <IconButton size="small" onClick={() => handleDelete(conn.id, conn.name)} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* New connection dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova conexão BigQuery</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Nome"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
            size="small"
          />
          <TextField
            label="Location (opcional)"
            placeholder="ex: US, EU, southamerica-east1"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            fullWidth
            size="small"
          />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Service Account JSON
            </Typography>
            <TextField
              placeholder="Cole o conteúdo do JSON aqui…"
              value={form.credentials}
              onChange={(e) => setForm((f) => ({ ...f, credentials: e.target.value }))}
              multiline
              rows={6}
              fullWidth
              size="small"
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
            />
            <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileRead} />
            <Button size="small" onClick={() => fileInputRef.current?.click()} sx={{ mt: 0.5 }}>
              Ou carregar arquivo .json
            </Button>
          </Box>
          {saveError && (
            <Typography variant="body2" color="error">{saveError}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            {saving ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
