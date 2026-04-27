import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import type { TerminalStatus } from '../types/terminal';

const MAX_BUFFER_LENGTH = 180_000;
const IDLE_AFTER_MS = 5_000;

export type TerminalSettings = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  confirmStop: boolean;
  terminalBackgroundColor: string;
  terminalTextColor: string;
};

export type TerminalSessionView = {
  id: string;
  title: string;
  cwd: string;
  status: TerminalStatus;
  activity: 'running' | 'idle' | 'stopped';
  intent: string;
  lastCommand: string;
  preview: string;
  url?: string;
};

function stripAnsi(value: string) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function getTerminalTheme(settings: TerminalSettings) {
  return {
    background: settings.terminalBackgroundColor,
    foreground: settings.terminalTextColor,
    cursor: '#77d4c4',
    selectionBackground: '#304152',
    black: settings.terminalBackgroundColor,
    blue: '#79c0ff',
    brightBlue: '#a5d6ff',
    brightCyan: '#b3f0ff',
    brightGreen: '#aff5b4',
    brightMagenta: '#d2a8ff',
    brightRed: '#ffb3ad',
    brightWhite: '#ffffff',
    brightYellow: '#fff8c5',
    cyan: '#76e3ea',
    green: '#7ee787',
    magenta: '#d2a8ff',
    red: '#ff7b72',
    white: '#e6edf3',
    yellow: '#f2cc60',
  };
}

function createTerminal(settings: TerminalSettings) {
  return new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    theme: getTerminalTheme(settings),
  });
}

function toPreview(buffer: string) {
  return stripAnsi(buffer)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-5)
    .join('\n');
}

function inferIntent(command: string, output: string) {
  const value = `${command}\n${output}`.toLowerCase();

  if (value.includes('claude')) {
    return 'Claude';
  }

  if (value.includes('codex') || value.includes('chatgpt')) {
    return 'ChatGPT';
  }

  if (value.includes('vite') || value.includes('local:') || value.includes('npm run dev')) {
    return 'Vite Server';
  }

  if (value.includes('npm install') || value.includes('npm i')) {
    return 'Installing';
  }

  if (value.includes('git ')) {
    return 'Git';
  }

  if (value.includes('docker ')) {
    return 'Docker';
  }

  if (value.includes('powershell')) {
    return 'PowerShell';
  }

  return command ? 'Command' : 'PowerShell';
}

function inferUrl(output: string) {
  return output.match(/https?:\/\/[^\s)]+/)?.[0];
}

