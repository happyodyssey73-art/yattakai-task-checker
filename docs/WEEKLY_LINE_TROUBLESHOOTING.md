# 週次 LINE（`sendWeeklyReview`）が届かないとき

やったかいの **日次（17:40）・朝の一声（毎日 8 時台）** は `sendDailyReminder` / `sendMorningMessage` と汎用 `withLock_`・`linePushText_` を使う。**本書の手順と実装の変更は主に週次だけ**に効く（日次・朝を壊さない前提）。

## 週次の前提（仕様）

- **トリガ**: `installWeeklyReviewTrigger` を GAS で実行したあと、**毎週土曜**・`WEEKLY_REVIEW_HOUR_JST_`（既定 8）・`Asia/Tokyo` の時間主導トリガで `sendWeeklyReview` が動く。`clasp push` だけではトリガは増えない。
- **集計対象の週**: 実行日 JST の「カレンダー上の日付」から **5 日前**を JST で `yyyy-MM-dd` にした日を **その週の月曜 `weekStartJst`** とし、**その月〜金**を集計する。トリガが土曜に乗っていることが前提（他曜に手動実行すると週の解釈がズレる）。
- **本文の目印**: `【やったかい週次】` で始まる。
- **週次 LIFF のクエリ**: 振り返り URL には `weekStart`・`token` に加え **`yw=1`**（週次専用フラグ）が付く。`weekStart` だけが欠けたとき **日次ダッシュのトークン検証に落ちず**、案内ページが返る（実装の意図）。
- **`sent_week:`（べき等）**: `sent_week:{weekStartJst}` は **週次専用ロック**のなかで、**LINE Messaging API が HTTP 200 で返ったあと**だけスクリプトプロパティに書く。送れなかった週は **フラグが立たない**ので、**同じ週に GAS から `sendWeeklyReview` を手動再実行**すれば再送できる（日次の `sent:` / 朝の `morning:` とは別キー）。
- **再試行**: 週次のプッシュだけ **`linePushTextWeekly_`** 経由で、**429 / 5xx** のとき短い待ちを挟んで最大 3 回まで再試行する。日次・朝は従来どおり **`linePushText_` は 1 回きり・失敗時は例外**（挙動変更なし）。

## 調べる順序（運用）

1. **実行数（その土曜）**  
   `sendWeeklyReview` の行があるか・成功 / 失敗・所要時間。
2. **ログ（該当実行）**  
   次のどれに当たるか。  
   - `[sendWeeklyReview] start todayJst=… weekStartJst=…` … 週次処理に入った。  
   - `[withWeeklyLock_] 実行済みのためスキップ` … 既に `sent_week:` が立っている。  
   - `[withWeeklyLock_] ロック取得タイムアウト` … 同時実行でロック未取得（8 秒）。  
   - `[withWeeklyLock_] 送信成功を確定` … 今回の実行で `sent_week` を書いた。  
   - `[withWeeklyLock_] 送信が完了しなかったため sent_week は未設定` … **同週の手動再実行**で再送の余地あり。  
   - `[linePushTextWeekly_] attempt … HTTP …` … LINE 側エラーまたはリトライ中。  
   - `[sendWeeklyReview] 送信完了` … 週次本文のプッシュが 200 で確定。
3. **スクリプト プロパティ**  
   `sent_week:YYYY-MM-DD` の有無（値は通常 `1`）。`YYYY-MM-DD` はその週の月曜（上記 `weekStartJst`）。
4. **同じ土曜の `sendMorningMessage`**  
   朝だけ届く場合は、週次トリガ未登録・週次だけ失敗・`sent_week` スキップなどに切り分けやすい。
5. **日次が毎日届いているか**  
   LINE トークン・ユーザー ID の切り分けに使う（日次は `linePushText_` のまま）。

## ログパターンと推定原因

| 観測 | 推定 |
|------|------|
| `sendWeeklyReview` の実行行がない | 週次トリガ未登録、別スクリプトにトリガがある、Google 側の未実行 |
| `実行済みのためスキップ` | 同一 `weekStartJst` で既に **200 確定後**に `sent_week` が立っている |
| `ロック取得タイムアウト` | 土曜 8 時台に朝・週次などでロック競合 |
| `送信が完了しなかったため sent_week は未設定` | LINE 失敗や実装が `false` を返した。**手動で `sendWeeklyReview` を再実行**可能 |
| `送信完了` だが端末に無い | 通知オフ、別アカウント、LINE クライアント側 |

