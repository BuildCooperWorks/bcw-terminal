import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  type MenuItemConstructorOptions,
  type OpenDialogOptions,
  type SaveDialogOptions,
  shell,
} from 'electron';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { autoUpdater } from 'electron-updater';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const isDevMode = Boolean(process.env.VITE_DEV_SERVER_URL);

if (isDevMode) {
  // Avoid cache/session path contention between rapid dev restarts on Windows.
  const devSessionRoot = path.join(app.getPath('temp'), 'bcw-terminal-dev-session', String(process.pid));
  app.setPath('sessionData', devSessionRoot);
}

const TERMINAL_OUTPUT = 'terminal:output';
const TERMINAL_CWD = 'terminal:cwd';
const TERMINAL_EXIT = 'terminal:exit';
const TERMINAL_SAVE_OUTPUT_REQUEST = 'terminal:save-output-request';
const FILESYSTEM_DIRECTORY_UPDATE = 'filesystem:directory-update';
const APP_UPDATE_STATUS = 'app:update-status';
const execFileAsync = promisify(execFile);
const WSL_PATH_PREFIX = 'wsl:';
const REMOTE_PATH_PREFIX = 'remote:';
// Marker tokens used to fence the output of an injected `ls` so we can extract
// just the listing from the shared terminal buffer without showing it to the user.
const REMOTE_LIST_MARKER_BEGIN = '__BCW_LS_BEGIN__';
const REMOTE_LIST_MARKER_END = '__BCW_LS_END__';
const REMOTE_LIST_MARKER_ERROR = '__BCW_LS_ERR__';

type TerminalSession = {
  id: string;
  title: string;
  cwd: string;
  shell: pty.IPty | null;
  outputBuffer: string;
  autoChangedWslHome: boolean;
  // First `user@host` seen in this session — the local shell (Windows WSL).
  // A later prompt with a different host means we've jumped to a remote SSH host.
  localShellHost: string | null;
  // Set once a remote (SSH) prompt is detected. While set, the file explorer
  // lists directories by injecting a fenced `ls` into this session instead of
  // reading the local filesystem.
  remoteHost: string | null;
  // Serializes concurrent remote `ls` injections so their fenced outputs don't interleave.
  remoteListQueue: Promise<unknown>;
  // Trailing partial line held back from the renderer so we can drop whole lines
  // that contain our injected `ls` markers even when they span PTY chunks.
  pendingDisplayChunk: string;
  // True while output is between a begin and end marker — that whole region (the
  // injected `ls` output) is hidden from the terminal display.
  suppressingMarkerOutput: boolean;
};

type AppLocale = 'ja' | 'en';
type WindowStateSnapshot = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  alwaysOnTop: boolean;
  isMaximized: boolean;
};

type SmartAppControlState = {
  status: 'on' | 'eval' | 'off' | 'unknown';
  detail?: string;
};

type AdminPrivilegeState = {
  canRestartElevated: boolean;
  detail?: string;
  isAdmin: boolean;
};

type AppUpdateState = {
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

type CommandVariableKind = 'text' | 'secret';
type CommandVariableSnapshot = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  kind: CommandVariableKind;
  value?: string;
  hasValue: boolean;
  updatedAt: number;
};

type StoredCommandVariable = Omit<CommandVariableSnapshot, 'value' | 'hasValue'> & {
  encryptedValue?: string;
  value?: string;
};

type CommandVariableFile = {
  version: 1;
  variables: StoredCommandVariable[];
};

type TerminalSequenceStep = {
  input: string;
  submit: boolean;
  waitFor?: string;
  delayMs?: number;
};

type FileSystemEntry = {
  name: string;
  path: string;
  type: 'directory' | 'file';
};

const TEXT_FILE_EXTENSIONS = new Set([
  '.bat',
  '.cmd',
  '.conf',
  '.config',
  '.css',
  '.csv',
  '.env',
  '.gitignore',
  '.html',
  '.ini',
  '.js',
  '.json',
  '.jsx',
  '.log',
  '.md',
  '.mjs',
  '.ps1',
  '.py',
  '.sh',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

let mainWindow: BrowserWindow | null = null;
let sessionCounter = 0;
let appLocale: AppLocale = 'ja';
const sessions = new Map<string, TerminalSession>();
const sequenceWaiters = new Map<string, Set<() => void>>();
let terminalShutdownStarted = false;
const DEFAULT_WINDOW_STATE: WindowStateSnapshot = {
  width: 1240,
  height: 780,
  alwaysOnTop: false,
  isMaximized: false,
};
let appUpdateState: AppUpdateState = {
  supported: false,
  status: 'idle',
};

const MENU_TEXT = {
  en: {
    close: 'Close',
    docs: 'Project Page',
    file: 'File',
    forceReload: 'Force Reload',
    help: 'Help',
    reload: 'Reload',
    resetZoom: 'Reset Zoom',
    saveTerminalOutput: 'Save Terminal Output',
    toggleDevTools: 'Toggle Developer Tools',
    toggleFullScreen: 'Toggle Full Screen',
    view: 'View',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
  },
  ja: {
    saveTerminalOutput: 'ターミナル出力を保存',
    close: '閉じる',
    docs: 'プロジェクトページを開く',
    file: 'ファイル',
    forceReload: '強制再読み込み',
    help: 'ヘルプ',
    reload: '再読み込み',
    resetZoom: 'ズームをリセット',
    toggleDevTools: '開発者ツール',
    toggleFullScreen: '全画面表示',
    view: '表示',
    zoomIn: '拡大',
    zoomOut: '縮小',
  },
} as const;

function getDefaultStartupCwd() {
  // Reopen the last local directory if it still exists.
  const lastCwd = loadLastLocalCwd();
  if (lastCwd && fs.existsSync(lastCwd)) {
    return lastCwd;
  }

  if (process.platform === 'win32') {
    const home = app.getPath('home') || process.env.USERPROFILE;
    if (home && fs.existsSync(home)) {
      return home;
    }
  }

  return process.cwd();
}

function getAppIconPath() {
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(process.cwd(), 'public/app-icon.ico');
  }

  return path.join(__dirname, '../renderer/app-icon.ico');
}

function stripAnsi(value: string) {
  return value
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B[@-_]/g, '');
}

const REMOTE_MARKER_PREFIX = '__BCW_LS_';

