# BcwTerminal AGENTS

Task 名: BcwTerminal 仕様策定・MVP 実装準備

このファイルは、BcwTerminal を AI と一緒に構築するための仕様メモです。  
実装方針・優先順位・注意点の単一情報源として扱い、`idea.md` の内容を実装向けに整理しています。

## 0. ドキュメント運用ルール
- このファイルを BcwTerminal 開発の SSOT とする。
- 仕様や優先順位を変更した場合は、実装前または実装直後にこのファイルを更新する。
- 変更履歴には、日付と変更内容を短く残す。

## 1. プロダクト概要
- プロダクト名: BcwTerminal
- 目的: Windows Terminal が使いづらい場面を補う、自分専用の開発ターミナルを作る。
- コンセプト: 「Windows Terminal の完全代替」ではなく、よく使う開発コマンドをすぐ叩けるコマンド操作ダッシュボード。
- 成功指標:
  - PowerShell を起動し、コマンド入力と出力表示ができる。
  - npm / git / cd / ls など日常的な開発操作をストレスなく実行できる。
  - 作業ディレクトリを切り替えながら使える。

## 2. 技術スタック
- Desktop shell: Electron
- Frontend: React + Vite 8 + MUI
- Language: TypeScript
- Terminal UI: xterm.js
- UI Components/Theming: MUI（Material UI, Emotion）
- Backend/runtime: Node.js
- Process control: `node-pty`（PowerShell を PTY として起動し、対話型 CLI に対応する）
- Internal communication: Electron IPC
- Directory architecture: bulletproof-react 準拠
- Future option: 気に入ったら Tauri へ移行して軽量化する。ただし Rust が必要になるため後回し。

## 3. ペルソナ / ユースケース
- 想定ユーザー: Windows 上で開発作業をする自分。
- 主要ユースケース:
  - PowerShell を BcwTerminal 内で操作する。
  - `npm i`、開発サーバー起動、git 操作を行う。
  - `cd` / `ls` などでローカルフォルダを操作する。
  - よく使うコマンドを将来的にボタンやショートカットから実行する。
- 非対象:
  - 初期段階での Windows Terminal 完全互換。
  - ブラウザ単体でのローカル操作。
  - 初期段階でのリモート実行や共有環境向け機能。

## 4. 画面構成 / ナビゲーション
- MVP では単一のターミナル画面を中心にする。
- xterm.js で入力・出力を表示する。
- 作業ディレクトリの現在地はターミナルプロンプトとセッションサムネイルで把握する。ヘッダー Tips は廃止し、主要操作は単一ツールバーに集約する。
- 将来的に複数タブ、プロジェクト切り替え、コマンドショートカット領域を追加する。
- 複数ターミナルはタブではなく、中央のメインターミナルと右サイドの縦サムネイル一覧で扱う。
- 右サイドのサムネイルには、最後に入力したコマンド、推定中の処理種別、Running / Idle / Stopped、直近出力を表示する。
- デスクトップアプリ前提のため、まずは Windows の通常ウィンドウサイズで使いやすくする。

## 5. 機能要件
### 5.1 MVP
- xterm.js によるターミナル画面表示。
- コマンド入力。
- PowerShell プロセスの起動。
- 入力コマンドの PowerShell への送信。
- stdout / stderr の表示。
- 作業ディレクトリ変更（`cd`）への対応。

### 5.2 Next
- コマンドショートカットのボタン化。
- 複数タブ。
- コマンド履歴検索。
- プロジェクト切り替え。

### 5.3 Later
- Docker 連携。
- Azure CLI 連携。
- Tauri への移行検討。

## 6. 非機能要件
- 起動と操作感は軽くする。
- UI は見やすく、自分用に最適化する。
- ローカル限定で動かす。
- コマンド実行は危険操作を含むため、将来的に確認や制限の仕組みを検討する。
- 秘密情報や認証情報をログに残さない。

## 7. アーキテクチャ方針
### 7.1 レイヤ責務
- React: ターミナル UI、コマンド入力、表示状態。
- Electron main / preload: IPC 境界、Node.js API の安全な公開。
- Node.js: PowerShell プロセス管理、stdin/stdout/stderr の橋渡し。

