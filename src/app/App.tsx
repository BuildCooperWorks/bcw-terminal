import { CssBaseline, ThemeProvider } from '@mui/material';
import { TerminalPage } from '../features/terminal/components/TerminalPage';
import { theme } from './theme';

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <TerminalPage />
    </ThemeProvider>
  );
}
