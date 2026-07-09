import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Box, Button, CircularProgress, Tooltip, Typography } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import { JssMount } from './JssMount'
import { datasetsApi, type Dataset, type DatasetWorksheet } from '../lib/api'
import { hasProLicense } from '../lib/license'

export interface SheetEditorPanelHandle {
  save: () => Promise<void>
}

interface Props {
  datasetId: string
  onDirtyChange: (dirty: boolean) => void
}

export const SheetEditorPanel = forwardRef<SheetEditorPanelHandle, Props>(function SheetEditorPanel(
  { datasetId, onDirtyChange },
  ref,
) {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingData, setPendingData] = useState<(string | number)[][] | null>(null)
  const [pendingWorksheets, setPendingWorksheets] = useState<DatasetWorksheet[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setLoading(true)
    datasetsApi.get(datasetId).then((ds) => {
      setDataset(ds)
      setLoading(false)
    })
  }, [datasetId])

  const isDirty = hasProLicense ? pendingWorksheets !== null : pendingData !== null

  function handleDataChange(data: (string | number)[][]) {
    setPendingData(data)
    setSaved(false)
    onDirtyChange(true)
  }

  function handleWorksheetsChange(sheets: DatasetWorksheet[]) {
    setPendingWorksheets(sheets)
    setSaved(false)
    onDirtyChange(true)
  }

  async function handleSave() {
    if (!dataset) return
    setSaving(true)
    try {
      let updated: Dataset
      if (hasProLicense) {
        if (pendingWorksheets === null) return
        const first = pendingWorksheets[0]
        updated = await datasetsApi.update(dataset.id, {
          columns: first?.columns ?? dataset.columns,
          data: first?.data ?? [],
          meta: { worksheets: pendingWorksheets },
        })
        setPendingWorksheets(null)
      } else {
        if (pendingData === null) return
        updated = await datasetsApi.update(dataset.id, {
          columns: dataset.columns,
          data: pendingData,
        })
        setPendingData(null)
      }
      setDataset(updated)
      setSaved(true)
      onDirtyChange(false)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({ save: handleSave }))

  const displayData = pendingData ?? dataset?.data ?? []

  if (loading || !dataset) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Box
        sx={{
          px: 2, py: 0.75, borderBottom: '1px solid', borderColor: 'divider',
          display: 'flex', alignItems: 'center', gap: 2, bgcolor: 'background.paper', flexShrink: 0,
        }}
      >
        <Box sx={{ flexGrow: 1 }} />
        {isDirty && (
          <Typography variant="caption" sx={{ color: 'warning.main' }}>Alterações não salvas</Typography>
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
              size="small" variant="contained"
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
              onClick={handleSave} disabled={!isDirty || saving}
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </span>
        </Tooltip>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
        {hasProLicense ? (
          <JssMount
            key={dataset.id}
            worksheets={pendingWorksheets ?? dataset.meta?.worksheets}
            data={dataset.data}
            columns={dataset.columns}
            onWorksheetsChange={handleWorksheetsChange}
          />
        ) : (
          <JssMount
            key={dataset.id}
            data={displayData}
            columns={dataset.columns}
            onDataChange={handleDataChange}
          />
        )}
      </Box>
    </Box>
  )
})
