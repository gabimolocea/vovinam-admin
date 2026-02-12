import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AppBar,
  Box,
  Button,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import CloseIcon from '@mui/icons-material/Close'

const SharedNavBar = () => {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const navigate = useNavigate()

  const handleMenuOpen = () => {
    setDrawerOpen(true)
  }

  const handleMenuClose = () => {
    setDrawerOpen(false)
  }

  const handleNavigate = (path) => {
    navigate(path)
    handleMenuClose()
  }

  const handleLogout = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/auth/logout/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      })
      if (response.ok) {
        localStorage.removeItem('authToken')
        navigate('/')
      }
    } catch (error) {
      console.error('Logout error:', error)
      localStorage.removeItem('authToken')
      navigate('/')
    }
  }

  return (
    <AppBar position="static" elevation={0} sx={{ backgroundColor: '#f5f5f5', color: '#000' }}>
      <Toolbar>
        <Typography
          variant="h6"
          sx={{
            flexGrow: 1,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/dashboard')}
        >
          FRVV Club Management
        </Typography>

        {/* Desktop Navigation */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1 }}>
          <Button color="inherit" component={Link} to="/dashboard">
            Dashboard
          </Button>
          <Button color="inherit" component={Link} to="/competitions">
            Competitions
          </Button>
          <Button color="inherit" onClick={handleLogout}>
            Logout
          </Button>
        </Box>

        {/* Mobile Navigation */}
        <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
          <IconButton color="inherit" onClick={handleMenuOpen}>
            {drawerOpen ? <CloseIcon /> : <MenuIcon />}
          </IconButton>
          <Drawer anchor="top" open={drawerOpen} onClose={handleMenuClose}>
            <Box sx={{ width: '100%' }}>
              <List sx={{ pt: 2 }}>
                <ListItem disablePadding>
                  <ListItemButton
                    component={Link}
                    to="/dashboard"
                    onClick={handleMenuClose}
                  >
                    <ListItemText primary="Dashboard" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton
                    component={Link}
                    to="/competitions"
                    onClick={handleMenuClose}
                  >
                    <ListItemText primary="Competitions" />
                  </ListItemButton>
                </ListItem>
                <Divider />
                <ListItem disablePadding>
                  <ListItemButton onClick={handleLogout}>
                    <ListItemText primary="Logout" />
                  </ListItemButton>
                </ListItem>
              </List>
            </Box>
          </Drawer>
        </Box>
      </Toolbar>
    </AppBar>
  )
}

export default SharedNavBar
