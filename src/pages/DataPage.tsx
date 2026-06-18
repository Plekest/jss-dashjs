import { useRef, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import StorageIcon from '@mui/icons-material/Storage'
import CloudDownloadIcon from '@mui/icons-material/CloudDownload'
import { useDatasetsStore } from '../stores/datasetsStore'
import { parseFile } from '../lib/parseFile'
import { ImportBigQueryDialog } from '../components/ImportBigQueryDialog'

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatRows(n: number) {
  return n.toLocaleString('pt-BR')
}

export function DataPage() {
  const { datasets, loading, createDataset, removeDataset, refresh } = useDatasetsStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bqDialogOpen, setBqDialogOpen] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const parsed = await parseFile(file)
      await createDataset({
        name: file.name.replace(/\.[^.]+$/, ''),
        sourceType: parsed.sourceType,
        columns: parsed.columns,
        data: parsed.data,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover dataset "${name}"?`)) return
    await removeDataset(id)
    await refresh()
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 600 }}>
          Data
        </Typography>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.json,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <Button
          variant="outlined"
          startIcon={<CloudDownloadIcon />}
          onClick={() => setBqDialogOpen(true)}
          sx={{ mr: 1 }}
        >
          Importar do BigQuery
        </Button>
        <Button
          variant="contained"
          startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadFileIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Enviando…' : 'Enviar arquivo'}
        </Button>
      </Box>

      <ImportBigQueryDialog open={bqDialogOpen} onClose={() => setBqDialogOpen(false)} />

      {error && (
        <Box sx={{ mb: 2, p: 1.5, bgcolor: '#fce8e6', borderRadius: 1 }}>
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        </Box>
      )}

      {loading && !datasets.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
          <CircularProgress />
        </Box>
      ) : datasets.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 10,
            gap: 2,
            color: 'text.secondary',
          }}
        >
          <StorageIcon sx={{ fontSize: 72, opacity: 0.2 }} />
          <Typography variant="h6" color="text.secondary">
            Nenhuma base de dados ainda
          </Typography>
          <Typography variant="body2" color="text.disabled" textAlign="center" maxWidth={360}>
            Envie um arquivo CSV, Excel, JSON ou TSV. Ele ficará disponível em Planilhas e Dashboards.
          </Typography>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
          >
            Enviar primeiro arquivo
          </Button>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
                <TableCell>NOME</TableCell>
                <TableCell>TIPO</TableCell>
                <TableCell align="right">LINHAS</TableCell>
                <TableCell>ATUALIZADO</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {datasets.map((ds) => (
                <TableRow
                  key={ds.id}
                  hover
                  sx={{ '&:last-child td': { border: 0 } }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {ds.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box
                      component="span"
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                        fontSize: 11,
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                      }}
                    >
                      {ds.sourceType}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="text.secondary">
                      {formatRows(ds.rowCount)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(ds.updatedAt)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Remover dataset">
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(ds.id, ds.name)}
                        sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}
