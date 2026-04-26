# BcwTerminal

## Latest Docs

- [Recent Updates (2026-04-26)](docs/recent-updates-2026-04-26.md)

Windows 上で動く、自分専用の開発ターミナルダッシュボード。
Windows Terminal を完全に置き換えるのではなく、よく使う開発コマンドをワンクリックで叩けるよう拡張した PowerShell ラッパーです。

- Electron + React + TypeScript + MUI + xterm.js
- PowerShell を PTY として起動するため、対話型 CLI（`claude`、`codex`、`npm run dev` など）にも対応
- 複数セッション、コマンドショートカット、コマンド管理（JSON 編集 / 保存・読み込み）、履歴、最前面固定などをサポート

## 主な機能

- **PowerShell セッション管理**: 中央のメインターミナル + 右サイドのサムネイルで複数セッションを切替
- **コマンドショートカット**: Claude / ChatGPT / Git / ls / Network などをドロップダウン化
- **コマンド管理ダイアログ**:
  - フォーム編集モード: グループ単位でタイトル・項目（ラベル / コマンド / 説明）を編集
  - JSON 編集モード: `groups` / `groupOrder` を直接編集 / ファイル保存・読み込み
- **カスタムコマンドグループ**: 任意のグループを作成し、配下にコマンドを自由に追加
- **コマンド履歴**: 直近 30 件をドロップダウンから再実行
- **設定**:
  - 表示言語（日本語 / English）
  - フォント / サイズ / 行間
  - ターミナル文字色 / 背景色
  - サイドバー表示・単一セッション時の自動非表示
  - 最前面固定（ウィンドウ状態は次回起動時に復元）
- **編集メニュー**: 選択範囲コピー / クリップボード貼り付け / Ctrl+C 送信 / クリア（`cls`）

## 必要環境

- Windows 10 / 11
- Node.js 20 系以上
- npm 10 系以上
- PowerShell 5.1 以上（既定の `powershell.exe` を使用）

## セットアップ

```powershell
git clone https://github.com/BuildCooperWorks/bcw-terminal.git
cd bcw-terminal
npm install
```

`@homebridge/node-pty-prebuilt-multiarch` のバイナリで問題が起きた場合は、Electron 用に再ビルドします。

```powershell
npm run rebuild:native
```

## 開発

```powershell
npm run dev
```

Vite の開発サーバーを起動し、Electron が `http://127.0.0.1:5173` を読み込みます。
DevTools は別ウィンドウで開きます。

## 型チェック / ビルド

```powershell
npm run typecheck   # tsc --noEmit
npm run build       # アイコン生成 + tsc + Vite ビルド + main プロセスの TypeScript ビルド
```

ビルド成果物は `dist/` 配下に出力されます。

## 配布用ビルド (portable .exe)

`electron-builder` で **インストール不要の portable .exe** を作成できます。

```powershell
npm run dist:win
```

成果物は `release/BcwTerminal-<version>-portable.exe`（約 96MB）。
ダブルクリックで起動でき、ユーザーデータは `userData`（OS の `AppData/Roaming/BcwTerminal`）に保存されます。

### 初回ビルド時の注意 (winCodeSign キャッシュ)

electron-builder は内部で `winCodeSign-2.6.0.7z` をダウンロード・展開しますが、アーカイブ内の macOS 用 `.dylib` がシンボリックリンクで構成されているため、**Windows でシンボリックリンク作成権限がない環境（Developer Mode OFF かつ非管理者）ではエラーになります**。

回避策のいずれかを選んでください:

- **A. Windows の Developer Mode を有効化する**（推奨・一度だけ）
  - 設定 → 「開発者向け」 → 「開発者モード」を ON
- **B. 初回ビルドだけ管理者権限の PowerShell で `npm run dist:win` を実行**（キャッシュが作成された後は通常権限で OK）
- **C. キャッシュを手動展開**（管理者権限不可・Dev Mode を有効化できない場合のみ）
  ```powershell
  $cache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
  # 一度 npm run dist:win を実行し、$cache\<random>.7z をダウンロードさせる（失敗 OK）
  & "node_modules\7zip-bin\win\x64\7za.exe" x "$cache\<random>.7z" "-o$cache\winCodeSign-2.6.0" "-xr!darwin" -y
  # その後 npm run dist:win を再実行
  ```

## ディレクトリ構成

`bulletproof-react` 準拠で、機能単位は `src/features/` に閉じます。

```
src/
  app/                      # ルートコンポーネント / テーマ
  features/
    terminal/               # ターミナル機能一式
      components/
      hooks/
      types/
  main/                     # Electron main プロセス
  preload/                  # preload script + 公開型
docs/
  AGENTS.md                 # 仕様 SSOT（仕様変更時はここを更新）
  idea.md                   # 初期構想メモ
public/                     # アイコン等の静的ファイル
scripts/                    # ビルドヘルパー（アイコン生成 / Electron 起動）
```

## コマンド設定の永続化

- 設定 / コマンド設定 / 履歴は `localStorage` に保存
- ウィンドウサイズ・位置・最大化・最前面状態は Electron の `userData/window-state.json` に保存
- コマンド管理 → JSON 編集 → 「JSON ファイルに保存 / 読み込み」で外部ファイルとも入出力可能

## 既知の制限 / 注意

- 現状は Windows + PowerShell 専用（macOS / Linux やその他シェルは未対応）
- 配布用パッケージはまだ作成していない
- ローカル限定で利用する前提。秘密情報を含むコマンドは履歴やログに残らないよう各自で注意

## ライセンス

未設定。

## Windows 注意事項 (Smart App Control)

- Windows 11 の **Smart App Control** が `ON` の場合、ローカル CLI や一部プロセス起動がブロックされ、ターミナル操作が失敗することがあります。
- コマンド起動に失敗する場合は、Smart App Control を `OFF` に設定したうえで Windows を再起動してください。
- BcwTerminal は起動時に Smart App Control 状態を検知し、`ON` / `評価モード` の場合は設定画面に警告メッセージを表示します。