### 7.2 コア処理イメージ
```ts
pty.spawn("powershell.exe", ["-NoLogo", "-NoProfile"]);
terminalInput => pty.write(terminalInput);
pty.onData(handleOutput);
```

### 7.3 ディレクトリ構成方針（bulletproof-react 準拠）
- アプリは `src` 配下で feature-first に構成する。
- 共有ロジックは `src/components` `src/lib` `src/hooks` `src/utils` へ集約する。
- 画面単位は `src/features/<feature-name>` に閉じる。
- Electron 側は `src/main`（main process）と `src/preload`（preload script）を分離する。
- 例:
```txt
src/
  app/
  features/
    terminal/
      components/
      hooks/
      services/
      types/
  components/
  lib/
  hooks/
  utils/
  styles/
  main/
  preload/
```

### 7.4 通信方針
- Renderer と main process の通信は Electron IPC を使う。
- Renderer から Node.js API を直接触らせず、preload 経由で必要な操作だけ公開する。

### 7.5 命名規約
- React コンポーネントは PascalCase。
- 関数・変数は camelCase。
- IPC チャンネル名は機能単位で分かる名前にする。

### 7.6 UI実装規約
- ターミナル画面を主役にする。
- UI 実装は MUI を優先し、カスタム実装は必要最小限にする。
- よく使う操作は将来的にアイコンボタンやショートカットとして配置する。
- よく使うコマンドはショートカットボタンとして配置し、選択中のターミナルへ即送信できるようにする。
- 設定ではフォント、表示密度、サイドバー表示、停止確認など、日常利用で頻繁に調整する項目を優先する。
- 設定画面から、コマンドボタンごとの表示 ON/OFF を切り替えられるようにする。
- Sessions サイドバーは展開/縮小可能にし、単一セッション時は初期状態で自動非表示にできるようにする。
- AI 系コマンド（Claude / ChatGPT）と Git コマンドは初期状態では非表示とし、必要に応じて設定で有効化する。
- UI 文言は日本語を既定とし、将来の英語化に備えて文言辞書と設定画面での言語切替を維持する。
- Electron のアプリメニュー（ファイル / 編集 / 表示 / ウィンドウ / ヘルプ）も日本語既定とし、言語設定に連動して英語表示へ切替できるようにする。
- コピー / 貼り付け / Ctrl+C 送信は「編集」ドロップダウンとして提供し、設定画面から表示ON/OFFを切替できるようにする。
- 編集メニューには、選択範囲コピー、クリップボード貼り付け、ターミナル出力保存、Ctrl+C送信、画面クリアを集約する。
- ターミナル上の右クリックは、選択範囲があればコピー、選択範囲がなければクリップボード貼り付けとして扱う。
- コマンドボタンごとに、タイトル編集とドロップダウン項目（項目名 / コマンド / 説明）の追加・削除を設定画面から行えるようにする。
- コマンド履歴一覧を参照可能にし、履歴項目のクリックで再実行できるようにする。
- コマンド履歴は履歴メニュー内からクリア可能にする。
- ショートカット列では、編集可能なコマンドグループを左側、システム系の「編集」「履歴」を右端に配置する。
- ヘッダー Tips / Ready 表示は置かず、セッション作成、操作シーケンス、編集、履歴、設定を単一ツールバーで扱う。
- 変数は `{{VARIABLE_NAME}}` 形式で参照できるようにし、パスワードなどは暗号化保存されるシークレット変数として扱う。
- WSL 起動、SSH 接続、パスワード入力待ちなどの対話操作は、操作シーケンスとして登録・実行できるようにする。
- 説明文よりも実操作できる UI を優先する。

## 8. データ設計
- MVP では永続データを最小限にする。
- 保存対象:
  - コマンド履歴
  - よく使うコマンド
  - 変数設定 / シークレット変数
  - 操作シーケンス
  - 表示設定 / 言語 / ターミナル色 / サイドバー表示
  - ウィンドウサイズ・位置・最大化状態・最前面状態
