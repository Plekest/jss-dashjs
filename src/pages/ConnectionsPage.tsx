import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
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
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Tracks a select param mid-flight: setSelectedId and setSearchParams don't
  // land in the same commit (react-router dispatches its own re-render), so
  // the fallback-to-first-item check below must wait for selectedId to
  // actually catch up before running, or it clobbers the pending selection.
  const pendingSelectRef = useRef<string | null>(null)

  useEffect(() => {
    if (!connections.length) {
      setSelectedId(null)
      return
    }
    const selectParam = searchParams.get('select')
    if (selectParam && connections.some((c) => c.id === selectParam)) {
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
    if (!selectedId || !connections.some((c) => c.id === selectedId)) {
      setSelectedId(connections[0].id)
    }
  }, [connections, selectedId, searchParams, setSearchParams])

  const selected = connections.find((c) => c.id === selectedId) ?? null

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
    <Box sx={{ p: 3, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, flexShrink: 0 }}>
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
            {connections.map((conn) => {
              const active = conn.id === selectedId
              const status = testStatus[conn.id]
              const dotColor =
                status === 'ok' ? 'success.main' : status === 'error' ? 'error.main' : 'text.disabled'
              return (
                <Box
                  key={conn.id}
                  onClick={() => setSelectedId(conn.id)}
                  sx={{
                    px: 2,
                    py: 1.25,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderLeft: '3px solid',
                    borderLeftColor: active ? 'primary.main' : 'transparent',
                    bgcolor: active ? 'background.paper' : 'transparent',
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap fontWeight={active ? 600 : 500}>
                      {conn.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {conn.config.projectId ?? '—'}
                    </Typography>
                  </Box>
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
                  gridTemplateColumns: '160px 1fr',
                  rowGap: 1.25,
                  columnGap: 2,
                  mb: 3,
                  maxWidth: 520,
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  Tipo
                </Typography>
                <Typography variant="body2">{selected.type}</Typography>

                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  Projeto
                </Typography>
                <Typography variant="body2">{selected.config.projectId ?? '—'}</Typography>

                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  Conta de serviço
                </Typography>
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{selected.config.clientEmail ?? '—'}</Typography>

                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  Atualizado
                </Typography>
                <Typography variant="body2">{formatDate(selected.updatedAt)}</Typography>
              </Box>

              {testStatus[selected.id] === 'ok' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'success.main', mb: 2 }}>
                  <CheckCircleOutlineIcon fontSize="small" />
                  <Typography variant="body2">Conexão testada com sucesso</Typography>
                </Box>
              )}
              {testStatus[selected.id] === 'error' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'error.main', mb: 2 }}>
                  <ErrorOutlineIcon fontSize="small" />
                  <Typography variant="body2">{testErrors[selected.id] ?? 'Falhou'}</Typography>
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  onClick={() => handleTest(selected.id)}
                  disabled={testStatus[selected.id] === 'testing'}
                  startIcon={testStatus[selected.id] === 'testing' ? <CircularProgress size={14} /> : undefined}
                >
                  {testStatus[selected.id] === 'testing' ? 'Testando…' : 'Testar conexão'}
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
