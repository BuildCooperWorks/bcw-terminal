import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import AddIcon from '@mui/icons-material/Add';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import BoltIcon from '@mui/icons-material/Bolt';
import ChatIcon from '@mui/icons-material/Chat';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import GitHubIcon from '@mui/icons-material/GitHub';
import HistoryIcon from '@mui/icons-material/History';
import LanIcon from '@mui/icons-material/Lan';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TerminalIcon from '@mui/icons-material/Terminal';
import TuneIcon from '@mui/icons-material/Tune';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useBcwTerminal, type TerminalSessionView, type TerminalSettings } from '../hooks/useBcwTerminal';
import './terminal.css';

const SETTINGS_STORAGE_KEY = 'bcw-terminal-settings';
const HISTORY_STORAGE_KEY = 'bcw-terminal-command-history';
const DEFAULT_TERMINAL_BACKGROUND_COLOR = '#0d1117';
const DEFAULT_TERMINAL_TEXT_COLOR = '#e6edf3';

type AppLocale = 'ja' | 'en';
type BuiltInMenuKey = 'claude' | 'chatgpt' | 'git' | 'ls' | 'dir' | 'network';
type CommandButtonKey = BuiltInMenuKey | 'edit' | 'history';
type CommandButtonVisibility = Record<CommandButtonKey, boolean>;

type CommandMenuItem = {
  label: string;
  command: string;
  description: string;
};

type CommandMenuConfig = {
  title: string;
  description: string;
  items: CommandMenuItem[];
};

type CommandMenuConfigs = Record<BuiltInMenuKey, CommandMenuConfig>;

type CustomCommandGroup = {
  id: string;
  title: string;
  description: string;
  visible: boolean;
  items: CommandMenuItem[];
};

type CommandHistoryItem = {
  command: string;
  createdAt: number;
  id: string;
  sessionId: string;
};

type CommandConfigDocumentGroup = {
  id: string;
  title: string;
  description?: string;
  visible?: boolean;
  items?: CommandMenuItem[];
};

type CommandConfigDocument = {
  version: 1;
  groupOrder?: string[];
  groups: CommandConfigDocumentGroup[];
};

type PageSettings = TerminalSettings & {
  locale: AppLocale;
  menuConfigs: CommandMenuConfigs;
  customCommandGroups: CustomCommandGroup[];
  groupOrder: string[];
  commandConfigPath?: string;
  showSidebar: boolean;
  hideSidebarWhenSingleSession: boolean;
  commandVisibility: CommandButtonVisibility;
  alwaysOnTop: boolean;
};

type SmartAppControlStatus = {
  status: 'on' | 'eval' | 'off' | 'unknown';
  detail?: string;
};