// Hides the injected `ls` probe from the terminal display. Everything from the
// begin marker line through the end marker line (the probe command echo, its
// listing output, and the markers themselves) is dropped. Normal output is passed
// through, but a trailing partial line is held back when it could be the start of
// a marker so that markers split across PTY chunks are still caught.
function filterMarkerLines(session: TerminalSession, output: string) {
  const combined = session.pendingDisplayChunk + output;

  // Fast path: nothing marker-related anywhere and we're not mid-suppression.
  if (!session.suppressingMarkerOutput && !combined.includes(REMOTE_MARKER_PREFIX)) {
    const newlineIndex = combined.lastIndexOf('\n');
    const tail = combined.slice(newlineIndex + 1);
    if (tail.length > 0 && tail.length < REMOTE_MARKER_PREFIX.length && REMOTE_MARKER_PREFIX.startsWith(tail)) {
      session.pendingDisplayChunk = tail;
      return combined.slice(0, newlineIndex + 1);
    }
    session.pendingDisplayChunk = '';
    return combined;
  }

  // Process complete lines; hold back the final partial line for the next chunk.
  const newlineIndex = combined.lastIndexOf('\n');
  const complete = combined.slice(0, newlineIndex + 1);
  const tail = combined.slice(newlineIndex + 1);
  session.pendingDisplayChunk = tail;

  let result = '';
  for (const line of complete.split(/(?<=\n)/)) {
    const hasBegin = line.includes(`${REMOTE_LIST_MARKER_BEGIN}`);
    const hasEnd = line.includes(`${REMOTE_LIST_MARKER_END}`) || line.includes(REMOTE_LIST_MARKER_ERROR);

    if (session.suppressingMarkerOutput) {
      // Inside a suppressed region: drop the line; the end marker closes it.
      if (hasEnd) {
        session.suppressingMarkerOutput = false;
      }
      continue;
    }

    if (hasBegin) {
      // Begin marker opens suppression. The command-echo line carries both begin
      // and end; if this same line also has the end marker it stays closed.
      session.suppressingMarkerOutput = !hasEnd;
      continue;
    }

    if (line.includes(REMOTE_MARKER_PREFIX)) {
      // A stray marker fragment — drop it to be safe.
      continue;
    }

    result += line;
  }

  return result;
}

type DetectedPrompt = {
  // Display cwd derived from the prompt, or null when the prompt only shows a
  // basename (common on remote bracket prompts) and the real path is unknown.
  cwd: string | null;
  // Host portion of a `user@host` prompt, when present. Used to tell a remote
  // SSH shell apart from the local Windows/WSL shell.
  host: string | null;
};

function detectPromptCwd(output: string): DetectedPrompt | null {
  const tail = output.trimEnd();
  const powerShellMatch = tail.match(/(?:^|\n)PS\s+([^>\r\n]+)>\s*$/);
  if (powerShellMatch?.[1]) {
    return { cwd: powerShellMatch[1], host: null };
  }

  // Bracket prompt, e.g. "[root@dev-aws01 home]#". The path segment is usually a
  // basename (bash \W), so we only capture the host and resolve the real cwd later.
  const bracketMatch = tail.match(/(?:^|\n)\[[^\s@\]]+@([^\s\]]+)\s+[^\]]*\][#$]\s*$/);
  if (bracketMatch?.[1]) {
    return { cwd: null, host: bracketMatch[1] };
  }

  // Colon prompt, e.g. "user@host:/path$" (local WSL and many SSH shells).
  const colonMatch = tail.match(/(?:^|\n)[^\s@]+@([^:\s\r\n]+):([^\r\n]+?)[#$]\s*$/);
  if (colonMatch) {
    return { cwd: toWslDisplayPath(colonMatch[2]), host: colonMatch[1] };
  }

  return null;
}

function toWslDisplayPath(value: string) {
  const trimmed = value.trim();
  if (trimmed === '~' || trimmed.startsWith('~/')) {
    return `${WSL_PATH_PREFIX}${trimmed}`;
  }

  if (trimmed.startsWith('/')) {
    return `${WSL_PATH_PREFIX}${trimmed}`;
  }

  return null;
}

function fromWslDisplayPath(value: string) {
  return value.startsWith(WSL_PATH_PREFIX) ? value.slice(WSL_PATH_PREFIX.length) : value;
}

function isWslDisplayPath(value: string) {
  return value.startsWith(WSL_PATH_PREFIX);
}

function isMountedWindowsHomePath(value: string) {
  return /^wsl:\/mnt\/[a-z]\/Users\/[^/]+\/?$/i.test(value);
}

function isRemoteDisplayPath(value: string) {
  return value.startsWith(REMOTE_PATH_PREFIX);
}

// Remote display paths are "remote:<host>:<subpath>". An empty subpath means
// "the session's current directory" (resolved via `pwd`); otherwise it is an
// absolute path on the remote host.
function parseRemoteDisplayPath(value: string) {
  const rest = value.slice(REMOTE_PATH_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator === -1) {
    return { host: rest, subPath: '' };
  }
  return { host: rest.slice(0, separator), subPath: rest.slice(separator + 1) };
}

function joinRemoteDisplayPath(host: string, absolutePath: string, name: string) {
  const normalizedBase = absolutePath === '/' ? '' : absolutePath.replace(/\/+$/, '');
  return `${REMOTE_PATH_PREFIX}${host}:${normalizedBase}/${name}`;
}

function joinWslPath(basePath: string, name: string) {
  const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
  return `${WSL_PATH_PREFIX}${normalizedBase}/${name}`;
}

function normalizeWslCommandPath(value: string) {
  if (value === '~') {
    return process.env.USERNAME ? `/home/${process.env.USERNAME}` : value;
  }
  if (value.startsWith('~/')) {
    return process.env.USERNAME ? `/home/${process.env.USERNAME}/${value.slice(2)}` : value;
  }
  return value;
}

function sendToRenderer(channel: string, payload: unknown) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const { webContents } = mainWindow;
  if (webContents.isDestroyed() || webContents.isCrashed()) {
    return;
  }

  try {
    webContents.send(channel, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Render frame was disposed')) {
      return;
    }
    throw error;
  }
}

function setAppUpdateState(next: Partial<AppUpdateState>) {
  appUpdateState = {
    ...appUpdateState,
    ...next,
  };
  sendToRenderer(APP_UPDATE_STATUS, appUpdateState);
}

function getWindowStateFilePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function getCommandVariablesFilePath() {
  return path.join(app.getPath('userData'), 'command-variables.json');
}

function getLastCwdFilePath() {
  return path.join(app.getPath('userData'), 'last-cwd.json');
}

// Remembers the most recent local Windows directory so new sessions can reopen
// there. WSL and remote paths aren't valid spawn cwds, so they're never stored.
function loadLastLocalCwd(): string | null {
  const filePath = getLastCwdFilePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { cwd?: unknown };
    return typeof parsed.cwd === 'string' ? parsed.cwd : null;
  } catch {
    return null;
  }
}

