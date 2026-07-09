import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import CloudDownloadIcon from '@mui/icons-material/CloudDownload'
import StorageIcon from '@mui/icons-material/Storage'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { connectionsApi, type ConnectionMeta } from '../lib/api'
import { parseFile, type ParsedFile } from '../lib/parseFile'
import { useDatasetsStore } from '../stores/datasetsStore'

interface Props {
  open: boolean
  onClose: () => void
}

type Kind = 'bigquery' | 'postgres' | 'upload'
type CredMode = 'existing' | 'new'
type StepId = 'type' | 'upload-file' | 'credentials' | 'sql' | 'save'
type Preview = { columns: { title: string }[]; data: (string | number)[][] }

const REFRESH_OPTIONS = [
  { value: '', label: 'Nunca' },
  { value: 15, label: '15 min' },
  { value: 60, label: '1 hora' },
  { value: 360, label: '6 horas' },
  { value: 1440, label: '24 horas' },
]

export function AddDataSourceWizard({ open, onClose }: Props) {
  const { createDataset, refresh } = useDatasetsStore()

  const [step, setStep] = useState<StepId>('type')
  const [kind, setKind] = useState<Kind | null>(null)

  // Credentials step
  const [credMode, setCredMode] = useState<CredMode>('existing')
  const [connections, setConnections] = useState<ConnectionMeta[]>([])
  const [existingConnectionId, setExistingConnectionId] = useState('')
  const [connName, setConnName] = useState('')
  const [location, setLocation] = useState('')
  const [bqCredentials, setBqCredentials] = useState('')
  const [pgHost, setPgHost] = useState('')
  const [pgPort, setPgPort] = useState('5432')
  const [pgUser, setPgUser] = useState('')
  const [pgPassword, setPgPassword] = useState('')
  const [pgDatabase, setPgDatabase] = useState('')
  const [pgSsl, setPgSsl] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const jsonFileInputRef = useRef<HTMLInputElement>(null)

  // SQL step
  const [sql, setSql] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  // Upload step
  const uploadFileInputRef = useRef<HTMLInputElement>(null)
  const [uploadParsed, setUploadParsed] = useState<ParsedFile | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Save step
  const [datasetName, setDatasetName] = useState('')
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (step !== 'credentials' || !kind || kind === 'upload') return
    connectionsApi.list().then((list) => setConnections(list.filter((c) => c.type === kind)))
  }, [step, kind])

  function resetTest() {
    setTestStatus('idle')
    setTestError(null)
  }

  function resetAll() {
    setStep('type')
    setKind(null)
    setCredMode('existing')
    setExistingConnectionId('')
    setConnName('')
    setLocation('')
    setBqCredentials('')
    setPgHost('')
    setPgPort('5432')
    setPgUser('')
    setPgPassword('')
    setPgDatabase('')
    setPgSsl(false)
    resetTest()
    setSql('')
    setPreview(null)
    setPreviewError(null)
    setUploadParsed(null)
    setUploadError(null)
    setDatasetName('')
    setRefreshIntervalMinutes('')
    setSaveError(null)
  }

  function handleClose() {
    resetAll()
    onClose()
  }

  function handleSelectKind(k: Kind) {
    setKind(k)
    setStep(k === 'upload' ? 'upload-file' : 'credentials')
  }

  function newConnectionCredentials(): string | Record<string, unknown> {
    if (kind === 'bigquery') return bqCredentials
    return {
      host: pgHost.trim(),
      port: Number(pgPort) || 5432,
      user: pgUser.trim(),
      password: pgPassword,
      database: pgDatabase.trim(),
      ssl: pgSsl,
    }
  }

  const canTest =
    kind !== null &&
    kind !== 'upload' &&
    (credMode === 'existing'
      ? !!existingConnectionId
      : kind === 'bigquery'
        ? !!bqCredentials.trim()
        : !!pgHost.trim() && !!pgUser.trim() && !!pgDatabase.trim())

  async function handleTest() {
    if (!kind || kind === 'upload') return
    setTestStatus('testing')
    setTestError(null)
    try {
      const res =
        credMode === 'existing'
          ? await connectionsApi.test(existingConnectionId)
          : await connectionsApi.testAdhoc(kind, newConnectionCredentials(), kind === 'bigquery' ? location.trim() || undefined : undefined)
      if (res.ok) {
        setTestStatus('ok')
      } else {
        setTestStatus('error')
        setTestError(res.error ?? 'Falhou')
      }
    } catch (e) {
      setTestStatus('error')
      setTestError(e instanceof Error ? e.message : 'Erro ao testar')
    }
  }

  async function handlePreview() {
    if (!kind || kind === 'upload' || !sql.trim()) return
    setPreviewing(true)
    setPreviewError(null)
    setPreview(null)
    try {
      const result =
        credMode === 'existing'
          ? await connectionsApi.preview(existingConnectionId, sql)
          : await connectionsApi.previewAdhoc(kind, newConnectionCredentials(), sql, kind === 'bigquery' ? location.trim() || undefined : undefined)
      setPreview(result)
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Erro na query')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    try {
      const parsed = await parseFile(file)
      setUploadParsed(parsed)
      setDatasetName(file.name.replace(/\.[^.]+$/, ''))
      setStep('save')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao processar arquivo')
    } finally {
      e.target.value = ''
    }
  }

  function handleBqJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setBqCredentials(ev.target?.result as string)
      resetTest()
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleSave() {
    if (!kind || !datasetName.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      if (kind === 'upload') {
        if (!uploadParsed) return
        await createDataset({
          name: datasetName.trim(),
          sourceType: uploadParsed.sourceType,
          columns: uploadParsed.columns,
          data: uploadParsed.data,
        })
      } else if (credMode === 'existing') {
        await connectionsApi.ingest(existingConnectionId, sql, datasetName.trim(), refreshIntervalMinutes || null)
        await refresh()
      } else {
        const created = await connectionsApi.create({
          name: connName.trim() || datasetName.trim(),
          type: kind,
          credentials: newConnectionCredentials(),
          ...(kind === 'bigquery' && location.trim() ? { location: location.trim() } : {}),
        })
        try {
          await connectionsApi.ingest(created.id, sql, datasetName.trim(), refreshIntervalMinutes || null)
        } catch (err) {
          // Ingest failed after the connection was persisted — remove it so
          // cancelling/failing this step never leaves an orphaned connection.
          await connectionsApi.remove(created.id)
          throw err
        }
        await refresh()
      }
      handleClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const steps = kind === 'upload' ? ['Tipo', 'Arquivo', 'Salvar'] : ['Tipo', 'Credenciais', 'SQL', 'Salvar']
  const activeStepIndex =
    step === 'type' ? 0 : step === 'upload-file' ? 1 : step === 'credentials' ? 1 : step === 'sql' ? 2 : steps.length - 1

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>Nova fonte de dados</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <Stepper activeStep={activeStepIndex} sx={{ mb: 1 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {step === 'type' && (
          <Box sx={{ display: 'flex', gap: 2, py: 2 }}>
            {(
              [
                { kind: 'bigquery' as const, label: 'BigQuery', icon: <CloudDownloadIcon sx={{ fontSize: 32 }} /> },
                { kind: 'postgres' as const, label: 'Postgres', icon: <StorageIcon sx={{ fontSize: 32 }} /> },
                { kind: 'upload' as const, label: 'Upload de arquivo', icon: <UploadFileIcon sx={{ fontSize: 32 }} /> },
              ]
            ).map((opt) => (
              <Box
                key={opt.kind}
                onClick={() => handleSelectKind(opt.kind)}
                sx={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  py: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  cursor: 'pointer',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                }}
              >
                {opt.icon}
                <Typography variant="body2" fontWeight={600}>{opt.label}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {step === 'upload-file' && (
          <Box sx={{ py: 2 }}>
            <input
              ref={uploadFileInputRef}
              type="file"
              accept=".csv,.tsv,.json,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleUploadFile}
            />
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => uploadFileInputRef.current?.click()}>
              Escolher arquivo
            </Button>
            {uploadError && (
              <Typography variant="body2" color="error" sx={{ mt: 1 }}>{uploadError}</Typography>
            )}
          </Box>
        )}

        {step === 'credentials' && kind !== 'upload' && kind !== null && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip
                label="Conexão existente"
                color={credMode === 'existing' ? 'primary' : 'default'}
                onClick={() => { setCredMode('existing'); resetTest() }}
              />
              <Chip
                label="Nova conexão"
                color={credMode === 'new' ? 'primary' : 'default'}
                onClick={() => { setCredMode('new'); resetTest() }}
              />
            </Box>

            {credMode === 'existing' ? (
              <FormControl size="small" fullWidth>
                <InputLabel>Conexão</InputLabel>
                <Select
                  label="Conexão"
                  value={existingConnectionId}
                  onChange={(e) => { setExistingConnectionId(e.target.value); resetTest() }}
                >
                  {connections.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name} — {String(c.type === 'postgres' ? c.config.database : c.config.projectId)}
                    </MenuItem>
                  ))}
                </Select>
                {connections.length === 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    Nenhuma conexão {kind} cadastrada ainda — use "Nova conexão".
                  </Typography>
                )}
              </FormControl>
            ) : (
              <>
                <TextField
                  label="Nome da conexão"
                  value={connName}
                  onChange={(e) => setConnName(e.target.value)}
                  fullWidth
                  size="small"
                />
                {kind === 'bigquery' ? (
                  <>
                    <TextField
                      label="Location (opcional)"
                      placeholder="ex: US, EU, southamerica-east1"
                      value={location}
                      onChange={(e) => { setLocation(e.target.value); resetTest() }}
                      fullWidth
                      size="small"
                    />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                        Service Account JSON
                      </Typography>
                      <TextField
                        placeholder="Cole o conteúdo do JSON aqui…"
                        value={bqCredentials}
                        onChange={(e) => { setBqCredentials(e.target.value); resetTest() }}
                        multiline
                        rows={5}
                        fullWidth
                        size="small"
                        inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
                      />
                      <input ref={jsonFileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleBqJsonFile} />
                      <Button size="small" onClick={() => jsonFileInputRef.current?.click()} sx={{ mt: 0.5 }}>
                        Ou carregar arquivo .json
                      </Button>
                    </Box>
                  </>
                ) : (
                  <>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <TextField label="Host" value={pgHost} onChange={(e) => { setPgHost(e.target.value); resetTest() }} fullWidth size="small" />
                      <TextField label="Porta" value={pgPort} onChange={(e) => { setPgPort(e.target.value); resetTest() }} sx={{ width: 120 }} size="small" />
                    </Box>
                    <TextField label="Database" value={pgDatabase} onChange={(e) => { setPgDatabase(e.target.value); resetTest() }} fullWidth size="small" />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <TextField label="Usuário" value={pgUser} onChange={(e) => { setPgUser(e.target.value); resetTest() }} fullWidth size="small" />
                      <TextField label="Senha" type="password" value={pgPassword} onChange={(e) => { setPgPassword(e.target.value); resetTest() }} fullWidth size="small" />
                    </Box>
                    <FormControlLabel
                      control={<Checkbox checked={pgSsl} onChange={(e) => { setPgSsl(e.target.checked); resetTest() }} />}
                      label="Usar SSL"
                    />
                  </>
                )}
              </>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                variant="outlined"
                onClick={handleTest}
                disabled={!canTest || testStatus === 'testing'}
                startIcon={testStatus === 'testing' ? <CircularProgress size={14} /> : null}
              >
                {testStatus === 'testing' ? 'Testando…' : 'Testar'}
              </Button>
              {testStatus === 'ok' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main' }}>
                  <CheckCircleOutlineIcon fontSize="small" />
                  <Typography variant="body2">Conexão OK</Typography>
                </Box>
              )}
              {testStatus === 'error' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'error.main' }}>
                  <ErrorOutlineIcon fontSize="small" />
                  <Typography variant="body2">{testError}</Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}

        {step === 'sql' && kind !== 'upload' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="SQL"
              placeholder="SELECT * FROM tabela LIMIT 1000"
              value={sql}
              onChange={(e) => { setSql(e.target.value); setPreview(null) }}
              multiline
              rows={4}
              fullWidth
              size="small"
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
            />
            <Box>
              <Button
                variant="outlined"
                onClick={handlePreview}
                disabled={!sql.trim() || previewing}
                startIcon={previewing ? <CircularProgress size={14} /> : null}
              >
                {previewing ? 'Consultando…' : 'Pré-visualizar'}
              </Button>
            </Box>
            {previewError && (
              <Box sx={{ p: 1.5, bgcolor: '#fce8e6', borderRadius: 1 }}>
                <Typography variant="body2" color="error" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                  {previewError}
                </Typography>
              </Box>
            )}
            {preview && <PreviewTable preview={preview} />}
          </Box>
        )}

        {step === 'save' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {kind === 'upload' && uploadParsed && <PreviewTable preview={uploadParsed} />}
            {kind !== 'upload' && preview && <PreviewTable preview={preview} />}
            <TextField
              label="Nome do dataset"
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              fullWidth
              size="small"
            />
            {kind !== 'upload' && (
              <FormControl size="small" fullWidth>
                <InputLabel>Atualizar automaticamente</InputLabel>
                <Select
                  label="Atualizar automaticamente"
                  value={refreshIntervalMinutes}
                  onChange={(e) => setRefreshIntervalMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  {REFRESH_OPTIONS.map((opt) => (
                    <MenuItem key={opt.label} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {saveError && <Typography variant="body2" color="error">{saveError}</Typography>}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancelar</Button>
        {step === 'credentials' && (
          <Button onClick={() => setStep('type')}>Voltar</Button>
        )}
        {step === 'credentials' && (
          <Button variant="contained" onClick={() => setStep('sql')} disabled={testStatus !== 'ok'}>
            Avançar
          </Button>
        )}
        {step === 'sql' && (
          <Button onClick={() => setStep('credentials')}>Voltar</Button>
        )}
        {step === 'sql' && (
          <Button variant="contained" onClick={() => setStep('save')} disabled={!preview}>
            Avançar
          </Button>
        )}
        {step === 'upload-file' && (
          <Button onClick={() => setStep('type')}>Voltar</Button>
        )}
        {step === 'save' && (
          <Button onClick={() => setStep(kind === 'upload' ? 'upload-file' : 'sql')}>Voltar</Button>
        )}
        {step === 'save' && (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !datasetName.trim()}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

function PreviewTable({ preview }: { preview: Preview }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Pré-visualização — {preview.data.length} linha(s), {preview.columns.length} coluna(s)
      </Typography>
      <TableContainer sx={{ maxHeight: 240, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {preview.columns.map((col, i) => (
                <TableCell key={i} sx={{ fontWeight: 600, fontSize: 12 }}>{col.title}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {preview.data.slice(0, 50).map((row, ri) => (
              <TableRow key={ri}>
                {row.map((cell, ci) => (
                  <TableCell key={ci} sx={{ fontSize: 12, fontFamily: 'monospace' }}>
                    {String(cell)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
