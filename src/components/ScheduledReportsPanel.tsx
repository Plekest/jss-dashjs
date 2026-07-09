import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CloseIcon from '@mui/icons-material/Close'
import { scheduledReportsApi, type ScheduledReport, type ReportMetric, type Aggregation } from '../lib/api'

const AGGREGATIONS: { value: Aggregation; label: string }[] = [
  { value: 'sum', label: 'Soma' },
  { value: 'mean', label: 'Média' },
  { value: 'count', label: 'Contagem' },
  { value: 'max', label: 'Máximo' },
  { value: 'min', label: 'Mínimo' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function emptyMetric(): ReportMetric {
  return { label: '', column: '', aggregation: 'sum' }
}

export function ScheduledReportsPanel({
  open,
  onClose,
  dashboardId,
  columns,
  canEdit,
}: {
  open: boolean
  onClose: () => void
  dashboardId: string
  columns: { title: string }[]
  canEdit: boolean
}) {
  const [reports, setReports] = useState<ScheduledReport[]>([])
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [metrics, setMetrics] = useState<ReportMetric[]>([emptyMetric()])
  const [recipients, setRecipients] = useState('')
  const [cron, setCron] = useState('')

  async function load() {
    setLoading(true)
    try {
      setReports(await scheduledReportsApi.list(dashboardId))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dashboardId])

  function resetForm() {
    setName('')
    setMetrics([emptyMetric()])
    setRecipients('')
    setCron('')
    setError(null)
  }

  function updateMetric(index: number, patch: Partial<ReportMetric>) {
    setMetrics((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  async function handleCreate() {
    const recipientList = recipients.split(',').map((s) => s.trim()).filter(Boolean)
    const validMetrics = metrics.filter((m) => m.label.trim() && m.column)
    if (!name.trim() || !validMetrics.length || !recipientList.length || !cron.trim()) return
    setSaving(true)
    setError(null)
    try {
      await scheduledReportsApi.create({
        dashboardId,
        name: name.trim(),
        metrics: validMetrics,
        recipients: recipientList,
        cron: cron.trim(),
      })
      resetForm()
      setFormOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, reportName: string) {
    if (!confirm(`Remover relatório agendado "${reportName}"?`)) return
    await scheduledReportsApi.remove(id)
    await load()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
        <Box sx={{ flexGrow: 1 }}>Relatórios agendados</Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {canEdit && (
          <Box>
            {!formOpen ? (
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
                Novo agendamento
              </Button>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                <TextField size="small" label="Nome do relatório" value={name} onChange={(e) => setName(e.target.value)} fullWidth />

                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Métricas
                </Typography>
                {metrics.map((m, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      size="small"
                      placeholder="Rótulo"
                      value={m.label}
                      onChange={(e) => updateMetric(i, { label: e.target.value })}
                      sx={{ flex: 1 }}
                    />
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <InputLabel>Coluna</InputLabel>
                      <Select label="Coluna" value={m.column} onChange={(e) => updateMetric(i, { column: e.target.value })}>
                        {columns.map((c) => (
                          <MenuItem key={c.title} value={c.title}>{c.title}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <InputLabel>Agregação</InputLabel>
                      <Select
                        label="Agregação"
                        value={m.aggregation}
                        onChange={(e) => updateMetric(i, { aggregation: e.target.value as Aggregation })}
                      >
                        {AGGREGATIONS.map((a) => (
                          <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <IconButton
                      size="small"
                      disabled={metrics.length === 1}
                      onClick={() => setMetrics((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Button size="small" startIcon={<AddIcon />} onClick={() => setMetrics((prev) => [...prev, emptyMetric()])} sx={{ alignSelf: 'flex-start' }}>
                  Adicionar métrica
                </Button>

                <TextField
                  size="small"
                  label="Destinatários (emails separados por vírgula)"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  fullWidth
                />

                <TextField
                  size="small"
                  label="Expressão cron"
                  placeholder="0 8 * * 1"
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  fullWidth
                />

                {error && (
                  <Typography variant="caption" color="error">
                    {error}
                  </Typography>
                )}

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => { setFormOpen(false); resetForm() }}>Cancelar</Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleCreate}
                    disabled={saving}
                    startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
                  >
                    Criar agendamento
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : reports.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            Nenhum relatório agendado ainda.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {reports.map((r) => (
              <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600}>{r.name}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {r.cron} · próximo envio: {formatDate(r.nextRunAt)}
                  </Typography>
                  {r.lastRunError && (
                    <Typography variant="caption" color="error" display="block">
                      Erro: {r.lastRunError}
                    </Typography>
                  )}
                </Box>
                {canEdit && (
                  <Tooltip title="Remover">
                    <IconButton size="small" onClick={() => handleDelete(r.id, r.name)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  )
}
