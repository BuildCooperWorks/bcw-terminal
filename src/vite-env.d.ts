/// <reference types="vite/client" />

import type { TerminalApi } from './preload/types';

declare global {
  interface Window {
    bcwTerminal: TerminalApi;
  }
}
