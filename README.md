# yattakai-task-checker（やったかい）

自分で決めた日次タスクの達成状況を、Google スプレッドシートで記録し、**LINE** で通知・**LIFF** で振り返るためのツールです。

## できること

| タイミング | 内容 |
|------------|------|
| 毎朝 7 時台（JST） | 軽い朝の LINE 通知（タスク件数 + ダッシュボード URL） |
| 毎日 17:40 前後（JST） | 達成率・タスク一覧・今日の一言を LINE で通知 |
| 毎週土曜 8 時台（JST） | 週次振り返り（先週月〜金の達成率）を LINE で通知 |
| いつでも | LIFF ダッシュボードで ◯/× を確認・更新 |

## アーキテクチャ

```
Google スプレッドシート（Categories / Tasks / Daily / Quotes）
        ↓
Google Apps Script（gas/Code.gs）
        ↓
LINE Messaging API（プッシュ通知）+ LIFF（ダッシュボード）
```

## ディレクトリ構成

| パス | 内容 |
|------|------|
| [`gas/`](gas/) | 本番ロジック（GAS）。clasp でスプレッドシートに同期 |
| [`seed/`](seed/) | スプレッドシート初期データ（CSV） |
| [`docs/SPEC.md`](docs/SPEC.md) | 設計書 |
| [`src/cli.mjs`](src/cli.mjs) | ローカル用 CLI（`tasks.json` 操作） |

## セットアップ

1. Google スプレッドシートを作成し、`seed/` の CSV をインポート（手順は [`seed/IMPORT.txt`](seed/IMPORT.txt)）
2. スプレッドシートに GAS をバインドし、[`gas/README.md`](gas/README.md) の手順で clasp 同期
3. スクリプトプロパティに `LINE_CHANNEL_ACCESS_TOKEN` と `LINE_USER_ID` を設定
4. 時間トリガをインストール（`installAllTimeTriggers`）

詳細は [`gas/README.md`](gas/README.md) を参照してください。

## ローカル CLI（補助）

```bash
npm start          # タスク一覧
npm run check      # 未完了があれば exit 1（CI 向け）
```
