import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'

interface Props {
  open: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

/** Central "leaving without saving?" prompt. Reused anywhere the host needs
 *  to guard in-app navigation away from an editor with unsaved changes —
 *  it does not cover real tab/window close, which the dashjs editor already
 *  guards via its own native beforeunload handler. */
export function UnsavedChangesDialog({ open, saving, onSave, onDiscard, onCancel }: Props) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Você tem alterações não salvas</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Se continuar sem salvar, as alterações feitas neste dashboard poderão ser perdidas.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onDiscard} disabled={saving} color="error">
          Descartar e sair
        </Button>
        <Button onClick={onSave} disabled={saving} variant="contained">
          {saving ? 'Salvando…' : 'Salvar e sair'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