type AppUpdateStatus = {
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

const BUILT_IN_MENU_ORDER: BuiltInMenuKey[] = ['claude', 'chatgpt', 'git', 'ls', 'dir', 'network'];

const LOCALE_TEXT = {
  en: {
    appUpdate: 'App update',
    appUpdateDescription: 'Check for new versions from GitHub Releases and apply downloaded updates.',
    activityIdle: 'Idle',
    activityRunning: 'Running',
    activityStopped: 'Stopped',
    addItem: 'Add item',
    alwaysOnTop: 'Always on top',
    clearButton: 'Clear',
    clearDescription: 'Clear terminal output.',
    commandButtons: 'Command buttons',
    commandButtonsDescription: 'Show or hide each command button.',
    commandHistory: 'Command history',
    commandHistoryDescription: 'Click an item to run it again.',
    commandManager: 'Command manager',
    commandManagerDescription: 'Create custom groups and edit existing dropdown commands.',
    commandToRun: 'Command',
    confirmBeforeStopping: 'Confirm before stopping',
    copySelection: 'Copy selection',
    customGroup: 'Custom group',
    deleteGroup: 'Delete group',
    deleteGroupTooltip: 'Delete the selected custom group. Built-in groups cannot be deleted.',
    deleteItemTooltip: 'Delete this command item from the selected group.',
    dropdownDescription: 'Description',
    dropdownItemDescription: 'Item description',
    dropdownItemLabel: 'Item label',
    editButton: 'Edit',
    editTooltip: 'Copy / paste / save / interrupt / clear',
    fontFamily: 'Font family',
    fontSize: 'Font size',
    groupTarget: 'Target group',
    groupVisibility: 'Group visibility',
    hideSidebarWhenSingleSession: 'Hide sidebar when single session',
    historyButton: 'History',
    historyTooltip: 'Recent command history',
    clearHistory: 'Clear history',
    clearHistoryDescription: 'Remove saved command history.',
    jsonApply: 'Apply JSON',
    jsonApplyTooltip: 'Apply JSON content to command groups and overwrite current command configuration.',
    jsonEditor: 'JSON editor',
    jsonEditorDescription: 'Edit command groups in JSON format. You can save and load files.',
    jsonLoad: 'Load JSON file',
    jsonLoadTooltip: 'Load command group configuration from a JSON file.',
    jsonSave: 'Save JSON file',
    jsonSaveTooltip: 'Save current command group configuration to a JSON file.',
    language: 'Language',
    lineHeight: 'Line height',
    mkdirDialogTitle: 'Create folder',
    mkdirDialogDescription: 'Enter a folder name.',
    mkdirDialogLabel: 'Folder name',
    manageItems: 'Items',
    menuTitle: 'Button title',
    menuVisible: 'Show this group',
    modeForm: 'Form',
    modeFormTooltip: 'Edit command groups in form mode.',
    modeJson: 'JSON',
    modeJsonTooltip: 'Edit command groups directly in JSON mode.',
    newGroup: 'New custom group',
    newGroupTooltip: 'Create a new editable custom command group.',
    noHistory: 'No command history yet.',
    pasteClipboard: 'Paste clipboard',
    saveTerminalOutput: 'Save terminal output',
    saveTerminalOutputDescription: 'Save the active terminal content as a text file.',
    powerShellStarting: 'Starting PowerShell',
    cancel: 'Cancel',
    create: 'Create',
    resetSettings: 'Reset settings',
    resetSettingsTooltip:
      'Reset all settings to defaults: language, fonts, terminal colors, sidebar options, button visibility, and command groups.',
    runAgain: 'Run',
    sendCtrlC: 'Send Ctrl+C',
    smartAppControlEvalWarning:
      'Smart App Control is in evaluation mode. Command launch can be restricted depending on policy.',
    smartAppControlOnWarning:
      'Smart App Control is ON. Local CLI launch can be blocked. Turn it OFF and reboot if commands fail.',
    sessions: 'Sessions',
    settings: 'Settings',
    openCommandManagerTooltip: 'Open command manager to edit command groups.',
    closeDialogTooltip: 'Close this dialog.',
    createSessionTooltip: 'Start a new PowerShell session.',
    checkUpdates: 'Check updates',
    installUpdate: 'Install update',
    stopSessionTooltip: 'Stop this session.',
    terminalBackgroundColor: 'Terminal background color',
    terminalTextColor: 'Terminal text color',
    terminalTips: [
      'Tip: Press Tab while typing a path or command to cycle completion candidates.',
      'Tip: Use Ctrl+C to interrupt a running command.',
      'Tip: Click a history item to run it again.',
      'Tip: Select terminal text and right-click to copy it.',
      'Tip: Save the active terminal output from Edit.',
    ],
    updateTipAvailable: 'Update available. Open Settings to check and apply it.',
    updateTipDownloaded: 'Update downloaded. Open Settings to apply it.',
    addItemTooltip: 'Add a new command item to the selected group.',
    showSessionSidebar: 'Show session sidebar',
    sidebarAutoHidden: 'Sidebar hidden in single-session mode',
    sidebarCollapse: 'Collapse sidebar',
    sidebarExpand: 'Expand sidebar',
    statusReady: 'Ready',
    statusStarting: 'Starting',
    statusStopped: 'Stopped',
    updateStatusAvailable: 'Update available',
    updateStatusChecking: 'Checking for update...',
    updateStatusDownloaded: 'Update downloaded. Restart to apply.',
    updateStatusDownloading: 'Downloading update...',
    updateStatusError: 'Update check failed.',
    updateStatusIdle: 'Ready to check updates.',
    updateStatusUnsupported: 'Auto update is available in packaged Windows app.',
    updateStatusUpToDate: 'You are up to date.',
  },
  ja: {
    appUpdate: 'アプリ更新',
    appUpdateDescription: 'GitHub Releases から新しいバージョンを確認し、ダウンロード済み更新を適用します。',
    activityIdle: '待機中',
    activityRunning: '実行中',
    activityStopped: '停止中',
    addItem: '項目を追加',
    alwaysOnTop: '最前面に固定',
    clearButton: 'クリア',
    clearDescription: 'ターミナル表示をクリアします。',
    commandButtons: 'コマンドボタン',
    commandButtonsDescription: '表示したいコマンドボタンだけを有効化できます。',
    commandHistory: 'コマンド履歴',
    commandHistoryDescription: 'クリックで再実行できます。',
    commandManager: 'コマンド管理',
    commandManagerDescription: 'カスタムグループ作成とドロップダウン項目を編集できます。',
    commandToRun: '実行コマンド',
    confirmBeforeStopping: '停止前に確認する',
    copySelection: '選択範囲をコピー',
    customGroup: 'カスタムグループ',
    deleteGroup: 'グループ削除',
    deleteGroupTooltip: '選択中のカスタムグループを削除します（標準グループは削除不可）。',
    deleteItemTooltip: '選択中グループからこのコマンド項目を削除します。',
    dropdownDescription: '説明',
    dropdownItemDescription: '項目説明',
    dropdownItemLabel: '項目名',
    editButton: '編集',
    editTooltip: 'コピー / 貼り付け / 保存 / 割り込み / クリア',
    fontFamily: 'フォント',
    fontSize: 'フォントサイズ',
    groupTarget: '編集対象グループ',
    groupVisibility: 'グループ表示',
    hideSidebarWhenSingleSession: '単一セッション時はサイドバーを非表示',
    historyButton: '履歴',
    historyTooltip: '最近のコマンド履歴',
    clearHistory: '履歴をクリア',
    clearHistoryDescription: '保存済みのコマンド履歴を削除します。',
    jsonApply: 'JSONを反映',
    jsonApplyTooltip: 'JSON内容を現在のコマンド設定へ反映して上書きします。',
    jsonEditor: 'JSON編集',
    jsonEditorDescription: 'JSON形式でコマンドを編集できます。保存と読み込みにも対応します。',
    jsonLoad: 'JSONファイルを読み込み',
    jsonLoadTooltip: 'JSONファイルからコマンド設定を読み込みます。',
    jsonSave: 'JSONファイルに保存',
    jsonSaveTooltip: '現在のコマンド設定をJSONファイルへ保存します。',
    language: '表示言語',
    lineHeight: '行間',
    mkdirDialogTitle: 'フォルダーを作成',
    mkdirDialogDescription: '作成するフォルダー名を入力してください。',
    mkdirDialogLabel: 'フォルダー名',
    manageItems: '項目一覧',
    menuTitle: 'ボタン名',
    menuVisible: 'このグループを表示',
    modeForm: 'フォーム編集',
    modeFormTooltip: 'フォーム形式でコマンド設定を編集します。',
    modeJson: 'JSON編集',
    modeJsonTooltip: 'JSONを直接編集してコマンド設定を管理します。',
    newGroup: '新しいカスタムグループ',
    newGroupTooltip: '編集可能なカスタムコマンドグループを新規作成します。',
    noHistory: '履歴はまだありません。',
    pasteClipboard: 'クリップボードを貼り付け',
    saveTerminalOutput: 'ターミナル出力を保存',
    saveTerminalOutputDescription: 'アクティブなターミナル内容をテキストファイルに保存します。',
    powerShellStarting: 'PowerShell を起動中',
    cancel: 'キャンセル',
    create: '作成',
    resetSettings: '設定をリセット',
    resetSettingsTooltip:
      '表示言語・フォント・ターミナル色設定・サイドバー設定・ボタン表示・コマンド設定を初期値に戻します。',
    runAgain: '再実行',
    sendCtrlC: 'Ctrl+C を送信',
    smartAppControlEvalWarning:
      'Smart App Control が評価モードです。ポリシーにより一部コマンド起動が制限される場合があります。',
    smartAppControlOnWarning:
      'Smart App Control が ON のため、ローカルCLI起動がブロックされる場合があります。失敗する場合は OFF にして再起動してください。',
    sessions: 'セッション',
    settings: '設定',
    openCommandManagerTooltip: 'コマンド管理画面を開きます。',
    closeDialogTooltip: 'このダイアログを閉じます。',
    createSessionTooltip: '新しい PowerShell セッションを起動します。',
    checkUpdates: '更新を確認',
    installUpdate: '更新を適用',
    stopSessionTooltip: 'このセッションを停止します。',
    terminalBackgroundColor: 'ターミナル背景色',
    terminalTextColor: 'ターミナル文字色',
    terminalTips: [
      'Tips: 入力途中で Tab キーを押すと、候補を補完できます。',
      'Tips: 実行中のコマンドは Ctrl+C で中断できます。',
      'Tips: 履歴の項目をクリックすると、もう一度実行できます。',
      'Tips: ターミナルの選択範囲を右クリックするとコピーできます。',
      'Tips: 編集メニューからアクティブなターミナル内容を保存できます。',
    ],
    updateTipAvailable: 'バージョンアップがあります。設定から確認・適用できます。',
    updateTipDownloaded: '更新のダウンロードが完了しました。設定から適用できます。',
    addItemTooltip: '選択中グループにコマンド項目を追加します。',
    showSessionSidebar: 'セッションサイドバーを表示',
    sidebarAutoHidden: '単一セッションではサイドバーを自動非表示',
    sidebarCollapse: 'サイドバーを折りたたむ',
    sidebarExpand: 'サイドバーを展開',
    statusReady: 'Ready',
    statusStarting: '起動中',
    statusStopped: '停止中',
    updateStatusAvailable: '更新があります',
    updateStatusChecking: '更新を確認中...',
    updateStatusDownloaded: '更新のダウンロードが完了しました。再起動して適用できます。',
    updateStatusDownloading: '更新をダウンロード中...',
    updateStatusError: '更新の確認に失敗しました。',
    updateStatusIdle: '更新確認の準備ができています。',
    updateStatusUnsupported: '自動更新はパッケージ化した Windows アプリで利用できます。',
    updateStatusUpToDate: '最新バージョンです。',
  },
} as const;

const DEFAULT_COMMAND_BUTTON_VISIBILITY: CommandButtonVisibility = {
  claude: false,
  chatgpt: false,
  git: false,
  ls: false,
  dir: true,
  network: false,
  edit: true,
  history: true,
};

const DEFAULT_MENU_CONFIGS: CommandMenuConfigs = {
  claude: {
    title: 'Claude',
    description: 'Claude Code の実行コマンド。',
    items: [
      { label: 'Claude 起動', command: 'claude', description: 'Claude Code を起動します。' },
      { label: '続きから起動', command: 'claude --continue', description: '直前セッションの続きを開始します。' },
      { label: '履歴から再開', command: 'claude --resume', description: '過去セッションから再開します。' },
      { label: 'exit', command: 'exit', description: 'AI CLI を終了します。' },
    ],
  },
  chatgpt: {
    title: 'ChatGPT',
    description: 'Codex CLI の実行コマンド。',
    items: [
      { label: 'Codex 起動', command: 'codex', description: 'Codex CLI を起動します。' },
      { label: 'セッション再開', command: 'codex resume', description: '過去の Codex セッションを再開します。' },
      { label: 'ログイン', command: 'codex login', description: 'Codex CLI にログインします。' },
      { label: 'exit', command: 'exit', description: 'AI CLI を終了します。' },
    ],
  },
  git: {
    title: 'Git',
    description: 'Git コマンドのショートカット。',
    items: [
      { label: '状態確認', command: 'git status', description: '作業ツリーの状態を表示します。' },
      { label: 'pull', command: 'git pull', description: 'リモートの最新を取得します。' },
      { label: 'ログ (10件)', command: 'git log --oneline -10', description: '直近10件のログを表示します。' },
      { label: 'diff', command: 'git diff', description: '未ステージ変更の差分を表示します。' },
      { label: 'ステージ差分', command: 'git diff --cached', description: 'ステージ済み差分を表示します。' },
      { label: 'branch 一覧', command: 'git branch', description: 'ローカルブランチ一覧を表示します。' },
    ],
  },
  ls: {
    title: 'ls',
    description: '一覧表示コマンド。',
    items: [
      { label: '通常', command: 'ls', description: '現在ディレクトリを一覧表示します。' },
      { label: '詳細', command: 'ls -l', description: '詳細情報付きで表示します。' },
      { label: '隠し含む', command: 'ls -Force', description: '隠しファイルを含めて表示します。' },
      { label: '名前のみ', command: 'Get-ChildItem -Name', description: '名前だけを表示します。' },
      { label: '再帰', command: 'Get-ChildItem -Recurse', description: '配下を再帰的に表示します。' },
    ],
  },
  dir: {
    title: 'ディレクトリ',
    description: 'Windows 向け一覧表示 / ディレクトリ操作コマンド。',
    items: [
      { label: '通常', command: 'dir', description: '現在ディレクトリを一覧表示します。' },
      { label: '隠し含む', command: 'dir /a', description: '隠しファイルを含めて表示します。' },
      { label: '詳細', command: 'dir /q', description: '所有者情報付きで表示します。' },
      { label: '日付順', command: 'dir /o:-d', description: '更新日時の降順で表示します。' },
      { label: 'tree', command: 'tree', description: '現在ディレクトリ配下のフォルダー構成を表示します。' },
      { label: '現在位置', command: 'Get-Location', description: '現在の作業ディレクトリを表示します。' },
      { label: '1階層上へ', command: 'cd ..', description: '親ディレクトリへ移動します。' },
      { label: 'ホームへ', command: 'cd ~', description: 'ホームディレクトリへ移動します。' },
      { label: '新規作成', command: 'mkdir ', description: 'クリック後の入力ダイアログで任意のフォルダー名を指定して作成します。' },
    ],
  },
  network: {
    title: 'Network',
    description: 'ネットワーク診断コマンド。',
    items: [
      { label: 'ipconfig', command: 'ipconfig', description: '現在のIP設定を表示します。' },
      { label: 'ipconfig /all', command: 'ipconfig /all', description: '詳細なIP設定を表示します。' },
      { label: 'ipconfig /flushdns', command: 'ipconfig /flushdns', description: 'DNSキャッシュをクリアします。' },
      { label: 'ipconfig /displaydns', command: 'ipconfig /displaydns', description: 'DNSキャッシュ内容を表示します。' },
      { label: 'net user', command: 'net user', description: 'ローカルユーザー一覧を表示します。' },
      { label: 'net use', command: 'net use', description: 'ネットワーク接続を表示します。' },
      { label: 'net share', command: 'net share', description: '共有設定を表示します。' },
      { label: 'tracert 8.8.8.8', command: 'tracert 8.8.8.8', description: 'Google DNSまでの経路を確認します。' },
      { label: 'tracert -d 8.8.8.8', command: 'tracert -d 8.8.8.8', description: '名前解決なしで経路を確認します。' },
      { label: 'tracert localhost', command: 'tracert localhost', description: 'ローカルへの経路を確認します。' },
    ],
  },
};

const DEFAULT_SETTINGS: PageSettings = {
  locale: 'ja',
  confirmStop: true,
  fontFamily: '"Cascadia Mono", "Consolas", monospace',
  fontSize: 14,
  lineHeight: 1.35,
  terminalBackgroundColor: DEFAULT_TERMINAL_BACKGROUND_COLOR,
  terminalTextColor: DEFAULT_TERMINAL_TEXT_COLOR,
  showSidebar: true,
  hideSidebarWhenSingleSession: true,
  commandVisibility: { ...DEFAULT_COMMAND_BUTTON_VISIBILITY },
  menuConfigs: { ...DEFAULT_MENU_CONFIGS },
  customCommandGroups: [],
  groupOrder: [...BUILT_IN_MENU_ORDER],
  alwaysOnTop: false,
};

function createDefaultSettings(): PageSettings {
  const menuConfigs = Object.fromEntries(
    BUILT_IN_MENU_ORDER.map((key) => [key, { ...DEFAULT_MENU_CONFIGS[key], items: [...DEFAULT_MENU_CONFIGS[key].items] }]),
  ) as CommandMenuConfigs;

  return {
    ...DEFAULT_SETTINGS,
    commandVisibility: { ...DEFAULT_COMMAND_BUTTON_VISIBILITY },
    menuConfigs,
    customCommandGroups: [],
    groupOrder: [...BUILT_IN_MENU_ORDER],
  };
}

function normalizeColor(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function mergeMenuItemsWithDefaults(savedItems: unknown, defaultItems: CommandMenuItem[]) {
  if (!Array.isArray(savedItems)) {
    return [...defaultItems];
  }

  const validSavedItems = savedItems.filter(
    (item): item is CommandMenuItem =>
      Boolean(item) &&
      typeof (item as CommandMenuItem).label === 'string' &&
      typeof (item as CommandMenuItem).command === 'string' &&
      typeof (item as CommandMenuItem).description === 'string',
  );

  const existingCommands = new Set(validSavedItems.map((item) => item.command.trim().toLowerCase()));
  const missingDefaultItems = defaultItems.filter((item) => !existingCommands.has(item.command.trim().toLowerCase()));

  return [...validSavedItems, ...missingDefaultItems];
}

function migrateLegacyDirItems(items: CommandMenuItem[]) {
  return items
    .filter((item) => {
      const normalizedCommand = item.command.trim().toLowerCase();
      if (normalizedCommand === 'dir /s') {
        return false;
      }
      if (normalizedCommand === 'mkdir .\\work\\scratch -force') {
        return false;
      }
      return true;
    })
    .map((item) => {
      const normalizedCommand = item.command.trim().toLowerCase();
      if (normalizedCommand !== 'mkdir new-folder' && normalizedCommand !== 'mkdir') {
        return item;
      }

      return {
        label: '新規作成',
        command: 'mkdir ',
        description: 'クリック後の入力ダイアログで任意のフォルダー名を指定して作成します。',
      };
    });
}

function dedupeMenuItems(items: CommandMenuItem[]) {
  const seen = new Set<string>();
  const deduped: CommandMenuItem[] = [];

  for (const item of items) {
    const key = `${item.label.trim().toLowerCase()}::${item.command.trim().toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function loadSettings(): PageSettings {
  try {
    const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!saved) {
      return createDefaultSettings();
    }

    const parsed = JSON.parse(saved) as Partial<PageSettings>;
    const defaults = createDefaultSettings();

    const menuConfigs = { ...defaults.menuConfigs };
    for (const key of BUILT_IN_MENU_ORDER) {
      const savedConfig = parsed.menuConfigs?.[key];
      if (!savedConfig) {
        continue;
      }

      const mergedItems = mergeMenuItemsWithDefaults(savedConfig.items, defaults.menuConfigs[key].items);
      const normalizedItems = key === 'dir' ? dedupeMenuItems(migrateLegacyDirItems(mergedItems)) : dedupeMenuItems(mergedItems);

      menuConfigs[key] = {
        title:
          key === 'dir' && (savedConfig.title === 'dir' || !savedConfig.title)
            ? defaults.menuConfigs[key].title
            : (savedConfig.title ?? defaults.menuConfigs[key].title),
        description: savedConfig.description ?? defaults.menuConfigs[key].description,
        items: normalizedItems,
      };
    }

    const customCommandGroups = Array.isArray(parsed.customCommandGroups)
      ? parsed.customCommandGroups
          .filter((group) => group && typeof group.id === 'string')
          .map((group) => ({
            id: group.id,
            title: group.title || 'MyCommand',
            description: group.description || '',
            visible: group.visible ?? true,
            items: Array.isArray(group.items) ? group.items : [],
          }))
      : [];

    const allGroupIds = new Set<string>([
      ...BUILT_IN_MENU_ORDER,
      ...customCommandGroups.map((group) => group.id),
    ]);
    const baseOrder = Array.isArray(parsed.groupOrder)
      ? parsed.groupOrder.filter((groupId): groupId is string => typeof groupId === 'string' && allGroupIds.has(groupId))
      : [];
    const missing = [...allGroupIds].filter((groupId) => !baseOrder.includes(groupId));
    const groupOrder = [...baseOrder, ...missing];

    return {
      ...defaults,
      ...parsed,
      terminalBackgroundColor: normalizeColor(parsed.terminalBackgroundColor, defaults.terminalBackgroundColor),
      terminalTextColor: normalizeColor(parsed.terminalTextColor, defaults.terminalTextColor),
      commandVisibility: {
        ...DEFAULT_COMMAND_BUTTON_VISIBILITY,
        ...parsed.commandVisibility,
      },
      menuConfigs,
      customCommandGroups,
      groupOrder,
      alwaysOnTop: Boolean(parsed.alwaysOnTop),
    };
  } catch {
    return createDefaultSettings();
  }
}

function loadHistory(): CommandHistoryItem[] {
  const sanitizeHistoryCommand = (value: string) =>
    value
      .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\x1B[@-_]/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim();

  try {
    const saved = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved) as CommandHistoryItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .slice(0, 200)
      .map((item) => {
        const original = String(item.command ?? '').trim();
        const sanitized = sanitizeHistoryCommand(original);
        return {
          ...item,
          command: sanitized || original,
        };
      })
      .filter((item) => item.command.length > 0);
  } catch {
    return [];
  }
}

function buildCommandConfigDocument(settings: PageSettings): CommandConfigDocument {
  const builtIns: CommandConfigDocumentGroup[] = BUILT_IN_MENU_ORDER.map((key) => ({
    id: key,
    title: settings.menuConfigs[key].title,
    description: settings.menuConfigs[key].description,
    visible: settings.commandVisibility[key],
    items: settings.menuConfigs[key].items,
  }));
  const customs: CommandConfigDocumentGroup[] = settings.customCommandGroups.map((group) => ({
    id: group.id,
    title: group.title,
    description: group.description,
    visible: group.visible,
    items: group.items,
  }));

  return {
    version: 1,
    groupOrder: settings.groupOrder,
    groups: [...builtIns, ...customs],
  };
}

function applyCommandConfigDocument(
  document: CommandConfigDocument,
  currentSettings: PageSettings,
): PageSettings {
  const next = createDefaultSettings();
  next.locale = currentSettings.locale;
  next.fontFamily = currentSettings.fontFamily;
  next.fontSize = currentSettings.fontSize;
  next.lineHeight = currentSettings.lineHeight;
  next.terminalBackgroundColor = currentSettings.terminalBackgroundColor;
  next.terminalTextColor = currentSettings.terminalTextColor;
  next.confirmStop = currentSettings.confirmStop;
  next.showSidebar = currentSettings.showSidebar;
  next.hideSidebarWhenSingleSession = currentSettings.hideSidebarWhenSingleSession;
  next.alwaysOnTop = currentSettings.alwaysOnTop;
  next.commandConfigPath = currentSettings.commandConfigPath;
  next.commandVisibility = {
    ...currentSettings.commandVisibility,
    claude: currentSettings.commandVisibility.claude,
    chatgpt: currentSettings.commandVisibility.chatgpt,
    git: currentSettings.commandVisibility.git,
    ls: currentSettings.commandVisibility.ls,
    dir: currentSettings.commandVisibility.dir,
    network: currentSettings.commandVisibility.network,
  };

  const groups = Array.isArray(document.groups) ? document.groups : [];
  const builtInSet = new Set<BuiltInMenuKey>(BUILT_IN_MENU_ORDER);
  const customGroups: CustomCommandGroup[] = [];

  for (const group of groups) {
    if (!group || typeof group.id !== 'string') {
      continue;
    }

    const normalizedItems = Array.isArray(group.items)
      ? group.items
          .filter((item) => item && typeof item.command === 'string')
          .map((item) => ({
            label: item.label || item.command,
            command: item.command,
            description: item.description || '-',
          }))
      : [];

    if (builtInSet.has(group.id as BuiltInMenuKey)) {
      const key = group.id as BuiltInMenuKey;
      next.menuConfigs[key] = {
        title: group.title || next.menuConfigs[key].title,
        description: group.description || next.menuConfigs[key].description,
        items: normalizedItems.length > 0 ? normalizedItems : next.menuConfigs[key].items,
      };
      if (typeof group.visible === 'boolean') {
        next.commandVisibility[key] = group.visible;
      }
      continue;
    }

    customGroups.push({
      id: group.id,
      title: group.title || 'MyCommand',
      description: group.description || '',
      visible: group.visible ?? true,
      items: normalizedItems,
    });
  }

  next.customCommandGroups = customGroups;

  const allGroupIds = new Set<string>([
    ...BUILT_IN_MENU_ORDER,
    ...customGroups.map((group) => group.id),
  ]);
  const baseOrder = Array.isArray(document.groupOrder)
    ? document.groupOrder.filter((groupId): groupId is string => typeof groupId === 'string' && allGroupIds.has(groupId))
    : [];
  const missing = [...allGroupIds].filter((groupId) => !baseOrder.includes(groupId));
  next.groupOrder = [...baseOrder, ...missing];

  return next;
}

function getStatusLabel(status: TerminalSessionView['status'], locale: AppLocale) {
  const text = LOCALE_TEXT[locale];
  if (status === 'ready') {
    return text.statusReady;
  }
  if (status === 'starting') {
    return text.statusStarting;
  }
  return text.statusStopped;
}

function getStatusDescription(status: TerminalSessionView['status'], locale: AppLocale) {
  if (locale === 'ja') {
    if (status === 'ready') {
      return 'PowerShell セッションはコマンド入力を受け付けています。';
    }
    if (status === 'starting') {
      return 'PowerShell セッションを起動中です。';
    }
    return 'PowerShell セッションは停止中です。再起動で再開できます。';
  }

  if (status === 'ready') {
    return 'PowerShell session is ready.';
  }
  if (status === 'starting') {
    return 'Starting PowerShell session.';
  }
  return 'PowerShell session is stopped.';
}

function getAppUpdateStatusText(update: AppUpdateStatus, locale: AppLocale) {
  const text = LOCALE_TEXT[locale];
  switch (update.status) {
    case 'checking':
      return text.updateStatusChecking;
    case 'available':
      return update.updateVersion ? `${text.updateStatusAvailable}: v${update.updateVersion}` : text.updateStatusAvailable;
    case 'downloading':
      return update.progress != null
        ? `${text.updateStatusDownloading} (${Math.round(update.progress)}%)`
        : text.updateStatusDownloading;
    case 'downloaded':
      return update.updateVersion
        ? `${text.updateStatusDownloaded} (v${update.updateVersion})`
        : text.updateStatusDownloaded;
    case 'up-to-date':
      return text.updateStatusUpToDate;
    case 'error':
      return update.error ? `${text.updateStatusError} ${update.error}` : text.updateStatusError;
    case 'unsupported':
      return text.updateStatusUnsupported;
    case 'idle':
    default:
      return text.updateStatusIdle;
  }
}

function getHeaderTipText(update: AppUpdateStatus, locale: AppLocale, fallbackTip: string) {
  const text = LOCALE_TEXT[locale];
  if (update.status === 'downloaded') {
    return text.updateTipDownloaded;
  }
  if (update.status === 'available') {
    return text.updateTipAvailable;
  }
  return fallbackTip;
}

function makeGroupId() {
  return `custom-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function TerminalPage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mkdirInputRef = useRef<HTMLInputElement | null>(null);
  const previousSessionCommandsRef = useRef<Record<string, string>>({});

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandManagerOpen, setCommandManagerOpen] = useState(false);

  const [aiMenuAnchor, setAiMenuAnchor] = useState<HTMLElement | null>(null);
  const [activeAiMenu, setActiveAiMenu] = useState<'claude' | 'chatgpt' | null>(null);
  const [gitMenuAnchor, setGitMenuAnchor] = useState<HTMLElement | null>(null);
  const [listMenuAnchor, setListMenuAnchor] = useState<HTMLElement | null>(null);
  const [dirMenuAnchor, setDirMenuAnchor] = useState<HTMLElement | null>(null);
  const [networkMenuAnchor, setNetworkMenuAnchor] = useState<HTMLElement | null>(null);
  const [editMenuAnchor, setEditMenuAnchor] = useState<HTMLElement | null>(null);
  const [historyMenuAnchor, setHistoryMenuAnchor] = useState<HTMLElement | null>(null);
  const [customMenuAnchor, setCustomMenuAnchor] = useState<HTMLElement | null>(null);
  const [customMenuTargetId, setCustomMenuTargetId] = useState<string | null>(null);

  const [settings, setSettings] = useState<PageSettings>(loadSettings);
  const [smartAppControl, setSmartAppControl] = useState<SmartAppControlStatus>({ status: 'unknown' });
  const [appUpdate, setAppUpdate] = useState<AppUpdateStatus>({ supported: false, status: 'idle' });
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>(loadHistory);
  const [commandConfigJson, setCommandConfigJson] = useState('');
  const [commandConfigMessage, setCommandConfigMessage] = useState('');
  const [tipIndex, setTipIndex] = useState(0);
  const [commandManagerMode, setCommandManagerMode] = useState<'form' | 'json'>('form');
  const [mkdirDialogOpen, setMkdirDialogOpen] = useState(false);
  const [mkdirFolderName, setMkdirFolderName] = useState('');

  const [managerTargetKey, setManagerTargetKey] = useState<string>('claude');
  const [newItemLabel, setNewItemLabel] = useState('');
  const [newItemCommand, setNewItemCommand] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');

  const terminalSettings = useMemo<TerminalSettings>(
    () => ({
      confirmStop: settings.confirmStop,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      terminalBackgroundColor: settings.terminalBackgroundColor,
      terminalTextColor: settings.terminalTextColor,
    }),
    [
      settings.confirmStop,
      settings.fontFamily,
      settings.fontSize,
      settings.lineHeight,
      settings.terminalBackgroundColor,
      settings.terminalTextColor,
    ],
  );

  const {
    activeSession,
    activeSessionId,
    attachTerminal,
    closeSession,
    createSession,
    fit,
    getActiveBufferText,
    getSelectionText,
    clearSelection,
    focusTerminal,
    selectSession,
    sendCommand,
    sessions,
  } =
    useBcwTerminal(terminalSettings);

  const text = LOCALE_TEXT[settings.locale];
  const status = activeSession?.status ?? 'starting';
  const terminalTips = text.terminalTips;
  const hasUpdateTip = appUpdate.status === 'available' || appUpdate.status === 'downloaded';
  const headerTipText = getHeaderTipText(
    appUpdate,
    settings.locale,
    terminalTips[tipIndex % terminalTips.length] ?? '',
  );
  const shouldShowSidebar =
    settings.showSidebar && (!settings.hideSidebarWhenSingleSession || sessions.length > 1);

  useEffect(() => {
    const serialized = JSON.stringify(buildCommandConfigDocument(settings), null, 2);
    setCommandConfigJson(serialized);
  }, [settings.menuConfigs, settings.customCommandGroups, settings.groupOrder, settings.commandVisibility]);

  useEffect(() => {
    if (!managerTargetKey) {
      setManagerTargetKey(settings.groupOrder[0] ?? 'claude');
      return;
    }

    const exists =
      BUILT_IN_MENU_ORDER.includes(managerTargetKey as BuiltInMenuKey) ||
      settings.customCommandGroups.some((group) => group.id === managerTargetKey);
    if (!exists) {
      setManagerTargetKey(settings.groupOrder[0] ?? 'claude');
    }
  }, [managerTargetKey, settings.customCommandGroups, settings.groupOrder]);

  useEffect(() => {
    if (hostRef.current) {
      attachTerminal(hostRef.current);
    }
  }, [attachTerminal]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(fit);
    return () => window.cancelAnimationFrame(frame);
  }, [fit]);

  useEffect(() => {
    if (hasUpdateTip || terminalTips.length <= 1) {
      return;
    }

    const timerId = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % terminalTips.length);
    }, 60_000);

    return () => window.clearInterval(timerId);
  }, [hasUpdateTip, terminalTips.length]);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(commandHistory.slice(0, 200)));
  }, [commandHistory]);

  useEffect(() => {
    void window.bcwTerminal.setLocale(settings.locale);
  }, [settings.locale]);

  useEffect(() => {
    let active = true;
    void window.bcwTerminal.getSmartAppControlState().then((state) => {
      if (!active) {
        return;
      }
      setSmartAppControl(state);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void window.bcwTerminal.getAppUpdateState().then((state) => {
      if (!active) {
        return;
      }
      setAppUpdate(state);
    });

    const unsubscribe = window.bcwTerminal.onAppUpdateStatus((state) => {
      if (!active) {
        return;
      }
      setAppUpdate(state);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    void window.bcwTerminal
      .getWindowState()
      .then((snapshot) => {
        setSettings((current) => ({ ...current, alwaysOnTop: snapshot.alwaysOnTop }));
      })
      .catch(() => {
        // Ignore transient IPC unavailability during dev hot reload.
      });
  }, []);

  useEffect(() => {
    if (!mkdirDialogOpen) {
      return;
    }

    const timerId = window.setTimeout(() => {
      mkdirInputRef.current?.focus();
      mkdirInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [mkdirDialogOpen]);

  const appendCommandHistory = (command: string, sessionId: string) => {
    const normalized = command.trim();
    if (!normalized) {
      return;
    }

    setCommandHistory((current) => {
      const now = Date.now();
      const latest = current[0];
      if (
        latest &&
        latest.command === normalized &&
        latest.sessionId === sessionId &&
        now - latest.createdAt < 1_000
      ) {
        return current;
      }

      return [
        { command: normalized, createdAt: now, id: `${now}-${Math.random().toString(16).slice(2)}`, sessionId },
        ...current,
      ].slice(0, 200);
    });
  };

  useEffect(() => {
    for (const session of sessions) {
      const previous = previousSessionCommandsRef.current[session.id] ?? '';
      if (session.lastCommand && session.lastCommand !== previous) {
        appendCommandHistory(session.lastCommand, session.id);
      }
      previousSessionCommandsRef.current[session.id] = session.lastCommand;
    }
  }, [sessions]);

  const normalizeCommandForExecution = (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) {
      return trimmed;
    }

    if (/^cmd(\.exe)?\s+\/d?\s*\/c\s+dir(\s|$)/i.test(trimmed) || /^cmd(\.exe)?\s+\/c\s+dir(\s|$)/i.test(trimmed)) {
      return trimmed;
    }

    if (/^dir(\s|$)/i.test(trimmed)) {
      return `cmd /d /c ${trimmed}`;
    }

    return command;
  };

  const resolveCommandForExecution = (command: string) => {
    if (/^mkdir(?:\s+new-folder)?\s*$/i.test(command)) {
      setMkdirFolderName('');
      setMkdirDialogOpen(true);
      return null;
    }

    return normalizeCommandForExecution(command);
  };

  const runCommand = (command: string) => {
    if (!activeSessionId) {
      return;
    }

    const resolvedCommand = resolveCommandForExecution(command);
    if (!resolvedCommand) {
      return;
    }

    sendCommand(resolvedCommand);
    appendCommandHistory(resolvedCommand, activeSessionId);
    window.requestAnimationFrame(() => {
      focusTerminal();
    });
  };

  const handleMkdirFromDialog = () => {
    if (!activeSessionId) {
      setMkdirDialogOpen(false);
      return;
    }

    const normalized = mkdirFolderName.trim();
    if (!normalized) {
      return;
    }

    const escaped = normalized.replace(/"/g, '`"');
    const resolvedCommand = `mkdir "${escaped}"`;
    sendCommand(resolvedCommand);
    appendCommandHistory(resolvedCommand, activeSessionId);
    setMkdirDialogOpen(false);
    setMkdirFolderName('');
    window.requestAnimationFrame(() => {
      focusTerminal();
    });
  };

  const handleCheckForAppUpdate = async () => {
    try {
      await window.bcwTerminal.checkForAppUpdate();
    } catch {
      setAppUpdate((current) => ({
        ...current,
        status: 'error',
      }));
    }
  };

  const handleInstallDownloadedUpdate = async () => {
    try {
      await window.bcwTerminal.installDownloadedAppUpdate();
    } catch {
      setAppUpdate((current) => ({
        ...current,
        status: 'error',
      }));
    }
  };

  const handleStopSession = (session: TerminalSessionView) => {
    if (settings.confirmStop && session.status !== 'stopped') {
      const shouldStop = window.confirm(`${session.title} を停止しますか？`);
      if (!shouldStop) {
        return;
      }
    }

    closeSession(session.id);
  };

  const handleCopySelection = async () => {
    const selectedText = getSelectionText() || window.getSelection()?.toString() || '';
    if (!selectedText.trim()) {
      setEditMenuAnchor(null);
      window.requestAnimationFrame(() => {
        focusTerminal();
      });
      return;
    }
    await window.bcwTerminal.writeClipboardText(selectedText);
    clearSelection();
    setEditMenuAnchor(null);
    window.requestAnimationFrame(() => {
      focusTerminal();
    });
  };

  const handleTerminalContextMenu = async (event: MouseEvent<HTMLDivElement>) => {
    const selectedText = getSelectionText() || window.getSelection()?.toString() || '';
    if (!selectedText.trim()) {
      return;
    }

    event.preventDefault();
    await window.bcwTerminal.writeClipboardText(selectedText);
    clearSelection();
    window.requestAnimationFrame(() => {
      focusTerminal();
    });
  };

  const handlePasteClipboard = async () => {
    if (!activeSessionId || !activeSession || activeSession.status === 'stopped') {
      setEditMenuAnchor(null);
      window.requestAnimationFrame(() => {
        focusTerminal();
      });
      return;
    }

    const clipboardText = await window.bcwTerminal.readClipboardText();
    if (!clipboardText) {
      setEditMenuAnchor(null);
      window.requestAnimationFrame(() => {
        focusTerminal();
      });
      return;
    }

    const pastedCommands = clipboardText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    window.bcwTerminal.sendData(activeSessionId, clipboardText);
    for (const command of pastedCommands) {
      appendCommandHistory(command, activeSessionId);
    }
    setEditMenuAnchor(null);
    window.requestAnimationFrame(() => {
      focusTerminal();
    });
  };

  const handleSaveTerminalOutput = async () => {
    const output = getActiveBufferText();
    if (!output.trim()) {
      setEditMenuAnchor(null);
      window.requestAnimationFrame(() => {
        focusTerminal();
      });
      return;
    }

    await window.bcwTerminal.saveTerminalOutputFile(output);
    setEditMenuAnchor(null);
    window.requestAnimationFrame(() => {
      focusTerminal();
    });
  };

  const handleSendCtrlC = () => {
    if (!activeSessionId || !activeSession || activeSession.status === 'stopped') {
      setEditMenuAnchor(null);
      window.requestAnimationFrame(() => {
        focusTerminal();
      });
      return;
    }

    window.bcwTerminal.sendData(activeSessionId, '\x03');
    setEditMenuAnchor(null);
    window.requestAnimationFrame(() => {
      focusTerminal();
    });
  };

  const handleClearHistory = () => {
    setCommandHistory([]);
    setHistoryMenuAnchor(null);
    window.requestAnimationFrame(() => {
      focusTerminal();
    });
  };

  const handleHeaderTipClick = () => {
    if (hasUpdateTip) {
      setSettingsOpen(true);
      return;
    }

    if (terminalTips.length > 1) {
      setTipIndex((current) => (current + 1) % terminalTips.length);
    }
  };

  const updateBuiltInMenu = (key: BuiltInMenuKey, updater: (current: CommandMenuConfig) => CommandMenuConfig) => {
    setSettings((current) => ({
      ...current,
      menuConfigs: {
        ...current.menuConfigs,
        [key]: updater(current.menuConfigs[key]),
      },
    }));
  };

  const updateCustomGroup = (id: string, updater: (current: CustomCommandGroup) => CustomCommandGroup) => {
    setSettings((current) => ({
      ...current,
      customCommandGroups: current.customCommandGroups.map((group) => (group.id === id ? updater(group) : group)),
    }));
  };

  const customMap = new Map(settings.customCommandGroups.map((group) => [group.id, group]));
  const managerTargets = settings.groupOrder
    .map((groupId) => {
      if (BUILT_IN_MENU_ORDER.includes(groupId as BuiltInMenuKey)) {
        const key = groupId as BuiltInMenuKey;
        return { key, label: settings.menuConfigs[key].title || key, isBuiltIn: true };
      }
      const custom = customMap.get(groupId);
      if (!custom) {
        return null;
      }
      return { key: custom.id, label: custom.title, isBuiltIn: false };
    })
    .filter((item): item is { key: string; label: string; isBuiltIn: boolean } => item !== null);

  const selectedBuiltInKey = BUILT_IN_MENU_ORDER.find((key) => key === managerTargetKey) ?? null;
  const selectedCustomGroup =
    settings.customCommandGroups.find((group) => group.id === managerTargetKey) ?? null;
  const managerGroupConfig = selectedBuiltInKey
    ? settings.menuConfigs[selectedBuiltInKey]
    : selectedCustomGroup;

  const addManagerItem = () => {
    const command = newItemCommand.trim();
    if (!command || !managerGroupConfig) {
      return;
    }

    const item: CommandMenuItem = {
      label: newItemLabel.trim() || command,
      command,
      description: newItemDescription.trim() || '-',
    };

    if (selectedBuiltInKey) {
      updateBuiltInMenu(selectedBuiltInKey, (current) => ({ ...current, items: [...current.items, item] }));
    } else if (selectedCustomGroup) {
      updateCustomGroup(selectedCustomGroup.id, (current) => ({ ...current, items: [...current.items, item] }));
    }

    setNewItemLabel('');
    setNewItemCommand('');
    setNewItemDescription('');
  };

  const removeManagerItem = (index: number) => {
    if (!managerGroupConfig) {
      return;
    }
    if (selectedBuiltInKey) {
      updateBuiltInMenu(selectedBuiltInKey, (current) => ({
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      }));
      return;
    }

    if (selectedCustomGroup) {
      updateCustomGroup(selectedCustomGroup.id, (current) => ({
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      }));
    }
  };

  const handleCreateCustomGroup = () => {
    const id = makeGroupId();
    const next: CustomCommandGroup = {
      id,
      title: 'MyCommand',
      description: 'カスタムコマンドグループ',
      visible: true,
      items: [],
    };
    setSettings((current) => ({
      ...current,
      customCommandGroups: [...current.customCommandGroups, next],
      groupOrder: [...current.groupOrder, id],
    }));
    setManagerTargetKey(id);
  };

  const handleDeleteCurrentCustomGroup = () => {
    if (!selectedCustomGroup) {
      return;
    }
    setSettings((current) => ({
      ...current,
      customCommandGroups: current.customCommandGroups.filter((group) => group.id !== selectedCustomGroup.id),
      groupOrder: current.groupOrder.filter((groupId) => groupId !== selectedCustomGroup.id),
    }));
    setManagerTargetKey('claude');
  };

  const applyCommandConfigJson = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText) as CommandConfigDocument;
      if (!parsed || !Array.isArray(parsed.groups)) {
        setCommandConfigMessage('JSON形式が不正です。groups 配列が必要です。');
        return;
      }

      setSettings((current) => applyCommandConfigDocument(parsed, current));
      setCommandConfigMessage('JSONを反映しました。');
    } catch (error) {
      setCommandConfigMessage(`JSON隗｣譫舌お繝ｩ繝ｼ: ${(error as Error).message}`);
    }
  };

  const handleLoadConfigFile = async () => {
    const result = await window.bcwTerminal.loadCommandConfigFile();
    if (result.canceled || !result.content) {
      return;
    }

    setCommandConfigJson(result.content);
    applyCommandConfigJson(result.content);
    setSettings((current) => ({ ...current, commandConfigPath: result.path || current.commandConfigPath }));
  };

  const handleSaveConfigFile = async () => {
    const result = await window.bcwTerminal.saveCommandConfigFile(commandConfigJson, settings.commandConfigPath);
    if (result.canceled) {
      return;
    }
    setSettings((current) => ({ ...current, commandConfigPath: result.path || current.commandConfigPath }));
    setCommandConfigMessage(`菫晏ｭ倥＠縺ｾ縺励◆: ${result.path}`);
  };

  const isButtonVisible = (key: CommandButtonKey) => settings.commandVisibility[key];
  const orderedShortcutGroupIds = settings.groupOrder.filter((groupId) => {
    if (BUILT_IN_MENU_ORDER.includes(groupId as BuiltInMenuKey)) {
      return isButtonVisible(groupId as BuiltInMenuKey);
    }
    const custom = customMap.get(groupId);
    return Boolean(custom?.visible);
  });
  const customMenuItems =
    settings.customCommandGroups.find((group) => group.id === customMenuTargetId)?.items ?? [];

  return (
    <Box
      className="terminal-page"
      style={
        {
          '--bcw-terminal-bg': settings.terminalBackgroundColor,
          '--bcw-terminal-text': settings.terminalTextColor,
        } as any
      }
    >
      <Box component="header" className="terminal-header">
        <Stack direction="row" alignItems="center" spacing={1.25} minWidth={0}>
          <Box className="terminal-mark">
            <TerminalIcon fontSize="small" />
          </Box>
          <Stack
            className={`terminal-tip${hasUpdateTip ? ' is-update' : ''}`}
            direction="row"
            alignItems="center"
            spacing={0.75}
            minWidth={0}
            role="button"
            tabIndex={0}
            onClick={handleHeaderTipClick}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleHeaderTipClick();
              }
            }}
          >
            <LightbulbOutlinedIcon className="terminal-tip-icon" fontSize="inherit" />
            <Typography className="terminal-tip-text" variant="body2" noWrap>
              {headerTipText}
            </Typography>
          </Stack>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1}>
          <Tooltip title={getStatusDescription(status, settings.locale)}>
            <Chip
              className="terminal-status"
              color={status === 'ready' ? 'primary' : 'default'}
              icon={<BoltIcon />}
              label={getStatusLabel(status, settings.locale)}
              size="small"
              variant="outlined"
            />
          </Tooltip>
          <Tooltip title={text.createSessionTooltip}>
            <IconButton aria-label="New PowerShell session" color="primary" onClick={createSession}>
              <AddIcon />
            </IconButton>
          </Tooltip>
          <Tooltip
            title={
              shouldShowSidebar
                ? text.sidebarCollapse
                : settings.hideSidebarWhenSingleSession && sessions.length <= 1
                  ? text.sidebarAutoHidden
                  : text.sidebarExpand
            }
          >
            <span>
              <IconButton
                aria-label="Toggle sessions sidebar"
                color="primary"
                disabled={settings.hideSidebarWhenSingleSession && sessions.length <= 1}
                onClick={() => setSettings((current) => ({ ...current, showSidebar: !current.showSidebar }))}
              >
                {shouldShowSidebar ? <ChevronRightIcon /> : <ChevronLeftIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={text.commandManager}>
            <IconButton aria-label="Open command manager" color="primary" onClick={() => setCommandManagerOpen(true)}>
              <TuneIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={text.settings}>
            <IconButton aria-label="Open settings" color="primary" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      <Box className="terminal-shortcuts">
        {orderedShortcutGroupIds.map((groupId) => {
          if (groupId === 'claude') {
            return (
              <Tooltip key={groupId} title={settings.menuConfigs.claude.description}>
                <span>
                  <Button
                    className="terminal-shortcut-button"
                    disabled={!activeSession || activeSession.status === 'stopped'}
                    endIcon={<ArrowDropDownIcon />}
                    size="small"
                    startIcon={<SmartToyIcon />}
                    variant="outlined"
                    onClick={(event) => {
                      setActiveAiMenu('claude');
                      setAiMenuAnchor(event.currentTarget);
                    }}
                  >
                    {settings.menuConfigs.claude.title}
                  </Button>
                </span>
              </Tooltip>
            );
          }

          if (groupId === 'chatgpt') {
            return (
              <Tooltip key={groupId} title={settings.menuConfigs.chatgpt.description}>
                <span>
                  <Button
                    className="terminal-shortcut-button"
                    disabled={!activeSession || activeSession.status === 'stopped'}
                    endIcon={<ArrowDropDownIcon />}
                    size="small"
                    startIcon={<ChatIcon />}
                    variant="outlined"
                    onClick={(event) => {
                      setActiveAiMenu('chatgpt');
                      setAiMenuAnchor(event.currentTarget);
                    }}
                  >
                    {settings.menuConfigs.chatgpt.title}
                  </Button>
                </span>
              </Tooltip>
            );
          }

          if (groupId === 'git') {
            return (
              <Tooltip key={groupId} title={settings.menuConfigs.git.description}>
                <span>
                  <Button
                    className="terminal-shortcut-button"
                    disabled={!activeSession || activeSession.status === 'stopped'}
                    endIcon={<ArrowDropDownIcon />}
                    size="small"
                    startIcon={<GitHubIcon />}
                    variant="outlined"
                    onClick={(event) => setGitMenuAnchor(event.currentTarget)}
                  >
                    {settings.menuConfigs.git.title}
                  </Button>
                </span>
              </Tooltip>
            );
          }

          if (groupId === 'ls') {
            return (
              <Tooltip key={groupId} title={settings.menuConfigs.ls.description}>
                <span>
                  <Button
                    className="terminal-shortcut-button"
                    disabled={!activeSession || activeSession.status === 'stopped'}
                    endIcon={<ArrowDropDownIcon />}
                    size="small"
                    startIcon={<FormatListBulletedIcon />}
                    variant="outlined"
                    onClick={(event) => setListMenuAnchor(event.currentTarget)}
                  >
                    {settings.menuConfigs.ls.title}
                  </Button>
                </span>
              </Tooltip>
            );
          }

          if (groupId === 'dir') {
            return (
              <Tooltip key={groupId} title={settings.menuConfigs.dir.description}>
                <span>
                  <Button
                    className="terminal-shortcut-button"
                    disabled={!activeSession || activeSession.status === 'stopped'}
                    endIcon={<ArrowDropDownIcon />}
                    size="small"
                    startIcon={<FormatListBulletedIcon />}
                    variant="outlined"
                    onClick={(event) => setDirMenuAnchor(event.currentTarget)}
                  >
                    {settings.menuConfigs.dir.title}
                  </Button>
                </span>
              </Tooltip>
            );
          }

          if (groupId === 'network') {
            return (
              <Tooltip key={groupId} title={settings.menuConfigs.network.description}>
                <span>
                  <Button
                    className="terminal-shortcut-button"
                    disabled={!activeSession || activeSession.status === 'stopped'}
                    endIcon={<ArrowDropDownIcon />}
                    size="small"
                    startIcon={<LanIcon />}
                    variant="outlined"
                    onClick={(event) => setNetworkMenuAnchor(event.currentTarget)}
                  >
                    {settings.menuConfigs.network.title}
                  </Button>
                </span>
              </Tooltip>
            );
          }

          const customGroup = customMap.get(groupId);
          if (!customGroup) {
            return null;
          }

          return (
            <Tooltip key={customGroup.id} title={customGroup.description || text.customGroup}>
              <span>
                <Button
                  className="terminal-shortcut-button"
                  disabled={!activeSession || activeSession.status === 'stopped'}
                  endIcon={<ArrowDropDownIcon />}
                  size="small"
                  startIcon={<TerminalIcon />}
                  variant="outlined"
                  onClick={(event) => {
                    setCustomMenuTargetId(customGroup.id);
                    setCustomMenuAnchor(event.currentTarget);
                  }}
                >
                  {customGroup.title}
                </Button>
              </span>
            </Tooltip>
          );
        })}

        <Menu
          anchorEl={aiMenuAnchor}
          open={Boolean(aiMenuAnchor) && Boolean(activeAiMenu)}
          onClose={() => {
            setAiMenuAnchor(null);
            setActiveAiMenu(null);
          }}
        >
          {(activeAiMenu ? settings.menuConfigs[activeAiMenu].items : []).map((item, index) => (
            <MenuItem
              key={`${item.command}-${index}`}
              onClick={() => {
                runCommand(item.command);
                setAiMenuAnchor(null);
                setActiveAiMenu(null);
              }}
            >
              <ListItemIcon>
                <PlayArrowIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} secondary={`${item.command} - ${item.description}`} />
            </MenuItem>
          ))}
        </Menu>

        <Menu anchorEl={gitMenuAnchor} open={Boolean(gitMenuAnchor)} onClose={() => setGitMenuAnchor(null)}>
          {settings.menuConfigs.git.items.map((item, index) => (
            <MenuItem
              key={`${item.command}-${index}`}
              onClick={() => {
                runCommand(item.command);
                setGitMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                <PlayArrowIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} secondary={`${item.command} - ${item.description}`} />
            </MenuItem>
          ))}
        </Menu>

        <Menu anchorEl={listMenuAnchor} open={Boolean(listMenuAnchor)} onClose={() => setListMenuAnchor(null)}>
          {settings.menuConfigs.ls.items.map((item, index) => (
            <MenuItem
              key={`${item.command}-${index}`}
              onClick={() => {
                runCommand(item.command);
                setListMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                <PlayArrowIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} secondary={`${item.command} - ${item.description}`} />
            </MenuItem>
          ))}
        </Menu>

        <Menu anchorEl={dirMenuAnchor} open={Boolean(dirMenuAnchor)} onClose={() => setDirMenuAnchor(null)}>
          {settings.menuConfigs.dir.items.map((item, index) => (
            <MenuItem
              key={`${item.command}-${index}`}
              onClick={() => {
                runCommand(item.command);
                setDirMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                <PlayArrowIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} secondary={`${item.command} - ${item.description}`} />
            </MenuItem>
          ))}
        </Menu>

        <Menu anchorEl={networkMenuAnchor} open={Boolean(networkMenuAnchor)} onClose={() => setNetworkMenuAnchor(null)}>
          {settings.menuConfigs.network.items.map((item, index) => (
            <MenuItem
              key={`${item.command}-${index}`}
              onClick={() => {
                runCommand(item.command);
                setNetworkMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                <PlayArrowIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} secondary={`${item.command} - ${item.description}`} />
            </MenuItem>
          ))}
        </Menu>

        <Menu
          anchorEl={customMenuAnchor}
          open={Boolean(customMenuAnchor) && Boolean(customMenuTargetId)}
          onClose={() => {
            setCustomMenuAnchor(null);
            setCustomMenuTargetId(null);
          }}
        >
          {customMenuItems.map((item, index) => (
            <MenuItem
              key={`${item.command}-${index}`}
              onClick={() => {
                runCommand(item.command);
                setCustomMenuAnchor(null);
                setCustomMenuTargetId(null);
              }}
            >
              <ListItemIcon>
                <PlayArrowIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} secondary={`${item.command} - ${item.description}`} />
            </MenuItem>
          ))}
        </Menu>

        {isButtonVisible('edit') ? (
          <>
            <Tooltip title={text.editTooltip}>
              <span className="terminal-shortcut-system terminal-shortcut-system-start">
                <Button
                  className="terminal-shortcut-button"
                  disabled={!activeSession || activeSession.status === 'stopped'}
                  endIcon={<ArrowDropDownIcon />}
                  size="small"
                  startIcon={<EditIcon />}
                  variant="outlined"
                  onClick={(event) => setEditMenuAnchor(event.currentTarget)}
                >
                  {text.editButton}
                </Button>
              </span>
            </Tooltip>
            <Menu anchorEl={editMenuAnchor} open={Boolean(editMenuAnchor)} onClose={() => setEditMenuAnchor(null)}>
              <MenuItem onMouseDown={(event) => event.preventDefault()} onClick={() => void handleCopySelection()}>
                <ListItemIcon>
                  <ContentCopyIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={text.copySelection} />
              </MenuItem>
              <MenuItem onClick={() => void handlePasteClipboard()}>
                <ListItemIcon>
                  <ContentPasteIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={text.pasteClipboard} />
              </MenuItem>
              <MenuItem onClick={() => void handleSaveTerminalOutput()}>
                <ListItemIcon>
                  <SaveAltIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={text.saveTerminalOutput} secondary={text.saveTerminalOutputDescription} />
              </MenuItem>
              <MenuItem onClick={handleSendCtrlC}>
                <ListItemIcon>
                  <CloseIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={text.sendCtrlC} />
              </MenuItem>
              <Divider />
              <MenuItem
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  runCommand('cls');
                  setEditMenuAnchor(null);
                }}
              >
                <ListItemIcon>
                  <ClearAllIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={text.clearButton} secondary={text.clearDescription} />
              </MenuItem>
            </Menu>
          </>
        ) : null}

        {isButtonVisible('history') ? (
          <>
            <Tooltip title={text.historyTooltip}>
              <span
                className={`terminal-shortcut-system${isButtonVisible('edit') ? '' : ' terminal-shortcut-system-start'}`}
              >
                <Button
                  className="terminal-shortcut-button"
                  disabled={!activeSession || activeSession.status === 'stopped'}
                  endIcon={<ArrowDropDownIcon />}
                  size="small"
                  startIcon={<HistoryIcon />}
                  variant="outlined"
                  onClick={(event) => setHistoryMenuAnchor(event.currentTarget)}
                >
                  {text.historyButton}
                </Button>
              </span>
            </Tooltip>
            <Menu
              anchorEl={historyMenuAnchor}
              open={Boolean(historyMenuAnchor)}
              onClose={() => setHistoryMenuAnchor(null)}
            >
              {commandHistory.length === 0 ? (
                <MenuItem disabled>
                  <ListItemText primary={text.noHistory} />
                </MenuItem>
              ) : (
                commandHistory.slice(0, 30).map((item) => (
                  <MenuItem
                    key={item.id}
                    onClick={() => {
                      runCommand(item.command);
                      setHistoryMenuAnchor(null);
                    }}
                  >
                    <ListItemIcon>
                      <HistoryIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={item.command} secondary={new Date(item.createdAt).toLocaleString()} />
                  </MenuItem>
                ))
              )}
              <Divider />
              <MenuItem onClick={handleClearHistory} disabled={commandHistory.length === 0}>
                <ListItemIcon>
                  <DeleteOutlineIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={text.clearHistory} secondary={text.clearHistoryDescription} />
              </MenuItem>
            </Menu>
          </>
        ) : null}
      </Box>

      <Box className={`terminal-workspace${shouldShowSidebar ? '' : ' is-sidebar-hidden'}`}>
        <Box className="terminal-shell">
          <Box ref={hostRef} className="terminal-host" onContextMenu={(event) => void handleTerminalContextMenu(event)} />
        </Box>

        {shouldShowSidebar ? (
          <Box component="aside" className="terminal-sidebar" aria-label="Running terminals">
            <Stack direction="row" alignItems="center" justifyContent="space-between" className="terminal-sidebar-header">
              <Typography className="terminal-sidebar-title">{text.sessions}</Typography>
              <Tooltip title={text.createSessionTooltip}>
                <IconButton aria-label="New terminal session" color="primary" size="small" onClick={createSession}>
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>

            <Stack spacing={1} className="terminal-session-list">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`terminal-thumb${session.id === activeSessionId ? ' is-active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectSession(session.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectSession(session.id);
                    }
                  }}
                >
                  <span className="terminal-thumb-topline">
                    <span className="terminal-thumb-title">{session.title}</span>
                    <Tooltip title={text.stopSessionTooltip}>
                      <span
                        className="terminal-thumb-stop"
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStopSession(session);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            handleStopSession(session);
                          }
                        }}
                      >
                        <CloseIcon fontSize="inherit" />
                      </span>
                    </Tooltip>
                  </span>
                  <span className="terminal-thumb-badges">
                    <span className={`terminal-thumb-activity is-${session.activity}`}>
                      {session.activity === 'running'
                        ? text.activityRunning
                        : session.activity === 'idle'
                          ? text.activityIdle
                          : text.activityStopped}
                    </span>
                    <span className="terminal-thumb-intent">{session.intent}</span>
                  </span>
                  <span className="terminal-thumb-meta">{session.cwd || text.powerShellStarting}</span>
                  {session.lastCommand ? <span className="terminal-thumb-command">&gt; {session.lastCommand}</span> : null}
                  {session.url ? <span className="terminal-thumb-url">{session.url}</span> : null}
                  <span className="terminal-thumb-preview">{session.preview || '蜃ｺ蜉帛ｾ・■...'}</span>
                </div>
              ))}
            </Stack>
          </Box>
        ) : null}
      </Box>

      <Drawer
        anchor="right"
        open={settingsOpen}
        PaperProps={{ className: 'terminal-settings-drawer-paper' }}
        onClose={() => setSettingsOpen(false)}
      >
        <Box className="terminal-settings-panel">
          <Typography className="terminal-settings-title">{text.settings}</Typography>

          <Stack spacing={2.5}>
            {smartAppControl.status === 'on' ? (
              <Typography className="terminal-settings-warning">{text.smartAppControlOnWarning}</Typography>
            ) : null}
            {smartAppControl.status === 'eval' ? (
              <Typography className="terminal-settings-warning">{text.smartAppControlEvalWarning}</Typography>
            ) : null}

            <Box>
              <Typography className="terminal-settings-label">{text.appUpdate}</Typography>
              <Typography className="terminal-settings-description">{text.appUpdateDescription}</Typography>
              <Typography className="terminal-settings-description">
                {getAppUpdateStatusText(appUpdate, settings.locale)}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                <Button
                  variant="outlined"
                  onClick={() => void handleCheckForAppUpdate()}
                  disabled={!appUpdate.supported || appUpdate.status === 'checking' || appUpdate.status === 'downloading'}
                >
                  {text.checkUpdates}
                </Button>
                <Button
                  variant="contained"
                  onClick={() => void handleInstallDownloadedUpdate()}
                  disabled={appUpdate.status !== 'downloaded'}
                >
                  {text.installUpdate}
                </Button>
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography className="terminal-settings-label">{text.language}</Typography>
              <TextField
                select
                size="small"
                fullWidth
                value={settings.locale}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    locale: event.target.value as AppLocale,
                  }))
                }
              >
                <MenuItem value="ja">日本語</MenuItem>
                <MenuItem value="en">English</MenuItem>
              </TextField>
            </Box>

            <Box>
              <Typography className="terminal-settings-label">{text.fontSize}</Typography>
              <Slider
                max={20}
                min={11}
                step={1}
                value={settings.fontSize}
                valueLabelDisplay="auto"
                onChange={(_, value) =>
                  setSettings((current) => ({ ...current, fontSize: Array.isArray(value) ? value[0] : value }))
                }
              />
            </Box>

            <Box>
              <Typography className="terminal-settings-label">{text.lineHeight}</Typography>
              <Slider
                max={1.6}
                min={1.1}
                step={0.05}
                value={settings.lineHeight}
                valueLabelDisplay="auto"
                onChange={(_, value) =>
                  setSettings((current) => ({ ...current, lineHeight: Array.isArray(value) ? value[0] : value }))
                }
              />
            </Box>

            <TextField
              label={text.fontFamily}
              size="small"
              value={settings.fontFamily}
              onChange={(event) => setSettings((current) => ({ ...current, fontFamily: event.target.value }))}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                label={text.terminalTextColor}
                size="small"
                type="color"
                value={settings.terminalTextColor}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, terminalTextColor: normalizeColor(event.target.value, current.terminalTextColor) }))
                }
                sx={{ flex: 1 }}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label={text.terminalBackgroundColor}
                size="small"
                type="color"
                value={settings.terminalBackgroundColor}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    terminalBackgroundColor: normalizeColor(event.target.value, current.terminalBackgroundColor),
                  }))
                }
                sx={{ flex: 1 }}
                InputLabelProps={{ shrink: true }}
              />
            </Stack>

            <FormControlLabel
              control={
                <Switch
                  checked={settings.alwaysOnTop}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSettings((current) => ({ ...current, alwaysOnTop: checked }));
                    void window.bcwTerminal.setAlwaysOnTop(checked);
                  }}
                />
              }
              label={text.alwaysOnTop}
            />

            <Divider />

            <Tooltip title={text.openCommandManagerTooltip}>
              <span>
                <Button variant="outlined" startIcon={<TuneIcon />} onClick={() => setCommandManagerOpen(true)}>
                  {text.commandManager}
                </Button>
              </span>
            </Tooltip>
            <Typography className="terminal-settings-description">{text.commandManagerDescription}</Typography>

            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={settings.showSidebar}
                  onChange={(event) => setSettings((current) => ({ ...current, showSidebar: event.target.checked }))}
                />
              }
              label={text.showSessionSidebar}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.hideSidebarWhenSingleSession}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, hideSidebarWhenSingleSession: event.target.checked }))
                  }
                />
              }
              label={text.hideSidebarWhenSingleSession}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.confirmStop}
                  onChange={(event) => setSettings((current) => ({ ...current, confirmStop: event.target.checked }))}
                />
              }
              label={text.confirmBeforeStopping}
            />

            <Tooltip title={text.resetSettingsTooltip}>
              <span>
                <Button variant="outlined" onClick={() => setSettings(createDefaultSettings())}>
                  {text.resetSettings}
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Box>
      </Drawer>

      <Dialog open={mkdirDialogOpen} onClose={() => setMkdirDialogOpen(false)}>
        <DialogTitle>{text.mkdirDialogTitle}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25} sx={{ minWidth: { xs: 280, sm: 360 } }}>
            <Typography className="terminal-settings-description">{text.mkdirDialogDescription}</Typography>
            <TextField
              autoFocus
              fullWidth
              label={text.mkdirDialogLabel}
              size="small"
              inputRef={mkdirInputRef}
              value={mkdirFolderName}
              onChange={(event) => setMkdirFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleMkdirFromDialog();
                }
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMkdirDialogOpen(false)}>{text.cancel}</Button>
          <Button variant="contained" onClick={handleMkdirFromDialog} disabled={!mkdirFolderName.trim()}>
            {text.create}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog fullWidth maxWidth="md" open={commandManagerOpen} onClose={() => setCommandManagerOpen(false)}>
        <DialogTitle>{text.commandManager}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Tooltip title={text.modeFormTooltip}>
                <span>
                  <Button
                    variant={commandManagerMode === 'form' ? 'contained' : 'outlined'}
                    onClick={() => setCommandManagerMode('form')}
                  >
                    {text.modeForm}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={text.modeJsonTooltip}>
                <span>
                  <Button
                    variant={commandManagerMode === 'json' ? 'contained' : 'outlined'}
                    onClick={() => setCommandManagerMode('json')}
                  >
                    {text.modeJson}
                  </Button>
                </span>
              </Tooltip>
            </Stack>
            {commandManagerMode === 'json' ? (
              <>
            <Box>
              <Typography className="terminal-settings-label">{text.jsonEditor}</Typography>
              <Typography className="terminal-settings-description">{text.jsonEditorDescription}</Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Tooltip title={text.jsonLoadTooltip}>
                <span>
                  <Button variant="outlined" onClick={() => void handleLoadConfigFile()}>
                    {text.jsonLoad}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={text.jsonSaveTooltip}>
                <span>
                  <Button variant="outlined" onClick={() => void handleSaveConfigFile()}>
                    {text.jsonSave}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={text.jsonApplyTooltip}>
                <span>
                  <Button variant="contained" onClick={() => applyCommandConfigJson(commandConfigJson)}>
                    {text.jsonApply}
                  </Button>
                </span>
              </Tooltip>
            </Stack>
            <TextField
              multiline
              minRows={10}
              label={text.jsonEditor}
              value={commandConfigJson}
              onChange={(event) => setCommandConfigJson(event.target.value)}
            />
            {commandConfigMessage ? (
              <Typography className="terminal-settings-description">{commandConfigMessage}</Typography>
            ) : null}
              </>
            ) : null}

            <Divider />

            {commandManagerMode === 'form' ? (
              <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                select
                label={text.groupTarget}
                size="small"
                value={managerTargetKey}
                sx={{ minWidth: 260 }}
                onChange={(event) => setManagerTargetKey(event.target.value)}
              >
                {managerTargets.map((target) => (
                  <MenuItem key={target.key} value={target.key}>
                    {target.label}
                  </MenuItem>
                ))}
              </TextField>
              <Tooltip title={text.newGroupTooltip}>
                <span>
                  <Button variant="outlined" startIcon={<AddIcon />} onClick={handleCreateCustomGroup}>
                    {text.newGroup}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={text.deleteGroupTooltip}>
                <span>
                  <Button
                    variant="outlined"
                    color="error"
                    disabled={!selectedCustomGroup}
                    onClick={handleDeleteCurrentCustomGroup}
                  >
                    {text.deleteGroup}
                  </Button>
                </span>
              </Tooltip>
            </Stack>

            {managerGroupConfig ? (
              <>
                <TextField
                  label={text.menuTitle}
                  size="small"
                  value={managerGroupConfig.title}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (selectedBuiltInKey) {
                      updateBuiltInMenu(selectedBuiltInKey, (current) => ({ ...current, title: value }));
                      return;
                    }
                    if (selectedCustomGroup) {
                      updateCustomGroup(selectedCustomGroup.id, (current) => ({ ...current, title: value }));
                    }
                  }}
                />
                <TextField
                  label={text.dropdownDescription}
                  size="small"
                  value={managerGroupConfig.description}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (selectedBuiltInKey) {
                      updateBuiltInMenu(selectedBuiltInKey, (current) => ({ ...current, description: value }));
                      return;
                    }
                    if (selectedCustomGroup) {
                      updateCustomGroup(selectedCustomGroup.id, (current) => ({ ...current, description: value }));
                    }
                  }}
                />

                {selectedBuiltInKey || selectedCustomGroup ? (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={
                          selectedBuiltInKey
                            ? settings.commandVisibility[selectedBuiltInKey]
                            : Boolean(selectedCustomGroup?.visible)
                        }
                        onChange={(event) => {
                          const checked = event.target.checked;
                          if (selectedBuiltInKey) {
                            setSettings((current) => ({
                              ...current,
                              commandVisibility: { ...current.commandVisibility, [selectedBuiltInKey]: checked },
                            }));
                            return;
                          }
                          if (selectedCustomGroup) {
                            updateCustomGroup(selectedCustomGroup.id, (current) => ({ ...current, visible: checked }));
                          }
                        }}
                      />
                    }
                    label={text.menuVisible}
                  />
                ) : null}

                <Divider />

                <Typography className="terminal-settings-label">{text.manageItems}</Typography>
                <Stack spacing={0.75}>
                  {managerGroupConfig.items.map((item, index) => (
                    <Stack key={`${item.command}-${index}`} direction="row" alignItems="flex-start" spacing={1}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography className="terminal-settings-toggle-label">{item.label}</Typography>
                        <Typography className="terminal-settings-description">{item.command}</Typography>
                        <Typography className="terminal-settings-description">{item.description}</Typography>
                      </Box>
                      <Tooltip title={text.deleteItemTooltip}>
                        <span>
                          <IconButton size="small" onClick={() => removeManagerItem(index)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  ))}
                </Stack>

                <Divider />

                <TextField
                  label={text.dropdownItemLabel}
                  size="small"
                  value={newItemLabel}
                  onChange={(event) => setNewItemLabel(event.target.value)}
                />
                <TextField
                  label={text.commandToRun}
                  size="small"
                  value={newItemCommand}
                  onChange={(event) => setNewItemCommand(event.target.value)}
                />
                <TextField
                  label={text.dropdownItemDescription}
                  size="small"
                  value={newItemDescription}
                  onChange={(event) => setNewItemDescription(event.target.value)}
                />
                <Tooltip title={text.addItemTooltip}>
                  <span>
                    <Button variant="outlined" onClick={addManagerItem}>
                      {text.addItem}
                    </Button>
                  </span>
                </Tooltip>
              </>
            ) : null}
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Tooltip title={text.closeDialogTooltip}>
            <span>
              <Button onClick={() => setCommandManagerOpen(false)}>Close</Button>
            </span>
          </Tooltip>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
