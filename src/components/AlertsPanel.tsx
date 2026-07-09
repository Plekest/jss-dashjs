import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
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
import { alertsApi, datasetsApi, type Alert, type AlertEvent, type Aggregation, type ThresholdOperator } from '../lib/api'

const AGGREGATIONS: { value: Aggregation; label: string }[] = [
  { value: 'sum', label: 'Soma' },
  { value: 'mean', label: 'Média' },
  { value: 'count', label: 'Contagem' },
  { value: 'max', label: 'Máximo' },
  { value: 'min', label: 'Mínimo' },
]

const OPERATORS: { value: ThresholdOperator; label: string }[] = [
  { value: 'gt', label: '> maior que' },
  { value: 'gte', label: '≥ maior ou igual' },
  { value: 'lt', label: '< menor que' },
  { value: 'lte', label: '≤ menor ou igual' },
  { value: 'eq', label: '= igual a' },
]

interface AlertStatus {
  hasOpenEvent: boolean
  loading: boolean
}

export function AlertsPanel({
  datasetId,
  canEdit,
}: {
  datasetId: string
  canEdit: boolean
}) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [columns, setColumns] = useState<{ title: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, AlertStatus>>({})
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [columnName, setColumnName] = useState('')
  const [aggregation, setAggregation] = useState<Aggregation>('sum')
  const [operator, setOperator] = useState<ThresholdOperator>('gt')
  const [threshold, setThreshold] = useState('')
  const [recipients, setRecipients] = useState('')
  const [renotify, setRenotify] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [rows, dataset] = await Promise.all([alertsApi.list(datasetId), datasetsApi.get(datasetId)])
      setAlerts(rows)
      setColumns(dataset.columns)
      const entries = await Promise.all(
        rows.map(async (a) => {
          const events = await alertsApi.listEvents(a.id)
          return [a.id, { hasOpenEvent: events.some((e: AlertEvent) => !e.resolvedAt), loading: false }] as const
        }),
      )
      setStatuses(Object.fromEntries(entries))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId])

  function resetForm() {
    setName('')
    setColumnName('')
    setAggregation('sum')
    setOperator('gt')
    setThreshold('')
    setRecipients('')
    setRenotify('')
  }

  async function handleCreate() {
    const parsedThreshold = Number(threshold)
    const recipientList = recipients.split(',').map((s) => s.trim()).filter(Boolean)
    if (!name.trim() || !columnName || Number.isNaN(parsedThreshold) || !recipientList.length) return
    setSaving(true)
    try {
      await alertsApi.create({
        datasetId,
        name: name.trim(),
        columnName,
        aggregation,
        operator,
        threshold: parsedThreshold,
        recipients: recipientList,
        renotifyAfterMinutes: renotify.trim() ? Number(renotify) : null,
      })
      resetForm()
      setFormOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, alertName: string) {
    if (!confirm(`Remover alerta "${alertName}"?`)) return
    await alertsApi.remove(id)
    await load()
  }

  if (loading && !alerts.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 640 }}>
      {canEdit && (
        <Box sx={{ mb: 2 }}>
          {!formOpen ? (
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
              Novo alerta
            </Button>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, border: 1, borderColor: 'divider', borderRadius: 2, mb: 2 }}>
              <TextField size="small" label="Nome do alerta" value={name} onChange={(e) => setName(e.target.value)} fullWidth />

              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Coluna</InputLabel>
                  <Select label="Coluna" value={columnName} onChange={(e) => setColumnName(e.target.value)}>
                    {columns.map((c) => (
                      <MenuItem key={c.title} value={c.title}>{c.title}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" fullWidth>
                  <InputLabel>Agregação</InputLabel>
                  <Select label="Agregação" value={aggregation} onChange={(e) => setAggregation(e.target.value as Aggregation)}>
                    {AGGREGATIONS.map((a) => (
                      <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Operador</InputLabel>
                  <Select label="Operador" value={operator} onChange={(e) => setOperator(e.target.value as ThresholdOperator)}>
                    {OPERATORS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField size="small" label="Limite" type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} fullWidth />
              </Box>

              <TextField
                size="small"
                label="Destinatários (emails separados por vírgula)"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                fullWidth
              />

              <TextField
                size="small"
                label="Reenviar a cada (minutos, opcional)"
                type="number"
                value={renotify}
                onChange={(e) => setRenotify(e.target.value)}
                fullWidth
              />

              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => { setFormOpen(false); resetForm() }}>Cancelar</Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleCreate}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                  Criar alerta
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      )}

      {alerts.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          Nenhum alerta configurado ainda.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {alerts.map((a) => {
            const status = statuses[a.id]
            const breaching = status?.hasOpenEvent
            const opLabel = OPERATORS.find((o) => o.value === a.operator)?.label ?? a.operator
            const aggLabel = AGGREGATIONS.find((g) => g.value === a.aggregation)?.label ?? a.aggregation
            return (
              <Box
                key={a.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}
              >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600}>{a.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {aggLabel}({a.columnName}) {opLabel} {a.threshold}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  color={breaching ? 'error' : 'success'}
                  label={breaching ? 'breach' : 'ok'}
                />
                {canEdit && (
                  <Tooltip title="Remover">
                    <IconButton size="small" onClick={() => handleDelete(a.id, a.name)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            )
          })}
        </Box>
      )}

      {alerts.some((a) => statuses[a.id]) && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
          Última verificação a cada 60s pelo servidor.
        </Typography>
      )}
    </Box>
  )
}
