import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  CircularProgress,
  Dialog,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import StorageIcon from '@mui/icons-material/Storage'
import CableIcon from '@mui/icons-material/Cable'
import { dashboardsApi, datasetsApi, connectionsApi } from '../lib/api'

interface Props {
  open: boolean
  onClose: () => void
}

type ResultType = 'dashboard' | 'dataset' | 'connection'

interface Result {
  type: ResultType
  id: string
  label: string
  sublabel?: string
  searchText: string
}

const GROUP_LABELS: Record<ResultType, string> = {
  dashboard: 'Dashboards',
  dataset: 'Datasets',
  connection: 'Conexões',
}

const GROUP_ICONS: Record<ResultType, ReactNode> = {
  dashboard: <DashboardIcon fontSize="small" />,
  dataset: <StorageIcon fontSize="small" />,
  connection: <CableIcon fontSize="small" />,
}

const GROUP_ORDER: ResultType[] = ['dashboard', 'dataset', 'connection']

function rank(item: Result, q: string) {
  const name = item.label.toLowerCase()
  if (name.startsWith(q)) return 0
  if (name.includes(q)) return 1
  return 2
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Result[]>([])
  const [highlighted, setHighlighted] = useState(0)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHighlighted(0)
    setLoading(true)
    Promise.all([dashboardsApi.list(), datasetsApi.list(), connectionsApi.list()])
      .then(([dashboards, datasets, connections]) => {
        const results: Result[] = [
          ...dashboards.map((d) => ({
            type: 'dashboard' as const,
            id: d.id,
            label: d.name,
            searchText: d.name.toLowerCase(),
          })),
          ...datasets.map((d) => ({
            type: 'dataset' as const,
            id: d.id,
            label: d.name,
            sublabel: d.sourceType,
            searchText: `${d.name} ${d.sourceType}`.toLowerCase(),
          })),
          ...connections.map((c) => ({
            type: 'connection' as const,
            id: c.id,
            label: c.name,
            sublabel: String(c.config.projectId ?? c.config.database ?? ''),
            searchText: `${c.name} ${c.type} ${c.config.projectId ?? ''} ${c.config.clientEmail ?? ''} ${c.config.host ?? ''} ${c.config.database ?? ''}`.toLowerCase(),
          })),
        ]
        setItems(results)
      })
      .finally(() => setLoading(false))
  }, [open])

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.searchText.includes(q)).sort((a, b) => rank(a, q) - rank(b, q))
  }, [items, query])

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((type) => ({ type, results: sorted.filter((item) => item.type === type) })).filter(
        (g) => g.results.length > 0,
      ),
    [sorted],
  )

  const flatVisible = useMemo(() => groups.flatMap((g) => g.results), [groups])
  const clampedHighlighted = Math.min(highlighted, Math.max(flatVisible.length - 1, 0))

  function handleSelect(item: Result) {
    onClose()
    if (item.type === 'dashboard') navigate(`/dashboards/${item.id}`)
    else if (item.type === 'dataset') navigate(`/data?select=${item.id}`)
    else navigate(`/connections?select=${item.id}`)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, flatVisible.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flatVisible[clampedHighlighted]
      if (item) handleSelect(item)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box sx={{ p: 1 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Buscar dashboards, datasets, conexões…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlighted(0)
          }}
          onKeyDown={handleKeyDown}
          variant="standard"
          inputProps={{ 'data-command-palette-input': 'true' }}
          InputProps={{ disableUnderline: true, sx: { fontSize: 18, px: 1, py: 1 } }}
        />
      </Box>
      <Box sx={{ borderTop: 1, borderColor: 'divider', maxHeight: 420, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : flatVisible.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            Nenhum resultado
          </Typography>
        ) : (
          <List dense disablePadding>
            {groups.map((group) => (
              <Box key={group.type}>
                <Typography
                  variant="caption"
                  sx={{
                    px: 2,
                    pt: 1.5,
                    pb: 0.5,
                    display: 'block',
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  {GROUP_LABELS[group.type]}
                </Typography>
                {group.results.map((item) => {
                  const idx = flatVisible.indexOf(item)
                  return (
                    <ListItemButton
                      key={`${item.type}-${item.id}`}
                      selected={idx === clampedHighlighted}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setHighlighted(idx)}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>{GROUP_ICONS[item.type]}</ListItemIcon>
                      <ListItemText primary={item.label} secondary={item.sublabel} />
                    </ListItemButton>
                  )
                })}
              </Box>
            ))}
          </List>
        )}
      </Box>
    </Dialog>
  )
}
