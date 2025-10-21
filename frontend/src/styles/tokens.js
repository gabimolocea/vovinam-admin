// Design tokens used across the app
const tokens = {
  colors: {
    primary: '#0d47a1',
    primaryLight: '#5472d3',
    secondary: '#f50057',
    neutral: {
      100: '#f5f7fb',
      200: '#e9eef8',
      500: '#6b7280',
      700: '#374151',
    },
    success: '#2e7d32',
    danger: '#d32f2f',
  },
  spacing: (factor) => `${factor * 8}px`, // simple spacing scale (8px)
};

export default tokens;