- 将来的に保存候補:
  - プロジェクト一覧
  - タブ状態

## 9. API / 外部連携
- 初期段階では外部 API 連携なし。
- OS 操作は Node.js の `child_process` を経由する。
- Docker / Azure CLI は Later 段階で検討する。

## 10. テーマ / デザイン方針
- 軽く、見やすく、長時間使いやすい UI にする。
- ターミナルの可読性を最優先する。
- ダークテーマを基本候補にする。
- コマンドショートカットやプロジェクト切り替えは、作業を邪魔しない密度で配置する。
- ターミナル内スクロールを主とし、ページ外側や xterm 既定スクロールバーが目立たないようにする。

## 11. テスト戦略
- PowerShell 起動と終了の基本動作を確認する。
- stdin 送信、stdout/stderr 表示を確認する。
- `cd` による作業ディレクトリ変更を確認する。
- `tree` など大量出力でも renderer が落ちにくいことを確認する。
- アクティブターミナル出力のファイル保存を確認する。
- 危険操作や失敗時のエラー表示を確認する。

## 12. デプロイ運用
- まずはローカル開発環境で動作確認する。
- パッケージ化は MVP が動いてから検討する。
- 配布よりも自分の開発環境で安定して使えることを優先する。

## 13. AI協働ルール
- 実装前にこのファイルと `idea.md` を確認する。
- まず MVP を動かすことを優先し、拡張機能は後回しにする。
- Electron / React / TypeScript / xterm.js / MUI の既存パターンを尊重する。
- ディレクトリ構成は bulletproof-react 準拠を崩さない。
- コマンド実行まわりはセキュリティとローカル限定の前提を明記して扱う。
- 秘密情報を含むログや設定ファイルを作らない。

## 14. ロードマップ
- Step 1: Electron + React + Vite + TypeScript のテンプレート作成。
- Step 2: xterm.js 導入。
- Step 3: PowerShell 接続。
- Step 4: コマンド入力と実行結果表示。
- Step 5: `cd` と作業ディレクトリ表示。
- Step 6: コマンドショートカット、複数タブ、履歴検索。

## 15. Definition of Done (DoD)
- BcwTerminal のウィンドウ内で PowerShell が操作できる。
- コマンド入力と出力表示が xterm.js 上で成立する。
- `npm i`、git 操作、`cd` / `ls` の基本操作ができる。
- 変更した仕様や判断をこのファイルに反映している。

