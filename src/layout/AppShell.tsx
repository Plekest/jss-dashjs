import { useState } from 'react'
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
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import TableChartIcon from '@mui/icons-material/TableChart'
import DashboardIcon from '@mui/icons-material/Dashboard'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import StorageIcon from '@mui/icons-material/Storage'
import CableIcon from '@mui/icons-material/Cable'

const DRAWER_WIDTH = 220

const navItems = [
  { label: 'Data', path: '/data', icon: <StorageIcon /> },
  { label: 'Conexões', path: '/connections', icon: <CableIcon /> },
  { label: 'Planilhas', path: '/sheets', icon: <TableChartIcon /> },
  { label: 'Dashboards', path: '/dashboards', icon: <DashboardIcon /> },
]

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: '#1a73e8' }}
      >
        <Toolbar variant="dense">
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setDrawerOpen((o) => !o)}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <AnalyticsIcon sx={{ mr: 1 }} />
          <Typography variant="h6" noWrap sx={{ fontWeight: 600, letterSpacing: '-0.5px' }}>
            JSS Analytics
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="persistent"
        open={drawerOpen}
        sx={{
          width: drawerOpen ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          transition: 'width 0.2s',
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            top: '48px',
            height: 'calc(100% - 48px)',
          },
        }}
      >
        <List dense sx={{ pt: 1 }}>
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.path)
            return (
              <ListItem key={item.path} disablePadding>
                <Tooltip title={drawerOpen ? '' : item.label} placement="right">
                  <ListItemButton
                    selected={active}
                    onClick={() => navigate(item.path)}
                    sx={{
                      borderRadius: '0 24px 24px 0',
                      mx: 1,
                      '&.Mui-selected': {
                        bgcolor: '#e8f0fe',
                        color: '#1a73e8',
                        '& .MuiListItemIcon-root': { color: '#1a73e8' },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} />
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