function saveLastLocalCwd(cwd: string) {
  if (isWslDisplayPath(cwd) || isRemoteDisplayPath(cwd)) {
    return;
  }
  try {
    fs.writeFileSync(getLastCwdFilePath(), JSON.stringify({ cwd }, null, 2), 'utf8');
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}

function loadWindowState(): WindowStateSnapshot {
  const filePath = getWindowStateFilePath();
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_WINDOW_STATE };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<WindowStateSnapshot>;
    return {
      ...DEFAULT_WINDOW_STATE,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
}

function saveWindowState(window: BrowserWindow) {
  const bounds = window.getBounds();
  const nextState: WindowStateSnapshot = {
    width: bounds.width,
    height: bounds.height,
    alwaysOnTop: window.isAlwaysOnTop(),
    isMaximized: window.isMaximized(),
  };

  if (!window.isMaximized()) {
    nextState.x = bounds.x;
    nextState.y = bounds.y;
  }

  const filePath = getWindowStateFilePath();
  fs.writeFileSync(filePath, JSON.stringify(nextState, null, 2), 'utf8');
}

function isValidVariableName(name: string) {
  return /^[A-Z_][A-Z0-9_]*$/.test(name);
}

function normalizeVariableName(name: string) {
  return name.trim().replace(/[a-z]/g, (value) => value.toUpperCase());
}

function loadStoredCommandVariables(): StoredCommandVariable[] {
  const filePath = getCommandVariablesFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<CommandVariableFile>;
    if (!Array.isArray(parsed.variables)) {
      return [];
    }

    return parsed.variables.filter(
      (item): item is StoredCommandVariable =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        (item.kind === 'text' || item.kind === 'secret'),
    );
  } catch {
    return [];
  }
}

function saveStoredCommandVariables(variables: StoredCommandVariable[]) {
  const document: CommandVariableFile = {
    version: 1,
    variables,
  };
  fs.writeFileSync(getCommandVariablesFilePath(), JSON.stringify(document, null, 2), 'utf8');
}

function encryptVariableValue(value: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this device.');
  }
  return safeStorage.encryptString(value).toString('base64');
}

function decryptVariableValue(variable: StoredCommandVariable) {
  if (variable.kind === 'text') {
    return variable.value ?? '';
  }

  if (!variable.encryptedValue) {
    return '';
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this device.');
  }

  return safeStorage.decryptString(Buffer.from(variable.encryptedValue, 'base64'));
}

function toCommandVariableSnapshot(variable: StoredCommandVariable): CommandVariableSnapshot {
  return {
    id: variable.id,
    name: variable.name,
    description: variable.description ?? '',
    enabled: variable.enabled ?? true,
    kind: variable.kind,
    value: variable.kind === 'text' ? (variable.value ?? '') : undefined,
    hasValue: variable.kind === 'secret' ? Boolean(variable.encryptedValue) : Boolean(variable.value),
    updatedAt: variable.updatedAt ?? Date.now(),
  };
}

function resolveCommandVariables(command: string) {
  const variables = loadStoredCommandVariables().filter((variable) => variable.enabled !== false);
  const variableMap = new Map(variables.map((variable) => [variable.name, variable]));
  const missingNames = new Set<string>();

  const resolvedCommand = command.replace(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g, (match, variableName: string) => {
    const variable = variableMap.get(variableName);
    if (!variable) {
      missingNames.add(variableName);
      return match;
    }

    return decryptVariableValue(variable);
  });

  return {
    command: resolvedCommand,
    missingVariables: [...missingNames],
  };
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function closeTerminalSessions(timeoutMs = 1500) {
  if (terminalShutdownStarted) {
    return Promise.resolve();
  }

  terminalShutdownStarted = true;
  const closingSessions = [...sessions.values()].filter((session) => session.shell);
  if (closingSessions.length === 0) {
    sessions.clear();
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const pendingIds = new Set(closingSessions.map((session) => session.id));
    let resolved = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const finish = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      sessions.clear();
      resolve();
    };

    const timeoutTimer = setTimeout(finish, timeoutMs + 900);

    forceKillTimer = setTimeout(() => {
      for (const sessionId of pendingIds) {
        const session = sessions.get(sessionId);
        const shell = session?.shell;
        if (session) {
          session.shell = null;
        }
        try {
          shell?.kill();
        } catch {
          // Native PTY cleanup is best-effort during app shutdown.
        }
      }
      clearTimeout(timeoutTimer);
      finish();
    }, timeoutMs);

    for (const session of closingSessions) {
      const shell = session.shell;
      if (!shell) {
        pendingIds.delete(session.id);
        continue;
      }

      shell.onExit(() => {
        pendingIds.delete(session.id);
        const nextSession = sessions.get(session.id);
        if (nextSession) {
          nextSession.shell = null;
        }
        if (pendingIds.size === 0) {
          clearTimeout(timeoutTimer);
          finish();
        }
      });

      try {
        shell.write('exit\r');
      } catch {
        pendingIds.delete(session.id);
      }
    }

    if (pendingIds.size === 0) {
      clearTimeout(timeoutTimer);
      finish();
    }
  });
}

function notifySequenceWaiters(sessionId: string) {
  const waiters = sequenceWaiters.get(sessionId);
  if (!waiters) {
    return;
  }

  for (const waiter of waiters) {
    waiter();
  }
}

function waitForSessionOutput(session: TerminalSession, pattern: string, timeoutMs = 30_000) {
  if (!pattern.trim()) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    let timeoutId: NodeJS.Timeout | undefined;
    let intervalId: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
      sequenceWaiters.get(session.id)?.delete(check);
    };

    const check = () => {
      if (session.outputBuffer.toLowerCase().includes(pattern.toLowerCase())) {
        cleanup();
        resolve(true);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        cleanup();
        resolve(false);
      }
    };

    const waiters = sequenceWaiters.get(session.id) ?? new Set<() => void>();
    waiters.add(check);
    sequenceWaiters.set(session.id, waiters);

    timeoutId = setTimeout(check, timeoutMs);
    intervalId = setInterval(check, 250);
    check();
  });
}

