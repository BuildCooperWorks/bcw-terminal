import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#101216',
      paper: '#171a20',
    },
    primary: {
      main: '#77d4c4',
    },
    secondary: {
      main: '#f0b86b',
    },
    text: {
      primary: '#edf1f5',
      secondary: '#aab4c0',
    },
  },
  typography: {
    fontFamily: 'Inter, "Segoe UI", sans-serif',
    h1: {
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: 0,
    },
    body2: {
      letterSpacing: 0,
    },
    button: {
      textTransform: 'none',
      letterSpacing: 0,
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
  },
});