## 16. 変更履歴
- 2026-04-24: `idea.md` を元に初期仕様へ更新。
- 2026-04-24: UI 方針を MUI に変更し、ディレクトリ構成を bulletproof-react 準拠に更新。
- 2026-04-24: プロダクト名を BcwTerminal に変更。
- 2026-04-24: Task 名を `BcwTerminal 仕様策定・MVP 実装準備` に設定。
- 2026-04-24: Electron + React + Vite + TypeScript + MUI + xterm.js の MVP 土台を追加し、PowerShell 接続用 IPC を実装。
- 2026-04-24: PowerShell 接続を `child_process` から PTY ベースへ変更し、対話型 CLI の動作に対応。
- 2026-04-24: 複数 PowerShell セッションを起動し、中央メインと右サイドのサムネイル一覧で切り替える UI 方針を追加。
- 2026-04-24: サムネイルに最後のコマンド、推定処理種別、Running / Idle / Stopped、URL候補を表示する方針を追加。
- 2026-04-24: 設定パネルとコマンドショートカットボタンを追加し、選択中ターミナルへコマンド送信できる方針を追加。
- 2026-04-24: Git コマンドをドロップダウン化し、status / pull / log / diff / branch を選択可能に変更。
- 2026-04-25: 設定画面にコマンドボタンごとの表示切替を追加し、Claude / ChatGPT / Git / ls / Clear / More を個別に ON/OFF 可能へ変更。
- 2026-04-25: プロジェクトフォルダ名を `C:\BuildCooperWorks\Projects\bcw-terminal` に変更し、ドキュメント内のパス記載を新ディレクトリ名へ更新。
- 2026-04-25: 画面右下に見える背景の色ムラを解消するため、ページ全体の背景を均一色へ統一し、ワークスペース/サイドバー背景も同色固定に変更。
- 2026-04-25: 設定 Drawer 下部の色ムラ対策として、Drawer Paper の背景色/背景画像を固定し、設定パネルを全高 + 独立スクロールへ調整。
- 2026-04-25: Sessions サイドバーの展開/縮小トグルを追加し、単一セッション時の自動非表示オプションを追加。AI 系と Git コマンドボタンは初期非表示へ変更。
- 2026-04-25: 設定・メニュー主要文言を日本語既定へ統一し、`ja/en` 文言辞書と設定画面の表示言語切替（日本語/English）を追加。
- 2026-04-25: Renderer の言語設定を IPC で main へ連携し、Electron アプリメニュー（File/View など）も `ja/en` で再構築する実装を追加。
- 2026-04-25: クリップボード操作を IPC API 化し、ショートカット列に「編集」ドロップダウン（選択範囲コピー / クリップボード貼り付け / Ctrl+C送信）を追加。
- 2026-04-25: コマンドメニュー設定を永続化し、設定画面でボタンタイトル変更・ドロップダウン項目追加/削除を可能化。あわせて履歴ドロップダウンと履歴一覧の再実行UIを追加。
- 2026-04-25: 右ドロワーの簡易編集とは別に、コマンド管理ダイアログを追加。既存グループ（Claude / ChatGPT / Git / ls / More）のタイトル・説明・項目編集に対応。
- 2026-04-25: カスタムコマンドグループ作成機能を追加。`MyCommand` のような任意グループを作成し、配下コマンド（ラベル/コマンド/説明）を自由に追加・削除可能。
- 2026-04-25: カスタムグループの表示切替を設定画面で制御可能にし、ショートカット列に動的反映。
- 2026-04-25: Electron 側に「最前面化」IPC（`window:get-state` / `window:set-always-on-top`）を追加し、設定画面スイッチから制御可能化。
- 2026-04-25: ウィンドウサイズ・位置・最大化状態・最前面状態を `userData/window-state.json` に永続化し、次回起動時に復元する実装を追加。
- 2026-04-25: 低頻度 `More` ボタンを廃止し、標準のショートカット列から削除。
- 2026-04-25: コマンド管理画面に JSON 編集セクションを追加。`groups` / `groupOrder` 形式で直接編集し、適用可能に変更。
- 2026-04-25: コマンド定義 JSON のファイル保存/読み込みを実装（Electron dialog + IPC）。読み込み結果はアプリ設定へ反映され、localStorage で永続化。
- 2026-04-25: `groupOrder` を設定に追加し、コマンド管理画面の表示順とカスタムグループのショートカット表示順を JSON 順で制御可能にした。
- 2026-04-25: コマンド管理画面に編集モード切替を追加（フォーム編集 / JSON編集）。JSON編集は切替時のみ表示し、常時表示しないUIに変更。
## 17. 2026-04-25 追加更新
- 最前面固定の IPC 実装を見直し。`setAlwaysOnTop(true, 'screen-saver')` を使用し、復元時も同レベルで再適用。
- 配色プリセットに `Fallout` を追加。設定画面から `Default/Fallout` を選択可能にし、xterm とアプリUI配色を連動。
- 設定画面の言語セレクトでラベル重なりが発生する問題を修正。`InputLabelProps={{ shrink: true }}` を適用し、`日本語` メニュー表示の崩れを修正。
## 18. 2026-04-25 追加更新 (UI整理)
- 設定ドロワーの言語/配色セレクトを「ラベル別表示 + セレクト本体」に変更し、浮動ラベル重なりを回避。
- 「コマンド表示切替」は設定ドロワーから削除し、コマンド管理(フォーム編集)側へ移動。
- コマンド管理に `グループ表示` セクションを追加し、編集可能コマンドグループ(Claude/ChatGPT/Git/ls + Custom)の表示ON/OFFを管理可能にした。
- 設定ドロワーからコマンド履歴一覧セクションを削除し、設定画面を簡潔化。

