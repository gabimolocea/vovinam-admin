import tokens from './tokens';

const overrides = {
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: `${8}px ${16}px`,
        },
        containedPrimary: {
          backgroundColor: tokens.colors.primary,
          color: '#fff',
          '&:hover': {
            backgroundColor: tokens.colors.primaryLight,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '12px 16px',
        },
      },
    },
  },
};

export default overrides;
