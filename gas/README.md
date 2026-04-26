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
| `INVEST24H_PAGE_URL` | 任意 | `sendInvest24hDigestEmail` が本文に載せる投資図解 URL。未設定時は `https://invest-24h-20260422.surge.sh/` |
| `INVEST24H_NOTIFY_TO` | 任意 | 上記メールの宛先（カンマ区切り）。未設定時は実行ユーザー本人の Gmail |
| `INVEST24H_MAIL_TRIGGER_SECRET` | 任意 | 長いランダム文字列。**ウェブアプリ**の URL に `?invest24hMail=1&secret=（同じ値）` を付けて GET すると `sendInvest24hDigestEmail` が走る（`MailApp`）。未設定時はこの GET は `mail_trigger_secret_not_configured` を返す |

手動で図解 URL をメールしたいときは、GAS エディタで **`sendInvest24hDigestEmail`** を実行する（`MailApp`）。または上記シークレットを設定したうえで、デプロイ済みウェブアプリ URL にクエリを付けて GET する。

## 時間トリガ（本番）

`Code.gs` の定数と `install*` 関数で時刻を管理する。**コードを変えただけでは Google 側のトリガは更新されない**ので、`clasp push` のあと GAS エディタで該当の `install…Trigger` を **もう一度実行**すること。

### 朝の LINE 配信時刻（変更メモ）

- **以前**: 朝のプッシュを **9 時台（JST）** を想定していた期間があった
- **現在**: **8 時台（JST）前後**（`MORNING_LINE_HOUR_JST_`、既定 `8`）。SPEC §1.3 #15・`Code.gs` の定数と一致
- **運用**: 時刻を変えたあとは、次の表の `installMorningMessageTrigger` を **GAS で再実行**し、Google 側の時間主導トリガを付け直す（`clasp push` だけではトリガは更新されない）

| 関数 | 内容（既定・JST） |
|------|-------------------|
| `installMorningMessageTrigger` | 毎朝 `sendMorningMessage`（`MORNING_LINE_HOUR_JST_`、既定 8 時前後） |
| `installDailyReminderTrigger` | 毎日 `sendDailyReminder`（17:40 前後） |
| `installWeeklyReviewTrigger` | 毎週土曜 `sendWeeklyReview`（`WEEKLY_REVIEW_HOUR_JST_`、既定 8 時台） |
| `installCleanupTrigger` | 毎週月曜 `cleanupOldDashTokens`（3 時、`Asia/Tokyo`） |

土曜朝は朝プッシュと週次が同じ時台になりうる（SPEC §1.3 #15・§1.4 W-2）。

週次 LINE が届かないときは [WEEKLY_LINE_TROUBLESHOOTING.md](../docs/WEEKLY_LINE_TROUBLESHOOTING.md)（`sent_week`・実行ログ・手動再実行）。

## 実装メモ

- `sendDailyReminder` 先頭で `ensureDailyRowsForToday_` を実行（当日の `Daily` 行を `Tasks` active と突き合わせて不足分を追記）
- ■2 は **§6.2 テンプレ経路**: `Quotes` から日付ハッシュで 1 件選択、`{{quote}}` 等を差し替え、表情ファイル名は **§5.5.1** を `pickAvatarsByPercent_` で付与
- Gemini（§6.1）は未実装。API キー設定後に別関数で追加可能
