# Google Apps Script（コンテナバインド）

`Code.gs` は [clasp](https://github.com/google/clasp) でスプレッドシートに紐づいた GAS プロジェクトと同期できます。

## 手順（初回）

1. `npm i -g @google/clasp`（未導入なら）
2. `gas` ディレクトリで `clasp login`
3. スプレッドシートで **拡張機能 → Apps Script** を開き、URL の **スクリプト ID** を控える
4. `gas` 内に `.clasp.json` を置く（`scriptId` のみ。`.clasp.json.example` を参考）
5. `clasp push` でアップロード
6. **（推奨）** 対象スプレッドシートを開いた状態で GAS エディタから **`ensureSpreadsheetBinding`** を 1 回実行する（LIFF / ウェブアプリでシートに確実に接続するため）

## スクリプト プロパティ

| プロパティ | 必須 | 内容 |
|------------|------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | 必須 | Messaging API チャネルアクセストークン |
| `LINE_USER_ID` | 必須 | プッシュ先の `U...` |
| `GEMINI_API_KEY` | 任意 | [Google AI Studio](https://aistudio.google.com/) で取得した API キー。設定すると ■2 を Gemini で生成（§6.1）。未設定時は Quotes＋テンプレフォールバック（§6.2）のみ動作 |
| `LIFF_URL` | 任意 | LINE プッシュ末尾に付与するダッシュボードの LIFF URL |
| `BOUND_SPREADSHEET_ID` | 任意（推奨） | スプレッドシート ID。ウェブアプリ / `google.script.run` で `getActiveSpreadsheet` が取れないときに `openById` する。**スプレッドシートからスクリプトを開き `ensureSpreadsheetBinding` を 1 回実行**すると自動で書き込まれる（手入力でも可） |
| `SKIP_DASH_TOKEN_CHECK` | 任意 | `true` のとき token 検証をスキップ（**開発用のみ・本番は設定しない**） |
| `ALLOW_WEEKLY_TEST_RESEND` | 任意（**テスト専用**） | `true` のときだけ GAS エディタから **`resendWeeklyReviewAfterClearingSentWeek`** を実行可能。当週の `sent_week:{月曜}` を削除してから `sendWeeklyReview` を再送する。**テスト後は必ずプロパティを削除**すること |

## 時間トリガ（本番）

`Code.gs` の定数と `install*` 関数で時刻を管理する。**コードを変えただけでは Google 側のトリガは更新されない**ので、`clasp push` のあと GAS エディタで該当の `install…Trigger` を **もう一度実行**すること。

### 朝が「設定より遅い時刻」（例: 7 時設定なのに 9 時頃）に届くとき

最初に疑うのは **Google 側の時間主導トリガが古い時刻のまま残っている**ケース（コードの定数変更はトリガ時刻を自動更新しない）。

切り分け手順（GAS エディタ）:

1. **実行ログ**を開き、9 時頃に動いた実行の関数名を確認する  
   - `sendMorningMessage` なら朝トリガ由来  
   - `sendDailyReminder` / `sendWeeklyReview` なら別トリガ由来
2. **トリガ**画面で、該当関数のトリガが 1 本だけか確認する（重複していると想定外の時刻で動きやすい）
3. `installMorningMessageTrigger` を実行して付け直す（`MORNING_PUSH_*` の変更後は必須）
4. まとめて揃える場合は `installAllTimeTriggers` を実行（朝・日次・週次・cleanup を 1 本ずつに揃える）

補助:

- `auditProjectTriggers` を実行すると、プロジェクト内のトリガ本数（どの関数が何本か）をログに出す。

### 朝の LINE 配信時刻（変更メモ）

- **以前**: 朝のプッシュを **9 時台（JST）** を想定していた期間があった／**8 時台**に寄せた期間もあった
- **現在**: **7 時台（JST）を目標**（`MORNING_PUSH_HOUR_JST_` 既定 `7`、`MORNING_PUSH_NEAR_MINUTE_JST_` 既定 `0`）。GAS の遅延で 8〜9 時台に届くことはありうる（SPEC §1.1.1）
- **運用**: 定数を変えたあとは **`installMorningMessageTrigger` を GAS で再実行**し、Google 側の時間主導トリガを付け直す（`clasp push` だけではトリガは更新されない）。実行ログに `sendMorningMessage クロックトリガ 1 本` が出ることを確認する

| 関数 | 内容（既定・JST） |
|------|-------------------|
| `ensureSpreadsheetBinding` | **手動 1 回**。スプレッドシートを開いた状態で実行し、`BOUND_SPREADSHEET_ID` を保存（LIFF / ウェブアプリ用） |
| `installMorningMessageTrigger` | 毎朝 `sendMorningMessage`（`MORNING_PUSH_HOUR_JST_` / `MORNING_PUSH_NEAR_MINUTE_JST_`・目標 7 時台） |
| `installDailyReminderTrigger` | 毎日 `sendDailyReminder`（17:40 前後） |
| `installWeeklyReviewTrigger` | 毎週土曜 `sendWeeklyReview`（`WEEKLY_REVIEW_HOUR_JST_`、既定 8 時台） |
| `installCleanupTrigger` | 毎週月曜 `cleanupOldDashTokens`（3 時、`Asia/Tokyo`） |

土曜朝は朝プッシュ（7 時台目標）と週次（8 時台）が近い午前に届くことがある（SPEC §1.3 #15・§1.4 W-2）。

週次 LINE が届かないときは [WEEKLY_LINE_TROUBLESHOOTING.md](../docs/WEEKLY_LINE_TROUBLESHOOTING.md)（`sent_week`・実行ログ・手動再実行）。

週次「振り返り」LIFF は **`LIFF_URL?oid=<32hex>&liff.state=（`?oid=` を URL エンコードした文字列）`** を送る。トップレベル `oid` が LIFF→GAS で落ちる場合に備え、`liff.state` からも `oid` を復元する。`oid` は Script Properties の `yattakai_liff_oid_*` に JSON で保持され、`cleanupOldDashTokens`（月曜 3 時 JST）で期限切れを削除する。

### 週次をもう一度送って試したいとき（`実行済みのためスキップ` のとき）

週次は `sent_week:YYYY-MM-DD`（その週の月曜）で 1 週 1 回にロックされる。既に送れている週で `sendWeeklyReview` を手動実行するとスキップされるのは仕様。

- **手動で直す**: スクリプト プロパティから **`sent_week:2026-05-04`**（ログに出た月曜と同じキー）を**削除**してから、もう一度 **`sendWeeklyReview`** を実行する。
- **補助関数**: `ALLOW_WEEKLY_TEST_RESEND` を `true` にしたうえで **`resendWeeklyReviewAfterClearingSentWeek`** を実行すると、当週の `sent_week:` を消してから `sendWeeklyReview` を呼ぶ。**試したら `ALLOW_WEEKLY_TEST_RESEND` は必ず削除**すること。
- **プロパティ UI で見えないとき**: スクリプト プロパティが **50 件超**だと設定画面は先頭 50 件のみ・読み取り専用。**`deleteSentWeekForTest`** を GAS エディタから実行すると `sent_week:2026-05-04` を削除（別の月曜はプロパティ `SENT_WEEK_DELETE_TARGET` に `yyyy-MM-dd` を入れてから実行）。その後 **`sendWeeklyReview`** を手動実行。

## 実装メモ

- `sendDailyReminder` 先頭で `ensureDailyRowsForToday_` を実行（当日の `Daily` 行を `Tasks` active と突き合わせて不足分を追記）
- ■2: `pickQuoteBundleForDate_` で `Quotes` から日付ハッシュで 1 件選び、`meaning` 列を **正本**として `dto.quote_meaning` に載せる（LIFF で意味全文を表示。LINE 本文はセリフ中心で長文化しない）
- Gemini（§6.1）: `GEMINI_API_KEY` 設定時は `callGeminiSection2_` が生成。シートの `meaning` をプロンプトに渡し、内容と矛盾しないセリフに制約。未設定時は Quotes＋テンプレ（§6.2）

## ドーナツチャート修正履歴（`mkDonut`）

`Code.gs` の `mkDonut` 関数で以下を修正した（SPEC §3.5 準拠）。

### 第3次修正（根本バグ修正・達成済みタスク数を面積に反映）

| 修正前の問題 | 根本原因 | 修正内容 |
|-------------|---------|---------|
| リングが常に 100% 塗りに見える（中央テキストは 70% 等正しい値） | セグメント面積の計算が `cat.total/total`（カテゴリのタスク総数÷全体タスク数）であったため、全カテゴリ合計が常に 360° になっていた | `cat.done/total`（達成済みタスク数÷全体タスク数）に変更。これにより達成率に比例した弧のみ着色され、残余はグレー背景が透けて未達成を示す |
| done=0 のカテゴリが最終セグメントに来ると未達成部分を誤塗り | フィルター条件 `cat.total>0` が done=0 のカテゴリを除外しなかった | フィルターを `cat.done>0` に変更し、達成タスクがないカテゴリはセグメントに含めない |
| セグメント境界が視覚的に不明瞭（隣接色がにじむ） | セグメント間に隙間がなかった | カテゴリが 2 つ以上のとき 1.5° のギャップ（`GAP`）を各セグメント両端に適用 |
| タスクトグル時にドーナツが瞬間切り替わる（UX） | `replaceChild` による切り替えに視覚トランジションがなかった | `.donut-wrap` に CSS `@keyframes donutIn`（0.18s fade+scale）を追加。`replaceChild` で新 DOM が挿入されるたびに自動発火 |
| スクリーンリーダーに達成率が伝わらない | SVG に `role`/`aria-label` がなかった | `role="img"` と `aria-label="達成率 N パーセント"` を SVG 要素に付与 |

変更箇所：`mkDonut` 内の 2 トークン（L1441 フィルター・L1445 share 計算）＋ GAP ロジック追加・CSS アニメーション・SVG aria 属性。`mkCatBar`・`updateSummary` の呼び出し側は変更不要（`mkDonut` 内部で完結）。

### 第2次修正（本質的修正・`<path>` Arc 方式）

| 修正前の問題 | 根本原因 | 修正内容 |
|-------------|---------|---------|
| 100% 達成でもグレーが見える（mobile WebView で seam が残る） | `stroke-dasharray` で複数 `<circle>` を重ねる方式は、アンチエイリアシングにより境界に微細な seam が生まれ、グレー背景が透けて見える | **`stroke-dasharray` を廃止**し、各セグメントを **`<path>` Arc コマンドで直接描画**。seam を構造から根絶 |
| タスク切り替え後にキャラクター画像・会話が消える | `updateTaskStatus` が `skipSection2:true` でビルドした `section2:null` なデータを CacheService に書き込み、次回ページリロード時に null が返ってくる | **`updateTaskStatus` は CacheService への書き戻しを行わない**。`invalidateDashboardCache_` でキャッシュを消去するだけにとどめ、次の `doGet` 時に完全なデータ（section2 込み）を再構築させる |

### 第1次修正（精度改善・`toFixed` 廃止）

| 修正前の問題 | 修正内容 |
|-------------|---------|
| `stroke-dasharray` に `.toFixed(2)` を適用しており、最終セグメントが閉じなかった | `toFixed()` を廃止し浮動小数点フル精度で設定 |
| `total = 0` 時に背景が透けた | グレー背景トラック（`#E2E8F0`）を常時 Layer-1 として描画 |
| `cat.total = 0` カテゴリが微小ドットを表示 | `cat.total > 0` のみをセグメントとして描画するよう事前フィルタ |

**反映手順**: `gas` ディレクトリで `clasp push` → GAS エディタでウェブアプリを **「新バージョン」で再デプロイ**。トリガ設定は変更不要。
