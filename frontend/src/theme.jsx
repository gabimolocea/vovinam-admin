import { createTheme } from '@mui/material/styles';
import defaultTokens from './styles/tokens';
import { getThemeOverrides } from './styles/theme-overrides';

// Theme builder that uses backend configuration
export function buildTheme(serverTokens = {}) {
  console.log('🎨 Building theme with tokens:', serverTokens);
  const colors = {
    primary: serverTokens?.colors?.primary || defaultTokens.colors.primary,
    primaryLight: serverTokens?.colors?.primaryLight || defaultTokens.colors.primaryLight,
    primaryDark: serverTokens?.colors?.primaryDark || defaultTokens.colors.primaryDark,
    secondary: serverTokens?.colors?.secondary || defaultTokens.colors.secondary,
    neutral100: serverTokens?.colors?.neutral?.[100] || defaultTokens.colors.neutral[100],
    neutral0: serverTokens?.colors?.neutral?.[0] || '#ffffff',
    textPrimary: serverTokens?.colors?.text?.primary || '#212121',
    textSecondary: serverTokens?.colors?.text?.secondary || '#757575',
  };

  const typography = {
    fontFamily: serverTokens?.typography?.fontFamily || ['Inter', 'Arial', 'Helvetica', 'sans-serif'].join(','),
    fontSize: serverTokens?.typography?.fontSize?.base || 14,
    fontWeight: {
      normal: serverTokens?.typography?.fontWeight?.normal || 400,
      medium: serverTokens?.typography?.fontWeight?.medium || 500,
      bold: serverTokens?.typography?.fontWeight?.bold || 700,
    }
  };

  const layout = {
    borderRadius: serverTokens?.layout?.borderRadius || 8,
    spacing: serverTokens?.layout?.spacing || 8,
  };

  const components = {
    button: {
      borderRadius: serverTokens?.components?.button?.borderRadius || 8,
    },
    card: {
      elevation: serverTokens?.components?.card?.elevation || 2,
    },
    table: {
      rowHover: serverTokens?.components?.table?.rowHover || '#f5f5f5',
    }
  };

  const baseTheme = createTheme({
    palette: {
      mode: 'light',
      primary: { 
        main: colors.primary,
        light: colors.primaryLight,
        dark: colors.primaryDark,
      },
      secondary: { main: colors.secondary },
      background: { 
        default: colors.neutral100, 
        paper: colors.neutral0,
      },
      text: {
        primary: colors.textPrimary,
        secondary: colors.textSecondary,
      }
    },
    typography: {
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize,
      h1: { fontWeight: typography.fontWeight.normal },
      h2: { fontWeight: typography.fontWeight.normal },
      h3: { fontWeight: typography.fontWeight.normal },
      h4: { fontWeight: typography.fontWeight.normal },
      h5: { fontWeight: typography.fontWeight.normal },
      h6: { fontWeight: typography.fontWeight.normal },
      button: { 
        textTransform: 'none', 
        fontWeight: typography.fontWeight.normal,
      },
    },
    spacing: layout.spacing,
    shape: {
      borderRadius: layout.borderRadius,
    },
  });

  // Get dynamic overrides based on theme tokens
  const overrides = getThemeOverrides(serverTokens);
  
  const finalTheme = createTheme({ ...baseTheme, ...overrides });
  console.log('🎯 Final theme created with palette:', finalTheme.palette);
  return finalTheme;
}

// API function to fetch theme from backend
export async function fetchThemeFromBackend() {
  try {
    console.log('🎨 Fetching theme from backend...');
    const response = await fetch('http://127.0.0.1:8000/api/frontend-themes/active_tokens/');
    if (response.ok) {
      const tokens = await response.json();
      console.log('✅ Theme loaded successfully:', tokens);
      return tokens;
    } else {
      console.warn('❌ Failed to fetch theme - Response not OK:', response.status);
    }
  } catch (error) {
    console.warn('❌ Failed to fetch theme from backend, using defaults:', error);
  }
  return {};
}

// Create theme with backend integration
export async function createDynamicTheme() {
  const serverTokens = await fetchThemeFromBackend();
  return buildTheme(serverTokens);
}

// Default theme export (synchronous fallback)
export default buildTheme();
