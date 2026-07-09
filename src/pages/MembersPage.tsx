import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import { membersApi, type Invite, type Member, type Role } from '../lib/api'
import { useAuth } from '../stores/authStore'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

export function MembersPage() {
  const { role: myRole, user } = useAuth()
  const isOwner = myRole === 'owner'

  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('editor')
  const [inviting, setInviting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [membersList, invitesList] = await Promise.all([
        membersApi.list(),
        isOwner ? membersApi.listInvites() : Promise.resolve([]),
      ])
      setMembers(membersList)
      setInvites(invitesList)
    } finally {
      setLoading(false)
    }
  }, [isOwner])

  useEffect(() => {
    load()
  }, [load])

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setError(null)
    try {
      await membersApi.invite(inviteEmail.trim(), inviteRole)
      setInviteEmail('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar convite')
    } finally {
      setInviting(false)
    }
  }

  async function handleRevokeInvite(id: string) {
    await membersApi.revokeInvite(id)
    await load()
  }

  async function handleRoleChange(userId: string, role: Role) {
    setError(null)
    try {
      await membersApi.updateRole(userId, role)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao trocar papel')
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remover ${name} do time?`)) return
    setError(null)
    try {
      await membersApi.remove(userId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover membro')
    }
  }

  if (loading && !members.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Membros
      </Typography>

      {error && (
        <Box sx={{ mb: 2, p: 1.5, bgcolor: '#fce8e6', borderRadius: 1 }}>
          <Typography variant="body2" color="error">{error}</Typography>
        </Box>
      )}

      {isOwner && (
        <Box sx={{ display: 'flex', gap: 1, mb: 3, maxWidth: 640 }}>
          <TextField
            label="E-mail para convidar"
            size="small"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            sx={{ flexGrow: 1, minWidth: 0 }}
          />
          <Select
            size="small"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            sx={{ minWidth: 140, flexShrink: 0 }}
          >
            <MenuItem value="owner">Owner</MenuItem>
            <MenuItem value="editor">Editor</MenuItem>
            <MenuItem value="viewer">Viewer</MenuItem>
          </Select>
          <Button
            variant="contained"
            startIcon={inviting ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Convidar
          </Button>
        </Box>
      )}

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase' }}>
        Time
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 4 }}>
        {members.map((m) => (
          <Box
            key={m.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 1.5,
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
            }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {m.name} {m.id === user?.id && <Typography component="span" variant="caption" color="text.secondary">(você)</Typography>}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {m.email}
              </Typography>
            </Box>
            <Select
              size="small"
              value={m.role}
              disabled={!isOwner}
              onChange={(e) => handleRoleChange(m.id, e.target.value as Role)}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="owner">Owner</MenuItem>
              <MenuItem value="editor">Editor</MenuItem>
              <MenuItem value="viewer">Viewer</MenuItem>
            </Select>
            {isOwner && (
              <Tooltip title="Remover">
                <IconButton size="small" onClick={() => handleRemove(m.id, m.name)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ))}
      </Box>

      {isOwner && (
        <>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase' }}>
            Convites pendentes
          </Typography>
          {invites.length === 0 ? (
            <Typography variant="body2" color="text.disabled">
              Nenhum convite pendente.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {invites.map((inv) => (
                <Box
                  key={inv.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    p: 1.5,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 2,
                  }}
                >
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {inv.email}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Expira em {formatDate(inv.expiresAt)}
                    </Typography>
                  </Box>
                  <Chip size="small" label={ROLE_LABEL[inv.role]} />
                  <Tooltip title="Revogar convite">
                    <IconButton size="small" onClick={() => handleRevokeInvite(inv.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