async function runTerminalSequence(sessionId: string, steps: TerminalSequenceStep[]) {
  const session = sessions.get(sessionId);
  if (!session?.shell) {
    return {
      executed: false,
      error: 'Terminal session is not running.',
      missingVariables: [],
      timedOutStepIndex: null,
    };
  }

  for (const [index, step] of steps.entries()) {
    if (step.waitFor) {
      const matched = await waitForSessionOutput(session, step.waitFor);
      if (!matched) {
        return {
          executed: false,
          error: `Timed out waiting for "${step.waitFor}".`,
          missingVariables: [],
          timedOutStepIndex: index,
        };
      }
    }

    const resolved = resolveCommandVariables(step.input ?? '');
    if (resolved.missingVariables.length > 0) {
      return {
        executed: false,
        error: undefined,
        missingVariables: resolved.missingVariables,
        timedOutStepIndex: null,
      };
    }

    session.shell.write(step.submit === false ? resolved.command : `${resolved.command}\r`);

    if (step.delayMs && step.delayMs > 0) {
      await delay(Math.min(step.delayMs, 60_000));
    }
  }

  return {
    executed: true,
    error: undefined,
    missingVariables: [],
    timedOutStepIndex: null,
  };
}

function createWindow() {
  const savedState = loadWindowState();
  mainWindow = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    x: savedState.x,
    y: savedState.y,
    minWidth: 960,
    minHeight: 580,
    backgroundColor: '#101216',
    icon: getAppIconPath(),
    title: 'BcwTerminal',
    alwaysOnTop: savedState.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const persistWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    saveWindowState(mainWindow);
  };

  mainWindow.on('resize', persistWindowState);
  mainWindow.on('move', persistWindowState);
  mainWindow.on('close', persistWindowState);
  mainWindow.on('maximize', persistWindowState);
  mainWindow.on('unmaximize', persistWindowState);

  if (savedState.isMaximized) {
    mainWindow.maximize();
  }

  if (savedState.alwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] process gone: reason=${details.reason}, exitCode=${details.exitCode}`);
  });
}

function isAutoUpdateSupported() {
  return process.platform === 'win32' && !process.env.VITE_DEV_SERVER_URL;
}

function getReadableAutoUpdateError(error: Error) {
  const message = error.message || String(error);
  const withoutHeaders = message.split(/\r?\nHeaders:/)[0] ?? message;
  const singleLine = withoutHeaders.replace(/\s+/g, ' ').trim();
  return singleLine.length > 280 ? `${singleLine.slice(0, 277)}...` : singleLine;
}

function quotePowerShellSingle(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function getRelaunchArgs() {
  return process.defaultApp ? process.argv.slice(1) : process.argv.slice(1);
}

function getAdminPrivilegeState(): AdminPrivilegeState {
  if (process.platform !== 'win32') {
    return { canRestartElevated: false, detail: 'non-windows', isAdmin: false };
  }

  try {
    const output = execFileSync('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      "[Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent() | ForEach-Object { $_.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }",
    ], {
      encoding: 'utf8',
      windowsHide: true,
    });

    return {
      canRestartElevated: true,
      isAdmin: output.trim().toLowerCase() === 'true',
    };
  } catch (error) {
    return {
      canRestartElevated: true,
      detail: error instanceof Error ? error.message : String(error),
      isAdmin: false,
    };
  }
}

async function restartElevated() {
  if (process.platform !== 'win32') {
    return { started: false, error: 'Administrator restart is only supported on Windows.' };
  }

  if (getAdminPrivilegeState().isAdmin) {
    return { started: false, alreadyAdmin: true };
  }

  const args = getRelaunchArgs();
  const command = [
    `$file = ${quotePowerShellSingle(process.execPath)}`,
    `$arguments = @(${args.map(quotePowerShellSingle).join(', ')})`,
    "$startArgs = @{ FilePath = $file; Verb = 'RunAs' }",
    "if ($arguments.Count -gt 0) { $startArgs.ArgumentList = $arguments }",
    'Start-Process @startArgs',
  ].join('; ');

  try {
    await execFileAsync('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command,
    ], {
      windowsHide: true,
    });

    await closeTerminalSessions();
    app.quit();
    return { started: true };
  } catch (error) {
    return {
      started: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function listDirectory(directoryPath: string, sessionId?: string) {
  const targetPath = typeof directoryPath === 'string' && directoryPath.trim() ? directoryPath : getDefaultStartupCwd();

  if (isRemoteDisplayPath(targetPath)) {
    return listRemoteDirectory(targetPath, sessionId);
  }

  if (isWslDisplayPath(targetPath)) {
    return listWslDirectory(targetPath);
  }

  try {
    const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
    const visibleEntries = entries
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map<FileSystemEntry>((entry) => ({
        name: entry.name,
        path: path.join(targetPath, entry.name),
        type: entry.isDirectory() ? 'directory' : 'file',
      }))
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === 'directory' ? -1 : 1;
        }
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      })
      .slice(0, 500);

    return {
      entries: visibleEntries,
      path: targetPath,
    };
  } catch (error) {
    return {
      entries: [],
      error: error instanceof Error ? error.message : String(error),
      path: targetPath,
    };
  }
}

async function listWslDirectory(displayPath: string) {
  const wslPath = normalizeWslCommandPath(fromWslDisplayPath(displayPath));

  try {
    const { stdout } = await execFileAsync(
      'wsl.exe',
      [
        '--exec',
        '/bin/sh',
        '-c',
        'cd "$1" || exit 1; for item in * .[!.]* ..?*; do [ -e "$item" ] || continue; [ -d "$item" ] && printf "d\\t%s\\n" "$item"; [ -f "$item" ] && printf "f\\t%s\\n" "$item"; done',
        'bcw-list',
        wslPath,
      ],
      {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
    );

    const entries = stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map<FileSystemEntry | null>((line) => {
        const [kind, ...nameParts] = line.split('\t');
        const name = nameParts.join('\t');
        if (!name || (kind !== 'd' && kind !== 'f')) {
          return null;
        }

        return {
          name,
          path: joinWslPath(wslPath, name),
          type: kind === 'd' ? 'directory' : 'file',
        };
      })
      .filter((entry): entry is FileSystemEntry => Boolean(entry))
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === 'directory' ? -1 : 1;
        }
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      })
      .slice(0, 500);

    return {
      entries,
      path: displayPath,
    };
  } catch (error) {
    return {
      entries: [],
      error: error instanceof Error ? error.message : String(error),
      path: displayPath,
    };
  }
}

function escapeSingleQuotes(value: string) {
  return value.replace(/'/g, `'\\''`);
}

