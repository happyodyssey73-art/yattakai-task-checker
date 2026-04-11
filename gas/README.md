# Google Apps Script（コンテナバインド）

`Code.gs` は [clasp](https://github.com/google/clasp) でスプレッドシートに紐づいた GAS プロジェクトと同期できます。

## 手順（初回）

1. `npm i -g @google/clasp`（未導入なら）
2. `gas` ディレクトリで `clasp login`
3. スプレッドシートで **拡張機能 → Apps Script** を開き、URL の **スクリプト ID** を控える
4. `gas` 内に `.clasp.json` を置く（`scriptId` のみ。`.clasp.json.example` を参考）
5. `clasp push` でアップロード

## スクリプト プロパティ（必須）

| プロパティ | 内容 |
|------------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | Messaging API チャネルアクセストークン |
| `LINE_USER_ID` | プッシュ先の `U...` |

## 実装メモ

- `sendDailyReminder` 先頭で `ensureDailyRowsForToday_` を実行（当日の `Daily` 行を `Tasks` active と突き合わせて不足分を追記）
- ■2 は **§6.2 テンプレ経路**: `Quotes` から日付ハッシュで 1 件選択、`{{quote}}` 等を差し替え、表情ファイル名は **§5.5.1** を `pickAvatarsByPercent_` で付与
- Gemini（§6.1）は未実装。API キー設定後に別関数で追加可能
