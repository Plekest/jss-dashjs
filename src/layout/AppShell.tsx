import { useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import StorageIcon from '@mui/icons-material/Storage'
import HomeIcon from '@mui/icons-material/Home'
import Brightness4Icon from '@mui/icons-material/Brightness4'
import Brightness7Icon from '@mui/icons-material/Brightness7'
import SearchIcon from '@mui/icons-material/Search'
import { useColorMode } from '../theme/colorMode'
import { CommandPalette } from '../components/CommandPalette'
import { useCommandPalette } from '../stores/commandPaletteStore'

const RAIL_WIDTH = 64

const navItems = [
  { label: 'Home', path: '/', icon: <HomeIcon /> },
  { label: 'Dados', path: '/data', icon: <StorageIcon /> },
  { label: 'Dashboards', path: '/dashboards', icon: <DashboardIcon /> },
]

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { mode, toggle } = useColorMode()
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const target = e.target as HTMLElement | null
        if (target?.closest('[data-command-palette-input]')) return
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar variant="dense">
          <Box
            onClick={() => navigate('/')}
            sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          >
            <AnalyticsIcon sx={{ mr: 1.5, color: 'primary.main' }} />
            <Typography variant="h6" noWrap sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              JSS Analytics
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            onClick={() => setPaletteOpen(true)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.5,
              width: 280,
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'action.hover',
              color: 'text.secondary',
              cursor: 'pointer',
              mr: 1.5,
              '&:hover': { borderColor: 'text.secondary', bgcolor: 'action.selected' },
            }}
          >
            <SearchIcon fontSize="small" />
            <Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>
              Buscar dashboards, datasets…
            </Typography>
            <Typography variant="caption">⌘K</Typography>
          </Box>
          <Tooltip title={mode === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}>
            <IconButton onClick={toggle} size="small">
              {mode === 'light' ? <Brightness4Icon fontSize="small" /> : <Brightness7Icon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: RAIL_WIDTH,
            boxSizing: 'border-box',
            top: '48px',
            height: 'calc(100% - 48px)',
            alignItems: 'center',
          },
        }}
      >
        <List sx={{ pt: 1.5, width: '100%' }}>
          {navItems.map((item) => {
            const active =
              item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
            return (
              <ListItem key={item.path} disablePadding sx={{ justifyContent: 'center', mb: 0.5 }}>
                <Tooltip title={item.label} placement="right">
                  <ListItemButton
                    selected={active}
                    onClick={() => navigate(item.path)}
                    sx={{
                      borderRadius: 2,
                      mx: 1,
                      minHeight: 44,
                      justifyContent: 'center',
                      '&.Mui-selected': {
                        bgcolor: 'rgba(189, 91, 61, 0.1)',
                        '& .MuiListItemIcon-root': { color: 'primary.main' },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
                  </ListItemButton>
                </Tooltip>
              </ListItem>
            )
          })}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          mt: '48px',
          height: 'calc(100vh - 48px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  )
}