// Inject a single fenced command into the live remote shell and wait until the
// end marker shows up in the output buffer, then return the text between the
// begin and end markers. Injections are serialized per session via remoteListQueue
// so concurrent listings don't interleave their fenced output.
async function runFencedRemoteCommand(session: TerminalSession, innerCommand: string) {
  const run = async () => {
    if (!session.shell) {
      return null;
    }

    const marker = Math.random().toString(36).slice(2, 10);
    const begin = `${REMOTE_LIST_MARKER_BEGIN}${marker}`;
    const end = `${REMOTE_LIST_MARKER_END}${marker}`;

    // Assemble the markers from a shell variable so the echoed command line shows
    // them as "...$m" (unexpanded) while only the real command OUTPUT contains the
    // fully expanded tokens. This lets us match output markers without colliding
    // with the command line the shell echoes back.
    session.shell.write(
      `__m=${marker}; echo "${REMOTE_LIST_MARKER_BEGIN}$__m"; ${innerCommand}; echo "${REMOTE_LIST_MARKER_END}$__m"\r`,
    );

    const matched = await waitForSessionOutput(session, end, 15_000);
    if (!matched) {
      return null;
    }

    const buffer = session.outputBuffer;
    const beginIndex = buffer.lastIndexOf(begin);
    if (beginIndex === -1) {
      return null;
    }
    const endIndex = buffer.indexOf(end, beginIndex + begin.length);
    if (endIndex === -1) {
      return null;
    }
    return buffer.slice(beginIndex + begin.length, endIndex);
  };

  const result = session.remoteListQueue.then(run, run);
  // Keep the queue alive regardless of this call's outcome.
  session.remoteListQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function listRemoteDirectory(displayPath: string, sessionId?: string) {
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session?.shell || !session.remoteHost) {
    return {
      entries: [],
      error: 'Remote session is not available.',
      path: displayPath,
    };
  }

  const { subPath } = parseRemoteDisplayPath(displayPath);
  const targetDir = subPath || '.';
  const quotedDir = escapeSingleQuotes(targetDir);
  // `pwd` resolves the absolute path (the prompt only shows a basename); `ls -1Ap`
  // lists one entry per line, includes dotfiles, and appends `/` to directories.
  const inner = `( cd '${quotedDir}' 2>/dev/null && pwd && ls -1Ap ) || echo ${REMOTE_LIST_MARKER_ERROR}`;

  let output: string | null;
  try {
    output = await runFencedRemoteCommand(session, inner);
  } catch (error) {
    return {
      entries: [],
      error: error instanceof Error ? error.message : String(error),
      path: displayPath,
    };
  }

  if (output === null || output.includes(REMOTE_LIST_MARKER_ERROR)) {
    return {
      entries: [],
      error: 'Failed to list the remote directory.',
      path: displayPath,
    };
  }

  const remoteHost = session.remoteHost;
  const { absolutePath, entries } = parseShellListing(output, (base, name) =>
    joinRemoteDisplayPath(remoteHost, base, name),
  );

  return {
    entries,
    path: `${REMOTE_PATH_PREFIX}${remoteHost}:${absolutePath}`,
  };
}

// Parses the fenced "pwd + ls -1Ap" output into the absolute path and entries,
// building display paths for either a remote host or local WSL.
function parseShellListing(output: string, makePath: (absolutePath: string, name: string) => string) {
  const lines = stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const absolutePath = lines.shift() ?? '/';

  const entries = lines
    .map<FileSystemEntry | null>((line) => {
      const isDirectory = line.endsWith('/');
      const name = isDirectory ? line.slice(0, -1) : line;
      if (!name || name === '.' || name === '..') {
        return null;
      }
      return {
        name,
        path: makePath(absolutePath, name),
        type: isDirectory ? 'directory' : 'file',
      };
    })
    .filter((entry): entry is FileSystemEntry => Boolean(entry))
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    })
    .slice(0, 500);

  return { absolutePath, entries };
}

// Runs a fenced "pwd + ls" in the live remote shell and pushes the resulting
// listing to the renderer. Triggered when the user runs `ls` on a remote SSH
// host, so the explorer follows wherever the remote shell currently is.
async function refreshExplorerFromShell(session: TerminalSession) {
  const remoteHost = session.remoteHost;
  if (!remoteHost) {
    return;
  }

  const inner = `( pwd && ls -1Ap ) 2>/dev/null || echo ${REMOTE_LIST_MARKER_ERROR}`;

  let output: string | null;
  try {
    output = await runFencedRemoteCommand(session, inner);
  } catch {
    return;
  }

  if (output === null || output.includes(REMOTE_LIST_MARKER_ERROR)) {
    return;
  }

  const { absolutePath, entries } = parseShellListing(output, (base, name) =>
    joinRemoteDisplayPath(remoteHost, base, name),
  );
  const rootPath = `${REMOTE_PATH_PREFIX}${remoteHost}:${absolutePath}`;

  // Keep cwd in sync so the explorer header and later navigation use this path.
  session.cwd = rootPath;
  sendToRenderer(TERMINAL_CWD, { sessionId: session.id, cwd: rootPath });
  sendToRenderer(FILESYSTEM_DIRECTORY_UPDATE, {
    sessionId: session.id,
    rootPath,
    entries,
    remote: true,
  });
}

