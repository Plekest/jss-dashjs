import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Card, CardActionArea, Chip, CircularProgress, Grid, IconButton, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DashboardIcon from '@mui/icons-material/Dashboard'
import CableIcon from '@mui/icons-material/Cable'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import type { DashboardChartRecord } from 'dashjs'
import { useDatasetsStore } from '../stores/datasetsStore'
import { AddDataSourceWizard } from '../components/AddDataSourceWizard'
import { MiniChart } from '../components/MiniChart'
import { dashboardsApi, connectionsApi, type DashboardMeta, type ConnectionMeta } from '../lib/api'

/** Count of items created within the last `days` days — powers the trend
 *  delta caption under each stat card ("+N essa semana"). */
function countCreatedSince(items: { createdAt: string }[], days: number) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return items.filter((item) => new Date(item.createdAt).getTime() >= cutoff).length
}

// Studio palette (theme.ts tokens) extended for categorical chart series —
// clay/sage stay first so they match the primary/secondary dots on the
// metric cards; the rest are earth-tone variants, never the library's
// default blue-heavy palette.
const CHART_PALETTE = ['#BD5B3D', '#6B8A6E', '#C9A05B', '#7C93A8', '#9C5B54', '#5C7A5E']

export function HomePage() {
  const navigate = useNavigate()
  const { datasets, loading: loadingDatasets } = useDatasetsStore()

  const [dashboards, setDashboards] = useState<DashboardMeta[]>([])
  const [loadingDashboards, setLoadingDashboards] = useState(true)
  const [connections, setConnections] = useState<ConnectionMeta[]>([])
  const [wizardOpen, setWizardOpen] = useState(false)

  useEffect(() => {
    dashboardsApi.list().then((rows) => {
      setDashboards(rows)
      setLoadingDashboards(false)
    })
  }, [])

  useEffect(() => {
    connectionsApi.list().then(setConnections)
  }, [])

  function togglePin(d: DashboardMeta, e: MouseEvent) {
    e.stopPropagation()
    const call = d.pinned ? dashboardsApi.unpin(d.id) : dashboardsApi.pin(d.id)
    call.then((updated) => setDashboards((prev) => prev.map((row) => (row.id === updated.id ? updated : row))))
  }

  const pinnedDashboards = useMemo(
    () => dashboards.filter((d) => d.pinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [dashboards],
  )
  const recentDashboards = useMemo(
    () => [...dashboards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
    [dashboards],
  )
  const datasetsWithErrors = useMemo(() => datasets.filter((d) => d.lastRefreshError), [datasets])

  const datasetsCreatedThisWeek = useMemo(() => countCreatedSince(datasets, 7), [datasets])
  const dashboardsCreatedThisWeek = useMemo(() => countCreatedSince(dashboards, 7), [dashboards])
  const connectionsCreatedThisWeek = useMemo(() => countCreatedSince(connections, 7), [connections])

  const sourceTypeCounts = useMemo(() => {
    const map = new Map<string, number>()
    datasets.forEach((d) => {
      const key = d.sourceType.toUpperCase()
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }))
  }, [datasets])

  const autoRefreshDatasets = useMemo(
    () => datasets.filter((d) => d.sourceType.toUpperCase() === 'BIGQUERY' || d.refreshIntervalMinutes != null),
    [datasets],
  )

  const refreshActivity = useMemo(() => {
    const now = new Date()
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))
      return { key: d.toDateString(), label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
    })
    const counts = new Map(buckets.map((b) => [b.key, 0]))
    autoRefreshDatasets.forEach((d) => {
      if (!d.lastRefreshedAt) return
      const key = new Date(d.lastRefreshedAt).toDateString()
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return buckets.map((b) => ({ label: b.label, value: counts.get(b.key) ?? 0 }))
  }, [autoRefreshDatasets])

  const datasetsChart: DashboardChartRecord = useMemo(
    () => ({
      dashboard_chart_id: 1,
      dashboard_page_id: 1,
      dashboard_chart_type: 'pie',
      dashboard_chart_config: {
        style: { shape: 'donut', donutWidth: 62 },
        labels: { showLegend: true, legendPosition: 'right', showValues: true, valueFormat: 'percent' },
        colors: { palette: CHART_PALETTE },
      },
      series: [{ name: 'Datasets', data: sourceTypeCounts }],
    }),
    [sourceTypeCounts],
  )

  const refreshActivityChart: DashboardChartRecord = useMemo(
    () => ({
      dashboard_chart_id: 2,
      dashboard_page_id: 1,
      dashboard_chart_type: 'line',
      dashboard_chart_config: {
        style: { gridLines: true, smooth: true },
        labels: { showLegend: false, showValues: true, valueFormat: 'number' },
        colors: { palette: [CHART_PALETTE[1]] },
      },
      series: [{ name: 'Atualizações', data: refreshActivity }],
    }),
    [refreshActivity],
  )

  const loading = loadingDashboards || loadingDatasets
  const isEmpty = !loading && datasets.length === 0 && dashboards.length === 0

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="overline" sx={{ letterSpacing: '0.12em', color: 'text.secondary', fontWeight: 600 }}>
          Visão geral
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.25 }}>
          Bem-vindo de volta
        </Typography>
      </Box>

      <AddDataSourceWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
          <CircularProgress />
        </Box>
      ) : isEmpty ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 1.5 }}>
          <Typography variant="h6" fontWeight={700}>
            Comece por aqui
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" maxWidth={360} sx={{ mb: 1 }}>
            Adicione uma fonte de dados ou crie um dashboard do zero — os dois caminhos levam ao mesmo lugar.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setWizardOpen(true)}>
              Nova fonte de dados
            </Button>
            <Button variant="outlined" startIcon={<DashboardIcon />} onClick={() => navigate('/dashboards?new=1')}>
              Novo dashboard
            </Button>
          </Box>
        </Box>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={4}>
              <Card sx={{ height: '100%' }}>
                <CardActionArea
                  onClick={() => navigate('/data')}
                  sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
                    <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: '.06em', color: 'text.secondary', fontWeight: 600 }}>
                      Datasets
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={700}>
                    {datasets.length}
                  </Typography>
                  {datasetsCreatedThisWeek > 0 && (
                    <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                      +{datasetsCreatedThisWeek} essa semana
                    </Typography>
                  )}
                </CardActionArea>
              </Card>
            </Grid>

            <Grid item xs={12} sm={4}>
              <Card sx={{ height: '100%' }}>
                <CardActionArea
                  onClick={() => navigate('/dashboards')}
                  sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'secondary.main', flexShrink: 0 }} />
                    <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: '.06em', color: 'text.secondary', fontWeight: 600 }}>
                      Dashboards
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={700}>
                    {dashboards.length}
                  </Typography>
                  {dashboardsCreatedThisWeek > 0 && (
                    <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                      +{dashboardsCreatedThisWeek} essa semana
                    </Typography>
                  )}
                </CardActionArea>
              </Card>
            </Grid>

            <Grid item xs={12} sm={4}>
              <Card sx={{ height: '100%' }}>
                <CardActionArea
                  onClick={() => navigate('/connections')}
                  sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CableIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: '.06em', color: 'text.secondary', fontWeight: 600 }}>
                      Conexões
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={700}>
                    {connections.length}
                  </Typography>
                  {connectionsCreatedThisWeek > 0 && (
                    <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                      +{connectionsCreatedThisWeek} essa semana
                    </Typography>
                  )}
                </CardActionArea>
              </Card>
            </Grid>
          </Grid>

          {(sourceTypeCounts.length > 0 || autoRefreshDatasets.length > 0) && (
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {sourceTypeCounts.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Card sx={{ p: 2.5 }}>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                      Datasets por tipo
                    </Typography>
                    <Box sx={{ height: 280 }}>
                      <MiniChart chart={datasetsChart} height={280} />
                    </Box>
                  </Card>
                </Grid>
              )}

              {autoRefreshDatasets.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Card sx={{ p: 2.5 }}>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                      Atualizações automáticas (7 dias)
                    </Typography>
                    <Box sx={{ height: 280 }}>
                      <MiniChart chart={refreshActivityChart} height={280} />
                    </Box>
                  </Card>
                </Grid>
              )}
            </Grid>
          )}

          {datasetsWithErrors.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ErrorOutlineIcon fontSize="small" color="error" />
                <Typography variant="subtitle1" fontWeight={600}>
                  Alertas de atualização
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {datasetsWithErrors.map((d) => (
                  <Box
                    key={d.id}
                    onClick={() => navigate(`/data?select=${d.id}`)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      cursor: 'pointer',
                      p: 1,
                      borderRadius: 1,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Typography variant="body2">{d.name}</Typography>
                    <Chip size="small" color="error" label={`Erro: ${d.lastRefreshError}`} />
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {pinnedDashboards.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Favoritos
              </Typography>
              <Grid container spacing={2}>
                {pinnedDashboards.map((d) => (
                  <Grid item xs={12} sm={6} md={4} lg={2} key={d.id}>
                    <DashboardCard dashboard={d} onOpen={() => navigate(`/dashboards/${d.id}`)} onTogglePin={togglePin} />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              Dashboards recentes
            </Typography>
            {dashboards.length > 0 && (
              <Button size="small" onClick={() => navigate('/dashboards')}>
                Ver todos
              </Button>
            )}
          </Box>

          {dashboards.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4, color: 'text.secondary' }}>
              <Typography variant="body2">Nenhum dashboard ainda</Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/dashboards?new=1')}>
                Novo dashboard
              </Button>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {recentDashboards.map((d) => (
                <Grid item xs={12} sm={6} md={4} lg={2} key={d.id}>
                  <DashboardCard dashboard={d} onOpen={() => navigate(`/dashboards/${d.id}`)} onTogglePin={togglePin} />
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}
    </Box>
  )
}

interface DashboardCardProps {
  dashboard: DashboardMeta
  onOpen: () => void
  onTogglePin: (d: DashboardMeta, e: MouseEvent) => void
}

function DashboardCard({ dashboard: d, onOpen, onTogglePin }: DashboardCardProps) {
  return (
    <Card
      sx={{
        position: 'relative',
        transition: 'box-shadow .15s ease, transform .15s ease',
        '&:hover': {
          boxShadow: '0 4px 8px rgba(0,0,0,0.06), 0 16px 32px -16px rgba(0,0,0,0.14)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardActionArea onClick={onOpen} sx={{ p: 2 }}>
        <DashboardIcon sx={{ color: 'primary.main', mb: 1, fontSize: 32 }} />
        <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ pr: 3 }}>
          {d.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Abrir editor
        </Typography>
      </CardActionArea>
      <Tooltip title={d.pinned ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}>
        <IconButton size="small" onClick={(e) => onTogglePin(d, e)} sx={{ position: 'absolute', top: 4, right: 4 }}>
          {d.pinned ? <StarIcon fontSize="small" color="warning" /> : <StarBorderIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Card>
  )
}