## 手動テストで「実行済みのためスキップ」になるとき

`sendWeeklyReview` は `sent_week:{weekStartJst}` が既にあると **`[withWeeklyLock_] 実行済みのためスキップ`** となり、**2 通目は送られない**（1 週 1 回の仕様）。

**再送して LIFF（`oid` リンクなど）を試したい場合**:

1. **スクリプト プロパティ**で、ログに出ているキー（例: `sent_week:2026-05-04`）を**削除**する。  
2. もう一度 **`sendWeeklyReview`** を手動実行する。

または、一時的にスクリプト プロパティ **`ALLOW_WEEKLY_TEST_RESEND` = `true`** を追加し、GAS エディタから **`resendWeeklyReviewAfterClearingSentWeek`** を実行する（当週の `sent_week:` を消してから `sendWeeklyReview` を呼ぶ）。**試したら `ALLOW_WEEKLY_TEST_RESEND` は必ず削除**すること。

**スクリプト プロパティが 50 件超**で `sent_week:…` が UI に出ないときは、GAS エディタから **`deleteSentWeekForTest`** を実行する（既定で `sent_week:2026-05-04` を削除。別の月曜はプロパティ **`SENT_WEEK_DELETE_TARGET`** に `yyyy-MM-dd` を入れてから実行）。その後 **`sendWeeklyReview`** を手動実行。

## 週次 LIFF が開けない・エラーになる（トークン以外）

- **`BOUND_SPREADSHEET_ID` / `ensureSpreadsheetBinding`**: ウェブアプリ実行時に `getActiveSpreadsheet` が取れないと `no_spreadsheet` や集計失敗になる。スプレッドシートからスクリプトを開き **`ensureSpreadsheetBinding` を 1 回実行**すると Script Properties に ID が保存され、`openById` で接続できる（`gas/README.md` の表参照）。
- **`parseWebAppQuery_`**: `doGet` は URL 直下のクエリと `liff.state` 内のクエリを **一度にマージ**する。`weekStart` / `token` / `yw` は **直下を優先**し、欠けているキーだけ `liff.state` から補う（LINE がパラメータを `liff.state` に包む場合の取りこぼし対策）。
- **`oid`（不透明オープン ID）**: 週次 LINE の「振り返り」は **`oid=<32hex>`** を載せ、`liff.state` に **`?oid=...` を重複載せ**する（LIFF がトップレベル `oid` を落としても `parseWebAppQuery_` が `st.oid` で復元するため）。`weekStart` と週次 `token` は Script Properties の JSON 正本から復元する。従来の `weekStart&token&yw=1` 形式も後方互換で受理する。
- **`invalid_token (当日の日付)` と日次のフッター文言**: LIFF が `weekStart` を落として **`token` だけ**が届くと、以前は日次として「今日」と照合されていた。**`doGet` は `weekStart` が無くても**、トークンが **当日を含む週の月曜**に紐づく週次トークンなら週次画面へフォールバックする（コード変更後はウェブアプリを新バージョンで再デプロイすること）。
- **`liffHtmlOutput_`**: 日次・週次の HTML 応答は **`XFrameOptionsMode.ALLOWALL`** を付与し、LINE アプリ内 WebView（iframe）での表示を許可する。コード変更後は **ウェブアプリを「新バージョン」で再デプロイ**すること。
- **エラー文言**: 週次のトークン失敗は `weeklyTokenErrorHtmlHint_`（日次の `tokenErrorHtmlHint_` とは分離）。

## 実装者向けメモ（コード位置）

- 週次ロック: `withWeeklyLock_`（`sent_week` は **週次専用**。汎用 `withLock_` は触らない）。  
- 週次送信: `linePushTextWeekly_`（`linePushText_` とは別。日次・朝は `linePushText_` のみ）。  
- 入口: `sendWeeklyReview` → `sendWeeklyReviewImpl_`（戻り値 `true` のときだけ `sent_week` コミット）。

## クリーンアップトリガ

`installCleanupTrigger` は **`Asia/Tokyo` の月曜 3 時**に合わせる（`inTimezone(TZ_)`）。古い `sent_week:` は `cleanupOldDashTokens` の保持期間（既定 90 日）を過ぎたものだけ削除対象。
