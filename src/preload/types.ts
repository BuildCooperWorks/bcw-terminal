export type AppLocale = 'ja' | 'en';
export type CommandConfigFileResult = {
  canceled: boolean;
  content?: string;
  path?: string;
};

export type CommandVariableKind = 'text' | 'secret';
export type CommandVariableSnapshot = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  kind: CommandVariableKind;
  value?: string;
  hasValue: boolean;
  updatedAt: number;
};

export type CommandVariableInput = {
  id?: string;
  name: string;
  description?: string;
  enabled?: boolean;
  kind: CommandVariableKind;
  value?: string;
};

export type TerminalSequenceStep = {
  input: string;
  submit: boolean;
  waitFor?: string;
  delayMs?: number;
};
export type WindowStateSnapshot = {
  alwaysOnTop: boolean;
};

export type SmartAppControlState = {
  status: 'on' | 'eval' | 'off' | 'unknown';
  detail?: string;
};

export type AppUpdateState = {
  error?: string;
  progress?: number;
  supported: boolean;
  updateVersion?: string;
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'up-to-date'
    | 'error'
    | 'unsupported';
};

export type TerminalApi = {
  checkForAppUpdate: () => Promise<{ started: boolean; supported: boolean }>;
  createSession: () => Promise<TerminalSessionSnapshot>;
  deleteCommandVariable: (id: string) => Promise<{ deleted: boolean }>;
  executeCommand: (sessionId: string, command: string) => Promise<{ executed: boolean; missingVariables: string[] }>;
  runSequence: (
    sessionId: string,
    steps: TerminalSequenceStep[],
  ) => Promise<{
    executed: boolean;
    error?: string;
    missingVariables: string[];
    timedOutStepIndex: number | null;
  }>;
  getAppUpdateState: () => Promise<AppUpdateState>;
  listCommandVariables: () => Promise<CommandVariableSnapshot[]>;
  getSmartAppControlState: () => Promise<SmartAppControlState>;
  loadCommandConfigFile: () => Promise<CommandConfigFileResult>;
  getWindowState: () => Promise<WindowStateSnapshot>;
  readClipboardText: () => Promise<string>;
  saveCommandConfigFile: (content: string, currentPath?: string) => Promise<CommandConfigFileResult>;
  saveCommandVariable: (variable: CommandVariableInput) => Promise<CommandVariableSnapshot>;
  saveTerminalOutputFile: (content: string) => Promise<CommandConfigFileResult>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  setLocale: (locale: AppLocale) => Promise<void>;
  sendData: (sessionId: string, data: string) => void;
  resize: (sessionId: string, cols: number, rows: number) => void;
  stop: (sessionId: string) => void;
  writeClipboardText: (text: string) => Promise<void>;
  installDownloadedAppUpdate: () => Promise<{ started: boolean }>;
  onAppUpdateStatus: (callback: (event: AppUpdateState) => void) => () => void;
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
