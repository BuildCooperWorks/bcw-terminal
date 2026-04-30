import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  type OpenDialogOptions,
  type SaveDialogOptions,
  shell,
} from 'electron';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { autoUpdater } from 'electron-updater';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const isDevMode = Boolean(process.env.VITE_DEV_SERVER_URL);

if (isDevMode) {
  // Avoid cache/session path contention between rapid dev restarts on Windows.
  const devSessionRoot = path.join(app.getPath('temp'), 'bcw-terminal-dev-session', String(process.pid));
  app.setPath('sessionData', devSessionRoot);
}

const TERMINAL_OUTPUT = 'terminal:output';
const TERMINAL_CWD = 'terminal:cwd';
const TERMINAL_EXIT = 'terminal:exit';
const APP_UPDATE_STATUS = 'app:update-status';

type TerminalSession = {
  id: string;
  title: string;
  cwd: string;
  shell: pty.IPty | null;
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

let mainWindow: BrowserWindow | null = null;
let sessionCounter = 0;
let appLocale: AppLocale = 'ja';
const sessions = new Map<string, TerminalSession>();
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
    toggleDevTools: 'Toggle Developer Tools',
    toggleFullScreen: 'Toggle Full Screen',
    view: 'View',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
  },
  ja: {
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
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
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
      submenu: [{ label: text.close, role: 'close' }],
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

function spawnShell(session: Omit<TerminalSession, 'shell'>) {
  const shell = pty.spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass'], {
    cols: 120,
    rows: 32,
    cwd: session.cwd,
    env: process.env,
    name: 'xterm-256color',
  });

  shell.onData((output) => {
    sendToRenderer(TERMINAL_OUTPUT, { sessionId: session.id, output });

    const promptMatch = stripAnsi(output).match(/PS\s+(.+?)>\s*$/m);
    if (promptMatch?.[1]) {
      const nextSession = sessions.get(session.id);
      if (nextSession) {
        nextSession.cwd = promptMatch[1];
      }
      sendToRenderer(TERMINAL_CWD, { sessionId: session.id, cwd: promptMatch[1] });
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
  const session = { ...sessionBase, shell };

  sessions.set(session.id, session);

  return {
    id: session.id,
    title: session.title,
    cwd: session.cwd,
  };
}

ipcMain.handle('terminal:create-session', () => createSession());

ipcMain.on('terminal:data', (_event, payload: { sessionId: string; data: string }) => {
  sessions.get(payload.sessionId)?.shell?.write(payload.data);
});

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
  for (const session of sessions.values()) {
    session.shell?.kill();
  }
  sessions.clear();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
