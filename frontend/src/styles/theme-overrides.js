import tokens from './tokens';

// Dynamic theme overrides function
export function getThemeOverrides(serverTokens = {}) {
  const colors = {
    primary: serverTokens?.colors?.primary || tokens.colors.primary,
    primaryLight: serverTokens?.colors?.primaryLight || tokens.colors.primaryLight,
    secondary: serverTokens?.colors?.secondary || tokens.colors.secondary,
    tableRowHover: serverTokens?.components?.table?.rowHover || '#f5f5f5',
  };

  const layout = {
    buttonBorderRadius: serverTokens?.components?.button?.borderRadius || 8,
    borderRadius: serverTokens?.layout?.borderRadius || 8,
    spacing: serverTokens?.layout?.spacing || 8,
  };

  const typography = {
    fontWeight: {
      normal: serverTokens?.typography?.fontWeight?.normal || 400,
    }
  };

  return {
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: layout.buttonBorderRadius,
            padding: `${layout.spacing}px ${layout.spacing * 2}px`,
            fontWeight: typography.fontWeight.normal,
          },
          containedPrimary: {
            backgroundColor: colors.primary,
            color: '#fff',
            '&:hover': {
              backgroundColor: colors.primaryLight,
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: layout.borderRadius,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            padding: '12px 16px',
            fontWeight: typography.fontWeight.normal,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: colors.tableRowHover,
            },
          },
        },
      },
      MuiTypography: {
        styleOverrides: {
          root: {
            fontWeight: typography.fontWeight.normal,
          },
          h1: { fontWeight: typography.fontWeight.normal },
          h2: { fontWeight: typography.fontWeight.normal },
          h3: { fontWeight: typography.fontWeight.normal },
          h4: { fontWeight: typography.fontWeight.normal },
          h5: { fontWeight: typography.fontWeight.normal },
          h6: { fontWeight: typography.fontWeight.normal },
          subtitle1: { fontWeight: typography.fontWeight.normal },
          subtitle2: { fontWeight: typography.fontWeight.normal },
          body1: { fontWeight: typography.fontWeight.normal },
          body2: { fontWeight: typography.fontWeight.normal },
          button: { fontWeight: typography.fontWeight.normal },
          caption: { fontWeight: typography.fontWeight.normal },
          overline: { fontWeight: typography.fontWeight.normal },
        },
      },
    },
  };
}

// Export default static overrides for fallback
export default getThemeOverrides();
