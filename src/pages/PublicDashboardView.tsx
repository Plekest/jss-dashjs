import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Box, CircularProgress, Typography } from '@mui/material'
import { DashjsMount } from '../components/DashjsMount'
import { buildDataSource } from '../lib/buildDataSource'
import { licenseKey } from '../lib/license'
import { publicApi, type PublicDashboard } from '../lib/api'
import type { DashJsOptions, DashboardFull } from 'dashjs'

export function PublicDashboardView() {
  const { slug } = useParams<{ slug: string }>()
  const [dashboard, setDashboard] = useState<PublicDashboard | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    setNotFound(false)
    publicApi.get(slug)
      .then(setDashboard)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  const dataSource = useMemo(
    () => buildDataSource(dashboard?.dataset ?? null),
    [dashboard],
  )

  const options: DashJsOptions | null = useMemo(() => {
    if (!dashboard) return null
    return {
      dashboard: dashboard.definition as DashboardFull,
      dataSource,
      license: licenseKey,
      readOnly: true,
    }
  }, [dashboard, dataSource])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (notFound || !dashboard || !options) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Typography variant="h6">Dashboard não encontrado</Typography>
        <Typography variant="body2" color="text.secondary">
          O link pode estar incorreto ou o dashboard não está mais publicado.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100vh', isolation: 'isolate' }}>
      <DashjsMount options={options} style={{ height: '100%' }} />
    </Box>
  )
}
