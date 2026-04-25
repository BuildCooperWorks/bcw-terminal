# 自作ターミナル（Windows向け）まとめ

## 目的
Windows Terminal が使いづらいため、
「自分専用のターミナルアプリ」を作る

---

## 結論（方針）
① Electronで作る（まず動かす）
② 気に入ったらTauriへ移行（軽量化）

---

## なぜElectronか
・Web技術（React/TS）がそのまま使える
・Node.jsでOS操作できる
・npm / git / PowerShell が実行できる
・開発が早い

※ Tauriは軽いがRustが必要なので後回し

---

## 全体構成

Electron
 ├ フロント → React + xterm.js（ターミナルUI）
 └ バック → Node.js（コマンド実行）

通信
 → IPC（Electron内通信）

---

## 技術スタック

・Electron
・React（Vite推奨）
・TypeScript
・xterm.js
・Node.js（child_process）

---

## やること（MVP）

最低限ここから始める👇

・ターミナル画面表示（xterm.js）
・コマンド入力できる
・PowerShellを起動
・コマンド実行結果を表示
・作業ディレクトリ変更（cd）

---

## コア処理イメージ

PowerShell起動

spawn("powershell")

入力

stdin.write("npm i\n")

出力

stdout.on("data", ...)

---

## できるようになること

・npm i
・git操作
・cd / ls
・ローカルフォルダ操作
・開発コマンドの統合

---

## 将来的な拡張

・コマンドショートカット（ボタン化）
・複数タブ
・履歴検索
・プロジェクト切り替え
・Docker連携
・Azure CLI連携

---

## 注意点（重要）

・ブラウザ単体ではローカル操作不可
・必ずNode/Electronが必要
・コマンド実行は危険（rmなど）
・最初はローカル限定で作る

---

## 完成イメージ

CooperTerm（仮）

・軽い
・見やすい
・自分用に最適化されたUI
・よく使うコマンドがすぐ叩ける

---

## 次のステップ

① Electron + React のテンプレ作成
② xterm.js導入
③ PowerShell接続
④ コマンド実行

---

## 最終ゴール

「Windows Terminalの代替」ではなく

👉 自分専用の開発ターミナル
👉 コマンド操作ダッシュボード

として完成させる