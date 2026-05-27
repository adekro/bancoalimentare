import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Avatar,
  Stack,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import Sidebar from './Sidebar'
import { useAuth } from '@/hooks/useAuth'

const DRAWER_WIDTH = 240

export default function AppLayout() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { user } = useAuth()

  // Ricava il titolo della pagina dalla rotta corrente
  const pageTitle: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/utenti': 'Utenti',
    '/distribuzione': 'Distribuzione',
    '/magazzino': 'Magazzino',
    '/stampe': 'Stampe',
  }
  const title = pageTitle[location.pathname] ?? 'Gestionale Solidale'

  const handleDrawerToggle = () => setMobileOpen((prev) => !prev)
  const userName = user?.email?.split('@')[0] ?? 'Admin'

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      {/* AppBar visibile solo su mobile */}
      {isMobile && (
        <AppBar
          position="fixed"
          className="no-print"
          sx={{ zIndex: theme.zIndex.drawer + 1, bgcolor: '#ffffff', color: 'text.primary' }}
          elevation={0}
        >
          <Toolbar>
            <IconButton
              color="default"
              aria-label="apri menu"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap>
              {title}
            </Typography>
          </Toolbar>
        </AppBar>
      )}

      {/* Sidebar — permanente desktop, temporanea mobile */}
      {isMobile ? (
        <Drawer
          variant="temporary"
          className="no-print"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
            },
          }}
        >
          <Sidebar onClose={handleDrawerToggle} />
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          className="no-print"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
            },
          }}
          open
        >
          <Sidebar />
        </Drawer>
      )}

      {/* Contenuto principale */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          px: { xs: 2, sm: 3, md: 4 },
          pb: { xs: 3, sm: 4, md: 5 },
          mt: isMobile ? 8 : 0,
          backgroundColor: 'background.default',
          minHeight: '100vh',
        }}
      >
        {!isMobile && (
          <Box
            sx={{
              height: 74,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              borderBottom: '1px solid',
              borderColor: 'divider',
              mb: 3,
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <IconButton color="default" aria-label="notifiche">
                <NotificationsNoneOutlinedIcon />
              </IconButton>
              <IconButton color="default" aria-label="attivita recenti">
                <HistoryOutlinedIcon />
              </IconButton>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 1 }}>
                <Typography variant="body2" fontWeight={700}>{userName}</Typography>
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
                  {userName.slice(0, 1).toUpperCase()}
                </Avatar>
              </Stack>
            </Stack>
          </Box>
        )}

        <Box sx={{ maxWidth: 1240, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}
