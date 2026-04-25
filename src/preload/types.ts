export type AppLocale = 'ja' | 'en';
export type CommandConfigFileResult = {
  canceled: boolean;
  content?: string;
  path?: string;
};
export type WindowStateSnapshot = {
  alwaysOnTop: boolean;
};

export type TerminalApi = {
  createSession: () => Promise<TerminalSessionSnapshot>;
  loadCommandConfigFile: () => Promise<CommandConfigFileResult>;
  getWindowState: () => Promise<WindowStateSnapshot>;
  readClipboardText: () => Promise<string>;
  restartSession: (sessionId: string) => Promise<TerminalSessionSnapshot | null>;
  saveCommandConfigFile: (content: string, currentPath?: string) => Promise<CommandConfigFileResult>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  setLocale: (locale: AppLocale) => Promise<void>;
  sendData: (sessionId: string, data: string) => void;
  resize: (sessionId: string, cols: number, rows: number) => void;
  stop: (sessionId: string) => void;
  writeClipboardText: (text: string) => Promise<void>;
  onOutput: (callback: (event: TerminalOutputEvent) => void) => () => void;
  onCwdChange: (callback: (event: TerminalCwdEvent) => void) => () => void;
  onExit: (callback: (event: TerminalExitEvent) => void) => () => void;
};

export type TerminalSessionSnapshot = {
  id: string;
  title: string;
  cwd: string;
};

export type TerminalOutputEvent = {
  sessionId: string;
  output: string;
};

export type TerminalCwdEvent = {
  sessionId: string;
  cwd: string;
};

export type TerminalExitEvent = {
  sessionId: string;
  code: number | null;
};
