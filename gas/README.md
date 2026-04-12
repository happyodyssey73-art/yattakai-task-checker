# Google Apps Script（コンテナバインド）

`Code.gs` は [clasp](https://github.com/google/clasp) でスプレッドシートに紐づいた GAS プロジェクトと同期できます。

## 手順（初回）

1. `npm i -g @google/clasp`（未導入なら）
2. `gas` ディレクトリで `clasp login`
3. スプレッドシートで **拡張機能 → Apps Script** を開き、URL の **スクリプト ID** を控える
4. `gas` 内に `.clasp.json` を置く（`scriptId` のみ。`.clasp.json.example` を参考）
5. `clasp push` でアップロード

## スクリプト プロパティ

| プロパティ | 必須 | 内容 |
|------------|------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | 必須 | Messaging API チャネルアクセストークン |
| `LINE_USER_ID` | 必須 | プッシュ先の `U...` |
| `GEMINI_API_KEY` | 任意 | [Google AI Studio](https://aistudio.google.com/) で取得した API キー。設定すると ■2 を Gemini で生成（§6.1）。未設定時は Quotes＋テンプレフォールバック（§6.2）のみ動作 |
| `LIFF_URL` | 任意 | LINE プッシュ末尾に付与するダッシュボードの LIFF URL |
| `SKIP_DASH_TOKEN_CHECK` | 任意 | `true` のとき token 検証をスキップ（**開発用のみ・本番は設定しない**） |

## 実装メモ

- `sendDailyReminder` 先頭で `ensureDailyRowsForToday_` を実行（当日の `Daily` 行を `Tasks` active と突き合わせて不足分を追記）
- ■2 は **§6.2 テンプレ経路**: `Quotes` から日付ハッシュで 1 件選択、`{{quote}}` 等を差し替え、表情ファイル名は **§5.5.1** を `pickAvatarsByPercent_` で付与
- Gemini（§6.1）は未実装。API キー設定後に別関数で追加可能