## 19. 2026-04-25 追加更新 (最前面IPC安定化)
- 開発時ホットリロードで `window:get-state` / `window:set-always-on-top` の IPC ハンドラ未登録タイミングが発生しても落ちないよう、preload 側で安全フォールバックを追加。
- `getWindowState()` は失敗時に `{ alwaysOnTop: false }` を返却。
- `setAlwaysOnTop()` は失敗時に握りつぶし（開発時の一時的不整合対策）。

## 20. 2026-04-25 追加更新 (Fallout色とネットワークコマンド)
- Fallout 配色に対して、ターミナルANSI色とUI文字色を設定画面から個別編集可能にした（color input）。
- Fallout 配色は CSS 変数連携に変更し、ヘッダー/サイドバー/設定パネル/サムネイルなどの文字色へ反映。
- 新しい組み込みコマンドグループ `Network` を追加し、`ipconfig` / `net` / `tracert` 系の option 付きコマンドをドロップダウンから実行可能にした。

## 21. 2026-04-25 追加更新 (配色プリセット整理とグループ表示切替UI)
- 配色プリセット機能を廃止し、`Default` のみで運用する構成へ整理。
- `Fallout` 専用の設定項目・テーマ分岐・CSS（`theme-fallout` 系）を削除。
- コマンド管理の「グループ表示切替」を一覧表示から撤去し、選択中グループに対する単一トグルへ変更。
- 選択中が built-in グループの場合は `commandVisibility`、custom グループの場合は当該グループ `visible` を切り替える挙動に統一。

## 22. 2026-04-25 追加更新 (Tooltip強化と色設定)
- 主要な全ボタンに Tooltip を追加し、操作意図が分かる説明を表示するように統一。
- 設定リセットボタンには「何が初期化されるか」を説明する Tooltip を追加。
- 設定画面に色設定を追加し、以下を自由に変更可能化:
  - ターミナル文字色
  - ターミナル背景色
  - UI文字色
  - UI背景色
- 色設定は localStorage 永続化対応。起動後も維持される。

## 23. 2026-04-25 追加更新 (UI色設定の撤去)
- ユーザー要望により UI 系の色設定（UI背景色 / UI文字色）を設定画面から削除。
- 設定として保持する色はターミナル系のみ（ターミナル背景色 / ターミナル文字色）。
- リセット説明文も「ターミナル色設定」に合わせて更新。

## 24. 2026-04-25 追加更新 (設定パネル重なり表示の修正)
- 設定 Drawer は MUI Portal 配下で描画されるため、`terminal-page` の CSS 変数が効かず背景透過になっていた。
- `terminal-settings-drawer-paper` と `terminal-settings-panel` の色指定を固定色へ戻し、背面UI（ショートカット行）が透けて重なる問題を解消。
- 設定見出し/ラベル/説明文の色も Drawer 内で安定表示するよう固定色に統一。

## 25. 2026-04-25 追加更新 (中断ボタン追加)
- ショートカット行に「中断」ボタンを追加し、ワンクリックで `Ctrl+C` を送信可能にした。
- 既存の Edit メニュー内「Ctrl+C を送信」と同じ処理を使用。
- ボタン表示制御キー `interrupt` を追加し、既定表示は ON。
- 英語/日本語のラベルと Tooltip（`Interrupt` / `中断`）を追加。

## 26. 2026-04-25 追加更新 (Networkボタン既定値)
- ユーザー要望により `Network` コマンドボタンの既定表示を OFF（非表示）へ変更。

## 27. 2026-04-25 追加更新 (中断ボタン整理)
- ユーザー要望により、ショートカット行に追加していた独立「中断」ボタンを削除。
- `Ctrl+C` による中断操作は `編集` メニュー内の「Ctrl+C を送信」に統一。