async function canViewFileInTerminal(filePath: string) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { viewable: false, reason: 'invalid-path' };
  }

  // Remote files can't be stat-ed locally; let the terminal `cat` attempt it.
  if (isRemoteDisplayPath(filePath)) {
    return { viewable: true };
  }

  if (isWslDisplayPath(filePath)) {
    return canViewWslFileInTerminal(filePath);
  }

  let handle: fs.promises.FileHandle | undefined;

  try {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
      return { viewable: false, reason: 'not-file' };
    }

    if (stats.size === 0) {
      return { viewable: true };
    }

    handle = await fs.promises.open(filePath, 'r');
    const sampleLength = Math.min(stats.size, 8192);
    const buffer = Buffer.alloc(sampleLength);
    const { bytesRead } = await handle.read(buffer, 0, sampleLength, 0);
    const sample = buffer.subarray(0, bytesRead);
    const extension = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();
    const knownTextFile = TEXT_FILE_EXTENSIONS.has(extension) || TEXT_FILE_EXTENSIONS.has(`.${basename}`);

    const hasUtf8Bom = sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf;
    const hasUtf16LeBom = sample[0] === 0xff && sample[1] === 0xfe;
    const hasUtf16BeBom = sample[0] === 0xfe && sample[1] === 0xff;
    if (hasUtf8Bom || hasUtf16LeBom || hasUtf16BeBom) {
      return { viewable: true };
    }

    let controlCount = 0;
    let nullCount = 0;
    for (const byte of sample) {
      if (byte === 0) {
        nullCount += 1;
        continue;
      }

      const isTextControl = byte === 9 || byte === 10 || byte === 13 || byte === 12 || byte === 8;
      if (byte < 32 && !isTextControl) {
        controlCount += 1;
      }
    }

    if (knownTextFile && nullCount / sample.length < 0.55) {
      return { viewable: true };
    }

    if (nullCount > 0) {
      return { viewable: false, reason: 'binary-file' };
    }

    return {
      viewable: sample.length === 0 || controlCount / sample.length < 0.08,
      reason: controlCount / Math.max(sample.length, 1) < 0.08 ? undefined : 'binary-file',
    };
  } catch (error) {
    return {
      viewable: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function canViewWslFileInTerminal(displayPath: string) {
  const wslPath = normalizeWslCommandPath(fromWslDisplayPath(displayPath));
  const extension = path.posix.extname(wslPath).toLowerCase();
  const basename = path.posix.basename(wslPath).toLowerCase();
  const knownTextFile = TEXT_FILE_EXTENSIONS.has(extension) || TEXT_FILE_EXTENSIONS.has(`.${basename}`);

  try {
    await execFileAsync('wsl.exe', ['--exec', '/usr/bin/test', '-f', wslPath], {
      windowsHide: true,
    });

    if (knownTextFile) {
      return { viewable: true };
    }

    try {
      await execFileAsync('wsl.exe', ['--exec', '/usr/bin/test', '-s', wslPath], {
        windowsHide: true,
      });
    } catch {
      return { viewable: true };
    }

    await execFileAsync('wsl.exe', ['--exec', '/bin/grep', '-Iq', '.', wslPath], {
      windowsHide: true,
    });

    return { viewable: true };
  } catch (error) {
    const exitCode = typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : null;
    return {
      viewable: false,
      reason: exitCode === 1 ? 'binary-file' : 'not-file',
    };
  }
}

function setupAutoUpdater() {
  if (!isAutoUpdateSupported()) {
    setAppUpdateState({
      supported: false,
      status: 'unsupported',
    });
    return;
  }

  setAppUpdateState({
    supported: true,
    status: 'idle',
  });

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setAppUpdateState({
      error: undefined,
      progress: undefined,
      status: 'checking',
      updateVersion: undefined,
    });
  });

  autoUpdater.on('update-available', (info) => {
    setAppUpdateState({
      error: undefined,
      status: 'available',
      updateVersion: info.version,
    });
  });

  autoUpdater.on('download-progress', (progressInfo) => {
    setAppUpdateState({
      progress: progressInfo.percent,
      status: 'downloading',
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setAppUpdateState({
      progress: 100,
      status: 'downloaded',
      updateVersion: info.version,
    });
  });

  autoUpdater.on('update-not-available', () => {
    setAppUpdateState({
      progress: undefined,
      status: 'up-to-date',
      updateVersion: undefined,
    });
  });

  autoUpdater.on('error', (error) => {
    setAppUpdateState({
      error: getReadableAutoUpdateError(error),
      progress: undefined,
      status: 'error',
    });
  });

  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setAppUpdateState({
      error: error instanceof Error ? getReadableAutoUpdateError(error) : message,
      status: 'error',
    });
  });
}

