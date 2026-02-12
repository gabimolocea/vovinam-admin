import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1d4ed8' },
    secondary: { main: '#0ea5e9' },
    background: {
      default: '#f5f7fb',
      paper: '#ffffff',
    },
  },
  shape: { borderRadius: 10 },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
