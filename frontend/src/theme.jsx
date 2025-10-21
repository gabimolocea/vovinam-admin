import { createTheme } from '@mui/material/styles';
import tokens from './styles/tokens';
import overrides from './styles/theme-overrides';

const baseTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0d47a1',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: tokens.colors.neutral[100],
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: ['BeVietnam', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'].join(','),
    h1: { fontWeight: 700 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
});

const theme = createTheme({ ...baseTheme, ...overrides });

export default theme;