## 28. 2026-04-26 追加更新 (Windows運用改善)
- README に Smart App Control の注意事項を追記。`ON` 時にコマンド起動が失敗する可能性と、`OFF` + 再起動の案内を明記。
- Electron main に Smart App Control 状態の検知処理（レジストリ参照）を追加し、renderer へ IPC で連携。
- 設定画面に Smart App Control の警告表示を追加（`ON` / `評価モード`）。
- 組み込みコマンドに `dir` グループを追加し、Windows 向け一覧操作をドロップダウン実行可能化。
- `ls` は既定で非表示、`dir` は既定で表示へ変更。
- 右サイドバーの × 操作を「停止」から「セッションを閉じる」挙動へ変更し、停止状態で固まる問題を修正。

## 28. 2026-04-25 追加更新 (クリアを編集メニューへ移動)
- 独立した「クリア」ボタンをショートカット列から削除し、`編集` メニュー内の項目へ移動（`cls` 送信動作は変更なし）。
- 表示制御キー `clear` を廃止し、`CommandButtonKey` から削除。
- 編集メニューの Tooltip 文言を「コピー / 貼り付け / 割り込み / クリア」に更新。

## 29. 2026-04-25 追加更新 (portable .exe 配布対応)
- `electron-builder` を `devDependencies` に追加（v26.x）。
- `package.json` に `build` 設定を追加: `appId`、`productName`、`directories.output=release`、`win.target=portable`、`asarUnpack` で node-pty バイナリを展開、`npmRebuild=false`（プリビルドを利用するため node-gyp 不要）。
- スクリプト `dist:win` (`npm run build && electron-builder --win --x64`) を追加し、`release/BcwTerminal-<version>-portable.exe` を出力。
- `vite.config.mts` に `base: './'` を追加（Electron で `loadFile` する際にアセット相対パスを解決するため）。
- `.gitignore` に `release/` を追加。
- README.md に配布用ビルド手順と、winCodeSign キャッシュの symlink 問題（Developer Mode/管理者権限/手動展開）の回避策を記載。
## 30. 2026-04-26 Update Notes (ASCII)
- Added Windows `dir` shortcut safety behavior: `dir ...` is executed via `cmd /d /c dir ...`.
- Improved post-shortcut focus behavior so users can continue typing immediately.
- Fixed copy behavior: copied selection is cleared after successful clipboard write.
- Adjusted focus/selection interaction so mouse drag selection remains available.
- Added `scripts/patch-node-pty-spectre.cjs` and `postinstall` wiring for native rebuild stability.
## 31. 2026-04-28 追加更新 (private GitHub Releases 自動更新)
- GitHub repo が private のため、`electron-updater` の GitHub publish 設定に `private: true` を追加。
- パッケージ化アプリの自動更新は `GH_TOKEN` または `GITHUB_TOKEN` が起動環境にある場合のみ実行する方針へ変更。
- トークン未設定時は GitHub の公開 `releases.atom` へアクセスせず、設定画面に短い案内メッセージを表示するようにした。
- 更新エラー表示は HTTP headers を含む長文をそのまま出さず、読みやすい短文へ整形する。
## 32. 2026-04-28 追加更新 (public GitHub Releases 自動更新)
- 配布運用を public GitHub Releases 前提へ変更。
- `electron-updater` の GitHub publish 設定から `private: true` を削除し、利用者側 token なしで更新確認できる構成へ戻した。
- `GH_TOKEN` / `GITHUB_TOKEN` 未設定時に更新確認を止める処理を削除した。
## 33. 2026-04-28 追加更新 (Release運用メモ)
- このリポジトリの GitHub Release は `v*` タグ push 時のみ更新される。
- `main` push のみでは Release の Latest は進まない。
- バージョン更新テスト時は「version変更コミットを `main` へ push」後に、同じ version の `v<version>` タグを push することを運用ルールにする。

