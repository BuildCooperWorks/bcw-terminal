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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TERMINAL_OUTPUT = 'terminal:output';
const TERMINAL_CWD = 'terminal:cwd';
const TERMINAL_EXIT = 'terminal:exit';

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

const MENU_TEXT = {
  en: {
    close: 'Close',
    copy: 'Copy',
    cut: 'Cut',
    docs: 'Project Page',
    edit: 'Edit',
    file: 'File',
    forceReload: 'Force Reload',
    help: 'Help',
    minimize: 'Minimize',
    paste: 'Paste',
    redo: 'Redo',
    reload: 'Reload',
    resetZoom: 'Reset Zoom',
    selectAll: 'Select All',
    toggleDevTools: 'Toggle Developer Tools',
    toggleFullScreen: 'Toggle Full Screen',
    undo: 'Undo',
    view: 'View',
    window: 'Window',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
  },
  ja: {
    close: '閉じる',
    copy: 'コピー',
    cut: '切り取り',
    docs: 'プロジェクトページを開く',
    edit: '編集',
    file: 'ファイル',
    forceReload: '強制再読み込み',
    help: 'ヘルプ',
    minimize: '最小化',
    paste: '貼り付け',
    redo: 'やり直し',
    reload: '再読み込み',
    resetZoom: 'ズームをリセット',
    selectAll: 'すべて選択',
    toggleDevTools: '開発者ツール',
    toggleFullScreen: '全画面表示',
    undo: '元に戻す',
    view: '表示',
    window: 'ウィンドウ',
    zoomIn: '拡大',
    zoomOut: '縮小',
  },
} as const;

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

  mainWindow.webContents.send(channel, payload);
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
    return;
  }

  void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function updateApplicationMenu(locale: AppLocale) {
  const text = MENU_TEXT[locale];
  const template: MenuItemConstructorOptions[] = [
    {
      label: text.file,
      submenu: [{ label: text.close, role: 'close' }],
    },
    {
      label: text.edit,
      submenu: [
        { label: text.undo, role: 'undo' },
        { label: text.redo, role: 'redo' },
        { type: 'separator' },
        { label: text.cut, role: 'cut' },
        { label: text.copy, role: 'copy' },
        { label: text.paste, role: 'paste' },
        { type: 'separator' },
        { label: text.selectAll, role: 'selectAll' },
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
        { type: 'separator' },
        { label: text.toggleFullScreen, role: 'togglefullscreen' },
      ],
    },
    {
      label: text.window,
      submenu: [{ label: text.minimize, role: 'minimize' }, { label: text.close, role: 'close' }],
    },
    {
      label: text.help,
      submenu: [
        {
          label: text.docs,
          click: () => {
            void shell.openExternal('https://github.com/BuildCooperWorks');
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

  const sessionBase = {
    id: `terminal-${sessionCounter}`,
    title: `PowerShell ${sessionCounter}`,
    cwd: process.cwd(),
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

function restartSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  session.shell?.kill();

  const restartedBase = {
    id: session.id,
    title: session.title,
    cwd: session.cwd || process.cwd(),
  };
  const shell = spawnShell(restartedBase);
  const restarted: TerminalSession = { ...restartedBase, shell };

  sessions.set(sessionId, restarted);

  return {
    id: restarted.id,
    title: restarted.title,
    cwd: restarted.cwd,
  };
}

ipcMain.handle('terminal:create-session', () => createSession());
ipcMain.handle('terminal:restart-session', (_event, sessionId: string) => restartSession(sessionId));

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

ipcMain.handle('clipboard:read-text', () => clipboard.readText());
ipcMain.handle('clipboard:write-text', (_event, value: string) => {
  clipboard.writeText(value ?? '');
});

app.whenReady().then(() => {
  app.setAppUserModelId('BuildCooperWorks.BcwTerminal');
  updateApplicationMenu(appLocale);
  createWindow();

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
