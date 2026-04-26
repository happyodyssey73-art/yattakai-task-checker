# 週次 LINE（`sendWeeklyReview`）が届かないとき

やったかいの **日次（17:40）・朝の一声（毎日 8 時台）** は `sendDailyReminder` / `sendMorningMessage` と汎用 `withLock_`・`linePushText_` を使う。**本書の手順と実装の変更は主に週次だけ**に効く（日次・朝を壊さない前提）。

## 週次の前提（仕様）

- **トリガ**: `installWeeklyReviewTrigger` を GAS で実行したあと、**毎週土曜**・`WEEKLY_REVIEW_HOUR_JST_`（既定 8）・`Asia/Tokyo` の時間主導トリガで `sendWeeklyReview` が動く。`clasp push` だけではトリガは増えない。
- **集計対象の週**: 実行日 JST の「カレンダー上の日付」から **5 日前**を JST で `yyyy-MM-dd` にした日を **その週の月曜 `weekStartJst`** とし、**その月〜金**を集計する。トリガが土曜に乗っていることが前提（他曜に手動実行すると週の解釈がズレる）。
- **本文の目印**: `【やったかい週次】` で始まる。
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

## 週次 LIFF が開けない・エラーになる（トークン以外）

- **`parseWebAppQuery_`**: `doGet` は URL 直下のクエリと `liff.state` 内のクエリを **一度にマージ**する。`weekStart` / `token` は **直下を優先**し、欠けているキーだけ `liff.state` から補う（LINE がパラメータを `liff.state` に包む場合の取りこぼし対策）。
- **`liffHtmlOutput_`**: 日次・週次の HTML 応答は **`XFrameOptionsMode.ALLOWALL`** を付与し、LINE アプリ内 WebView（iframe）での表示を許可する。コード変更後は **ウェブアプリを「新バージョン」で再デプロイ**すること。
- **エラー文言**: 週次のトークン失敗は `weeklyTokenErrorHtmlHint_`（日次の `tokenErrorHtmlHint_` とは分離）。

## 実装者向けメモ（コード位置）

- 週次ロック: `withWeeklyLock_`（`sent_week` は **週次専用**。汎用 `withLock_` は触らない）。  
- 週次送信: `linePushTextWeekly_`（`linePushText_` とは別。日次・朝は `linePushText_` のみ）。  
- 入口: `sendWeeklyReview` → `sendWeeklyReviewImpl_`（戻り値 `true` のときだけ `sent_week` コミット）。

## クリーンアップトリガ

`installCleanupTrigger` は **`Asia/Tokyo` の月曜 3 時**に合わせる（`inTimezone(TZ_)`）。古い `sent_week:` は `cleanupOldDashTokens` の保持期間（既定 90 日）を過ぎたものだけ削除対象。
