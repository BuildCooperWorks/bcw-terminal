import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AppUpdateState,
  CommandVariableInput,
  TerminalCwdEvent,
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalSequenceStep,
} from './types';

const terminalApi = {
  checkForAppUpdate: () => ipcRenderer.invoke('app:update:check'),
  createSession: () => ipcRenderer.invoke('terminal:create-session'),
  deleteCommandVariable: (id: string) => ipcRenderer.invoke('command-variables:delete', id),
  executeCommand: (sessionId: string, command: string) =>
    ipcRenderer.invoke('terminal:execute-command', { sessionId, command }),
  runSequence: (sessionId: string, steps: TerminalSequenceStep[]) =>
    ipcRenderer.invoke('terminal:run-sequence', { sessionId, steps }),
  getAppUpdateState: async () => {
    try {
      return await ipcRenderer.invoke('app:update:get-state');
    } catch {
      return { supported: false, status: 'unsupported' as const };
    }
  },
  getSmartAppControlState: async () => {
    try {
      return await ipcRenderer.invoke('system:get-smart-app-control-state');
    } catch {
      return { status: 'unknown' as const };
    }
  },
  getWindowState: async () => {
    try {
      return await ipcRenderer.invoke('window:get-state');
    } catch {
      return { alwaysOnTop: false };
    }
  },
  loadCommandConfigFile: () => ipcRenderer.invoke('command-config:load-file'),
  listCommandVariables: () => ipcRenderer.invoke('command-variables:list'),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  saveCommandConfigFile: (content: string, currentPath?: string) =>
    ipcRenderer.invoke('command-config:save-file', { content, currentPath }),
  saveCommandVariable: (variable: CommandVariableInput) => ipcRenderer.invoke('command-variables:save', variable),
  saveTerminalOutputFile: (content: string) => ipcRenderer.invoke('terminal-output:save-file', { content }),
  setAlwaysOnTop: async (value: boolean) => {
    try {
      await ipcRenderer.invoke('window:set-always-on-top', value);
    } catch {
      // Ignore when main process handlers are not yet ready during hot reload.
    }
  },
  setLocale: (locale: 'ja' | 'en') => ipcRenderer.invoke('app:set-locale', locale),
  sendData: (sessionId: string, data: string) => ipcRenderer.send('terminal:data', { sessionId, data }),
  resize: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.send('terminal:resize', { sessionId, cols, rows }),
  stop: (sessionId: string) => ipcRenderer.send('terminal:stop', sessionId),
  writeClipboardText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  installDownloadedAppUpdate: () => ipcRenderer.invoke('app:update:install'),
  onAppUpdateStatus: (callback: (event: AppUpdateState) => void) => {
    const listener = (_event: IpcRendererEvent, payload: AppUpdateState) => callback(payload);
    ipcRenderer.on('app:update-status', listener);

    return () => ipcRenderer.removeListener('app:update-status', listener);
  },
  onOutput: (callback: (event: TerminalOutputEvent) => void) => {
    const listener = (_event: IpcRendererEvent, payload: TerminalOutputEvent) => callback(payload);
    ipcRenderer.on('terminal:output', listener);

    return () => ipcRenderer.removeListener('terminal:output', listener);
  },
  onCwdChange: (callback: (event: TerminalCwdEvent) => void) => {
    const listener = (_event: IpcRendererEvent, payload: TerminalCwdEvent) => callback(payload);
    ipcRenderer.on('terminal:cwd', listener);

    return () => ipcRenderer.removeListener('terminal:cwd', listener);
  },
  onExit: (callback: (event: TerminalExitEvent) => void) => {
    const listener = (_event: IpcRendererEvent, payload: TerminalExitEvent) => callback(payload);
    ipcRenderer.on('terminal:exit', listener);

    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },
};

contextBridge.exposeInMainWorld('bcwTerminal', terminalApi);