## 34. 2026-04-30 追加更新 (操作性・安定性・Vite 8)
- 起動時の既定ディレクトリを `C:\` 直下から Windows ユーザーホームへ変更し、初期操作時の権限リスクを下げた。
- ヘッダーのパス表示を廃止し、Tips 表示へ置き換え。通常時はターミナル小技を60秒ごと、またはクリックで切り替える。
- 更新がある場合はヘッダー Tips より更新案内を優先表示し、クリックで設定画面へ遷移する。
- 編集メニューへ「ターミナル出力を保存」を追加し、アクティブなターミナル内容をテキストファイルへ保存可能にした。
- ターミナル選択範囲の右クリックコピー、履歴クリア、貼り付け実行時の履歴追加に対応。
- コマンド履歴の制御シーケンス混入対策を追加し、文字化けや空履歴化を抑制した。
- `tree` コマンドを `dir` グループへ追加し、ディレクトリ構成のみを表示する標準操作として扱う。
- 大量出力時の renderer OOM 対策として、出力バッファ・プレビュー更新・xterm scrollback を調整。
- ターミナル外側の余分なスクロールバーを抑え、ターミナル本体に少しだけ余白を持たせるレイアウトへ調整。
- ショートカット列は編集可能なコマンドグループを左側、システム系の「編集」「履歴」を右端へ配置する。
- 開発時の Electron cache/session path 競合を避けるため、dev mode の `sessionData` をプロセス固有パスへ分離。
- `sendToRenderer` を安全化し、renderer frame 破棄タイミングの `Render frame was disposed` 例外を無視できるようにした。
- Vite を 8.x 系へ更新し、`@vitejs/plugin-react` も Vite 8 対応版へ更新。`npm audit` は 0 vulnerabilities を維持。

## 35. 2026-05-09 追加更新 (右クリック貼り付け)
- ターミナル上の右クリック操作を拡張し、選択範囲がない場合はクリップボード内容をアクティブセッションへ貼り付けるようにした。
- 選択範囲がある場合は従来どおり右クリックでコピーし、コピー後に選択範囲を解除する。

## 36. 2026-05-29 追加更新 (変数・操作シーケンス・ツールバー整理)
- `{{VARIABLE_NAME}}` 形式でコマンドや操作シーケンスから参照できる変数管理を追加。
- パスワードなどは Electron `safeStorage` で暗号化保存するシークレット変数として扱い、renderer 側へ平文を返さない。
- WSL 起動、SSH 接続、パスワード入力待ちなどの対話操作を、送信前待機・送信文字列・送信後待機・Enter 送信有無のステップとして登録できる操作シーケンスを追加。
- 変数管理と操作シーケンス管理は 1 つのダイアログへ統合し、タブ切替で扱う。
- Tips 行と Ready 表示を削除し、ツールバーを 1 本に統合。左側にセッション操作と操作シーケンス、右側に編集・履歴・設定を配置。
- コマンド管理はツールバーから外し、設定画面内の低頻度操作として整理。`変数 / 操作シーケンス` は `コマンド管理` より上へ配置。
- フォントサイズ、行間、フォント名、ターミナル色などの表示設定は設定画面の下側へ移動。
- Release workflow の YAML アセット対象を `release/latest.yml` に限定し、不要な debug YAML が Release に混入しないようにした。

## 37. 2026-05-29 Additional Update (File Explorer Sidebar)
- Added an in-app file explorer sidebar opened from the toolbar folder button. It is closed by default and does not read filesystem contents while closed.
- The sidebar supports local Windows directories through Electron main-process filesystem APIs.
- WSL prompts are detected as `wsl:<path>` roots. Directory listings are retrieved through `wsl.exe --exec /bin/sh`, and WSL file viewing uses Linux shell commands.
- Entering WSL from `/mnt/c/Users/<user>` automatically runs `cd ~` once so the file explorer starts from the Linux home directory instead of the mounted Windows home.
- Directory clicks change the active terminal cwd: PowerShell uses `Set-Location -LiteralPath`; WSL uses `cd`.
- File right-click viewing sends `Get-Content -LiteralPath ... | more` on PowerShell and `cat -- ... | more` on WSL.
- Binary-looking files are skipped before viewing, with a Snackbar explaining the reason.
- Prompt detection updates cwd only when terminal output ends with a real prompt, preventing `more` output from changing the sidebar path.
- Command history replay clears the active input line before sending. PowerShell uses Escape; WSL/bash uses Ctrl+U.
- History items can be deleted by right-clicking them without confirmation.
