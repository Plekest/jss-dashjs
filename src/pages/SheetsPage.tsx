import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import StorageIcon from '@mui/icons-material/Storage'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import { JssMount } from '../components/JssMount'
import { useDatasetsStore } from '../stores/datasetsStore'
import { hasProLicense } from '../lib/license'
import type { DatasetWorksheet } from '../lib/api'

export function SheetsPage() {
  const navigate = useNavigate()
  const { datasets, activeDataset, activeDatasetId, setActiveDataset, updateDataset, loading } =
    useDatasetsStore()

  // Local pending state — only flushed to DB on explicit Save.
  // Simple mode uses pendingData; pro mode uses pendingWorksheets (all tabs).
  const [pendingData, setPendingData] = useState<(string | number)[][] | null>(null)
  const [pendingWorksheets, setPendingWorksheets] = useState<DatasetWorksheet[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isDirty = hasProLicense ? pendingWorksheets !== null : pendingData !== null

  async function handleSelectDataset(id: string) {
    setPendingData(null)
    setPendingWorksheets(null)
    setSaved(false)
    await setActiveDataset(id)
  }

  const handleDataChange = useCallback((data: (string | number)[][]) => {
    setPendingData(data)
    setSaved(false)
  }, [])

  const handleWorksheetsChange = useCallback((sheets: DatasetWorksheet[]) => {
    setPendingWorksheets(sheets)
    setSaved(false)
  }, [])

  async function handleSave() {
    if (!activeDataset) return
    setSaving(true)
    try {
      if (hasProLicense) {
        if (pendingWorksheets === null) return
        const first = pendingWorksheets[0]
        await updateDataset(activeDataset.id, {
          columns: first?.columns ?? activeDataset.columns,
          data: first?.data ?? [],
          meta: { worksheets: pendingWorksheets },
        })
        setPendingWorksheets(null)
      } else {
        if (pendingData === null) return
        await updateDataset(activeDataset.id, {
          columns: activeDataset.columns,
          data: pendingData,
        })
        setPendingData(null)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const displayData = pendingData ?? activeDataset?.data ?? []

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar */}
      <Box
        sx={{
          width: 260,
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          bgcolor: 'background.default',
        }}
      >
        <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1, fontWeight: 600, color: 'text.secondary' }}>
            DATASETS
          </Typography>
          {loading && <CircularProgress size={14} />}
        </Box>
        <Divider />
        <List dense sx={{ flexGrow: 1, overflow: 'auto', py: 0 }}>
          {!loading && datasets.length === 0 && (
            <Typography variant="caption" sx={{ p: 2, color: 'text.disabled', display: 'block' }}>
              Nenhum dataset. Envie arquivos na seção Data.
            </Typography>
          )}
          {datasets.map((ds) => (
            <ListItem key={ds.id} disablePadding>
              <ListItemButton
                selected={activeDatasetId === ds.id}
                onClick={() => handleSelectDataset(ds.id)}
                sx={{
                  borderLeft: '3px solid',
                  borderLeftColor: 'transparent',
                  '&.Mui-selected': {
                    borderLeftColor: 'primary.main',
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    '&:hover': { bgcolor: 'background.paper' },
                  },
                }}
              >
                <ListItemText
                  primary={ds.name}
                  primaryTypographyProps={{ noWrap: true, fontSize: 13 }}
                  secondary={`${ds.rowCount.toLocaleString('pt-BR')} linhas`}
                  secondaryTypographyProps={{ fontSize: 11 }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Divider />
        <Box sx={{ p: 1 }}>
          <Button
            fullWidth
            size="small"
            variant="outlined"
            startIcon={<StorageIcon />}
            onClick={() => navigate('/data')}
          >
            Gerenciar dados
          </Button>
        </Box>
      </Box>

      {/* Main area */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Save toolbar */}
        {activeDataset && (
          <Box
            sx={{
              px: 2,
              py: 0.75,
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              bgcolor: 'background.paper',
              flexShrink: 0,
            }}
          >
            <Typography variant="subtitle2" sx={{ flexGrow: 1, color: 'text.secondary' }}>
              {activeDataset.name}
            </Typography>

            {isDirty && (
              <Typography variant="caption" sx={{ color: 'warning.main' }}>
                Alterações não salvas
              </Typography>
            )}
            {saved && !isDirty && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main' }}>
                <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption">Salvo</Typography>
              </Box>
            )}

            <Tooltip title={!isDirty ? 'Sem alterações pendentes' : ''}>
              <span>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
              </span>
            </Tooltip>
          </Box>
        )}

        {/* Content */}
        {!activeDataset ? (
          <Box
            sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              color: 'text.secondary',
            }}
          >
            <StorageIcon sx={{ fontSize: 64, opacity: 0.3 }} />
            <Typography variant="h6" color="text.secondary">
              Selecione um dataset
            </Typography>
            <Button variant="contained" startIcon={<StorageIcon />} onClick={() => navigate('/data')}>
              Ir para Data
            </Button>
          </Box>
        ) : (
          <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'hidden', position: 'relative', p: 0 }}>
            {hasProLicense ? (
              <JssMount
                key={activeDataset.id}
                worksheets={pendingWorksheets ?? activeDataset.meta?.worksheets}
                data={activeDataset.data}
                columns={activeDataset.columns}
                onWorksheetsChange={handleWorksheetsChange}
              />
            ) : (
              <JssMount
                key={activeDataset.id}
                data={displayData}
                columns={activeDataset.columns}
                onDataChange={handleDataChange}
              />
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}
