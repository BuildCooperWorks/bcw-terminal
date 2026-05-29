import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useCallback } from 'react';
import AddIcon from '@mui/icons-material/Add';
import type { ReactNode } from 'react';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChatIcon from '@mui/icons-material/Chat';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import FolderIcon from '@mui/icons-material/Folder';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import GitHubIcon from '@mui/icons-material/GitHub';
import HistoryIcon from '@mui/icons-material/History';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import KeyIcon from '@mui/icons-material/Key';
import LanIcon from '@mui/icons-material/Lan';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TerminalIcon from '@mui/icons-material/Terminal';
import TuneIcon from '@mui/icons-material/Tune';
import {
  Box,
  Button,
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
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type {
  CommandVariableKind,
  CommandVariableSnapshot,
  FileSystemEntry,
  TerminalSequenceStep,
} from '../../../preload/types';
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

type OperationSequence = {
  id: string;
  title: string;
  description: string;
  visible: boolean;
  steps: TerminalSequenceStep[];
};

type CommandHistoryItem = {
  command: string;
  createdAt: number;
  id: string;
  sessionId: string;
};

type FileTreeState = {
  childrenByPath: Record<string, FileSystemEntry[]>;
  errorsByPath: Record<string, string>;
  expandedPaths: Record<string, boolean>;
  loadingPaths: Record<string, boolean>;
  rootPath: string;
  pendingRootPath: string;
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
  operationSequences: OperationSequence[];
  groupOrder: string[];
  commandConfigPath?: string;
  fileExplorerExpanded: boolean;
  showFileExplorer: boolean;
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
    automationManager: 'Variables / sequences',
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
    closeFileExplorer: 'Close file explorer',
    expandFileExplorer: 'Expand file explorer',
    fileExplorer: 'Files',
    fileTreeEmpty: 'No files',
    fileTreeError: 'Cannot read folder',
    fileTreeLoading: 'Loading...',
    fileViewFailed: 'Cannot view file.',
    fileViewReasonBinary: 'Skipped viewing this file in the terminal because it appears to be binary.',
    fileViewReasonInvalidPath: 'Invalid path.',
    fileViewReasonNotFile: 'This item is not a file.',
    fileViewSkippedBinary: 'Skipped viewing this file in the terminal because it appears to be binary.',
    fileViewInTerminal: 'View file in terminal',
    fontFamily: 'Font family',
    fontSize: 'Font size',
    groupTarget: 'Target group',
    groupVisibility: 'Group visibility',
    hideSidebarWhenSingleSession: 'Hide sidebar when single session',
    historyButton: 'History',
    historyTooltip: 'Recent command history',
    clearHistory: 'Clear history',
    clearHistoryDescription: 'Remove saved command history.',
    deleteHistoryItem: 'Delete this history item',
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
    sequenceAddStep: 'Add step',
    sequenceDelayMs: 'Delay after send (ms)',
    sequenceDescription: 'Description',
    sequenceInput: 'Input',
    sequenceManager: 'Sequence manager',
    sequenceManagerDescription: 'Register interactive terminal flows such as WSL login, SSH, and password input.',
    sequenceMenu: 'Sequences',
    sequenceNew: 'New sequence',
    sequenceNoItems: 'No sequences yet.',
    sequenceRunError: 'Sequence failed.',
    sequenceRunStarted: 'Sequence started.',
    sequenceStepWaitFor: 'Wait for text before send',
    sequenceSubmit: 'Press Enter after send',
    sequenceTitle: 'Sequence name',
    pasteClipboard: 'Paste clipboard',
    saveTerminalOutput: 'Save terminal output',
    saveTerminalOutputDescription: 'Save the active terminal content as a text file.',
    powerShellStarting: 'Starting PowerShell',
    cancel: 'Cancel',
    create: 'Create',
    resetSettings: 'Reset settings',
    resetSettingsTooltip:
      'Reset all settings to defaults: language, fonts, terminal colors, sidebar options, button visibility, and command groups.',
    refreshFileTree: 'Refresh file tree',
    runAgain: 'Run',
    variableDeleteTooltip: 'Delete this variable.',
    variableDescription: 'Description',
    variableEnabled: 'Enabled',
    variableKind: 'Type',
    variableKindSecret: 'Secret',
    variableKindText: 'Text',
    variableManager: 'Variable manager',
    variableManagerDescription: 'Create values that can be referenced from command buttons with {{VARIABLE_NAME}}.',
    variableMissing: 'Variable is not registered:',
    variableName: 'Variable name',
    variableNew: 'New variable',
    variableReference: 'Reference',
    variableSaved: 'Variable saved.',
    variableSecretPlaceholder: 'Leave blank to keep the saved secret.',
    variableTestInTerminal: 'Test in terminal',
    variableTestSecretTooltip: 'Secret variables are not printed to the terminal.',
    variableValue: 'Value',
    variablesEmpty: 'No variables yet.',
    sendCtrlC: 'Send Ctrl+C',
    smartAppControlEvalWarning:
      'Smart App Control is in evaluation mode. Command launch can be restricted depending on policy.',
    smartAppControlOnWarning:
      'Smart App Control is ON. Local CLI launch can be blocked. Turn it OFF and reboot if commands fail.',
    sessions: 'Sessions',
    settings: 'Settings',
    closeDialogTooltip: 'Close this dialog.',
    createSessionTooltip: 'Start a new PowerShell session.',
    checkUpdates: 'Check updates',
    installUpdate: 'Install update',
    stopSessionTooltip: 'Stop this session.',
    terminalBackgroundColor: 'Terminal background color',
    terminalTextColor: 'Terminal text color',
    addItemTooltip: 'Add a new command item to the selected group.',
    showSessionSidebar: 'Show session sidebar',
    showFileExplorer: 'Show file explorer',
    sidebarAutoHidden: 'Sidebar hidden in single-session mode',
    sidebarCollapse: 'Collapse sidebar',
    sidebarExpand: 'Expand sidebar',
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
    automationManager: '変数 / 操作シーケンス',
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
    closeFileExplorer: 'ファイルサイドバーを閉じる',
    expandFileExplorer: 'ファイルサイドバーを展開',
    fileExplorer: 'ファイル',
    fileTreeEmpty: 'ファイルはありません',
    fileTreeError: 'フォルダーを読めません',
    fileTreeLoading: '読み込み中...',
    fileViewFailed: 'ファイルを表示できません。',
    fileViewReasonBinary: 'ターミナルでのファイル表示をスキップしました。バイナリファイルの可能性があります。',
    fileViewReasonInvalidPath: 'パスが不正です。',
    fileViewReasonNotFile: 'ファイルではありません。',
    fileViewSkippedBinary: 'ターミナルでのファイル表示をスキップしました。バイナリファイルの可能性があります。',
    fileViewInTerminal: 'ターミナルでファイルを表示',
    fontFamily: 'フォント',
    fontSize: 'フォントサイズ',
    groupTarget: '編集対象グループ',
    groupVisibility: 'グループ表示',
    hideSidebarWhenSingleSession: '単一セッション時はサイドバーを非表示',
    historyButton: '履歴',
    historyTooltip: '最近のコマンド履歴',
    clearHistory: '履歴をクリア',
    clearHistoryDescription: '保存済みのコマンド履歴を削除します。',
    deleteHistoryItem: 'この履歴を削除',
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
    sequenceAddStep: 'ステップを追加',
    sequenceDelayMs: '送信後の待機(ms)',
    sequenceDescription: '説明',
    sequenceInput: '送信する文字列',
    sequenceManager: '操作シーケンス管理',
    sequenceManagerDescription: 'WSL 起動、SSH、パスワード入力などの対話操作を手順として登録します。',
    sequenceMenu: '操作シーケンス',
    sequenceNew: '新しい操作シーケンス',
    sequenceNoItems: '操作シーケンスはまだありません。',
    sequenceRunError: '操作シーケンスの実行に失敗しました。',
    sequenceRunStarted: '操作シーケンスを開始しました。',
    sequenceStepWaitFor: '送信前に待つ文字列',
    sequenceSubmit: '送信後に Enter',
    sequenceTitle: 'シーケンス名',
    pasteClipboard: 'クリップボードを貼り付け',
    saveTerminalOutput: 'ターミナル出力を保存',
    saveTerminalOutputDescription: 'アクティブなターミナル内容をテキストファイルに保存します。',
    powerShellStarting: 'PowerShell を起動中',
    cancel: 'キャンセル',
    create: '作成',
    resetSettings: '設定をリセット',
    resetSettingsTooltip:
      '表示言語・フォント・ターミナル色設定・サイドバー設定・ボタン表示・コマンド設定を初期値に戻します。',
    refreshFileTree: 'ファイルツリーを更新',
    runAgain: '再実行',
    variableDeleteTooltip: 'この変数を削除します。',
    variableDescription: '説明',
    variableEnabled: '有効',
    variableKind: '種別',
    variableKindSecret: 'シークレット',
    variableKindText: '通常テキスト',
    variableManager: '変数管理',
    variableManagerDescription: 'コマンドボタンから {{VARIABLE_NAME}} の形式で参照できる値を管理します。',
    variableMissing: '変数が登録されていません:',
    variableName: '変数名',
    variableNew: '新しい変数',
    variableReference: '参照名',
    variableSaved: '変数を保存しました。',
    variableSecretPlaceholder: '空欄のまま保存すると登録済みシークレットを維持します。',
    variableTestInTerminal: 'ターミナルで確認',
    variableTestSecretTooltip: 'シークレット変数はターミナルに表示しません。',
    variableValue: '値',
    variablesEmpty: '変数はまだありません。',
    sendCtrlC: 'Ctrl+C を送信',
    smartAppControlEvalWarning:
      'Smart App Control が評価モードです。ポリシーにより一部コマンド起動が制限される場合があります。',
    smartAppControlOnWarning:
      'Smart App Control が ON のため、ローカルCLI起動がブロックされる場合があります。失敗する場合は OFF にして再起動してください。',
    sessions: 'セッション',
    settings: '設定',
    closeDialogTooltip: 'このダイアログを閉じます。',
    createSessionTooltip: '新しい PowerShell セッションを起動します。',
    checkUpdates: '更新を確認',
    installUpdate: '更新を適用',
    stopSessionTooltip: 'このセッションを停止します。',
    terminalBackgroundColor: 'ターミナル背景色',
    terminalTextColor: 'ターミナル文字色',
    addItemTooltip: '選択中グループにコマンド項目を追加します。',
    showSessionSidebar: 'セッションサイドバーを表示',
    showFileExplorer: 'ファイルサイドバーを表示',
    sidebarAutoHidden: '単一セッションではサイドバーを自動非表示',
    sidebarCollapse: 'サイドバーを折りたたむ',
    sidebarExpand: 'サイドバーを展開',
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
  dir: false,
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
  fileExplorerExpanded: false,
  showFileExplorer: true,
  showSidebar: true,
  hideSidebarWhenSingleSession: true,
  commandVisibility: { ...DEFAULT_COMMAND_BUTTON_VISIBILITY },
  menuConfigs: { ...DEFAULT_MENU_CONFIGS },
  customCommandGroups: [],
  operationSequences: [],
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
    operationSequences: [],
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

function normalizeSequenceSteps(value: unknown): TerminalSequenceStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((step): step is Partial<TerminalSequenceStep> => Boolean(step) && typeof step === 'object')
    .map((step) => ({
      input: typeof step.input === 'string' ? step.input : '',
      submit: step.submit !== false,
      waitFor: typeof step.waitFor === 'string' ? step.waitFor : '',
      delayMs: typeof step.delayMs === 'number' && Number.isFinite(step.delayMs) ? Math.max(0, step.delayMs) : 300,
    }));
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

    const operationSequences = Array.isArray(parsed.operationSequences)
      ? parsed.operationSequences
          .filter((sequence) => sequence && typeof sequence.id === 'string')
          .map((sequence) => ({
            id: sequence.id,
            title: sequence.title || 'Sequence',
            description: sequence.description || '',
            visible: sequence.visible ?? true,
            steps: normalizeSequenceSteps(sequence.steps),
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
      operationSequences,
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
  next.fileExplorerExpanded = currentSettings.fileExplorerExpanded;
  next.showFileExplorer = currentSettings.showFileExplorer;
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

function makeGroupId() {
  return `custom-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function makeSequenceId() {
  return `sequence-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

type CommandVariableForm = {
  id?: string;
  name: string;
  description: string;
  enabled: boolean;
  kind: CommandVariableKind;
  value: string;
};

const EMPTY_VARIABLE_FORM: CommandVariableForm = {
  name: '',
  description: '',
  enabled: true,
  kind: 'text',
  value: '',
};

type AutomationManagerTab = 'variables' | 'sequences';

function toVariableReference(name: string) {
  return `{{${name}}}`;
}

function createVariableTestCommand(name: string) {
  return `Write-Output "${name} = {{${name}}}"`;
}

function createEmptySequenceStep(): TerminalSequenceStep {
  return {
    input: '',
    submit: true,
    waitFor: '',
    delayMs: 300,
  };
}

export function TerminalPage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mkdirInputRef = useRef<HTMLInputElement | null>(null);
  const previousSessionCommandsRef = useRef<Record<string, string>>({});

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandManagerOpen, setCommandManagerOpen] = useState(false);
  const [automationManagerOpen, setAutomationManagerOpen] = useState(false);
  const [automationManagerTab, setAutomationManagerTab] = useState<AutomationManagerTab>('variables');

  const [aiMenuAnchor, setAiMenuAnchor] = useState<HTMLElement | null>(null);
  const [activeAiMenu, setActiveAiMenu] = useState<'claude' | 'chatgpt' | null>(null);
  const [gitMenuAnchor, setGitMenuAnchor] = useState<HTMLElement | null>(null);
  const [listMenuAnchor, setListMenuAnchor] = useState<HTMLElement | null>(null);
  const [dirMenuAnchor, setDirMenuAnchor] = useState<HTMLElement | null>(null);
  const [networkMenuAnchor, setNetworkMenuAnchor] = useState<HTMLElement | null>(null);
  const [editMenuAnchor, setEditMenuAnchor] = useState<HTMLElement | null>(null);
  const [historyMenuAnchor, setHistoryMenuAnchor] = useState<HTMLElement | null>(null);
  const [sequenceMenuAnchor, setSequenceMenuAnchor] = useState<HTMLElement | null>(null);
  const [customMenuAnchor, setCustomMenuAnchor] = useState<HTMLElement | null>(null);
  const [customMenuTargetId, setCustomMenuTargetId] = useState<string | null>(null);

  const [settings, setSettings] = useState<PageSettings>(loadSettings);
  const [smartAppControl, setSmartAppControl] = useState<SmartAppControlStatus>({ status: 'unknown' });
  const [appUpdate, setAppUpdate] = useState<AppUpdateStatus>({ supported: false, status: 'idle' });
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>(loadHistory);
  const [commandConfigJson, setCommandConfigJson] = useState('');
  const [commandConfigMessage, setCommandConfigMessage] = useState('');
  const [commandManagerMode, setCommandManagerMode] = useState<'form' | 'json'>('form');
  const [mkdirDialogOpen, setMkdirDialogOpen] = useState(false);
  const [mkdirFolderName, setMkdirFolderName] = useState('');
  const [commandVariables, setCommandVariables] = useState<CommandVariableSnapshot[]>([]);
  const [variableForm, setVariableForm] = useState<CommandVariableForm>(EMPTY_VARIABLE_FORM);
  const [variableMessage, setVariableMessage] = useState('');
  const [sequenceTargetId, setSequenceTargetId] = useState('');
  const [sequenceMessage, setSequenceMessage] = useState('');
  const [fileViewMessage, setFileViewMessage] = useState('');
  const [fileTree, setFileTree] = useState<FileTreeState>({
    childrenByPath: {},
    errorsByPath: {},
    expandedPaths: {},
    loadingPaths: {},
    pendingRootPath: '',
    rootPath: '',
  });

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
  const canToggleFileExplorer = settings.showFileExplorer && Boolean(activeSession?.cwd);
  const shouldShowFileExplorer = canToggleFileExplorer && settings.fileExplorerExpanded;
  const isFileExplorerExpanded = shouldShowFileExplorer;
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
    if (sequenceTargetId && settings.operationSequences.some((sequence) => sequence.id === sequenceTargetId)) {
      return;
    }

    setSequenceTargetId(settings.operationSequences[0]?.id ?? '');
  }, [sequenceTargetId, settings.operationSequences]);

  useEffect(() => {
    if (hostRef.current) {
      attachTerminal(hostRef.current);
    }
  }, [attachTerminal]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(fit);
    return () => window.cancelAnimationFrame(frame);
  }, [fit, isFileExplorerExpanded, shouldShowFileExplorer, shouldShowSidebar]);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(commandHistory.slice(0, 200)));
  }, [commandHistory]);

  useEffect(() => {
    void window.bcwTerminal.setLocale(settings.locale);
  }, [settings.locale]);

  const loadFileTreeDirectory = useCallback(async (directoryPath: string, options?: { resetRoot?: boolean }) => {
    if (!directoryPath) {
      return;
    }

    setFileTree((current) => ({
      ...current,
      pendingRootPath: options?.resetRoot ? directoryPath : current.pendingRootPath,
      rootPath: current.rootPath || directoryPath,
      loadingPaths: { ...current.loadingPaths, [directoryPath]: true },
    }));

    const result = await window.bcwTerminal.listDirectory(directoryPath);

    setFileTree((current) => {
      const nextLoading = { ...current.loadingPaths };
      delete nextLoading[directoryPath];

      const nextErrors = { ...current.errorsByPath };
      if (result.error) {
        nextErrors[directoryPath] = result.error;
      } else {
        delete nextErrors[directoryPath];
      }

      return {
        ...current,
        childrenByPath: {
          ...current.childrenByPath,
          [directoryPath]: result.entries,
        },
        errorsByPath: nextErrors,
        loadingPaths: nextLoading,
        pendingRootPath: options?.resetRoot ? '' : current.pendingRootPath,
        rootPath: options?.resetRoot ? result.path : current.rootPath || result.path,
      };
    });
  }, []);

  const toggleFileTreeDirectory = (directoryPath: string) => {
    const isExpanded = Boolean(fileTree.expandedPaths[directoryPath]);
    setFileTree((current) => ({
      ...current,
      expandedPaths: {
        ...current.expandedPaths,
        [directoryPath]: !isExpanded,
      },
    }));

    if (!isExpanded && !fileTree.childrenByPath[directoryPath]) {
      void loadFileTreeDirectory(directoryPath);
    }
  };

  const refreshFileTree = () => {
    if (activeSession?.cwd && isFileExplorerExpanded) {
      void loadFileTreeDirectory(activeSession.cwd, { resetRoot: true });
    }
  };

  const toggleFileExplorer = () => {
    setSettings((current) => ({
      ...current,
      fileExplorerExpanded: !current.fileExplorerExpanded,
    }));
  };

  useEffect(() => {
    const cwd = activeSession?.cwd;
    if (!cwd || !settings.showFileExplorer || !settings.fileExplorerExpanded) {
      return;
    }

    void loadFileTreeDirectory(cwd, { resetRoot: true });
  }, [activeSession?.cwd, loadFileTreeDirectory, settings.fileExplorerExpanded, settings.showFileExplorer]);

  const refreshCommandVariables = () => {
    void window.bcwTerminal
      .listCommandVariables()
      .then((variables) => setCommandVariables(variables))
      .catch((error: unknown) => {
        setVariableMessage(error instanceof Error ? error.message : String(error));
      });
  };

  useEffect(() => {
    refreshCommandVariables();
  }, []);

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

  const openAutomationManager = (tab: AutomationManagerTab) => {
    setAutomationManagerTab(tab);
    setAutomationManagerOpen(true);
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

  const quotePowerShellLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const isWslPath = (value: string) => value.startsWith('wsl:');
  const fromWslPath = (value: string) => (isWslPath(value) ? value.slice(4) : value);
  const quoteShellLiteral = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
  const toWslShellPathExpression = (value: string) => {
    const wslPath = fromWslPath(value);
    if (wslPath === '~') {
      return '~';
    }
    if (wslPath.startsWith('~/')) {
      return `~/${quoteShellLiteral(wslPath.slice(2))}`;
    }
    return quoteShellLiteral(wslPath);
  };

  const createChangeDirectoryCommand = (directoryPath: string) =>
    isWslPath(directoryPath)
      ? `cd ${toWslShellPathExpression(directoryPath)}`
      : `Set-Location -LiteralPath ${quotePowerShellLiteral(directoryPath)}`;

  const createFileViewCommand = (filePath: string) =>
    isWslPath(filePath)
      ? `cat -- ${toWslShellPathExpression(filePath)} | more`
      : `Get-Content -LiteralPath ${quotePowerShellLiteral(filePath)} | more`;

  const getFileViewFailureMessage = (reason?: string) => {
    if (reason === 'binary-file') {
      return text.fileViewReasonBinary;
    }
    if (reason === 'invalid-path') {
      return text.fileViewReasonInvalidPath;
    }
    if (reason === 'not-file') {
      return text.fileViewReasonNotFile;
    }
    if (reason) {
      return `${text.fileViewFailed} ${reason}`;
    }
    return text.fileViewFailed;
  };

  const viewFileInTerminal = async (filePath: string) => {
    const check = await window.bcwTerminal.canViewFileInTerminal(filePath);
    if (!check.viewable) {
      setFileViewMessage(getFileViewFailureMessage(check.reason));
      return;
    }

    await runCommand(createFileViewCommand(filePath));
  };

  const runCommand = async (command: string, options?: { clearCurrentLine?: boolean }) => {
    if (!activeSessionId) {
      return;
    }

    const resolvedCommand = resolveCommandForExecution(command);
    if (!resolvedCommand) {
      return;
    }

    const result = await sendCommand(resolvedCommand, options);
    if (!result.executed) {
      if (result.missingVariables.length > 0) {
        setVariableMessage(`${text.variableMissing} ${result.missingVariables.join(', ')}`);
        openAutomationManager('variables');
      }
      return;
    }

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
    void sendCommand(resolvedCommand);
    appendCommandHistory(resolvedCommand, activeSessionId);
    setMkdirDialogOpen(false);
    setMkdirFolderName('');
    window.requestAnimationFrame(() => {
      focusTerminal();
    });
  };

  const resetVariableForm = () => {
    setVariableForm({ ...EMPTY_VARIABLE_FORM });
    setVariableMessage('');
  };

  const editCommandVariable = (variable: CommandVariableSnapshot) => {
    setVariableForm({
      id: variable.id,
      name: variable.name,
      description: variable.description,
      enabled: variable.enabled,
      kind: variable.kind,
      value: variable.kind === 'text' ? (variable.value ?? '') : '',
    });
    setVariableMessage('');
  };

  const handleSaveCommandVariable = async () => {
    try {
      const saved = await window.bcwTerminal.saveCommandVariable(variableForm);
      setCommandVariables((current) => {
        const exists = current.some((variable) => variable.id === saved.id);
        const next = exists
          ? current.map((variable) => (variable.id === saved.id ? saved : variable))
          : [...current, saved];
        return next.sort((left, right) => left.name.localeCompare(right.name));
      });
      setVariableForm({
        id: saved.id,
        name: saved.name,
        description: saved.description,
        enabled: saved.enabled,
        kind: saved.kind,
        value: saved.kind === 'text' ? (saved.value ?? '') : '',
      });
      setVariableMessage(text.variableSaved);
    } catch (error) {
      setVariableMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDeleteCommandVariable = async (id: string) => {
    try {
      await window.bcwTerminal.deleteCommandVariable(id);
      setCommandVariables((current) => current.filter((variable) => variable.id !== id));
      if (variableForm.id === id) {
        resetVariableForm();
      }
    } catch (error) {
      setVariableMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleTestCommandVariable = (variable: CommandVariableSnapshot) => {
    if (variable.kind === 'secret') {
      setVariableMessage(text.variableTestSecretTooltip);
      return;
    }

    void runCommand(createVariableTestCommand(variable.name));
    setAutomationManagerOpen(false);
  };

  const updateOperationSequence = (id: string, updater: (current: OperationSequence) => OperationSequence) => {
    setSettings((current) => ({
      ...current,
      operationSequences: current.operationSequences.map((sequence) =>
        sequence.id === id ? updater(sequence) : sequence,
      ),
    }));
  };

  const handleCreateOperationSequence = () => {
    const id = makeSequenceId();
    const next: OperationSequence = {
      id,
      title: 'WSL SSH',
      description: 'wsl -> ssh -> password',
      visible: true,
      steps: [
        { input: 'wsl', submit: true, waitFor: '', delayMs: 800 },
        { input: 'ssh -l USER HOST', submit: true, waitFor: '', delayMs: 300 },
        { input: '{{PASSWORD}}', submit: true, waitFor: 'password:', delayMs: 0 },
      ],
    };

    setSettings((current) => ({
      ...current,
      operationSequences: [...current.operationSequences, next],
    }));
    setSequenceTargetId(id);
    setSequenceMessage('');
  };

  const handleDeleteOperationSequence = () => {
    if (!sequenceTargetId) {
      return;
    }

    setSettings((current) => ({
      ...current,
      operationSequences: current.operationSequences.filter((sequence) => sequence.id !== sequenceTargetId),
    }));
    setSequenceMessage('');
  };

  const handleAddSequenceStep = () => {
    if (!sequenceTargetId) {
      return;
    }

    updateOperationSequence(sequenceTargetId, (current) => ({
      ...current,
      steps: [...current.steps, createEmptySequenceStep()],
    }));
  };

  const handleRemoveSequenceStep = (index: number) => {
    if (!sequenceTargetId) {
      return;
    }

    updateOperationSequence(sequenceTargetId, (current) => ({
      ...current,
      steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
    }));
  };

  const updateSequenceStep = (
    index: number,
    updater: (current: TerminalSequenceStep) => TerminalSequenceStep,
  ) => {
    if (!sequenceTargetId) {
      return;
    }

    updateOperationSequence(sequenceTargetId, (current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => (stepIndex === index ? updater(step) : step)),
    }));
  };

  const runOperationSequence = async (sequence: OperationSequence) => {
    if (!activeSessionId || !activeSession || activeSession.status === 'stopped') {
      return;
    }

    const result = await window.bcwTerminal.runSequence(activeSessionId, sequence.steps);
    if (result.executed) {
      setSequenceMessage(text.sequenceRunStarted);
      setSequenceMenuAnchor(null);
      setAutomationManagerOpen(false);
      window.requestAnimationFrame(() => {
        focusTerminal();
      });
      return;
    }

    if (result.missingVariables.length > 0) {
      setVariableMessage(`${text.variableMissing} ${result.missingVariables.join(', ')}`);
      openAutomationManager('variables');
      return;
    }

    setSequenceMessage(result.error || text.sequenceRunError);
    openAutomationManager('sequences');
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

  const pasteClipboardIntoActiveTerminal = async (closeEditMenu = false) => {
    if (!activeSessionId || !activeSession || activeSession.status === 'stopped') {
      if (closeEditMenu) {
        setEditMenuAnchor(null);
      }
      window.requestAnimationFrame(() => {
        focusTerminal();
      });
      return;
    }

    const clipboardText = await window.bcwTerminal.readClipboardText();
    if (!clipboardText) {
      if (closeEditMenu) {
        setEditMenuAnchor(null);
      }
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
    if (closeEditMenu) {
      setEditMenuAnchor(null);
    }
    window.requestAnimationFrame(() => {
      focusTerminal();
    });
  };

  const handleTerminalContextMenu = async (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();

    const selectedText = getSelectionText() || window.getSelection()?.toString() || '';
    if (selectedText.trim()) {
      await window.bcwTerminal.writeClipboardText(selectedText);
      clearSelection();
      window.requestAnimationFrame(() => {
        focusTerminal();
      });
      return;
    }

    await pasteClipboardIntoActiveTerminal();
  };

  const handlePasteClipboard = async () => {
    await pasteClipboardIntoActiveTerminal(true);
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

  useEffect(() => {
    return window.bcwTerminal.onSaveTerminalOutputRequest(() => {
      void handleSaveTerminalOutput();
    });
  }, [handleSaveTerminalOutput]);

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
  const selectedOperationSequence =
    settings.operationSequences.find((sequence) => sequence.id === sequenceTargetId) ?? null;
  const visibleOperationSequences = settings.operationSequences.filter((sequence) => sequence.visible);

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
  const hasRightToolbarActions = isButtonVisible('edit') || isButtonVisible('history');
  const shortcutDisabled = !activeSession || activeSession.status === 'stopped';
  const renderShortcutButton = (
    key: string,
    title: string,
    description: string,
    icon: ReactNode,
    onClick: (event: MouseEvent<HTMLButtonElement>) => void,
  ) => (
    <Tooltip key={key} title={description}>
      <span>
        <Button
          className="terminal-shortcut-button"
          disabled={shortcutDisabled}
          endIcon={<ArrowDropDownIcon />}
          size="small"
          startIcon={icon}
          variant="outlined"
          onClick={onClick}
        >
          {title}
        </Button>
      </span>
    </Tooltip>
  );
  const renderCommandMenuItems = (items: CommandMenuItem[], onClose: () => void) =>
    items.map((item, index) => (
      <MenuItem
        key={`${item.command}-${index}`}
        onClick={() => {
          runCommand(item.command);
          onClose();
        }}
      >
        <ListItemIcon>
          <PlayArrowIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primary={item.label} secondary={`${item.command} - ${item.description}`} />
      </MenuItem>
    ));

  const renderFileTreeEntries = (directoryPath: string, depth = 0): ReactNode => {
    const entries = fileTree.childrenByPath[directoryPath] ?? [];
    const isLoading = Boolean(fileTree.loadingPaths[directoryPath]);
    const error = fileTree.errorsByPath[directoryPath];

    if (error) {
      return (
        <Typography className="terminal-file-tree-message" sx={{ pl: `${depth * 14 + 10}px` }}>
          {text.fileTreeError}: {error}
        </Typography>
      );
    }

    if (isLoading && entries.length === 0) {
      return (
        <Typography className="terminal-file-tree-message" sx={{ pl: `${depth * 14 + 10}px` }}>
          {text.fileTreeLoading}
        </Typography>
      );
    }

    if (!isLoading && entries.length === 0) {
      return (
        <Typography className="terminal-file-tree-message" sx={{ pl: `${depth * 14 + 10}px` }}>
          {text.fileTreeEmpty}
        </Typography>
      );
    }

    return entries.map((entry) => {
      const isDirectory = entry.type === 'directory';
      const isExpanded = Boolean(fileTree.expandedPaths[entry.path]);
      const isChildLoading = Boolean(fileTree.loadingPaths[entry.path]);

      return (
        <Box key={entry.path} className="terminal-file-tree-node">
          <button
            className={`terminal-file-tree-row${isDirectory ? ' is-directory' : ''}`}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            title={isDirectory ? entry.path : `${text.fileViewInTerminal}: ${entry.path}`}
            type="button"
            onClick={() => {
              if (isDirectory) {
                toggleFileTreeDirectory(entry.path);
                void runCommand(createChangeDirectoryCommand(entry.path), { clearCurrentLine: true });
              }
            }}
            onContextMenu={(event) => {
              if (isDirectory) {
                return;
              }

              event.preventDefault();
              void viewFileInTerminal(entry.path);
            }}
          >
            {isDirectory ? (
              <ChevronRightIcon className={`terminal-file-tree-chevron${isExpanded ? ' is-expanded' : ''}`} />
            ) : (
              <span className="terminal-file-tree-spacer" />
            )}
            {isDirectory ? (
              <FolderIcon className="terminal-file-tree-icon is-directory" />
            ) : (
              <InsertDriveFileIcon className="terminal-file-tree-icon" />
            )}
            <span className="terminal-file-tree-name">{entry.name}</span>
          </button>
          {isDirectory && isExpanded ? (
            <Box className="terminal-file-tree-children">
              {isChildLoading ? (
                <Typography className="terminal-file-tree-message" sx={{ pl: `${(depth + 1) * 14 + 10}px` }}>
                  {text.fileTreeLoading}
                </Typography>
              ) : (
                renderFileTreeEntries(entry.path, depth + 1)
              )}
            </Box>
          ) : null}
        </Box>
      );
    });
  };

  const deleteCommandHistoryItem = (historyItemId: string) => {
    setCommandHistory((current) => current.filter((item) => item.id !== historyItemId));
  };

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
      <Box className="terminal-shortcuts">
        <Tooltip title={text.createSessionTooltip}>
          <IconButton
            aria-label="New PowerShell session"
            className="terminal-toolbar-icon"
            color="primary"
            onClick={createSession}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={isFileExplorerExpanded ? text.closeFileExplorer : text.expandFileExplorer}>
          <span>
            <IconButton
              aria-label={isFileExplorerExpanded ? 'Collapse file explorer' : 'Expand file explorer'}
              className="terminal-toolbar-icon"
              color="primary"
              disabled={!canToggleFileExplorer}
              onClick={toggleFileExplorer}
            >
              <FolderIcon />
            </IconButton>
          </span>
        </Tooltip>

        {orderedShortcutGroupIds.map((groupId) => {
          if (groupId === 'claude') {
            return renderShortcutButton(
              groupId,
              settings.menuConfigs.claude.title,
              settings.menuConfigs.claude.description,
              <SmartToyIcon />,
              (event) => {
                setActiveAiMenu('claude');
                setAiMenuAnchor(event.currentTarget);
              },
            );
          }

          if (groupId === 'chatgpt') {
            return renderShortcutButton(
              groupId,
              settings.menuConfigs.chatgpt.title,
              settings.menuConfigs.chatgpt.description,
              <ChatIcon />,
              (event) => {
                setActiveAiMenu('chatgpt');
                setAiMenuAnchor(event.currentTarget);
              },
            );
          }

          if (groupId === 'git') {
            return renderShortcutButton(
              groupId,
              settings.menuConfigs.git.title,
              settings.menuConfigs.git.description,
              <GitHubIcon />,
              (event) => setGitMenuAnchor(event.currentTarget),
            );
          }

          if (groupId === 'ls') {
            return renderShortcutButton(
              groupId,
              settings.menuConfigs.ls.title,
              settings.menuConfigs.ls.description,
              <FormatListBulletedIcon />,
              (event) => setListMenuAnchor(event.currentTarget),
            );
          }

          if (groupId === 'dir') {
            return renderShortcutButton(
              groupId,
              settings.menuConfigs.dir.title,
              settings.menuConfigs.dir.description,
              <FormatListBulletedIcon />,
              (event) => setDirMenuAnchor(event.currentTarget),
            );
          }

          if (groupId === 'network') {
            return renderShortcutButton(
              groupId,
              settings.menuConfigs.network.title,
              settings.menuConfigs.network.description,
              <LanIcon />,
              (event) => setNetworkMenuAnchor(event.currentTarget),
            );
          }

          const customGroup = customMap.get(groupId);
          if (!customGroup) {
            return null;
          }

          return renderShortcutButton(
            customGroup.id,
            customGroup.title,
            customGroup.description || text.customGroup,
            <TerminalIcon />,
            (event) => {
              setCustomMenuTargetId(customGroup.id);
              setCustomMenuAnchor(event.currentTarget);
            },
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
          {renderCommandMenuItems(activeAiMenu ? settings.menuConfigs[activeAiMenu].items : [], () => {
            setAiMenuAnchor(null);
            setActiveAiMenu(null);
          })}
        </Menu>

        <Menu anchorEl={gitMenuAnchor} open={Boolean(gitMenuAnchor)} onClose={() => setGitMenuAnchor(null)}>
          {renderCommandMenuItems(settings.menuConfigs.git.items, () => setGitMenuAnchor(null))}
        </Menu>

        <Menu anchorEl={listMenuAnchor} open={Boolean(listMenuAnchor)} onClose={() => setListMenuAnchor(null)}>
          {renderCommandMenuItems(settings.menuConfigs.ls.items, () => setListMenuAnchor(null))}
        </Menu>

        <Menu anchorEl={dirMenuAnchor} open={Boolean(dirMenuAnchor)} onClose={() => setDirMenuAnchor(null)}>
          {renderCommandMenuItems(settings.menuConfigs.dir.items, () => setDirMenuAnchor(null))}
        </Menu>

        <Menu anchorEl={networkMenuAnchor} open={Boolean(networkMenuAnchor)} onClose={() => setNetworkMenuAnchor(null)}>
          {renderCommandMenuItems(settings.menuConfigs.network.items, () => setNetworkMenuAnchor(null))}
        </Menu>

        <Menu
          anchorEl={customMenuAnchor}
          open={Boolean(customMenuAnchor) && Boolean(customMenuTargetId)}
          onClose={() => {
            setCustomMenuAnchor(null);
            setCustomMenuTargetId(null);
          }}
        >
          {renderCommandMenuItems(customMenuItems, () => {
            setCustomMenuAnchor(null);
            setCustomMenuTargetId(null);
          })}
        </Menu>

        {visibleOperationSequences.length > 0 ? (
          <>
            <Tooltip title={text.sequenceManagerDescription}>
              <span>
                <Button
                  className="terminal-shortcut-button"
                  disabled={!activeSession || activeSession.status === 'stopped'}
                  endIcon={<ArrowDropDownIcon />}
                  size="small"
                  startIcon={<PlaylistPlayIcon />}
                  variant="outlined"
                  onClick={(event) => setSequenceMenuAnchor(event.currentTarget)}
                >
                  {text.sequenceMenu}
                </Button>
              </span>
            </Tooltip>
            <Menu
              anchorEl={sequenceMenuAnchor}
              open={Boolean(sequenceMenuAnchor)}
              onClose={() => setSequenceMenuAnchor(null)}
            >
              {visibleOperationSequences.map((sequence) => (
                <MenuItem
                  key={sequence.id}
                  onClick={() => {
                    void runOperationSequence(sequence);
                    setSequenceMenuAnchor(null);
                  }}
                >
                  <ListItemIcon>
                    <PlaylistPlayIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={sequence.title} secondary={sequence.description} />
                </MenuItem>
              ))}
              <Divider />
              <MenuItem
                onClick={() => {
                  setSequenceMenuAnchor(null);
                  openAutomationManager('sequences');
                }}
              >
                <ListItemIcon>
                  <TuneIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={text.sequenceManager} secondary={text.sequenceManagerDescription} />
              </MenuItem>
            </Menu>
          </>
        ) : null}

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
                    title={text.deleteHistoryItem}
                    onClick={() => {
                      runCommand(item.command, { clearCurrentLine: true });
                      setHistoryMenuAnchor(null);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      deleteCommandHistoryItem(item.id);
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
        <Tooltip title={text.settings}>
          <IconButton
            aria-label="Open settings"
            className={`terminal-toolbar-icon terminal-toolbar-settings${hasRightToolbarActions ? '' : ' terminal-shortcut-system-start'}`}
            color="primary"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Box
        className={`terminal-workspace${shouldShowFileExplorer ? ' has-file-explorer' : ''}${
          shouldShowSidebar ? '' : ' is-sidebar-hidden'
        }`}
      >
        {shouldShowFileExplorer ? (
          <Box component="aside" className="terminal-file-sidebar" aria-label="Files">
            <Stack direction="row" alignItems="center" justifyContent="space-between" className="terminal-sidebar-header">
              <Typography className="terminal-sidebar-title">{text.fileExplorer}</Typography>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title={text.refreshFileTree}>
                  <IconButton aria-label="Refresh file tree" color="primary" size="small" onClick={refreshFileTree}>
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={text.closeFileExplorer}>
                  <IconButton aria-label="Collapse file explorer" color="primary" size="small" onClick={toggleFileExplorer}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
            <Typography className="terminal-file-root" title={fileTree.rootPath}>
              {fileTree.pendingRootPath || fileTree.rootPath}
            </Typography>
            <Box className="terminal-file-tree">{renderFileTreeEntries(fileTree.rootPath)}</Box>
          </Box>
        ) : null}

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

            <Tooltip title={`${text.variableManagerDescription} ${text.sequenceManagerDescription}`}>
              <span>
                <Button variant="outlined" startIcon={<KeyIcon />} onClick={() => openAutomationManager('variables')}>
                  {text.automationManager}
                </Button>
              </span>
            </Tooltip>

            <Tooltip title={text.commandManagerDescription}>
              <span>
                <Button variant="outlined" startIcon={<TuneIcon />} onClick={() => setCommandManagerOpen(true)}>
                  {text.commandManager}
                </Button>
              </span>
            </Tooltip>

            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={settings.showFileExplorer}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, showFileExplorer: event.target.checked }))
                  }
                />
              }
              label={text.showFileExplorer}
            />
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

            <Divider />

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

      <Dialog fullWidth maxWidth="md" open={automationManagerOpen} onClose={() => setAutomationManagerOpen(false)}>
        <DialogTitle>{text.automationManager}</DialogTitle>
        <DialogContent dividers>
          <Tabs
            value={automationManagerTab}
            onChange={(_event, value: AutomationManagerTab) => setAutomationManagerTab(value)}
            sx={{ mb: 2 }}
          >
            <Tab label={text.variableManager} value="variables" />
            <Tab label={text.sequenceManager} value="sequences" />
          </Tabs>
          {automationManagerTab === 'variables' ? (
          <Stack spacing={2}>
            <Box>
              <Typography className="terminal-settings-label">{text.variableManager}</Typography>
              <Typography className="terminal-settings-description">{text.variableManagerDescription}</Typography>
            </Box>

            <Stack spacing={1}>
              {commandVariables.length === 0 ? (
                <Typography className="terminal-settings-description">{text.variablesEmpty}</Typography>
              ) : (
                commandVariables.map((variable) => (
                  <Stack key={variable.id} direction="row" alignItems="flex-start" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography className="terminal-settings-toggle-label">
                        {variable.name} / {variable.kind === 'secret' ? text.variableKindSecret : text.variableKindText}
                      </Typography>
                      <Typography className="terminal-settings-description">
                        {text.variableReference}: {toVariableReference(variable.name)}
                      </Typography>
                      {variable.description ? (
                        <Typography className="terminal-settings-description">{variable.description}</Typography>
                      ) : null}
                    </Box>
                    <Button size="small" variant="outlined" onClick={() => editCommandVariable(variable)}>
                      {text.editButton}
                    </Button>
                    <Tooltip
                      title={variable.kind === 'secret' ? text.variableTestSecretTooltip : createVariableTestCommand(variable.name)}
                    >
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={variable.kind === 'secret' || !activeSession || activeSession.status === 'stopped'}
                          onClick={() => handleTestCommandVariable(variable)}
                        >
                          {text.variableTestInTerminal}
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title={text.variableDeleteTooltip}>
                      <span>
                        <IconButton size="small" onClick={() => void handleDeleteCommandVariable(variable.id)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                ))
              )}
            </Stack>

            <Divider />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={resetVariableForm}>
                {text.variableNew}
              </Button>
              {variableForm.name ? (
                <Button
                  variant="outlined"
                  onClick={() => void window.bcwTerminal.writeClipboardText(toVariableReference(variableForm.name))}
                >
                  {text.variableReference}: {toVariableReference(variableForm.name)}
                </Button>
              ) : null}
            </Stack>

            <TextField
              label={text.variableName}
              size="small"
              value={variableForm.name}
              onChange={(event) =>
                setVariableForm((current) => ({
                  ...current,
                  name: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
                }))
              }
            />
            <TextField
              select
              label={text.variableKind}
              size="small"
              value={variableForm.kind}
              onChange={(event) =>
                setVariableForm((current) => ({
                  ...current,
                  kind: event.target.value as CommandVariableKind,
                  value: event.target.value === 'secret' ? '' : current.value,
                }))
              }
            >
              <MenuItem value="text">{text.variableKindText}</MenuItem>
              <MenuItem value="secret">{text.variableKindSecret}</MenuItem>
            </TextField>
            <TextField
              label={text.variableValue}
              size="small"
              type={variableForm.kind === 'secret' ? 'password' : 'text'}
              value={variableForm.value}
              helperText={variableForm.kind === 'secret' ? text.variableSecretPlaceholder : undefined}
              onChange={(event) => setVariableForm((current) => ({ ...current, value: event.target.value }))}
            />
            <TextField
              label={text.variableDescription}
              size="small"
              value={variableForm.description}
              onChange={(event) => setVariableForm((current) => ({ ...current, description: event.target.value }))}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={variableForm.enabled}
                  onChange={(event) => setVariableForm((current) => ({ ...current, enabled: event.target.checked }))}
                />
              }
              label={text.variableEnabled}
            />
            {variableMessage ? (
              <Typography className="terminal-settings-description">{variableMessage}</Typography>
            ) : null}
          </Stack>
          ) : null}
          {automationManagerTab === 'sequences' ? (
          <Stack spacing={2}>
            <Box>
              <Typography className="terminal-settings-label">{text.sequenceManager}</Typography>
              <Typography className="terminal-settings-description">{text.sequenceManagerDescription}</Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                select
                label={text.groupTarget}
                size="small"
                value={sequenceTargetId}
                sx={{ minWidth: 260 }}
                onChange={(event) => setSequenceTargetId(event.target.value)}
              >
                {settings.operationSequences.length === 0 ? (
                  <MenuItem value="">{text.sequenceNoItems}</MenuItem>
                ) : null}
                {settings.operationSequences.map((sequence) => (
                  <MenuItem key={sequence.id} value={sequence.id}>
                    {sequence.title}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={handleCreateOperationSequence}>
                {text.sequenceNew}
              </Button>
              <Button
                variant="outlined"
                color="error"
                disabled={!selectedOperationSequence}
                onClick={handleDeleteOperationSequence}
              >
                {text.deleteGroup}
              </Button>
            </Stack>

            {selectedOperationSequence ? (
              <>
                <TextField
                  label={text.sequenceTitle}
                  size="small"
                  value={selectedOperationSequence.title}
                  onChange={(event) =>
                    updateOperationSequence(selectedOperationSequence.id, (current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
                <TextField
                  label={text.sequenceDescription}
                  size="small"
                  value={selectedOperationSequence.description}
                  onChange={(event) =>
                    updateOperationSequence(selectedOperationSequence.id, (current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={selectedOperationSequence.visible}
                      onChange={(event) =>
                        updateOperationSequence(selectedOperationSequence.id, (current) => ({
                          ...current,
                          visible: event.target.checked,
                        }))
                      }
                    />
                  }
                  label={text.menuVisible}
                />

                <Divider />

                <Typography className="terminal-settings-label">{text.manageItems}</Typography>
                <Stack spacing={2}>
                  {selectedOperationSequence.steps.map((step, index) => (
                    <Stack key={`${selectedOperationSequence.id}-${index}`} className="terminal-sequence-step" spacing={2}>
                      <Stack className="terminal-sequence-step-header" direction="row" alignItems="center" spacing={1}>
                        <Typography className="terminal-settings-toggle-label">Step {index + 1}</Typography>
                        <Tooltip title={text.deleteItemTooltip}>
                          <span>
                            <IconButton size="small" onClick={() => handleRemoveSequenceStep(index)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                      <TextField
                        label={text.sequenceStepWaitFor}
                        size="small"
                        value={step.waitFor ?? ''}
                        onChange={(event) =>
                          updateSequenceStep(index, (current) => ({ ...current, waitFor: event.target.value }))
                        }
                      />
                      <TextField
                        label={text.sequenceInput}
                        size="small"
                        value={step.input}
                        onChange={(event) =>
                          updateSequenceStep(index, (current) => ({ ...current, input: event.target.value }))
                        }
                      />
                      <Stack
                        className="terminal-sequence-step-footer"
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={2}
                      >
                        <TextField
                          label={text.sequenceDelayMs}
                          size="small"
                          type="number"
                          value={step.delayMs ?? 0}
                          onChange={(event) =>
                            updateSequenceStep(index, (current) => ({
                              ...current,
                              delayMs: Math.max(0, Number(event.target.value) || 0),
                            }))
                          }
                          sx={{ flex: 1 }}
                        />
                        <FormControlLabel
                          className="terminal-sequence-submit-toggle"
                          control={
                            <Switch
                              checked={step.submit !== false}
                              onChange={(event) =>
                                updateSequenceStep(index, (current) => ({
                                  ...current,
                                  submit: event.target.checked,
                                }))
                              }
                            />
                          }
                          label={text.sequenceSubmit}
                        />
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
                <Button variant="outlined" onClick={handleAddSequenceStep}>
                  {text.sequenceAddStep}
                </Button>
                {sequenceMessage ? (
                  <Typography className="terminal-settings-description">{sequenceMessage}</Typography>
                ) : null}
              </>
            ) : (
              <Typography className="terminal-settings-description">{text.sequenceNoItems}</Typography>
            )}
          </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAutomationManagerOpen(false)}>Close</Button>
          {automationManagerTab === 'variables' ? (
            <Button variant="contained" onClick={() => void handleSaveCommandVariable()} disabled={!variableForm.name.trim()}>
              {text.jsonSave}
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={!selectedOperationSequence || !activeSession || activeSession.status === 'stopped'}
              onClick={() => {
                if (selectedOperationSequence) {
                  void runOperationSequence(selectedOperationSequence);
                }
              }}
            >
              {text.runAgain}
            </Button>
          )}
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

      <Snackbar
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        autoHideDuration={4200}
        message={fileViewMessage}
        open={Boolean(fileViewMessage)}
        onClose={() => setFileViewMessage('')}
      />
    </Box>
  );
}