function updateApplicationMenu(locale: AppLocale) {
  const text = MENU_TEXT[locale];
  const template: MenuItemConstructorOptions[] = [
    {
      label: text.file,
      submenu: [
        {
          label: text.saveTerminalOutput,
          click: () => sendToRenderer(TERMINAL_SAVE_OUTPUT_REQUEST, undefined),
        },
        { type: 'separator' },
        { label: text.close, role: 'close' },
      ],
    },
    {
      label: text.view,
      submenu: [
        { label: text.reload, role: 'reload' },
        { label: text.forceReload, role: 'forceReload' },
        { label: text.toggleDevTools, role: 'toggleDevTools' },
        { type: 'separator' },
        { label: text.resetZoom, role: 'resetZoom' },
        { label: text.zoomIn, role: 'zoomIn' },
        { label: text.zoomOut, role: 'zoomOut' },
      ],
    },
    {
      label: text.help,
      submenu: [
        {
          label: locale === 'ja' ? `バージョン ${app.getVersion()}` : `Version ${app.getVersion()}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: text.docs,
          click: () => {
            void shell.openExternal('https://github.com/BuildCooperWorks/bcw-terminal');
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function spawnShell(session: Pick<TerminalSession, 'id' | 'title' | 'cwd'>) {
  const shell = pty.spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass'], {
    cols: 120,
    rows: 32,
    cwd: session.cwd,
    env: process.env,
    name: 'xterm-256color',
  });

  shell.onData((output) => {
    const nextSession = sessions.get(session.id);
    let cleanTail = stripAnsi(output);
    let displayOutput = output;
    if (nextSession) {
      nextSession.outputBuffer = `${nextSession.outputBuffer}${stripAnsi(output)}`.slice(-20_000);
      cleanTail = nextSession.outputBuffer;
      displayOutput = filterMarkerLines(nextSession, output);
    }
    if (displayOutput) {
      sendToRenderer(TERMINAL_OUTPUT, { sessionId: session.id, output: displayOutput });
    }
    notifySequenceWaiters(session.id);

    const prompt = detectPromptCwd(cleanTail);

    if (prompt) {
      if (nextSession) {
        // Remember the first host seen (local WSL). A different host later = remote SSH.
        if (prompt.host && !nextSession.localShellHost) {
          nextSession.localShellHost = prompt.host;
        }

        const wasRemote = Boolean(nextSession.remoteHost);
        const isRemote = Boolean(
          prompt.host && nextSession.localShellHost && prompt.host !== nextSession.localShellHost,
        );
        nextSession.remoteHost = isRemote ? prompt.host : null;

        // On entering/leaving a remote host, clear the explorer; the listing will
        // be refreshed the next time the user runs `ls`.
        if (isRemote !== wasRemote) {
          sendToRenderer(FILESYSTEM_DIRECTORY_UPDATE, {
            sessionId: session.id,
            cleared: true,
            remote: isRemote,
          });
        }

        if (isRemote) {
          // Mark the cwd as remote so the UI reflects the SSH connection (the chip
          // and a cleared explorer) immediately, without waiting for an `ls`. The
          // real path is resolved via `pwd` when the user runs `ls`; once that has
          // populated a full "remote:host:/path", don't clobber it back to empty.
          const remotePrefix = `${REMOTE_PATH_PREFIX}${prompt.host}:`;
          if (!nextSession.cwd.startsWith(remotePrefix)) {
            nextSession.cwd = remotePrefix;
            sendToRenderer(TERMINAL_CWD, { sessionId: session.id, cwd: remotePrefix });
          }
          // Don't overwrite cwd with a local path while on a remote host.
          return;
        }
      }

      const nextCwd = prompt.cwd;
      if (!nextCwd) {
        return;
      }

      if (
        nextSession &&
        !nextSession.autoChangedWslHome &&
        isWslDisplayPath(nextCwd) &&
        isMountedWindowsHomePath(nextCwd)
      ) {
        nextSession.autoChangedWslHome = true;
        nextSession.cwd = `${WSL_PATH_PREFIX}~`;
        sendToRenderer(TERMINAL_CWD, { sessionId: session.id, cwd: nextSession.cwd });
        shell.write('cd ~\r');
        return;
      }

      if (nextSession) {
        nextSession.cwd = nextCwd;
      }
      sendToRenderer(TERMINAL_CWD, { sessionId: session.id, cwd: nextCwd });

      // Remember local Windows directories so the next launch reopens here.
      if (!isWslDisplayPath(nextCwd)) {
        saveLastLocalCwd(nextCwd);
      }
    }
  });

  shell.onExit(({ exitCode }) => {
    const code = typeof exitCode === 'number' ? exitCode : null;

    if (sessions.get(session.id)?.shell === shell) {
      sendToRenderer(TERMINAL_EXIT, { sessionId: session.id, code });
      const nextSession = sessions.get(session.id);
      if (nextSession) {
        nextSession.shell = null;
      }
    }
  });

  return shell;
}

function getSmartAppControlState(): SmartAppControlState {
  if (process.platform !== 'win32') {
    return { status: 'unknown', detail: 'non-windows' };
  }

  try {
    const output = execFileSync('reg', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy',
      '/v',
      'VerifiedAndReputablePolicyState',
    ], {
      encoding: 'utf8',
      windowsHide: true,
    });

    const line = output
      .split(/\r?\n/)
      .find((row) => row.includes('VerifiedAndReputablePolicyState'));

    if (!line) {
      return { status: 'unknown', detail: 'registry-value-not-found' };
    }

    const parts = line.trim().split(/\s+/);
    const raw = parts.at(-1)?.toLowerCase() ?? '';
    const value = raw.startsWith('0x') ? Number.parseInt(raw, 16) : Number.parseInt(raw, 10);

    if (value === 2) {
      return { status: 'on' };
    }
    if (value === 1) {
      return { status: 'eval' };
    }
    if (value === 0) {
      return { status: 'off' };
    }

    return { status: 'unknown', detail: `unexpected-value:${raw}` };
  } catch (error) {
    return { status: 'unknown', detail: (error as Error).message };
  }
}

function createSession() {
  sessionCounter += 1;
  const defaultCwd = getDefaultStartupCwd();

  const sessionBase = {
    id: `terminal-${sessionCounter}`,
    title: `PowerShell ${sessionCounter}`,
    cwd: defaultCwd,
  };
  const shell = spawnShell(sessionBase);
  const session: TerminalSession = {
    ...sessionBase,
    shell,
    outputBuffer: '',
    autoChangedWslHome: false,
    localShellHost: null,
    remoteHost: null,
    remoteListQueue: Promise.resolve(),
    pendingDisplayChunk: '',
    suppressingMarkerOutput: false,
  };

  sessions.set(session.id, session);

  return {
    id: session.id,
    title: session.title,
    cwd: session.cwd,
  };
}

ipcMain.handle('terminal:create-session', () => createSession());
ipcMain.handle('filesystem:list-directory', (_event, directoryPath: string, sessionId?: string) =>
  listDirectory(directoryPath, sessionId),
);
ipcMain.handle('filesystem:can-view-file-in-terminal', (_event, filePath: string) => canViewFileInTerminal(filePath));

ipcMain.on('terminal:data', (_event, payload: { sessionId: string; data: string }) => {
  sessions.get(payload.sessionId)?.shell?.write(payload.data);
});

// The renderer calls this when the user runs a listing command (`ls`, etc.). For
// a remote SSH session we re-fetch the directory via a hidden fenced `ls` and
// push the result to the explorer; for local shells it's a no-op.
ipcMain.handle('filesystem:refresh-remote', (_event, sessionId: string) => {
  const session = sessions.get(sessionId);
  if (session?.shell && session.remoteHost) {
    void refreshExplorerFromShell(session);
  }
});

ipcMain.handle(
  'terminal:execute-command',
  (_event, payload: { sessionId: string; command: string; options?: { clearCurrentLine?: boolean } }) => {
  const session = sessions.get(payload.sessionId);
  if (!session?.shell) {
    return {
      executed: false,
      missingVariables: [],
    };
  }

  const resolved = resolveCommandVariables(payload.command ?? '');
  if (resolved.missingVariables.length > 0) {
    return {
      executed: false,
      missingVariables: resolved.missingVariables,
    };
  }

  if (payload.options?.clearCurrentLine) {
    session.shell.write(isWslDisplayPath(session.cwd) ? '\x15' : '\x1b');
  }

  session.shell.write(`${resolved.command}\r`);
  return {
    executed: true,
    missingVariables: [],
  };
  },
);

ipcMain.handle(
  'terminal:run-sequence',
  (_event, payload: { sessionId: string; steps: TerminalSequenceStep[] }) =>
    runTerminalSequence(payload.sessionId, Array.isArray(payload.steps) ? payload.steps : []),
);

ipcMain.on('terminal:resize', (_event, payload: { sessionId: string; cols: number; rows: number }) => {
  if (payload.cols < 1 || payload.rows < 1) {
    return;
  }

  sessions.get(payload.sessionId)?.shell?.resize(payload.cols, payload.rows);
});

ipcMain.on('terminal:stop', (_event, sessionId: string) => {
  sessions.get(sessionId)?.shell?.kill();
  const session = sessions.get(sessionId);
  if (session) {
    session.shell = null;
  }
});

ipcMain.handle('app:set-locale', (_event, locale: AppLocale) => {
  appLocale = locale === 'en' ? 'en' : 'ja';
  updateApplicationMenu(appLocale);
});

ipcMain.handle('system:get-admin-privilege-state', () => getAdminPrivilegeState());
ipcMain.handle('system:restart-elevated', () => restartElevated());
ipcMain.handle('system:get-smart-app-control-state', () => getSmartAppControlState());
ipcMain.handle('app:update:get-state', () => appUpdateState);
ipcMain.handle('app:update:check', async () => {
  if (!isAutoUpdateSupported()) {
    return {
      started: false,
      supported: false,
    };
  }

  await autoUpdater.checkForUpdates();
  return {
    started: true,
    supported: true,
  };
});
ipcMain.handle('app:update:install', () => {
  if (!isAutoUpdateSupported() || appUpdateState.status !== 'downloaded') {
    return { started: false };
  }

  autoUpdater.quitAndInstall();
  return { started: true };
});

ipcMain.handle('window:get-state', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return {
      alwaysOnTop: false,
    };
  }

  return {
    alwaysOnTop: mainWindow.isAlwaysOnTop(),
  };
});

ipcMain.handle('window:set-always-on-top', (_event, value: boolean) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const enabled = Boolean(value);
  if (enabled) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    mainWindow.setAlwaysOnTop(false, 'normal');
  }
  saveWindowState(mainWindow);
});

ipcMain.handle('command-variables:list', () => loadStoredCommandVariables().map(toCommandVariableSnapshot));

ipcMain.handle(
  'command-variables:save',
  (_event, payload: {
    id?: string;
    name: string;
    description?: string;
    enabled?: boolean;
    kind: CommandVariableKind;
    value?: string;
  }) => {
    const name = normalizeVariableName(payload.name ?? '');
    if (!isValidVariableName(name)) {
      throw new Error('Variable name must use A-Z, 0-9, and underscore, and cannot start with a number.');
    }

    const variables = loadStoredCommandVariables();
    const existingIndex = variables.findIndex((variable) => variable.id === payload.id);
    const duplicate = variables.some((variable, index) => variable.name === name && index !== existingIndex);
    if (duplicate) {
      throw new Error(`Variable "${name}" already exists.`);
    }

    const existing = existingIndex >= 0 ? variables[existingIndex] : undefined;
    const now = Date.now();
    const kind: CommandVariableKind = payload.kind === 'secret' ? 'secret' : 'text';
    const next: StoredCommandVariable = {
      id: existing?.id ?? `variable-${now}-${Math.random().toString(16).slice(2, 8)}`,
      name,
      description: payload.description ?? existing?.description ?? '',
      enabled: payload.enabled ?? existing?.enabled ?? true,
      kind,
      updatedAt: now,
    };

    if (kind === 'secret') {
      if (typeof payload.value === 'string' && payload.value.length > 0) {
        next.encryptedValue = encryptVariableValue(payload.value);
      } else if (existing?.kind === 'secret' && existing.encryptedValue) {
        next.encryptedValue = existing.encryptedValue;
      }
    } else {
      next.value = payload.value ?? (existing?.kind === 'text' ? existing.value : '') ?? '';
    }

    if (existingIndex >= 0) {
      variables[existingIndex] = next;
    } else {
      variables.push(next);
    }

    saveStoredCommandVariables(variables);
    return toCommandVariableSnapshot(next);
  },
);

ipcMain.handle('command-variables:delete', (_event, id: string) => {
  const variables = loadStoredCommandVariables();
  const nextVariables = variables.filter((variable) => variable.id !== id);
  saveStoredCommandVariables(nextVariables);
  return {
    deleted: nextVariables.length !== variables.length,
  };
});

ipcMain.handle('command-config:load-file', async () => {
  const ownerWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const options: OpenDialogOptions = {
    title: 'Load command config',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }],
  };
  const result = ownerWindow ? await dialog.showOpenDialog(ownerWindow, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    canceled: false,
    content,
    path: filePath,
  };
});

ipcMain.handle(
  'command-config:save-file',
  async (_event, payload: { content: string; currentPath?: string }) => {
    const ownerWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const options: SaveDialogOptions = {
      title: 'Save command config',
      defaultPath: payload.currentPath || 'bcw-terminal-commands.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const saveResult = ownerWindow
      ? await dialog.showSaveDialog(ownerWindow, options)
      : await dialog.showSaveDialog(options);

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(saveResult.filePath, payload.content ?? '', 'utf8');
    return {
      canceled: false,
      path: saveResult.filePath,
    };
  },
);

ipcMain.handle('terminal-output:save-file', async (_event, payload: { content: string }) => {
  const ownerWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const options: SaveDialogOptions = {
    title: 'Save terminal output',
    defaultPath: `bcw-terminal-output-${timestamp}.txt`,
    filters: [{ name: 'Text', extensions: ['txt'] }, { name: 'All Files', extensions: ['*'] }],
  };
  const saveResult = ownerWindow ? await dialog.showSaveDialog(ownerWindow, options) : await dialog.showSaveDialog(options);

  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  fs.writeFileSync(saveResult.filePath, payload.content ?? '', 'utf8');
  return {
    canceled: false,
    path: saveResult.filePath,
  };
});

ipcMain.handle('clipboard:read-text', () => clipboard.readText());
ipcMain.handle('clipboard:write-text', (_event, value: string) => {
  clipboard.writeText(value ?? '');
});

app.whenReady().then(() => {
  app.setAppUserModelId('BuildCooperWorks.BcwTerminal');
  updateApplicationMenu(appLocale);
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void closeTerminalSessions().finally(() => {
      app.quit();
    });
  }
});