function commandFromInput(input: string) {
  const normalized = input.replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  if (lines.length < 2) {
    return null;
  }

  return lines
    .slice(0, -1)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

export function useBcwTerminal(settings: TerminalSettings) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const createdInitialSessionRef = useRef(false);
  const buffersRef = useRef(new Map<string, string>());
  const inputBuffersRef = useRef(new Map<string, string>());
  const idleTimersRef = useRef(new Map<string, number>());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TerminalSessionView[]>([]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  const fit = useCallback(() => {
    try {
      fitAddonRef.current?.fit();
    } catch {
      return;
    }

    const terminal = terminalRef.current;
    const sessionId = activeIdRef.current;
    if (terminal && sessionId && terminal.cols > 0 && terminal.rows > 0) {
      window.bcwTerminal.resize(sessionId, terminal.cols, terminal.rows);
    }
  }, []);

  const renderActiveBuffer = useCallback((sessionId: string | null) => {
    const terminal = terminalRef.current;
    if (!terminal || !sessionId) {
      return;
    }

    try {
      terminal.reset();
      terminal.write(buffersRef.current.get(sessionId) ?? '');
      terminal.focus();
    } catch {
      // Ignore transient renderer timing issues while xterm initializes or disposes.
    }
  }, []);

  const selectSession = useCallback(
    (sessionId: string) => {
      activeIdRef.current = sessionId;
      setActiveSessionId(sessionId);
      renderActiveBuffer(sessionId);
      window.requestAnimationFrame(fit);
    },
    [fit, renderActiveBuffer],
  );

  const createSession = useCallback(async () => {
    const session = await window.bcwTerminal.createSession();
    const nextSession: TerminalSessionView = {
      id: session.id,
      title: session.title,
      cwd: session.cwd,
      status: 'ready',
      activity: 'running',
      intent: 'PowerShell',
      lastCommand: '',
      preview: 'PowerShell を起動中',
    };

    buffersRef.current.set(session.id, 'BcwTerminal PowerShell session\r\n');
    setSessions((current) => [...current, nextSession]);
    selectSession(session.id);
  }, [selectSession]);

  const attachTerminal = useCallback(
    (element: HTMLDivElement) => {
      if (terminalRef.current) {
        return;
      }

      const terminal = createTerminal(settings);
      const fitAddon = new FitAddon();

      terminal.loadAddon(fitAddon);
      terminal.open(element);
      terminal.onData((data) => {
        const sessionId = activeIdRef.current;
        if (sessionId) {
          const currentInput = inputBuffersRef.current.get(sessionId) ?? '';
          const nextInput = `${currentInput}${data}`;
          const command = commandFromInput(nextInput);

          if (command) {
            inputBuffersRef.current.set(sessionId, '');
            setSessions((current) =>
              current.map((session) =>
                session.id === sessionId
                  ? {
                      ...session,
                      activity: 'running',
                      intent: inferIntent(command, buffersRef.current.get(sessionId) ?? ''),
                      lastCommand: command,
                    }
                  : session,
              ),
            );
          } else {
            inputBuffersRef.current.set(sessionId, nextInput);
          }

          window.bcwTerminal.sendData(sessionId, data);
        }
      });

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      fit();
    },
    [fit, settings],
  );

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.fontFamily = settings.fontFamily;
    terminal.options.fontSize = settings.fontSize;
    terminal.options.lineHeight = settings.lineHeight;
    terminal.options.theme = getTerminalTheme(settings);
    window.requestAnimationFrame(fit);
  }, [fit, settings]);

  useEffect(() => {
    if (createdInitialSessionRef.current) {
      return;
    }

    createdInitialSessionRef.current = true;
    void createSession();
  }, [createSession]);

  useEffect(() => {
    activeIdRef.current = activeSessionId;
    renderActiveBuffer(activeSessionId);
    window.requestAnimationFrame(fit);
  }, [activeSessionId, fit, renderActiveBuffer]);

  useEffect(() => {
    const unsubscribeOutput = window.bcwTerminal.onOutput(({ sessionId, output }) => {
      const currentBuffer = buffersRef.current.get(sessionId) ?? '';
      const nextBuffer = `${currentBuffer}${output}`.slice(-MAX_BUFFER_LENGTH);
      buffersRef.current.set(sessionId, nextBuffer);
      const cleanedOutput = stripAnsi(output);
      const url = inferUrl(cleanedOutput);

      if (activeIdRef.current === sessionId) {
        try {
          terminalRef.current?.write(output);
        } catch {
          // Ignore transient renderer timing issues while xterm initializes or disposes.
        }
      }

      window.clearTimeout(idleTimersRef.current.get(sessionId));
      idleTimersRef.current.set(
        sessionId,
        window.setTimeout(() => {
          setSessions((current) =>
            current.map((session) =>
              session.id === sessionId && session.status !== 'stopped' ? { ...session, activity: 'idle' } : session,
            ),
          );
        }, IDLE_AFTER_MS),
      );

      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                status: 'ready',
                activity: 'running',
                intent: inferIntent(session.lastCommand, cleanedOutput),
                preview: toPreview(nextBuffer),
                url: url ?? session.url,
              }
            : session,
        ),
      );
    });
    const unsubscribeCwd = window.bcwTerminal.onCwdChange(({ sessionId, cwd }) => {
      setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, cwd } : session)));
    });
    const unsubscribeExit = window.bcwTerminal.onExit(({ sessionId }) => {
      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId ? { ...session, status: 'stopped', activity: 'stopped' } : session,
        ),
      );

      if (activeIdRef.current === sessionId) {
        try {
          terminalRef.current?.write('\r\nPowerShell session stopped.\r\n');
        } catch {
          // Ignore transient renderer timing issues while xterm initializes or disposes.
        }
      }
    });

    window.addEventListener('resize', fit);

    return () => {
      unsubscribeOutput();
      unsubscribeCwd();
      unsubscribeExit();
      window.removeEventListener('resize', fit);
      for (const timerId of idleTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      idleTimersRef.current.clear();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [fit]);

  const stopSession = useCallback(
    (sessionId: string) => {
      window.bcwTerminal.stop(sessionId);
      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId ? { ...session, status: 'stopped', activity: 'stopped' } : session,
        ),
      );

      if (activeIdRef.current === sessionId) {
        renderActiveBuffer(sessionId);
      }
    },
    [renderActiveBuffer],
  );

  const closeSession = useCallback(
    (sessionId: string) => {
      const wasActive = activeIdRef.current === sessionId;
      let nextActiveId: string | null = null;
      let shouldCreateSession = false;

      window.bcwTerminal.stop(sessionId);
      window.clearTimeout(idleTimersRef.current.get(sessionId));
      idleTimersRef.current.delete(sessionId);
      buffersRef.current.delete(sessionId);
      inputBuffersRef.current.delete(sessionId);

      setSessions((current) => {
        const remaining = current.filter((session) => session.id !== sessionId);

        if (remaining.length === 0) {
          shouldCreateSession = true;
          return remaining;
        }

        if (wasActive) {
          nextActiveId = remaining[0].id;
        }

        return remaining;
      });

      if (nextActiveId) {
        selectSession(nextActiveId);
      } else if (wasActive) {
        activeIdRef.current = null;
        setActiveSessionId(null);
        terminalRef.current?.reset();
      }

      if (shouldCreateSession) {
        void createSession();
      }
    },
    [createSession, selectSession],
  );

  const sendCommand = useCallback((command: string) => {
    const sessionId = activeIdRef.current;
    if (!sessionId) {
      return;
    }

    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              activity: 'running',
              intent: inferIntent(command, buffersRef.current.get(sessionId) ?? ''),
              lastCommand: command,
            }
          : session,
      ),
    );
    inputBuffersRef.current.set(sessionId, '');
    window.bcwTerminal.sendData(sessionId, `${command}\r`);
  }, []);

  const getSelectionText = useCallback(() => {
    return terminalRef.current?.getSelection() ?? '';
  }, []);

  const clearSelection = useCallback(() => {
    terminalRef.current?.clearSelection();
  }, []);

  const focusTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.cursorBlink = true;
    terminal.focus();
  }, []);

  return {
    activeSession,
    activeSessionId,
    attachTerminal,
    createSession,
    fit,
    selectSession,
    sendCommand,
    getSelectionText,
    clearSelection,
    focusTerminal,
    sessions,
    closeSession,
    stopSession,
  };
}
