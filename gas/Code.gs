/**
 * yattakai-task-checker — コンテナバインド GAS（スプレッドシートから開く想定）
 *
 * スクリプト プロパティ:
 *   LINE_CHANNEL_ACCESS_TOKEN, LINE_USER_ID（必須）
 *   INVEST24H_MAIL_TRIGGER_SECRET（任意）… 設定時のみ、ウェブアプリ GET
 *     ?invest24hMail=1&secret=… で sendInvest24hDigestEmail を実行可（MailApp）。未設定時はこの経路は 403 相当
 *   GEMINI_API_KEY（任意）… 設定時に §6.1 Gemini で ■2 を生成。未設定時は §6.2 テンプレのみ
 *   AVATAR_BASE_URL（任意）… キャラ画像を配信する URL（末尾スラッシュなし）。例: https://yattakai-avatars.surge.sh
 *                             未設定時は LIFF でテキストのみ表示（フォールバック）
 *   LIFF_URL（任意）… 設定時のみプッシュ末尾に「ダッシュボード: …?date=…&token=…」を付与
 *   BOUND_SPREADSHEET_ID（任意）… スプレッドシート ID。ウェブアプリ / google.script.run で
 *     getActiveSpreadsheet が取れないときに openById する。**初回**: スプレッドシートからスクリプトを開き
 *     ensureSpreadsheetBinding を 1 回実行すると自動保存される（手入力でも可）
 *   SKIP_DASH_TOKEN_CHECK（任意）… true のとき token 検証をスキップ（開発用のみ・本番は設定しない）
 *
 * シート: Daily / Tasks / Quotes（§4）… シート名は SPEC どおり英字
 *
 * Web アプリ doGet:
 *   ?format=json&date=yyyy-MM-dd&token=… … ダッシュボード用 DTO（token は当日プッシュで発行）
 *   ?oid=<32hex> … 週次振り返り（不透明 ID。weekStart/token をサーバー正本から復元。LIFF でクエリ欠落しても日次に落ちない）
 *   週次従来: ?weekStart=…&token=…&yw=1（後方互換）
 *   上記以外 … LIFF 向け HTML（google.script.run で JSON 相当データを取得）
 *
 * 初回セットアップ:
 *   1. installDailyReminderTrigger を 1 回実行（毎日 17:40 JST に sendDailyReminder）
 *   2. installMorningMessageTrigger を 1 回実行（毎日朝 sendMorningMessage。時刻は MORNING_PUSH_* 定数・既定 7 時台 JST 目標。コード変更後は必ず再実行）
 *   3. installWeeklyReviewTrigger を 1 回実行（毎週土曜 sendWeeklyReview。時刻は WEEKLY_REVIEW_HOUR_JST_、既定 8 時台 JST 前後）
 *   4. installCleanupTrigger を 1 回実行（毎週月曜 3:00 JST に cleanupOldDashTokens）
 *   5. （推奨）スプレッドシートから本プロジェクトを開いた状態で ensureSpreadsheetBinding を 1 回実行
 *      … LIFF / ウェブアプリで getActiveSpreadsheet が無い環境でもシートに接続できるようにする
 * 変更後は gas で clasp push のあと、ウェブアプリを「新バージョン」で再デプロイすること。
 */

/** 当日ダッシュ用トークンをスクリプトプロパティに保存するキー接頭辞 */
var DASH_TOKEN_PROP_PREFIX_ = 'yattakai_dash_token_';

/** 週次ダッシュ用トークンのスクリプトプロパティキー接頭辞（§付録 A.3） */
var WEEK_TOKEN_PROP_PREFIX_ = 'yattakai_week_token_';

/**
 * LIFF 経由で weekStart / token が GAS の e.parameter に届かない場合の根本対策:
 * 短い不透明 ID（oid）だけを URL に載せ、週次の weekStart・週次 token は Script Properties の JSON を正本とする。
 * キー: yattakai_liff_oid_<32hex> 値: { v, scope, weekStart, token, exp, iat }
 */
var LIFF_OPAQUE_OPEN_PREFIX_ = 'yattakai_liff_oid_';

/** 不透明リンクの有効期限（ms）。cleanupOldDashTokens の既定保持（90 日）と整合 */
var LIFF_OPAQUE_EXP_MS_ = 90 * 86400000;

/**
 * デプロイ確認用の識別子（Web アプリが最新デプロイかを判定するための「印」）。
 * 変更したら「新バージョン」で再デプロイし、この値で疎通確認する。
 */
var DEPLOY_MARKER_ = '2026-05-13-donut-arc-fix';

/** CacheService キー接頭辞と TTL（30 分）*/
var CACHE_KEY_PREFIX_ = 'yattakai_dash_v1_';
var CACHE_TTL_SEC_    = 1800;

/** タイムゾーン（GAS プロジェクト設定の TZ_ に依存しないよう明示固定）*/
var TZ_ = 'Asia/Tokyo';

/**
 * ウェブアプリ・google.script.run で Active が無いときに SpreadsheetApp.openById するための
 * Script Properties キー（ensureSpreadsheetBinding または getBoundSpreadsheet_ が書き込む）。
 */
var BOUND_SPREADSHEET_ID_KEY_ = 'BOUND_SPREADSHEET_ID';

/**
 * 朝 LINE（installMorningMessageTrigger / sendMorningMessage）のスケジュール（JST = TZ_）。
 *
 * 正本: この定数を読むのは **installMorningMessageTrigger のみ**（Google のクロックトリガに書き込む値）。
 * clasp push やコード保存だけではトリガは更新されないため、時刻を変えたら **必ず install を再実行**すること。
 *
 * 目標: 7:00〜8:59 のうち早い時間帯（7 時台中心）。GAS の遅延で 8〜9 時台にずれることはありうる（SPEC §1.1.1）。
 * 土曜は sendWeeklyReview（§1.4 W-2）が 8 時台の別トリガのため、朝と週次の 2 本が近い午前に届く場合がある。
 */
var MORNING_PUSH_HOUR_JST_ = 7;
/**
 * atHour(hour) と組み合わせる 15 分窓の開始分（0 なら当該時の :00 から :14 付近に起動しうる）。
 * @see https://developers.google.com/apps-script/reference/script/clock-trigger-builder#nearMinute(Integer)
 */
var MORNING_PUSH_NEAR_MINUTE_JST_ = 0;

/**
 * 週次振り返り（installWeeklyReviewTrigger / sendWeeklyReview）の土曜トリガの時（JST、0–23）。§1.4 W-2。
 * 朝プッシュ（`MORNING_PUSH_HOUR_JST_` 既定 7）とは別定数。**別トリガ・別ロック**であり土曜は両方が動きうる。
 */
var WEEKLY_REVIEW_HOUR_JST_ = 8;

function generateDashToken_() {
  return Utilities.getUuid().replace(/-/g, '');
}

/**
 * 冪等なダッシュトークン発行。同じ dateStr に対して 2 回目以降は既存トークンを返す。
 * 朝メッセージと夕方メッセージで同じ URL を共有できる。
 * @private
 */
function issueDashToken_(dateStr) {
  var props = PropertiesService.getScriptProperties();
  var key = dashTokenPropKey_(dateStr);
  var existing = props.getProperty(key);
  if (existing) {
    Logger.log('[issueDashToken_] 既存トークンを返却（' + dateStr + '）');
    return existing;
  }
  var token = generateDashToken_();
  props.setProperty(key, token);
  Logger.log('[issueDashToken_] 新規トークンを発行（' + dateStr + '）');
  return token;
}

function dashTokenPropKey_(dateStr) {
  return DASH_TOKEN_PROP_PREFIX_ + dateStr;
}

/** 開発用。本番では設定しないこと。 */
function isSkipDashTokenCheck_() {
  var v = PropertiesService.getScriptProperties().getProperty('SKIP_DASH_TOKEN_CHECK');
  return v && String(v).trim().toLowerCase() === 'true';
}

/**
 * SPEC §1.3: date と組で token を検証。SKIP_DASH_TOKEN_CHECK=true なら常に通過。
 * @returns {{ ok: boolean, error?: string }}
 */
function assertDashboardToken_(dateStr, tokenParam) {
  if (isSkipDashTokenCheck_()) {
    Logger.log('[SECURITY WARNING] SKIP_DASH_TOKEN_CHECK が有効です。本番環境では必ず無効にしてください。date=' + dateStr);
    return { ok: true };
  }
  var key = dashTokenPropKey_(dateStr);
  var stored = PropertiesService.getScriptProperties().getProperty(key);
  if (!stored) {
    return { ok: false, error: 'token_not_issued' };
  }
  var t = tokenParam != null ? String(tokenParam).trim() : '';
  if (!t) {
    return { ok: false, error: 'token_missing' };
  }
  if (t !== String(stored).trim()) {
    return { ok: false, error: 'invalid_token' };
  }
  return { ok: true };
}

function tokenErrorHtmlHint_(err) {
  if (err === 'token_not_issued') {
    return 'この日のダッシュ用リンクはまだ発行されていません。当日の LINE 通知のあとに開くか、sendDailyReminder を実行してください。';
  }
  if (err === 'token_missing') {
    return 'リンクに token がありません。LINE の「ダッシュボード」から開き直してください。';
  }
  if (err === 'invalid_token') {
    return 'リンクが無効です。当日の LINE メッセージのダッシュボードから開いてください。';
  }
  return 'アクセスを確認できませんでした。';
}

/** 週次 LIFF / doGetWeekly_ 用（日次の tokenErrorHtmlHint_ とは文言を分離） */
function weeklyTokenErrorHtmlHint_(err) {
  if (err === 'token_not_issued') {
    return '週次の振り返り用トークンがまだありません。週次の LINE を送ったあとに開くか、GAS で sendWeeklyReview を実行してください。';
  }
  if (err === 'token_missing') {
    return 'リンクに token がありません。最新の週次 LINE の「振り返り」から開き直してください。';
  }
  if (err === 'invalid_token') {
    return '週次のリンクが無効または期限切れです。最新の週次 LINE の「振り返り」から開いてください。';
  }
  return '週次ページへのアクセスを確認できませんでした。';
}

/**
 * 毎日 17:40（スクリプトのタイムゾーン）に sendDailyReminder を実行するトリガを 1 本だけ入れる。
 * Apps Script エディタから手動で 1 回実行する。
 */
function installDailyReminderTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var toDel = [];
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyReminder') {
      toDel.push(triggers[i]);
    }
  }
  for (var j = 0; j < toDel.length; j++) {
    ScriptApp.deleteTrigger(toDel[j]);
  }
  ScriptApp.newTrigger('sendDailyReminder')
    .timeBased()
    .everyDays(1)
    .atHour(17)
    .nearMinute(40)
    .inTimezone(TZ_)
    .create();
}

/**
 * プロジェクト内のトリガ一覧をログに出す（監査・原因特定用）。
 *
 * 目的:
 * - 「朝が 9 時に来る」等の違和感があったとき、まず **どの関数のトリガが何本あるか**を確定する。
 * - 旧設定（例: 9 時台想定）で作られたトリガが残っていないかを早期発見する。
 *
 * 注意:
 * - GAS の Trigger オブジェクトは timeBased の **設定時刻そのものを取得できない**ため、
 *   この関数は「本数とハンドラ名」の監査に特化する。
 */
function auditProjectTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var counts = {};
  Logger.log('[auditProjectTriggers] tz=' + TZ_ + ' triggers=' + triggers.length);
  for (var i = 0; i < triggers.length; i++) {
    var h = triggers[i].getHandlerFunction();
    counts[h] = (counts[h] || 0) + 1;
  }
  var keys = Object.keys(counts).sort();
  for (var k = 0; k < keys.length; k++) {
    Logger.log('[auditProjectTriggers] handler=' + keys[k] + ' count=' + counts[keys[k]]);
  }
  Logger.log(
    '[auditProjectTriggers] expected: sendMorningMessage=1 sendDailyReminder=1 sendWeeklyReview=1 cleanupOldDashTokens=1（必要なものだけ）'
  );
}

/**
 * トリガまわりの「よくある事故」を防ぐための一括インストール。
 *
 * - これを 1 回実行すれば、トリガが全部「1本ずつ」に揃う。
 * - 時刻を変えたときも、個別 install の実行漏れを防げる。
 */
function installAllTimeTriggers() {
  installMorningMessageTrigger();
  installDailyReminderTrigger();
  installWeeklyReviewTrigger();
  installCleanupTrigger();
  auditProjectTriggers();
}

/**
 * 汎用冪等ロック。fullKey に対応する ScriptProperties フラグが立っていなければ fn を実行し、
 * 実行後にフラグを立てる。重複実行（トリガー多重起動・手動実行の競合）を防止する。
 * キーの命名規則:
 *   'sent:{dateStr}'    … 夕方リマインダー送信済みフラグ
 *   'morning:{dateStr}' … 朝メッセージ送信済みフラグ
 * cleanupOldDashTokens で daysToKeep 日より古いフラグを週次削除する。
 * @private
 */
function withLock_(fullKey, fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(8000);
  } catch (e) {
    Logger.log('[withLock_] ロック取得タイムアウト。スキップ（' + fullKey + '）');
    return;
  }
  try {
    var props = PropertiesService.getScriptProperties();
    if (!props.getProperty(fullKey)) {
      fn();
      props.setProperty(fullKey, '1');
    } else {
      Logger.log('[withLock_] 実行済みのためスキップ（' + fullKey + '）');
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * 毎朝 sendMorningMessage 用の時間主導トリガを **1 本だけ**設定する（JST = TZ_）。
 * GAS エディタから手動で 1 回実行すること（**MORNING_PUSH_* を変えたら再実行が必須**。push だけではトリガは更新されない）。
 */
function installMorningMessageTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var toDel = [];
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendMorningMessage') {
      toDel.push(triggers[i]);
    }
  }
  for (var j = 0; j < toDel.length; j++) {
    ScriptApp.deleteTrigger(toDel[j]);
  }
  ScriptApp.newTrigger('sendMorningMessage')
    .timeBased()
    .everyDays(1)
    .atHour(MORNING_PUSH_HOUR_JST_)
    .nearMinute(MORNING_PUSH_NEAR_MINUTE_JST_)
    .inTimezone(TZ_)
    .create();
  Logger.log(
    '[installMorningMessageTrigger] 登録: JST ' +
      MORNING_PUSH_HOUR_JST_ +
      ':' +
      (MORNING_PUSH_NEAR_MINUTE_JST_ < 10 ? '0' : '') +
      MORNING_PUSH_NEAR_MINUTE_JST_ +
      ' 付近（15 分窓・遅延は SPEC §1.1.1） sendMorningMessage'
  );
  assertMorningTriggerCountOne_();
}

/**
 * 朝トリガ登録直後の検証: sendMorningMessage 用がちょうど 1 本であることをログする（重複・取り逃しの早期発見）。
 * @private
 */
function assertMorningTriggerCountOne_() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendMorningMessage') n++;
  }
  if (n !== 1) {
    Logger.log('[installMorningMessageTrigger] WARNING: sendMorningMessage トリガ本数=' + n + '（期待 1）。エディタのトリガ画面を確認してください。');
  } else {
    Logger.log('[installMorningMessageTrigger] OK: sendMorningMessage クロックトリガ 1 本');
  }
}

/**
 * 朝の定刻（MORNING_PUSH_HOUR_JST_ / MORNING_PUSH_NEAR_MINUTE_JST_ ・JST）に送る「今日の始まり」LINE メッセージ。
 * withLock_ で 1 日 1 回だけ実行される。
 * - Gemini は呼ばない（テンプレートのみ）
 * - issueDashToken_ で冪等トークンを発行（夕方と URL を共有）
 * - ensureDailyRowsForToday_ で当日 Daily 行を補完（冪等）
 */
function sendMorningMessage() {
  var todayStr = Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd');
  withLock_('morning:' + todayStr, function() { sendMorningMessageImpl_(todayStr); });
}

function sendMorningMessageImpl_(todayStr) {
  Logger.log(
    '[sendMorningMessage] 実行開始 JST=' +
      Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd HH:mm:ss') +
      ' date=' +
      todayStr
  );
  var props = PropertiesService.getScriptProperties();
  var lineToken = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var userId    = props.getProperty('LINE_USER_ID');
  if (!lineToken || !userId) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID が未設定です。');
  }

  var ss = getBoundSpreadsheet_();

  // (1) 当日 Daily 行を補完（ensureDailyRowsForToday_ は冪等なので夕方と競合しない）
  try {
    ensureDailyRowsForToday_(ss, todayStr, TZ_);
  } catch (e) {
    Logger.log('[sendMorningMessage] ensureDailyRows 失敗（無視）: ' + String(e));
  }

  // (2) アクティブタスク数を Tasks シートから取得
  var taskCount = countActiveTasks_(ss);

  // (3) dashToken を先行発行（issueDashToken_ は冪等: 夕方と同じトークンを共有）
  var dashToken = issueDashToken_(todayStr);

  // (4) ダッシュボード URL
  var liffUrl = (props.getProperty('LIFF_URL') || '').trim();
  var dashUrl = '';
  if (liffUrl) {
    var q = 'date=' + encodeURIComponent(todayStr) + '&token=' + encodeURIComponent(dashToken);
    var sep = liffUrl.indexOf('?') >= 0 ? '&' : '?';
    dashUrl = liffUrl + sep + q;
  }

  // (5) 曜日ラベル
  var DOW_JP = ['日', '月', '火', '水', '木', '金', '土'];
  var dow = DOW_JP[new Date().getDay()];

  // (6) 朝専用テンプレートメッセージ（Gemini なし、決定論的ローテーション）
  var morningLine = getMorningLine_(todayStr);

  // (7) テキスト組み立て
  var lines = [];
  lines.push('【やったかい】' + todayStr + '（' + dow + '）おはよ！');
  lines.push('今日のタスク: ' + taskCount + '件');
  lines.push('');
  lines.push('ヒロ子より: 「' + morningLine + '」');
  if (dashUrl) {
    lines.push('');
    lines.push('👉 ダッシュボード: ' + dashUrl);
  }

  linePushText_(lineToken, userId, lines.join('\n'));
  Logger.log('[sendMorningMessage] 送信完了（' + todayStr + '）');
}

/**
 * Tasks シートの active なタスク数を返す。
 * @private
 */
function countActiveTasks_(ss) {
  var sheet = ss.getSheetByName('Tasks');
  if (!sheet) return 0;
  var rows = sheet.getDataRange().getValues();
  var h = rows[0];
  var ixId     = h.indexOf('task_id');
  var ixActive = h.indexOf('active');
  if (ixId < 0) return 0;
  var count = 0;
  for (var r = 1; r < rows.length; r++) {
    var id = String(rows[r][ixId] || '').trim();
    if (!id) continue;
    if (ixActive >= 0) {
      var a = rows[r][ixActive];
      if (a === false || String(a).toUpperCase() === 'FALSE') continue;
    }
    count++;
  }
  return count;
}

/**
 * 朝メッセージ用テンプレート（Gemini 不使用）。
 * dayHash_ で日付ごとに決定論的ローテーション。
 * @private
 */
function getMorningLine_(dateStr) {
  var lines = [
    'てか今日こそ全部やりきろ！夕方に◯で埋めよっ😤',
    '今日も小さく積み上げよ。ちりつもがマジ最強✨',
    '朝イチにこれ見てる自分えらい👏 いってらっしゃい！',
    'タスクはこわくない、始めたら勝ちだから💅',
    'もう今日の勝ち筋は決まってる。あとはやるだけ🔥',
    '昨日の自分より一歩だけ前に進めばいい。それだけ🌱',
    'てかあたし今日もやるっしょ！絶対できる💪',
  ];
  return lines[dayHash_(dateStr) % lines.length];
}

/** withLock_ の後方互換ラッパー（夕方リマインダー用）*/
function withDailyLock_(dateStr, fn) {
  withLock_('sent:' + dateStr, fn);
}

function sendDailyReminder() {
  var todayStr = Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd');
  withDailyLock_(todayStr, function() { sendDailyReminderImpl_(todayStr); });
}

/** sendDailyReminder の実処理（withDailyLock_ 内で 1 日 1 回だけ実行される） */
function sendDailyReminderImpl_(todayStr) {
  var ss = getBoundSpreadsheet_();
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var userId = props.getProperty('LINE_USER_ID');
  if (!token || !userId) {
    throw new Error('スクリプト プロパティに LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID を設定してください。');
  }

  var model = buildDailyDashboardModel_(ss, todayStr, TZ_, { ensureTodayRows: true });
  if (!model.ok) {
    linePushText_(token, userId, '【やったかい】' + todayStr + ' の Daily 行がありません。');
    return;
  }

  // LIFF を即時に開けるようキャッシュをウォームアップ（Gemini 呼び出し結果を再利用）
  try {
    var warmPub = toPublicDashboardJson_(model);
    CacheService.getScriptCache().put(CACHE_KEY_PREFIX_ + todayStr, JSON.stringify(warmPub), CACHE_TTL_SEC_);
    Logger.log('[sendDailyReminder] キャッシュをウォームアップしました（' + todayStr + '）');
  } catch (warnErr) {
    Logger.log('[sendDailyReminder] キャッシュウォームアップ失敗（無視）: ' + String(warnErr));
  }

  var lines = formatDailyReminderLines_(model);
  // issueDashToken_ は冪等: 朝メッセージで先行発行済みのトークンがあれば同じ値を返す
  var dashToken = issueDashToken_(model.date);

  var liffUrl = (props.getProperty('LIFF_URL') || '').trim();
  if (liffUrl) {
    var q = 'date=' + encodeURIComponent(model.date) + '&token=' + encodeURIComponent(dashToken);
    var sep = liffUrl.indexOf('?') >= 0 ? '&' : '?';
    lines.push('');
    lines.push('ダッシュボード: ' + liffUrl + sep + q);
  }
  linePushText_(token, userId, lines.join('\n'));
}

/**
 * 指定日の Daily を読み集計し ■2 DTO まで組み立てる（sendDailyReminder / doGet 共通）。
 * @param {{ ensureTodayRows?: boolean, skipSection2?: boolean }} opts
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   date?: string,
 *   achievement_percent?: number,
 *   mood_message?: string,
 *   counts?: { done: number, not_done: number, total: number },
 *   tasks?: Array<{ task_id: string, label: string, status: string, status_mark: string, is_explicit: boolean }>,
 *   section2?: Object,
 *   section2TextBlock?: string
 * }}
 */
function buildDailyDashboardModel_(ss, dateStr, tz, opts) {
  opts = opts || {};
  if (opts.ensureTodayRows) {
    ensureDailyRowsForToday_(ss, dateStr, tz);
  }

  var dailySheet = ss.getSheetByName('Daily');
  var tasksSheet = ss.getSheetByName('Tasks');
  if (!dailySheet || !tasksSheet) {
    throw new Error('シート Daily または Tasks が見つかりません。');
  }

  var dailyRows = dailySheet.getDataRange().getValues();
  var header = dailyRows[0];
  var ciDate  = header.indexOf('date');
  var ciTask  = header.indexOf('task_id');
  var ciStat  = header.indexOf('status');
  var ciUpdAt = header.indexOf('updated_at'); // 存在すればユーザーが明示的に設定済みかを判定
  if (ciDate < 0 || ciTask < 0 || ciStat < 0) {
    throw new Error('Daily の 1 行目に date / task_id / status 列が必要です。');
  }

  var todays = [];
  for (var r = 1; r < dailyRows.length; r++) {
    var row = dailyRows[r];
    var d = formatDateCell_(row[ciDate], tz);
    if (d === dateStr) {
      // updated_at が空 = 自動初期化行（ユーザーがまだ明示的に入力していない）
      var isExplicit = ciUpdAt >= 0 && row[ciUpdAt] !== '' && row[ciUpdAt] !== null && row[ciUpdAt] !== undefined;
      todays.push({
        task_id: String(row[ciTask] || '').trim(),
        raw: row[ciStat],
        is_explicit: isExplicit,
      });
    }
  }

  if (todays.length === 0) {
    return { ok: false, error: 'no_daily_rows', date: dateStr };
  }

  var done = 0;
  var notDone = 0;
  for (var i = 0; i < todays.length; i++) {
    var st = normalizeStatus_(todays[i].raw);
    todays[i].status = st;
    if (st === 'done') done++;
    else notDone++;
  }

  var denom = todays.length;
  var pct = Math.round((done / denom) * 100);
  var mood = moodMessage_(pct);

  // タスクシートは一度だけ読んで buildTaskLabelMap_ と buildCategoryStatsMap_ で共有
  var tRows = tasksSheet.getDataRange().getValues();
  var taskMap = buildTaskLabelMapFromRows_(tRows);

  var tasksOut = [];
  for (var j = 0; j < todays.length; j++) {
    var t = todays[j];
    var label = taskMap[t.task_id] || t.task_id || '(task_id なし)';
    tasksOut.push({
      task_id: t.task_id,
      label: label,
      status: t.status,
      status_mark: statusMark_(t.status),
      is_explicit: !!t.is_explicit, // LIFF のニュートラル表示制御に使用
    });
  }

  // opts.skipSection2=true のとき Gemini / Quotes 呼び出しをスキップ（タスクトグル後の高速集計用）
  var section2Dto = null;
  var section2TextBlock = '';
  if (!opts.skipSection2) {
    var s2 = buildSection2_(ss, dateStr, pct, mood);
    section2Dto = s2.dto;
    section2TextBlock = s2.textBlock;
  }
  var categories = buildCategoryStatsMap_(ss, tasksSheet, tasksOut, tRows);

  return {
    ok: true,
    date: dateStr,
    achievement_percent: pct,
    mood_message: mood,
    counts: { done: done, not_done: notDone, total: denom },
    tasks: tasksOut,
    categories: categories,
    section2: section2Dto,
    section2TextBlock: section2TextBlock,
  };
}

/**
 * buildTaskLabelMap_ の行配列版。buildDailyDashboardModel_ でシートを一度読んだ配列を再利用する。
 * @private
 */
function buildTaskLabelMapFromRows_(rows) {
  var h = rows[0];
  var ixId    = h.indexOf('task_id');
  var ixShort = h.indexOf('display_short');
  var ixTitle = h.indexOf('title');
  var ixActive = h.indexOf('active');
  if (ixId < 0) throw new Error('Tasks の 1 行目に task_id 列が必要です。');
  var map = {};
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    var id = String(row[ixId] || '').trim();
    if (!id) continue;
    if (ixActive >= 0) {
      var a = row[ixActive];
      if (a === false || String(a).toUpperCase() === 'FALSE') continue;
    }
    var shortv = ixShort >= 0 ? String(row[ixShort] || '').trim() : '';
    var titlev = ixTitle >= 0 ? String(row[ixTitle] || '').trim() : '';
    map[id] = shortv || titlev || id;
  }
  return map;
}

/**
 * Categories シート + Tasks シートのカテゴリ列を使い、タスク集計結果をカテゴリ別に集計。
 * taskRows を渡せばシートの再読み込みをスキップする（buildDailyDashboardModel_ での二重読み防止）。
 * Categories シートが無い・category_id 列が無い場合はタスクを「その他」に集約して返す。
 * @returns Array<{ category_id, display_name, color, sort_order, done, not_done, total }>
 */
function buildCategoryStatsMap_(ss, tasksSheet, tasksOut, taskRows) {
  var tRows = taskRows || tasksSheet.getDataRange().getValues();
  var th = tRows[0];
  var ixTid = th.indexOf('task_id');
  var ixCat = th.indexOf('category_id');
  var taskCatMap = {};
  if (ixTid >= 0 && ixCat >= 0) {
    for (var r = 1; r < tRows.length; r++) {
      var tid = String(tRows[r][ixTid] || '').trim();
      var cid = String(tRows[r][ixCat] || '').trim();
      if (tid) taskCatMap[tid] = cid;
    }
  }

  var catSheet = ss.getSheetByName('Categories');
  var catMap = {};
  var catOrder = [];
  if (catSheet) {
    var cRows = catSheet.getDataRange().getValues();
    var ch = cRows[0];
    var cxId = ch.indexOf('category_id');
    var cxName = ch.indexOf('display_name');
    var cxColor = ch.indexOf('color');
    var cxSort = ch.indexOf('sort_order');
    var cxActive = ch.indexOf('active');
    if (cxId >= 0) {
      for (var ci = 1; ci < cRows.length; ci++) {
        var crow = cRows[ci];
        var catId = String(crow[cxId] || '').trim();
        if (!catId) continue;
        if (cxActive >= 0) {
          var av = crow[cxActive];
          if (av === false || String(av).toUpperCase() === 'FALSE') continue;
        }
        var sord = cxSort >= 0 ? Number(crow[cxSort]) : ci;
        if (isNaN(sord)) sord = ci;
        catMap[catId] = {
          category_id: catId,
          display_name: cxName >= 0 ? String(crow[cxName] || catId).trim() : catId,
          color: cxColor >= 0 ? String(crow[cxColor] || '#94A3B8').trim() : '#94A3B8',
          sort_order: sord,
          done: 0, not_done: 0, total: 0,
        };
        catOrder.push({ id: catId, ord: sord });
      }
    }
  }

  var NONE = '__none__';
  var hasNone = false;
  for (var ti = 0; ti < tasksOut.length; ti++) {
    var task = tasksOut[ti];
    var cid2 = taskCatMap[task.task_id] || '';
    if (!catMap[cid2]) {
      if (!catMap[NONE]) {
        catMap[NONE] = {
          category_id: NONE, display_name: 'その他', color: '#94A3B8',
          sort_order: 9999, done: 0, not_done: 0, total: 0,
        };
        hasNone = true;
      }
      cid2 = NONE;
    }
    var cat = catMap[cid2];
    cat.total++;
    if (task.status === 'done') cat.done++;
    else cat.not_done++;
  }
  if (hasNone) catOrder.push({ id: NONE, ord: 9999 });

  catOrder.sort(function (a, b) { return a.ord - b.ord; });
  var result = [];
  for (var k = 0; k < catOrder.length; k++) {
    var c = catMap[catOrder[k].id];
    if (c && c.total > 0) result.push(c);
  }
  return result;
}

/** buildDailyDashboardModel_ の結果から LINE 用テキスト行を生成 */
function formatDailyReminderLines_(model) {
  var c = model.counts;
  var lines = [];
  lines.push('【やったかい】' + model.date);
  lines.push('達成率 ' + model.achievement_percent + '%　' + model.mood_message);
  lines.push('（達成 ' + c.done + ' / 全体 ' + c.total + '、未 ' + c.not_done + '）');
  lines.push('');
  for (var j = 0; j < model.tasks.length; j++) {
    var t = model.tasks[j];
    lines.push('- ' + t.label + ' ' + t.status_mark);
  }
  lines.push('');
  lines.push(model.section2TextBlock);
  return lines;
}

/**
 * LIFF が liff.state に包んだクエリ文字列（"?date=X&token=Y" 等）を解析してオブジェクトに変換。
 * GAS サーバー側には URLSearchParams が無いため簡易実装。
 */
function parseLiffState_(liffState) {
  var result = {};
  if (!liffState) return result;
  var s = String(liffState).replace(/^\?/, '');
  var pairs = s.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var eqIdx = pairs[i].indexOf('=');
    if (eqIdx < 1) continue;
    try {
      var key = decodeURIComponent(pairs[i].slice(0, eqIdx));
      var val = decodeURIComponent(pairs[i].slice(eqIdx + 1));
      result[key] = val;
    } catch (ex) {}
  }
  return result;
}

/**
 * 週次 LIFF 用の不透明オープン ID を発行する（正本は Script Properties）。
 * @param {string} weekStartJst yyyy-MM-dd（その週の月曜・JST）
 * @param {string} weekToken issueWeekToken_ が返した週次ダッシュ用トークン
 * @returns {string} 32 桁 hex（ハイフンなし UUID）
 * @private
 */
function issueWeeklyLiffOpaqueOpen_(weekStartJst, weekToken) {
  var id = generateDashToken_();
  var now = Date.now();
  var ws = String(weekStartJst || '').trim();
  var tok = String(weekToken || '').trim();
  var payload = {
    v: 1,
    scope: 'weekly',
    weekStart: ws,
    token: tok,
    exp: now + LIFF_OPAQUE_EXP_MS_,
    iat: now,
  };
  PropertiesService.getScriptProperties().setProperty(LIFF_OPAQUE_OPEN_PREFIX_ + id, JSON.stringify(payload));
  Logger.log('[issueWeeklyLiffOpaqueOpen_] issued oid weekStart=' + ws);
  return id;
}

/**
 * 不透明 oid を解決し、週次 doGet 用の weekStart / token を返す。
 * @returns {{ ok: true, weekStart: string, token: string } | { ok: false, error: string }}
 * @private
 */
function resolveLiffOpaqueWeeklyOpen_(oid) {
  var id = String(oid || '')
    .trim()
    .replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(id)) {
    return { ok: false, error: 'open_invalid' };
  }
  var raw = PropertiesService.getScriptProperties().getProperty(LIFF_OPAQUE_OPEN_PREFIX_ + id);
  if (!raw) {
    return { ok: false, error: 'open_not_found' };
  }
  var o;
  try {
    o = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: 'open_invalid' };
  }
  if (!o || o.v !== 1 || o.scope !== 'weekly') {
    return { ok: false, error: 'open_invalid' };
  }
  var ws = String(o.weekStart || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ws)) {
    return { ok: false, error: 'open_invalid' };
  }
  var tok = String(o.token || '').trim();
  if (!tok) {
    return { ok: false, error: 'open_invalid' };
  }
  var exp = Number(o.exp);
  if (!isNaN(exp) && exp > 0 && Date.now() > exp) {
    return { ok: false, error: 'open_expired' };
  }
  return { ok: true, weekStart: ws, token: tok };
}

/**
 * oid 解決失敗時のユーザー向け短文（週次 token 文言とは別系統）。
 * @private
 */
function weeklyLiffOpenResolvErrorHint_(code) {
  if (code === 'open_expired') {
    return '週次の振り返りリンクの有効期限が切れています。最新の週次 LINE の「振り返り」から開いてください。';
  }
  if (code === 'open_not_found') {
    return '振り返りリンクが見つかりません。最新の週次 LINE の「振り返り」から開いてください。';
  }
  return weeklyTokenErrorHtmlHint_('invalid_token');
}

/**
 * doGet のクエリと LIFF の liff.state を一箇所でマージする。
 * 同一キーは e.parameter（アドレスバー直下のクエリ）を liff.state より優先する。
 * @returns {{ date: string, weekStart: string, token: string, format: string, liffState: string, yw: string, oid: string }}
 * @private
 */
function parseWebAppQuery_(e) {
  e = e || {};
  var p = e.parameter || {};
  var liffState = (p['liff.state'] && String(p['liff.state'])) || '';
  var st = parseLiffState_(liffState);
  function pick_(top, fromState) {
    var a = top != null && String(top).trim();
    if (a) return a;
    var b = fromState != null && String(fromState).trim();
    return b || '';
  }
  var fmtTop = (p.format && String(p.format).trim().toLowerCase()) || '';
  var fmtSt = (st.format && String(st.format).trim().toLowerCase()) || '';
  return {
    date: pick_(p.date, st.date),
    weekStart: pick_(p.weekStart, st.weekStart),
    token: pick_(p.token != null && p.token !== undefined ? p.token : '', st.token),
    format: fmtTop || fmtSt || '',
    liffState: liffState,
    /** 週次 LIFF 意図（LINE 本文 URL に yw=1 を付与。weekStart 欠落時に日次へ落とさない） */
    yw: pick_(p.yw, st.yw),
    /** 週次不透明オープン ID（weekStart/token のサーバー正本へ解決） */
    oid: pick_(p.oid, st.oid),
    /** 診断用: 最新デプロイかどうかを HTTP GET だけで判定する */
    ping: pick_(p.ping, st.ping),
  };
}

/**
 * LINE LIFF 内 WebView（iframe）で表示するため X-Frame-Options を緩和する。
 * JSON（jsonOutput_）には使わない。
 * @private
 */
function liffHtmlOutput_(html) {
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * &lt;script&gt; 内にそのまま埋め込める JSON リテラル（&lt;/script&gt; 断ち・HTML パーサ干渉を避ける）。
 * @param {*} obj JSON.stringify 可能な値
 * @returns {string}
 * @private
 */
function jsonLiteralForScriptTag_(obj) {
  if (obj === null || obj === undefined) return 'null';
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/**
 * コンテナバインドのスプレッドシートを取得する。
 * ウェブアプリ・google.script.run で getActiveSpreadsheet が取れない場合は Script Properties の
 * BOUND_SPREADSHEET_ID で openById する。Active が取れたときは ID をプロパティにキャッシュする。
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 * @private
 */
function getBoundSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    Logger.log('[getBoundSpreadsheet_] getActiveSpreadsheet 例外: ' + String(e));
  }
  if (ss) {
    try {
      var id = ss.getId();
      var prev = props.getProperty(BOUND_SPREADSHEET_ID_KEY_);
      if (prev !== id) {
        props.setProperty(BOUND_SPREADSHEET_ID_KEY_, id);
        Logger.log('[getBoundSpreadsheet_] ' + BOUND_SPREADSHEET_ID_KEY_ + ' を更新');
      }
    } catch (e2) {
      Logger.log('[getBoundSpreadsheet_] ID キャッシュ失敗（無視）: ' + String(e2));
    }
    return ss;
  }
  var sid = (props.getProperty(BOUND_SPREADSHEET_ID_KEY_) || '').trim();
  if (!sid) {
    throw new Error(
      'スプレッドシートを取得できません（ウェブアプリ等で Active が無い状態です）。' +
        'スプレッドシートから本スクリプトを開き ensureSpreadsheetBinding を 1 回実行するか、' +
        'Script Properties に ' +
        BOUND_SPREADSHEET_ID_KEY_ +
        ' をスプレッドシートの ID で設定してください。'
    );
  }
  return SpreadsheetApp.openById(sid);
}

/**
 * スプレッドシートを開いた状態で GAS エディタから 1 回実行し、BOUND_SPREADSHEET_ID を保存する。
 * LIFF / ウェブアプリで getActiveSpreadsheet が無いときのフォールバック用。
 */
function ensureSpreadsheetBinding() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('スプレッドシートを開いたうえで実行してください。');
  PropertiesService.getScriptProperties().setProperty(BOUND_SPREADSHEET_ID_KEY_, ss.getId());
  Logger.log('[ensureSpreadsheetBinding] ' + BOUND_SPREADSHEET_ID_KEY_ + '=' + ss.getId());
}

/**
 * 週次 LIFF 専用クエリ yw=1（LINE 本文 URL に付与）が付いているか。
 * @private
 */
function isWeeklyLiffIntent_(q) {
  var yw = String(q && q.yw != null ? q.yw : '')
    .trim()
    .toLowerCase();
  return yw === '1' || yw === 'true' || yw === 'yes';
}

/**
 * 週次意図（yw=1）だが weekStart が欠けたときの案内 HTML（日次トークン検証に落とさない）。
 * @private
 */
function weeklyLiffParamsMissingHtml_() {
  var body =
    '<p style="margin:16px;font-size:15px;line-height:1.7;color:#1E293B;">' +
    '週次ページ用の情報が足りません（<code>weekStart</code> がありません）。' +
    '</p>' +
    '<p style="margin:16px;font-size:14px;line-height:1.7;color:#475569;">' +
    '<strong>対処:</strong> 最新の週次 LINE（<span style="white-space:nowrap;">【やったかい週次】</span>）の' +
    '<strong>「振り返り」</strong>リンクから開き直してください。' +
    ' LIFF のエンドポイント URL だけをブックマークしていると表示できません。' +
    '</p>';
  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>やったかい 週次</title></head><body style="font-family:system-ui,sans-serif;background:#fafafa;">' +
    body +
    '</body></html>'
  );
}

/**
 * ウェブアプリ（LIFF エンドポイント）。
 * format=json … ダッシュボード DTO（?token= は sendDailyReminder 発行分と照合）
 *
 * 投資図解メール（任意）: スクリプトプロパティ INVEST24H_MAIL_TRIGGER_SECRET が設定されているときだけ、
 * GET ?invest24hMail=1&secret=（同値）で sendInvest24hDigestEmail を実行する。JSON のみ返す。
 */
function doGet(e) {
  e = e || { parameter: {} };
  var p0 = e.parameter || {};
  if (String(p0.invest24hMail || '').trim() === '1') {
    var props0 = PropertiesService.getScriptProperties();
    var expected0 = (props0.getProperty('INVEST24H_MAIL_TRIGGER_SECRET') || '').trim();
    var got0 = String(p0.secret != null ? p0.secret : '').trim();
    if (!expected0) {
      return jsonOutput_({ ok: false, error: 'mail_trigger_secret_not_configured' });
    }
    if (got0 !== expected0) {
      return jsonOutput_({ ok: false, error: 'forbidden' });
    }
    try {
      sendInvest24hDigestEmail();
      return jsonOutput_({ ok: true, mailed: true });
    } catch (mailErr) {
      return jsonOutput_({ ok: false, error: 'mail_failed', message: String(mailErr.message || mailErr) });
    }
  }

  var q = parseWebAppQuery_(e);
  var tz = TZ_;

  // 診断: デプロイ識別子と、どのクエリが見えているか
  try {
    Logger.log('[doGet] marker=' + DEPLOY_MARKER_ + ' q=' + JSON.stringify(q));
  } catch (eLog) {}

  // 診断: 最新デプロイ判定・LIFF/LINE 経由のクエリ可視化
  // 例: <webapp-url>?ping=1
  if (String(q.ping || '').trim() === '1') {
    return jsonOutput_({
      ok: true,
      marker: DEPLOY_MARKER_,
      now_jst: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'),
      q: q,
      raw_parameter: e && e.parameter ? e.parameter : {},
    });
  }

  var rawDate = q.date;
  var format = q.format;
  var tokenParam = q.token;

  // 不透明 oid: LIFF 経由で weekStart/token が欠落してもサーバー正本で週次へルーティング（日次 token 検証に落とさない）
  var oidRaw = String(q.oid || '')
    .trim()
    .replace(/-/g, '');
  if (oidRaw && /^[0-9a-f]{32}$/i.test(oidRaw)) {
    Logger.log('[doGet] route=weekly_by_oid oid=' + oidRaw);
    var opened = resolveLiffOpaqueWeeklyOpen_(oidRaw);
    if (opened.ok === true) {
      Logger.log('[doGet] oid_resolved weekStart=' + opened.weekStart);
      return doGetWeekly_(opened.weekStart, opened.token, format);
    }
    if (format === 'json') {
      return jsonOutput_({
        ok: false,
        error: opened.error || 'open_invalid',
        week_start: opened.weekStart || '',
      });
    }
    return liffHtmlOutput_(
      '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
        '<title>やったかい 週次</title></head><body style="font-family:system-ui,sans-serif;background:#fafafa;">' +
        '<p style="margin:16px;line-height:1.7;color:#1E293B;">' +
        escapeHtml_(weeklyLiffOpenResolvErrorHint_(opened.error)) +
        '</p></body></html>'
    );
  }

  /**
   * LIFF が weekStart / oid / yw を落として token だけ残すと、日次分岐で「今日」と照合され invalid_token になる。
   * トークンが「今日を含む週の月曜」に紐づく週次トークンなら、そのまま週次へ（sendWeeklyReview が発行した週と一致する）。
   */
  if (!String(q.weekStart || '').trim() && tokenParam) {
    var todayJstFb = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var wsFb = mostRecentMondayJst_(todayJstFb);
    var gateW = assertWeeklyToken_(wsFb, tokenParam);
    if (gateW.ok) {
      Logger.log('[doGet] LIFF フォールバック: weekStart 欠落を週次トークンで補い weekStart=' + wsFb);
      return doGetWeekly_(wsFb, tokenParam, format);
    }
  }

  // 週次 LIFF（LINE で yw=1 を付与）なのに weekStart が欠けた場合、日次トークン検証に落ちない
  if (isWeeklyLiffIntent_(q) && !String(q.weekStart || '').trim()) {
    if (format === 'json') {
      return jsonOutput_({
        ok: false,
        error: 'weekly_params_incomplete',
        message: 'weekStart が必要です。最新の週次 LINE の「振り返り」リンクから開いてください。',
      });
    }
    return liffHtmlOutput_(weeklyLiffParamsMissingHtml_());
  }

  // weekStart があれば週次（§5.7.3 W-8）。日次 date より先に判定する。
  if (q.weekStart) {
    return doGetWeekly_(q.weekStart, tokenParam, format);
  }

  var dateStr = rawDate || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    if (format === 'json') {
      return jsonOutput_({ ok: false, error: 'invalid_date', date: dateStr });
    }
    return htmlMessage_(
      '日付が不正です。yyyy-MM-dd で指定してください。',
      dateStr,
      format
    );
  }

  var gate = assertDashboardToken_(dateStr, tokenParam);
  if (!gate.ok) {
    if (format === 'json') {
      return jsonOutput_({ ok: false, error: gate.error, date: dateStr });
    }
    return htmlMessage_(tokenErrorHtmlHint_(gate.error), dateStr, format, null, tokenParam);
  }

  var ss;
  try {
    ss = getBoundSpreadsheet_();
  } catch (err) {
    if (format === 'json') {
      return jsonOutput_({ ok: false, error: 'no_spreadsheet', message: String(err.message || err) });
    }
    return htmlMessage_(
      'スプレッドシートを取得できません。コンテナバインドでデプロイするか、スプレッドシートから ensureSpreadsheetBinding を 1 回実行してください。',
      dateStr,
      format,
      null,
      tokenParam
    );
  }

  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var ensureRows = dateStr === todayStr;

  var pubJson;
  try {
    pubJson = getCachedDashboard_(ss, dateStr, tz, { ensureTodayRows: ensureRows });
  } catch (err) {
    if (format === 'json') {
      return jsonOutput_({ ok: false, error: 'build_failed', message: String(err.message || err) });
    }
    return htmlMessage_(String(err.message || err), dateStr, format, null, tokenParam);
  }

  if (format === 'json') {
    return jsonOutput_(pubJson);
  }

  var hint = pubJson.ok
    ? '上の内容はスプレッドシートと同じ JSON から取得しています。'
    : '（この日の Daily 行がありません）';
  return htmlMessage_(hint, dateStr, format, pubJson.ok ? pubJson : null, tokenParam);
}

/** JSON レスポンス（LIFF の fetch 用） */
function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** API 向けに整形（LINE 用 section2TextBlock は含めない） */
function toPublicDashboardJson_(model) {
  if (!model.ok) {
    return { ok: false, error: model.error || 'unknown', date: model.date };
  }
  return {
    ok: true,
    date: model.date,
    achievement_percent: model.achievement_percent,
    mood_message: model.mood_message,
    counts: model.counts,
    tasks: model.tasks,
    categories: model.categories || [],
    section2: model.section2,
  };
}

/**
 * HtmlService 内から google.script.run で呼ぶ（クライアント fetch は GAS が HTML を返して
 * JSON.parse に失敗することがあるためサーバー経路にする）。
 * 名前末尾に _ を付けない（google.script.run の制約）。
 */
function getDashboardJsonForClient(dateStr, clientToken) {
  var tz = TZ_;
  var d = (dateStr && String(dateStr).trim()) || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, error: 'invalid_date', date: d };
  }
  var gate = assertDashboardToken_(d, clientToken);
  if (!gate.ok) {
    return { ok: false, error: gate.error, date: d };
  }
  var ss;
  try {
    ss = getBoundSpreadsheet_();
  } catch (err) {
    return { ok: false, error: 'no_spreadsheet', message: String(err.message || err) };
  }
  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var ensureRows = d === todayStr;
  try {
    return getCachedDashboard_(ss, d, tz, { ensureTodayRows: ensureRows });
  } catch (err2) {
    return { ok: false, error: 'build_failed', message: String(err2.message || err2) };
  }
}

/**
 * CacheService を使ってダッシュボード JSON を返す共通ヘルパー。
 * キャッシュヒット時はシート読み込みをスキップして即返却する。
 * キャッシュミス時は buildDailyDashboardModel_ → toPublicDashboardJson_ してキャッシュに書く。
 *
 * opts は buildDailyDashboardModel_ のオプションと同じ（ensureTodayRows / skipSection2 等）。
 * opts.bypassCache=true のときはキャッシュを無視して必ず再読み込みする（デバッグ用）。
 * @private
 */
function getCachedDashboard_(ss, dateStr, tz, opts) {
  opts = opts || {};
  var key = CACHE_KEY_PREFIX_ + dateStr;
  if (!opts.bypassCache) {
    try {
      var hit = CacheService.getScriptCache().get(key);
      if (hit) {
        var parsed = JSON.parse(hit);
        Logger.log('[cache HIT] ' + key);
        return parsed;
      }
    } catch (e) {
      Logger.log('[cache] get/parse error（無視）: ' + String(e));
    }
  }
  var model = buildDailyDashboardModel_(ss, dateStr, tz, opts);
  var pub = toPublicDashboardJson_(model);
  if (pub.ok) {
    try {
      CacheService.getScriptCache().put(key, JSON.stringify(pub), CACHE_TTL_SEC_);
      Logger.log('[cache SET] ' + key + ' ttl=' + CACHE_TTL_SEC_ + 's');
    } catch (e) {
      Logger.log('[cache] put error（無視）: ' + String(e));
    }
  }
  return pub;
}

/**
 * 指定日のダッシュボードキャッシュを削除する。
 * updateTaskStatus でシートを書き換えたあとに呼ぶ。
 * @private
 */
function invalidateDashboardCache_(dateStr) {
  try {
    CacheService.getScriptCache().remove(CACHE_KEY_PREFIX_ + dateStr);
    Logger.log('[cache INVALIDATED] ' + CACHE_KEY_PREFIX_ + dateStr);
  } catch (e) {}
}

/**
 * LIFF クライアントから google.script.run で呼ぶタスク状態更新 RPC。
 * 名前末尾に _ を付けない（google.script.run の制約）。
 *
 * @param {string} dateStr     'YYYY-MM-DD'
 * @param {string} clientToken sendDailyReminder で発行したトークン
 * @param {string} taskId      'task_001' など
 * @param {string} newStatus   'done' | 'not_done'
 * @returns {object} ok:true 時は toPublicDashboardJson_ 相当の更新後モデル
 *                   ok:false 時は { ok: false, error: string }
 */
function updateTaskStatus(dateStr, clientToken, taskId, newStatus) {
  // 1. 入力バリデーション（unset への書き戻しは UI 仕様上受け付けない）
  if (newStatus !== 'done' && newStatus !== 'not_done') {
    return { ok: false, error: 'INVALID_STATUS' };
  }
  var d = dateStr && String(dateStr).trim();
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, error: 'INVALID_DATE' };
  }
  var tid = taskId && String(taskId).trim();
  if (!tid) {
    return { ok: false, error: 'INVALID_TASK_ID' };
  }

  // 2. トークン検証（getDashboardJsonForClient と同じ経路・同じ関数で一元管理）
  var gate = assertDashboardToken_(d, clientToken);
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }

  // 3. LockService で競合防止（連打・LIFF 再読み込み重複の対策）
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: 'LOCK_TIMEOUT' };
  }

  try {
    var ss = getBoundSpreadsheet_();
    var dailySheet = ss.getSheetByName('Daily');
    if (!dailySheet) return { ok: false, error: 'NO_DAILY_SHEET' };

    var data = dailySheet.getDataRange().getValues();
    var header = data[0];
    var colDate   = header.indexOf('date');
    var colTaskId = header.indexOf('task_id');
    var colStatus = header.indexOf('status');
    var colUpdAt  = header.indexOf('updated_at');

    if (colDate < 0 || colTaskId < 0 || colStatus < 0) {
      return { ok: false, error: 'MISSING_COLUMNS' };
    }

    var tz = TZ_;
    var written = false;
    for (var i = 1; i < data.length; i++) {
      var rowDate   = formatDateCell_(data[i][colDate], tz);
      var rowTaskId = String(data[i][colTaskId] || '').trim();
      if (rowDate === d && rowTaskId === tid) {
        dailySheet.getRange(i + 1, colStatus + 1).setValue(newStatus === 'done' ? '◯' : '×');
        if (colUpdAt >= 0) {
          dailySheet.getRange(i + 1, colUpdAt + 1).setValue(
            Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss")
          );
        }
        written = true;
        break;
      }
    }

    if (!written) {
      return { ok: false, error: 'TASK_NOT_FOUND' };
    }

    // キャッシュ無効化 → 高速再ビルド（section2 は skipSection2:true で Gemini 呼び出し省略）
    // 注: skipSection2:true の結果はキャッシュに書かない。
    //     section2:null がキャッシュに残ると次回ページリロード時にキャラクター会話が消えるため。
    //     次の doGet/getDashboardJsonForClient 呼び出しはキャッシュミスし、完全なデータを再構築する。
    invalidateDashboardCache_(d);
    var model = buildDailyDashboardModel_(ss, d, tz, { skipSection2: true });
    return toPublicDashboardJson_(model);
  } finally {
    lock.releaseLock();
  }
}

/**
 * HTML 版ダッシュボード（LIFF）。
 * google.script.run で getDashboardJsonForClient を呼び、ドーナツ SVG・カテゴリバー・■2 を描画。
 * 変更後: clasp push → ウェブアプリ「新バージョン」で再デプロイ。
 */
/**
 * HTML 版ダッシュボード（LIFF）。
 * model が渡されたとき（doGet がキャッシュから取得済みのとき）は JSON を HTML に埋め込み、
 * クライアントは google.script.run を呼ばずに即座に描画する（2往復 → 1往復）。
 * model が null のとき（エラー時）は従来通り google.script.run でフォールバック取得する。
 * 変更後: clasp push → ウェブアプリ「新バージョン」で再デプロイ。
 */
function htmlMessage_(message, dateStr, format, model, tokenStr) {
  var defaultDateJson = JSON.stringify(dateStr);
  var defaultTokenJson = JSON.stringify(String(tokenStr || ''));
  var escapedHint = escapeHtml_(message || '');
  // AVATAR_BASE_URL: 末尾スラッシュなし。未設定時は '' → 画像なし（テキストのみ）
  var avatarBaseUrl = (PropertiesService.getScriptProperties().getProperty('AVATAR_BASE_URL') || '').replace(/\/$/, '');

  // model（public JSON）が渡されていればクライアントに埋め込む → 2往復目の RPC をゼロにする
  // model は toPublicDashboardJson_ の結果（ok, date, tasks, categories, section2 等を含む）
  var bakedJson = (model && model.ok) ? jsonLiteralForScriptTag_(model) : 'null';

  var css = [
    // iOS/Android セーフエリア対応（ノッチ・ホームバー）と和文フォントスタック
    '*{-webkit-tap-highlight-color:transparent;box-sizing:border-box;}',
    'body{font-family:"Noto Sans JP","Hiragino Kaku Gothic ProN",system-ui,sans-serif;',
    'padding:env(safe-area-inset-top,0) 16px calc(40px + env(safe-area-inset-bottom,0));',
    'max-width:480px;margin:0 auto;background:#fafafa;color:#1E293B;}',
    '#st{min-height:1.4em;padding:10px 0 2px;font-size:13px;color:#64748B;}',
    '.top{text-align:center;padding:16px 0 6px;}',
    '.dlbl{font-size:12px;color:#94A3B8;margin:0 0 2px;letter-spacing:.04em;}',
    '.mlbl{font-size:15px;font-weight:700;color:#1E293B;margin:0;}',
    '@keyframes donutIn{from{opacity:0;transform:scale(0.96);}to{opacity:1;transform:scale(1);}}',
    '.donut-wrap{display:flex;justify-content:center;padding:8px 0 4px;animation:donutIn .18s ease-out;}',
    '.donut-svg{width:160px;height:160px;}',
    '.dpct{font-size:30px;font-weight:900;fill:#1E293B;dominant-baseline:middle;text-anchor:middle;}',
    '.clbl{text-align:center;font-size:12px;color:#64748B;margin:2px 0 16px;}',
    // h2 の最小サイズを 11px→12px（物理サイズ約4mm確保）
    'h2{font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.06em;margin:18px 0 8px;border-bottom:1px solid #E2E8F0;padding-bottom:4px;}',
    '.catsec,.tasksec{margin-bottom:4px;}',
    '.crow{margin-bottom:12px;}',
    '.cnr{display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:5px;}',
    '.cdot{width:10px;height:10px;border-radius:50%;flex-shrink:0;display:inline-block;}',
    '.cfrac{margin-left:auto;font-size:13px;font-weight:700;color:#1E293B;}',
    '.cbar{height:8px;border-radius:4px;background:#F1F5F9;overflow:hidden;display:flex;}',
    '.bd,.bn{height:100%;}',
    '.bn{background:#FECACA;}',
    'ul{list-style:none;padding:0;margin:0;}',
    '.ti{padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:6px;border:1px solid #E2E8F0;background:#fff;display:flex;align-items:center;gap:8px;}',
    '.tlbl{flex:1;min-width:0;word-break:break-all;}',
    // タップ領域を Apple/Google 推奨の 44×44 以上に拡大、transition を 80ms に短縮
    '.tbtn{border:none;border-radius:8px;padding:10px 14px;font-size:16px;cursor:pointer;background:#F1F5F9;color:#94A3B8;',
    'transition:background .08s,color .08s,transform .08s;line-height:1;min-width:44px;min-height:44px;flex-shrink:0;}',
    '.tbtn:active{transform:scale(0.88);}',
    '.tbtn.a-done{background:#059669;color:#fff;}',
    '.tbtn.a-nd{background:#DC2626;color:#fff;}',
    '.tbtn:disabled{opacity:.4;cursor:not-allowed;}',
    '.td{border-color:#A7F3D0;background:#F0FDF4;}',  // ◯ 達成: 緑
    '.tn{border-color:#FECACA;background:#FEF2F2;}',  // ✕ 明示的未達成: 赤
    '.tu{border-color:#E2E8F0;background:#fff;}',     // 未記録（中立）: ニュートラル
    // safe-area-inset-bottom を考慮、white-space:normal で長文トーストも折り返す
    '.toast{position:fixed;bottom:calc(24px + env(safe-area-inset-bottom,0));left:50%;',
    'transform:translateX(-50%);background:#1E293B;color:#fff;padding:8px 20px;border-radius:20px;',
    'font-size:13px;opacity:0;transition:opacity .3s;pointer-events:none;z-index:999;',
    'white-space:normal;max-width:calc(100vw - 48px);text-align:center;}',
    '.toast.show{opacity:1;}',
    '.sec2{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin-top:4px;}',
    '.qt{font-size:14px;font-weight:700;color:#1E293B;margin:0 0 4px;line-height:1.6;}',
    '.qa{font-size:11px;color:#94A3B8;margin:0 0 6px;}',
    '.qm-h{font-size:11px;font-weight:700;color:#64748B;margin:10px 0 4px;letter-spacing:.04em;}',
    '.qm{font-size:13px;color:#334155;margin:0 0 12px;line-height:1.65;white-space:pre-wrap;word-break:break-word;}',
    '.ch{display:flex;align-items:flex-start;gap:10px;margin:10px 0;}',
    '.ch.r{flex-direction:row-reverse;}',
    '.av{width:64px;height:64px;min-width:64px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#E2E8F0;}',
    '.bubble{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:8px 12px;font-size:13px;color:#334155;line-height:1.6;flex:1;}',
    '.ch.r .bubble{background:#EFF6FF;border-color:#BFDBFE;}',
    // キャラクター名を 10px→11px に引き上げ
    '.cn{font-size:11px;font-weight:700;color:#94A3B8;margin:0 0 2px;letter-spacing:.04em;}',
    '.dg{font-size:13px;color:#475569;margin:6px 0;line-height:1.6;}',
    '.footer{margin-top:28px;padding-top:14px;border-top:1px solid #E2E8F0;font-size:11px;color:#94A3B8;text-align:center;}',
    'a{color:#3B82F6;text-decoration:none;}',
  ].join('');

  var js = [
    '(function(){',
    'var D=' + defaultDateJson + ',T=' + defaultTokenJson + ',AV=' + jsonLiteralForScriptTag_(avatarBaseUrl) + ',NS="http://www.w3.org/2000/svg";',
    // サーバーが埋め込んだ初期データ。非 null のときは google.script.run を呼ばず即描画する
    'var __D__=' + bakedJson + ';',
    'var root=document.getElementById("app"),stEl=document.getElementById("st");',
    'var qs=new URLSearchParams(window.location.search);',
    'var date=(qs.get("date")||"").trim()||D,token=(qs.get("token")||"").trim()||T;',
    'stEl.textContent="読み込み中…";while(root.firstChild)root.removeChild(root.firstChild);',
    'function h(tag,text,cls){var e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}',
    'function svgE(tag){return document.createElementNS(NS,tag);}',
    'function sa(el,k,v){el.setAttribute(k,v);}',
    // Color sanitizer
    'function sc(c){var s=String(c||"#94A3B8").trim();return/^(#[0-9a-fA-F]{3,8}|rgb[a]?\\([^)]*\\)|[a-zA-Z]{2,30})$/.test(s)?s:"#94A3B8";}',
    // Donut SVG builder — §3.5: segment = category task-count share
    // 実装方針:
    //   stroke-dasharray によるセグメント分割を廃止し、SVG <path> Arc コマンドで直接描画。
    //   → 重なった dashed-circle が生むアンチエイリアシング seam（グレー漏れ）を根絶。
    //   Layer-1: グレー背景 <circle>（total=0 でも円の輪郭が見える）
    //   Layer-2: 各カテゴリを <path fill=色> のドーナツスライスで描画（stroke なし・seam なし）
    //   360° 単一セグメントは degenerate SVG arc 回避のため <circle stroke=色> にフォールバック。
    'function mkDonut(cats,total,pct){',
    '  var OUR=76,INN=48,CX=90,CY=90;',
    '  var wrap=document.createElement("div");wrap.className="donut-wrap";wrap.id="donut-wrap";',
    '  var svg=svgE("svg");sa(svg,"viewBox","0 0 180 180");sa(svg,"class","donut-svg");sa(svg,"role","img");sa(svg,"aria-label","達成率 "+String(pct||0)+"パーセント");',
    '  var bg=svgE("circle");sa(bg,"cx","90");sa(bg,"cy","90");sa(bg,"r","62");',
    '  sa(bg,"fill","none");sa(bg,"stroke","#E2E8F0");sa(bg,"stroke-width","28");svg.appendChild(bg);',
    '  function pt(r,deg){var rad=(deg-90)*Math.PI/180;return[CX+r*Math.cos(rad),CY+r*Math.sin(rad)];}',
    '  function arcPath(a0,a1){var po=pt(OUR,a0),qo=pt(OUR,a1),pi=pt(INN,a0),qi=pt(INN,a1);',
    '    var lg=(((a1-a0)%360)+360)%360>180?1:0;',
    '    var d="M "+po[0]+" "+po[1]+" A "+OUR+" "+OUR+" 0 "+lg+" 1 "+qo[0]+" "+qo[1];',
    '    d+=" L "+qi[0]+" "+qi[1]+" A "+INN+" "+INN+" 0 "+lg+" 0 "+pi[0]+" "+pi[1]+" Z";',
    '    return d;}',
    '  var segs=[];if(total>0&&cats&&cats.length){for(var i=0;i<cats.length;i++){if((cats[i].done||0)>0)segs.push(cats[i]);}}',
    '  if(segs.length>0){',
    '    var cum=0,usedDeg=0,n=segs.length,GAP=n>1?1.5:0;',
    '    var td0=0;for(var k=0;k<n;k++)td0+=(segs[k].done||0);',
    '    var totalDeg=total>0?(td0/total)*360:0;',
    '    for(var i=0;i<n;i++){var cat=segs[i];',
    '      var sh=cat.done/total;',
    '      var deg=(i===n-1)?Math.max(0,totalDeg-usedDeg):sh*360;',
    '      usedDeg+=deg;',
    '      var a0=cum+GAP/2,a1=cum+deg-GAP/2,el;',
    '      if(deg>=359.999){',
    '        el=svgE("circle");sa(el,"cx","90");sa(el,"cy","90");sa(el,"r","62");',
    '        sa(el,"fill","none");sa(el,"stroke",sc(cat.color));sa(el,"stroke-width","28");',
    '      }else if(a1>a0){el=svgE("path");sa(el,"d",arcPath(a0,a1));sa(el,"fill",sc(cat.color));}',
    '      if(el)svg.appendChild(el);cum+=deg;}',
    '  }',
    '  var t=svgE("text");sa(t,"x","90");sa(t,"y","90");sa(t,"class","dpct");t.textContent=String(pct||0)+"%";',
    '  svg.appendChild(t);wrap.appendChild(svg);return wrap;',
    '}',
    // Category bar row builder
    'function mkCatBar(cat){',
    '  var row=document.createElement("div");row.className="crow";',
    '  var nr=document.createElement("div");nr.className="cnr";',
    '  var dot=document.createElement("span");dot.className="cdot";dot.style.background=sc(cat.color);',
    '  nr.appendChild(dot);nr.appendChild(h("span",cat.display_name||cat.category_id));',
    '  nr.appendChild(h("span",cat.done+"/"+cat.total,"cfrac"));row.appendChild(nr);',
    '  if(cat.total>0){var bar=document.createElement("div");bar.className="cbar";',
    '    function seg(v,cls,col){if(!(v>0))return;var s=document.createElement("div");s.className=cls;s.style.width=v.toFixed(1)+"%";if(col)s.style.background=sc(col);bar.appendChild(s);}',
    '    seg(cat.done/cat.total*100,"bd",cat.color);seg(cat.not_done/cat.total*100,"bn",null);',
    '    row.appendChild(bar);}',
    '  return row;',
    '}',
    // showToast
    'function showToast(msg){var t=document.getElementById("toast");if(!t)return;t.textContent=msg;t.className="toast show";setTimeout(function(){t.className="toast";},2500);}',
    // applyTaskStyle: li のクラスとボタンのアクティブ状態を同期
    // isExpl=true のとき: done→緑 / not_done→赤。false（未記録）のとき: ニュートラルグレー
    'function applyTaskStyle(li,st,isExpl){',
    '  li.className="ti "+(st==="done"?"td":(isExpl?"tn":"tu"));',
    '  var btns=li.querySelectorAll(".tbtn");',
    '  for(var i=0;i<btns.length;i++){',
    '    var s=btns[i].dataset.status;',
    '    var act=(s==="done"&&st==="done")||(s==="not_done"&&st==="not_done"&&isExpl);',
    '    btns[i].className="tbtn"+(act?" "+(s==="done"?"a-done":"a-nd"):"");',
    '  }',
    '}',
    // mkStatusBtn: closure-in-loop を避けるため独立関数
    'function mkStatusBtn(s,taskId,li){',
    '  var btn=document.createElement("button");btn.className="tbtn";btn.dataset.status=s;',
    '  btn.textContent=s==="done"?"◯":"✕";',
    '  btn.addEventListener("click",function(){onTaskToggle(taskId,s,li);});',
    '  return btn;',
    '}',
    // mkTaskRow: ◯/✕ ボタン付きタスク行を生成
    // is_explicit=false（初期化直後）はニュートラル表示。タップ後に explicit=true に移行。
    'function mkTaskRow(t){',
    '  var li=document.createElement("li");',
    '  var expl=!!t.is_explicit;',
    '  li.dataset.taskId=t.task_id;li.dataset.status=t.status||"not_done";li.dataset.explicit=expl?"1":"0";',
    '  var lbl=document.createElement("span");lbl.className="tlbl";lbl.textContent=t.label;',
    '  li.appendChild(lbl);',
    '  li.appendChild(mkStatusBtn("done",t.task_id,li));',
    '  li.appendChild(mkStatusBtn("not_done",t.task_id,li));',
    '  applyTaskStyle(li,t.status||"not_done",expl);',
    '  return li;',
    '}',
    // onTaskToggle: 楽観的更新 → GAS RPC → 失敗時ロールバック
    // 同じ状態 かつ 既に explicit の場合のみスキップ（未記録→同値でも明示的設定として送信）
    'function onTaskToggle(taskId,newStatus,li){',
    '  var prevStatus=li.dataset.status;',
    '  var prevExpl=li.dataset.explicit==="1";',
    '  if(prevStatus===newStatus&&prevExpl)return;',
    '  var btns=li.querySelectorAll(".tbtn");',
    '  for(var i=0;i<btns.length;i++)btns[i].disabled=true;',
    '  li.dataset.status=newStatus;li.dataset.explicit="1";applyTaskStyle(li,newStatus,true);',
    '  google.script.run',
    '    .withSuccessHandler(function(res){',
    '      for(var i=0;i<btns.length;i++)btns[i].disabled=false;',
    '      if(!res||!res.ok){li.dataset.status=prevStatus;li.dataset.explicit=prevExpl?"1":"0";applyTaskStyle(li,prevStatus,prevExpl);showToast("更新に失敗しました");return;}',
    '      updateSummary(res);',
    '    })',
    '    .withFailureHandler(function(){',
    '      for(var i=0;i<btns.length;i++)btns[i].disabled=false;',
    '      li.dataset.status=prevStatus;li.dataset.explicit=prevExpl?"1":"0";applyTaskStyle(li,prevStatus,prevExpl);showToast("通信エラーが発生しました");',
    '    })',
    '    .updateTaskStatus(date,token,taskId,newStatus);',
    '}',
    // updateSummary: タスクトグル後にドーナツ・達成率・カテゴリを差分更新
    'function updateSummary(data){',
    '  var c=data.counts||{};',
    '  var moodEl=document.getElementById("mood-lbl");if(moodEl)moodEl.textContent=data.mood_message||"";',
    '  var clblEl=document.getElementById("clbl");',
    '  if(clblEl)clblEl.textContent="達成 "+(c.done||0)+" / 全体 "+(c.total||0)+"、未 "+(c.not_done||0);',
    '  var oldD=document.getElementById("donut-wrap");',
    '  if(oldD){var newD=mkDonut(data.categories||[],c.total||0,data.achievement_percent);oldD.parentNode.replaceChild(newD,oldD);}',
    '  var catSec=document.getElementById("catsec");',
    '  if(catSec&&data.categories){while(catSec.firstChild)catSec.removeChild(catSec.firstChild);catSec.appendChild(h("h2","カテゴリ別"));for(var ci=0;ci<data.categories.length;ci++)catSec.appendChild(mkCatBar(data.categories[ci]));}',
    '}',
    // Main paint
    'function paint(data){',
    '  if(!data||data.ok===false){stEl.textContent="エラー: "+(data&&data.error?data.error:"unknown")+(data&&data.date?" ("+data.date+")":"");return;}',
    '  stEl.textContent="";while(root.firstChild)root.removeChild(root.firstChild);',
    '  var frag=document.createDocumentFragment();',
    // Top: date + mood（mood に id を付けて updateSummary から差分更新できるようにする）
    '  var top=document.createElement("div");top.className="top";',
    '  top.appendChild(h("p",data.date||"","dlbl"));',
    '  var moodP=h("p",data.mood_message||"","mlbl");moodP.id="mood-lbl";top.appendChild(moodP);',
    '  frag.appendChild(top);',
    // Donut（mkDonut 内で id="donut-wrap" を付与済み）
    '  var cats=data.categories||[],c=data.counts||{};',
    '  frag.appendChild(mkDonut(cats,c.total||0,data.achievement_percent));',
    '  var clblP=h("p","達成 "+(c.done||0)+" / 全体 "+(c.total||0)+"、未 "+(c.not_done||0),"clbl");clblP.id="clbl";frag.appendChild(clblP);',
    // Category bars（id="catsec" を付与して updateSummary から差分更新）
    '  if(cats.length>0){var cs=document.createElement("div");cs.className="catsec";cs.id="catsec";cs.appendChild(h("h2","カテゴリ別"));',
    '    for(var ci=0;ci<cats.length;ci++)cs.appendChild(mkCatBar(cats[ci]));frag.appendChild(cs);}',
    // Tasks（◯/✕ ボタン付き）
    '  var ts=document.createElement("div");ts.className="tasksec";ts.appendChild(h("h2","タスク"));',
    '  var ul=document.createElement("ul"),tasks=data.tasks||[];',
    '  for(var ti=0;ti<tasks.length;ti++)ul.appendChild(mkTaskRow(tasks[ti]));',
    '  ts.appendChild(ul);frag.appendChild(ts);',
    // Section 2 — avatar image + bubble layout
    '  var s2=data.section2||{};var sec=document.createElement("div");sec.className="sec2";',
    '  sec.appendChild(h("h2","今日の一言"));',
    '  sec.appendChild(h("p","「"+(s2.quote||"")+"」","qt"));',
    '  if(s2.quote_attribution)sec.appendChild(h("p",s2.quote_attribution,"qa"));',
    '  var qm0=(s2.quote_meaning||"").trim();',
    '  if(qm0){sec.appendChild(h("p","意味","qm-h"));sec.appendChild(h("p",qm0,"qm"));}',
    // mkChar: name, text, imgFile, isRight
    '  function mkChar(name,text,imgFile,isRight){',
    '    var row=document.createElement("div");row.className="ch"+(isRight?" r":"");',
    '    var avEl=document.createElement("div");avEl.className="av";',
    // アバター画像が取得できない場合、名前の頭文字入りカラー円でフォールバック
    '    var fbColor=isRight?"#F59E0B":"#475569";',
    '    if(AV&&imgFile){',
    '      var img=document.createElement("img");',
    '      img.style.cssText="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;";',
    '      img.src=AV+"/"+imgFile;img.alt=name;',
    '      img.onerror=function(){',
    '        this.style.display="none";',
    '        var fb=document.createElement("div");',
    '        fb.style.cssText="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;background:"+fbColor+";border-radius:50%;";',
    '        fb.textContent=name.charAt(0);',
    '        avEl.appendChild(fb);',
    '      };',
    '      avEl.appendChild(img);',
    '    }else{',
    '      var fb2=document.createElement("div");',
    '      fb2.style.cssText="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;background:"+fbColor+";border-radius:50%;";',
    '      fb2.textContent=name.charAt(0);avEl.appendChild(fb2);',
    '    }',
    '    row.appendChild(avEl);',
    '    var bub=document.createElement("div");bub.className="bubble";',
    '    var cn=document.createElement("p");cn.className="cn";cn.textContent=name;',
    '    var tx=document.createElement("p");tx.style.margin="0";tx.textContent=text;',
    '    bub.appendChild(cn);bub.appendChild(tx);row.appendChild(bub);return row;',
    '  }',
    '  sec.appendChild(mkChar("イチさん",s2.ichisan||"",s2.ichisan_image||"",false));',
    '  sec.appendChild(mkChar("ヒロ子",s2.hiroko||"",s2.hiroko_image||"",true));',
    '  frag.appendChild(sec);root.appendChild(frag);',
    '}',
    // 埋め込みデータがあれば即描画（キャッシュ or doGet ビルド済み）、なければ RPC でフォールバック
    'if(__D__&&__D__.ok===true){stEl.textContent="";paint(__D__);}',
    'else{google.script.run.withSuccessHandler(paint).withFailureHandler(function(err){stEl.textContent="取得に失敗しました: "+(err&&err.message?err.message:String(err));}).getDashboardJsonForClient(date,token);}',
    '})();',
  ].join('\n');

  var html =
    '<!DOCTYPE html><html><head>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<meta charset="UTF-8"><title>やったかい</title>' +
    '<style>' + css + '</style>' +
    '</head><body>' +
    '<p id="st"></p>' +
    '<div id="app"></div>' +
    '<div class="toast" id="toast"></div>' +
    // エラー・案内メッセージのみ表示。JSON リンクは内部実装情報のためエンドユーザーに非表示（§1.3.1）
    (escapedHint ? '<div class="footer"><span>' + escapedHint + '</span></div>' : '') +
    '<script>' + js + '<\/script>' +
    '</body></html>';

  return liffHtmlOutput_(html);
}

function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * LINE 用に meaning の先頭を短く切り出す（§6.2: 全文は LIFF の quote_meaning に任せる）。
 * 改行は最初の行のみ。長すぎる場合は読点・句点で手前を優先し、末尾に …。
 * @param {string} meaning
 * @param {number} maxLen 目安文字数（全角含む）
 * @returns {string}
 */
function meaningSnippetForLine_(meaning, maxLen) {
  var lim = maxLen > 8 ? maxLen : 72;
  var s = String(meaning || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!s) return '';
  var line = String(s.split('\n')[0] || '').trim();
  if (!line) return '';
  if (line.length <= lim) return line;
  var cut = line.slice(0, lim - 1);
  var punct = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('、'));
  if (punct >= Math.floor(lim * 0.45)) {
    cut = cut.slice(0, punct + 1);
  }
  cut = cut.replace(/[、，\s]+$/, '');
  return cut + '…';
}

/**
 * ■2 セリフに運用語・不自然な連語が紛れ込んだ場合に true（Gemini 失敗扱いでテンプレへ）。
 * 禁止語は SECTION2_JP_RULES_ と整合させること。
 */
function section2JpStyleViolates_(ichisan, hiroko) {
  var t = String(ichisan || '') + '\n' + String(hiroko || '');
  var banned = [
    '意味欄',
    '腹を合わせ',
    'リンクして',
    'ダッシュボード',
    'quote_meaning',
    'Quotes の',
    'DTO',
    'LIFF',
  ];
  for (var i = 0; i < banned.length; i++) {
    if (t.indexOf(banned[i]) >= 0) return true;
  }
  return false;
}

/**
 * Quotes シートから指定日に対応する 1 件分の名言バンドルを返す（決定論的）。
 * meaning はシート列が正本。LIFF では dto.quote_meaning にそのまま載せる。
 * @param {GoogleAppsScript.Spreadsheet.Sheet|null} quotesSheet
 * @param {string} todayStr yyyy-MM-dd
 * @returns {{ text: string, attribution: string, meaning: string }}
 */
function pickQuoteBundleForDate_(quotesSheet, todayStr) {
  var quotes = quotesSheet ? loadActiveQuotes_(quotesSheet) : [];
  if (quotes.length > 0) {
    var idx = dayHash_(todayStr) % quotes.length;
    var q = quotes[idx];
    return {
      text: q.text,
      attribution: q.attribution || '',
      meaning: typeof q.meaning === 'string' ? q.meaning.trim() : String(q.meaning || '').trim(),
    };
  }
  return {
    text: finalFallbackQuoteText_(),
    attribution: '',
    meaning: '',
  };
}

/**
 * §6.1 / §6.2: ■2 生成のオーケストレーター（Gemini 優先 → 失敗時テンプレフォールバック）。
 * pickQuoteBundleForDate_ で Quotes から 1 件選び、meaning を Gemini・テンプレ・DTO に共通供給する。
 * 個人タスク全文はプロンプトに載せない（SPEC §6.1 方針）。
 * 戻り値: { dto, textBlock }
 */
function buildSection2_(ss, todayStr, achievementPercent, moodMessage) {
  var quotesSheet = ss.getSheetByName('Quotes');
  var bundle = pickQuoteBundleForDate_(quotesSheet, todayStr);
  var quoteText = bundle.text;
  var attribution = bundle.attribution;
  var meaningSheet = bundle.meaning;

  // §6.1: Gemini 試行（シートの meaning はプロンプトに渡し、DTO の quote_meaning は常にシート由来）
  var geminiResult = callGeminiSection2_(achievementPercent, moodMessage, quoteText, attribution, meaningSheet);
  if (geminiResult.ok) {
    Logger.log('[section2] Gemini 成功');
    geminiResult.dto.quote_meaning = meaningSheet;
    return buildSection2DtoAndBlock_(geminiResult.dto, '（Gemini）');
  }

  // §6.2: テンプレフォールバック（LINE 本文に meaning 全文は載せず、LIFF の quote_meaning で表示）
  Logger.log('[section2] Gemini 失敗 → テンプレ経路 reason=' + (geminiResult.error || 'unknown'));
  var avatars = pickAvatarsByPercent_(achievementPercent);
  var meaningSnippet = meaningSnippetForLine_(meaningSheet, 72);
  var vars = {
    quote: quoteText,
    achievement_percent: String(achievementPercent),
    mood_message: moodMessage,
    attribution: attribution,
    meaning: meaningSheet,
    meaning_snippet: meaningSnippet,
  };
  var ichisanTpl;
  var hirokoTpl;
  // 解説が登録されていても先頭行が空なら「解説なし」と同じテンプレに寄せる（quote_meaning はシート正本のまま）
  if (meaningSheet && meaningSnippet) {
    ichisanTpl =
      '「{{quote}}」、ワシの読みでは「{{meaning_snippet}}」が本丸じゃ。今日の合言葉は「{{mood_message}}」。その気持ちとも筋が通っておる。小さく一歩、進むんじゃよ、ヒロ子ちゃん。';
    hirokoTpl =
      '説明まで読んでマジ腑に落ちた！今日の「{{mood_message}}」とも空気合うじゃん。よし、あたし動くわ！';
  } else {
    ichisanTpl = '「{{quote}}」という言葉を胸に刻んでおくんじゃ、ヒロ子ちゃん。ワシも共に見守っておるぞ。';
    hirokoTpl = '「{{quote}}」か〜、マジ刺さるじゃん！今日まだ時間あるし、あたし動くっしょ！';
  }
  var ichisanText = substituteTemplate_(ichisanTpl, vars);
  var hirokoText = substituteTemplate_(hirokoTpl, vars);
  // 補間後バリデーション（§6.2.1）: 未置換プレースホルダー・空文字は即フォールバック
  try {
    assertInterpolated_(ichisanText, 'ichisan');
    assertInterpolated_(hirokoText, 'hiroko');
  } catch (interpErr) {
    Logger.log('[section2] テンプレ補間エラー: ' + interpErr.message);
    ichisanText = 'ワシの言葉を借りるならば、一歩踏み出すことが全ての始まりじゃ。';
    hirokoText = 'あたし今日まだ諦めてないっしょ！やれることからやってくっ！';
  }
  var dto = {
    quote: quoteText,
    quote_attribution: attribution,
    quote_meaning: meaningSheet,
    ichisan: ichisanText,
    hiroko: hirokoText,
    ichisan_image: avatars.ichisan_image,
    hiroko_image: avatars.hiroko_image,
  };
  return buildSection2DtoAndBlock_(dto, '（テンプレ）');
}

/**
 * dto から LINE 用テキストブロックを組み立てるヘルパー。
 * quote_meaning の全文は LIFF のみ（LINE はセリフ中心で長文化を避ける）。
 */
function buildSection2DtoAndBlock_(dto, sourceLbl) {
  // 経路ラベル（テンプレ/Gemini）はログのみ。LINE 本文には出さない（§1.3.1）
  Logger.log('[section2] route=' + (sourceLbl || ''));
  var lines = [];
  lines.push('【今日の一言】');
  lines.push('「' + dto.quote + '」');
  if (dto.quote_attribution) lines.push('（出典: ' + dto.quote_attribution + '）');
  lines.push('');
  lines.push('イチ: ' + dto.ichisan);
  lines.push('ヒロ子: ' + dto.hiroko);
  return { dto: dto, textBlock: lines.join('\n') };
}

/**
 * キャラクター口調ルール（金型）— ここだけ直せばプロンプト全体に反映される。
 * character-voice.md の必須ルールを凝縮したもの。
 */
var CHAR_VOICE_RULES_ = [
  '【イチさん（チャートマスター）口調ルール】',
  '・一人称: ワシ（俺/僕/私は禁止）',
  '・ヒロ子の呼び方: ヒロ子ちゃん または お主',
  '・語尾: 〜じゃ / 〜じゃな / 〜じゃろう / 〜のじゃ / 〜しておくんじゃ',
  '・禁止: です/ます/してください などの丁寧語。「〜でございます」も禁止',
  '・語りの質: 短文に重みを持たせる。饒舌にしない',
  '・良い例: 「まずは防衛ラインを決めておくんじゃ」「焦りは相場の敵じゃ」',
  '',
  '【ヒロ子口調ルール】',
  '・一人称: あたし（うちはたまに）',
  '・語尾: 〜じゃん / 〜だよね / 〜っしょ / マジ？ / 〜かも',
  '・態度: 率直に驚く・共感する。固すぎる敬語は禁止',
  '・良い例: 「えっ！？なんでこうなるの？」「マジそれなー！」',
].join('\n');

/**
 * ■2 の日本語品質ルール（Gemini プロンプトとテンプレ文面の両方の基準）。
 * UI・運用内部語をセリフに出さず、比喩は聞き手が追える言い回しに落とす。
 */
var SECTION2_JP_RULES_ = [
  '【■2 文章品質（イチ・ヒロ子のセリフ共通・必須）】',
  '・運用・画面の内部名を口に出さない（禁止例: 意味欄、リンク、ダッシュボード、Quotes、シート、DTO、LIFF、quote_meaning）',
  '・「腹を合わせて」のようなあいまいな連語は使わない（足並みを揃える・同じ方向を向く、など具体語へ）',
  '・目的語のない「積む」は使わない（「経験を積む」のように目的語を添えるか、「一歩ずつ進む」「一歩踏み出す」に言い換える）',
  '・「意味欄の芯」など、見えない内部構造を指す比喩は禁止。言葉の趣旨・肝・読み、と聞き手の体験に寄せる',
  '・登録済みの解説があるときはその趣旨に沿う。解説全文は別画面でも見えるため、セリフで全文を繰り返さず要点に触れる',
].join('\n');

/**
 * §6.1: Gemini API で ■2 を生成。
 * 失敗時（キー未設定 / タイムアウト / HTTP エラー / JSON 不正 / 必須キー欠落）は
 * { ok: false, error } を返し、呼び出し元（buildSection2_）がテンプレに切り替える。
 *
 * スクリプトプロパティ: GEMINI_API_KEY（未設定なら即テンプレフォールバック）
 * プロンプトに個人タスク名・プライベート情報は含めない。
 * quoteMeaning は Quotes シートの meaning 列（運用者が登録した固定文）。矛盾する解釈は禁止。
 */
function callGeminiSection2_(achievementPercent, moodMessage, quoteText, attribution, quoteMeaning) {
  var apiKey = (PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '').trim();
  if (!apiKey) return { ok: false, error: 'api_key_not_set' };

  var quoteRef = '「' + quoteText + '」' + (attribution ? '（' + attribution + '）' : '');
  var meaningTrim = String(quoteMeaning || '').trim();
  var meaningBlock = meaningTrim
    ? '  運用で登録した名言の解説（正本。これと矛盾する言い換えは禁止。セリフに全文を丸写ししない）:\n  ' +
        meaningTrim.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').join('\n  ')
    : '  （解説文は未登録。参考名言の一般的な理解の範囲で述べよ）';

  var prompt = [
    'あなたはキャラクター対話の生成AIです。以下の口調ルールと文章品質ルールを厳守してセリフを書いてください。',
    'いずれかに違反したセリフは絶対に出力しないでください。',
    '',
    CHAR_VOICE_RULES_,
    '',
    SECTION2_JP_RULES_,
    '',
    '▼ イチさんの口調 NG 例（絶対に使わない）:',
    '  NG: 「焦らず、まずは一歩踏み出すことが大切だよ」→ 「だよ」禁止',
    '  NG: 「まずは一歩を踏み出しましょう」→ 丁寧語禁止',
    '  NG: 「今日はここまでにしよう」→ 一人称「ワシ」なし・語尾不正',
    '  OK: 「焦りは禁物じゃ。まず一歩、踏み出すんじゃよ、ヒロ子ちゃん」',
    '  OK: 「ワシの経験上、こういうときこそ守りを固めるんじゃ」',
    '',
    '▼ 日本語の NG 例（■2 品質・絶対に使わない）:',
    '  NG: 「意味欄に書いてある芯を、ワシの口で言うなら」→ 内部構造の比喩禁止',
    '  NG: 「今日のメッセージとも腹を合わせて、一歩ずつ積む」→ あいまいな連語・目的語のない「積む」禁止',
    '  NG: 「リンクしてるっしょ」「Quotes の」→ 運用・UI 用語禁止',
    '  OK: 「ワシの読みでは、この言葉の趣旨は〜じゃ。今日のメッセージの気持ちとも筋が通っておる」',
    '',
    '今日の状況（これだけを使うこと・個人情報は含まない）:',
    '  達成率: ' + achievementPercent + '%',
    '  今日のメッセージ: 「' + moodMessage + '」',
    '  参考名言: ' + quoteRef,
    '',
    meaningBlock,
    '',
    'ルール:',
    '  - 各セリフは 1〜2 文（短め・簡潔に）',
    '  - 個人のタスク名・プライベート情報は出力しない',
    '  - イチさんは必ず「ワシ」を使い、語尾は必ず「〜じゃ／〜じゃな／〜のじゃ」で終わること',
    '  - 解説文が登録されているとき: その趣旨と矛盾しないこと。要点に触れるに留め、登録文の全文を繰り返さないこと（利用者は別画面で全文を読める）',
    '  - 解説文が未登録のとき: 参考名言の一般的な理解の範囲で述べること',
    '  - 今日のメッセージ「' + moodMessage + '」の気持ちと名言の趣旨を、自然な日本語でつなぐ（無理な比喩は使わない）',
    '',
    '必ず次の JSON のみ返してください（コードブロック・前後の説明文は不要）:',
    '{"quote":"参考にした名言の原文","ichisan":"（必ず ワシ + 〜じゃ語尾）","hiroko":"（必ず あたし + ギャル語）"}',
  ].join('\n');

  var url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' +
    apiKey;
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.45,
        maxOutputTokens: 2048,
      },
    }),
    muteHttpExceptions: true,
  };

  var res;
  try {
    res = UrlFetchApp.fetch(url, options);
  } catch (e) {
    return { ok: false, error: 'fetch_failed' };
  }

  var code = res.getResponseCode();
  if (code !== 200) return { ok: false, error: 'http_' + code };

  var raw;
  try {
    raw = JSON.parse(res.getContentText());
  } catch (e) {
    return { ok: false, error: 'response_parse_failed' };
  }

  var text = '';
  try {
    // 思考モデルは複数 part を返すことがある。末尾 part に本文が来るため最後を取る
    var parts = raw.candidates[0].content.parts;
    text = parts[parts.length - 1].text;
  } catch (e) {
    return { ok: false, error: 'unexpected_shape' };
  }

  // コードブロック除去
  text = text.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();

  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // 直接 parse できない場合は JSON オブジェクト部分だけ抽出して再試行
    var m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, error: 'json_parse_failed' };
    try {
      parsed = JSON.parse(m[0]);
    } catch (e2) {
      return { ok: false, error: 'json_parse_failed' };
    }
  }

  if (!parsed || typeof parsed.ichisan !== 'string' || typeof parsed.hiroko !== 'string') {
    return { ok: false, error: 'missing_required_keys' };
  }

  var ichTrim = parsed.ichisan.trim();
  var hiroTrim = parsed.hiroko.trim();
  if (!ichTrim || !hiroTrim) {
    return { ok: false, error: 'empty_dialogue' };
  }
  if (section2JpStyleViolates_(ichTrim, hiroTrim)) {
    Logger.log('[section2] Gemini セリフが品質ルール違反 → テンプレへ');
    return { ok: false, error: 'jp_style_violation' };
  }

  // 表情ファイル名は GAS 側のテーブルで決定（Gemini に判断させない・SPEC §6.1）
  var avatars = pickAvatarsByPercent_(achievementPercent);
  return {
    ok: true,
    dto: {
      quote:
        typeof parsed.quote === 'string' && parsed.quote.trim()
          ? parsed.quote.trim()
          : quoteText,
      quote_attribution: attribution,
      ichisan: ichTrim,
      hiroko: hiroTrim,
      ichisan_image: avatars.ichisan_image,
      hiroko_image: avatars.hiroko_image,
    },
  };
}

/** §4.4 Quotes: 必須列を検査し active=TRUE・text 非空のみ。meaning 列があれば読む（LIFF の quote_meaning 用）。 */
function loadActiveQuotes_(quotesSheet) {
  var rows = quotesSheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  var h = rows[0];
  var ixText = h.indexOf('text');
  var ixActive = h.indexOf('active');
  var ixOrder = h.indexOf('sort_order');
  if (ixText < 0) return [];

  var list = [];
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    var text = String(row[ixText] || '').trim();
    if (!text) continue;
    if (ixActive >= 0) {
      var a = row[ixActive];
      if (a === false || String(a).toUpperCase() === 'FALSE') continue;
    }
    var ord = ixOrder >= 0 ? Number(row[ixOrder]) : r;
    if (isNaN(ord)) ord = r;
    var ixMeaning = h.indexOf('meaning');
    list.push({
      text: text,
      attribution: h.indexOf('attribution') >= 0 ? String(row[h.indexOf('attribution')] || '').trim() : '',
      meaning: ixMeaning >= 0 ? String(row[ixMeaning] || '').trim() : '',
      sort_order: ord,
    });
  }
  list.sort(function (x, y) {
    return x.sort_order - y.sort_order;
  });
  return list;
}

/** 日付文字列の簡易ハッシュ（決定選択用） */
function dayHash_(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function substituteTemplate_(tpl, vars) {
  var out = tpl;
  out = out.split('{{quote}}').join(vars.quote);
  out = out.split('{{achievement_percent}}').join(vars.achievement_percent);
  out = out.split('{{mood_message}}').join(vars.mood_message);
  out = out.split('{{attribution}}').join(vars.attribution);
  out = out.split('{{meaning}}').join(vars.meaning != null && vars.meaning !== undefined ? vars.meaning : '');
  out = out
    .split('{{meaning_snippet}}')
    .join(vars.meaning_snippet != null && vars.meaning_snippet !== undefined ? vars.meaning_snippet : '');
  return out;
}

/**
 * 補間後テキストの検証（§6.2.1）。
 * 未置換の {{…}} が残っているか、空文字の場合に例外を投げる。
 */
function assertInterpolated_(text, name) {
  if (/\{\{[^}]+\}\}/.test(text)) {
    throw new Error('未置換プレースホルダーが残っています: ' + name);
  }
  if (!text || text.trim().length === 0) {
    throw new Error('補間後テキストが空です: ' + name);
  }
}

/** §5.5.1 達成率 → 表情ファイル名（GAS 側で決定） */
function pickAvatarsByPercent_(percent) {
  if (percent >= 100) {
    return { ichisan_image: 'ichisan-happy.png', hiroko_image: 'hiroko-happy.png' };
  }
  if (percent >= 80) {
    return { ichisan_image: 'ichisan-happy.png', hiroko_image: 'hiroko-bashful.png' };
  }
  if (percent >= 60) {
    return { ichisan_image: 'ichisan-normal.png', hiroko_image: 'hiroko-normal.png' };
  }
  if (percent >= 50) {
    return { ichisan_image: 'ichisan-serious.png', hiroko_image: 'hiroko-normal.png' };
  }
  if (percent >= 30) {
    return { ichisan_image: 'ichisan-serious.png', hiroko_image: 'hiroko-remorse.png' };
  }
  if (percent >= 10) {
    return { ichisan_image: 'ichisan-sad.png', hiroko_image: 'hiroko-confused.png' };
  }
  return { ichisan_image: 'ichisan-sad.png', hiroko_image: 'hiroko-sad.png' };
}

/** §1.3 #11 最終フォールバック（Quotes が空のとき） */
function finalFallbackQuoteText_() {
  return '本日の名言を表示できない。それでも一歩は踏み出せる。';
}

function moodMessage_(percent) {
  if (percent >= 100) return '完璧！';
  if (percent >= 80) return 'いいね！';
  if (percent >= 60) return 'あとちょっと';
  if (percent >= 50) return '半分クリア！';
  if (percent >= 30) return 'ここからここから';
  if (percent >= 10) return 'まだまだこれから！';
  return 'まずははじめの一歩';
}

function normalizeStatus_(cell) {
  if (cell === null || cell === undefined) return 'not_done';
  var s = String(cell).trim();
  if (s === '') return 'not_done';
  if (s === '◯' || s === '○' || s === '〇' || s === '✓' || s === '✔') return 'done';
  if (s === '×' || s === '✕' || s === 'x' || s === 'X') return 'not_done';
  return 'not_done'; // 不明な値も not_done として扱う
}

function statusMark_(st) {
  if (st === 'done') return '◯';
  if (st === 'not_done') return '×';
  return '（未記入）';
}

function formatDateCell_(v, tz) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  var s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return s;
}

/** buildTaskLabelMapFromRows_ の薄いラッパー（setupMasterSheets など行配列を持たない呼び出し元向け） */
function buildTaskLabelMap_(tasksSheet) {
  return buildTaskLabelMapFromRows_(tasksSheet.getDataRange().getValues());
}

// ─────────────────────────────────────────────────────────────
// セットアップ（初回 or 修復時にエディタから 1 回実行）
// ─────────────────────────────────────────────────────────────

/**
 * マスタシートの初期化・補完。GAS エディタから 1 回だけ手動実行する。
 *
 * 1. Categories シートを作成・upsert（task_id の color が正しく設定されていないとドーナツが全グレーになる）
 * 2. Tasks シートに seed/tasks.csv 由来の全タスクを upsert（既存行は上書き、新規行は追加）
 * 3. 当日分の Daily 行を補完（Tasks にあって Daily にない task_id を追加）
 *
 * 冪等なので何度実行しても安全。既存のユーザーデータ（status 列）は書き換えない。
 */
function setupMasterSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = TZ_;
  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  setupCategories_(ss);
  setupTasks_(ss);
  ensureDailyRowsForToday_(ss, todayStr, tz);

  Logger.log('[setupMasterSheets] 完了（date=' + todayStr + '）。GAS ログで結果を確認してください。');
  ss.toast('セットアップ完了', 'やったかい', 5);
}

/**
 * Categories シートを作成・upsert する。
 * マスタ行は seed/categories.csv から生成した CATEGORIES_MASTER_（npm run sync:seed-gas）。
 * @private
 */
function setupCategories_(ss) {
  var CATS = CATEGORIES_MASTER_;

  var sheet = ss.getSheetByName('Categories');
  if (!sheet) {
    sheet = ss.insertSheet('Categories');
    sheet.getRange(1, 1, CATS.length, CATS[0].length).setValues(CATS);
    Logger.log('[setupCategories_] Categories シートを新規作成しました。');
    return;
  }

  var existing = sheet.getDataRange().getValues();
  if (existing.length < 1) {
    sheet.getRange(1, 1, CATS.length, CATS[0].length).setValues(CATS);
    Logger.log('[setupCategories_] Categories を書き込みしました（空だったため）。');
    return;
  }

  var header = existing[0];
  var idCol = header.indexOf('category_id');
  if (idCol < 0) {
    sheet.clearContents();
    sheet.getRange(1, 1, CATS.length, CATS[0].length).setValues(CATS);
    Logger.log('[setupCategories_] Categories のヘッダが不正だったため再書き込みしました。');
    return;
  }

  var hdrMap = {};
  for (var h = 0; h < header.length; h++) hdrMap[header[h]] = h;

  var existingIds = {};
  for (var r = 1; r < existing.length; r++) {
    var id = String(existing[r][idCol] || '').trim();
    if (id) existingIds[id] = r + 1;
  }

  var dataRows = CATS.slice(1);
  var dataHeader = CATS[0];
  for (var i = 0; i < dataRows.length; i++) {
    var catRow = dataRows[i];
    var catId = String(catRow[0]);
    var rowNum = existingIds[catId];
    if (rowNum) {
      for (var c = 0; c < dataHeader.length; c++) {
        var col = hdrMap[dataHeader[c]];
        if (col !== undefined) sheet.getRange(rowNum, col + 1).setValue(catRow[c]);
      }
      Logger.log('[setupCategories_] 更新: ' + catId);
    } else {
      var newRow = new Array(header.length).fill('');
      for (var c2 = 0; c2 < dataHeader.length; c2++) {
        var col2 = hdrMap[dataHeader[c2]];
        if (col2 !== undefined) newRow[col2] = catRow[c2];
      }
      sheet.appendRow(newRow);
      Logger.log('[setupCategories_] 追加: ' + catId);
    }
  }
}

/**
 * Tasks シートにマスタ定義の全タスクを upsert する。
 * マスタ行は seed/tasks.csv から生成した TASKS_MASTER_（npm run sync:seed-gas）。
 * task_id が既存なら title / display_short / category_id / active / sort_order を更新。
 * task_id が未存在なら末尾に追加。
 * @private
 */
function setupTasks_(ss) {
  var TASKS = TASKS_MASTER_;

  var sheet = ss.getSheetByName('Tasks');
  if (!sheet) {
    sheet = ss.insertSheet('Tasks');
    sheet.getRange(1, 1, TASKS.length, TASKS[0].length).setValues(TASKS);
    Logger.log('[setupTasks_] Tasks シートを新規作成しました。');
    return;
  }

  var existing = sheet.getDataRange().getValues();
  if (existing.length < 1) {
    sheet.getRange(1, 1, TASKS.length, TASKS[0].length).setValues(TASKS);
    Logger.log('[setupTasks_] Tasks を書き込みしました（空だったため）。');
    return;
  }

  var header = existing[0];
  var idCol = header.indexOf('task_id');
  if (idCol < 0) {
    sheet.clearContents();
    sheet.getRange(1, 1, TASKS.length, TASKS[0].length).setValues(TASKS);
    Logger.log('[setupTasks_] Tasks のヘッダが不正だったため再書き込みしました。');
    return;
  }

  var hdrMap = {};
  for (var h = 0; h < header.length; h++) hdrMap[header[h]] = h;

  var existingIds = {};
  for (var r = 1; r < existing.length; r++) {
    var id = String(existing[r][idCol] || '').trim();
    if (id) existingIds[id] = r + 1;
  }

  var dataRows = TASKS.slice(1);
  var dataHeader = TASKS[0];
  for (var i = 0; i < dataRows.length; i++) {
    var taskRow = dataRows[i];
    var taskId = String(taskRow[0]);
    var rowNum = existingIds[taskId];
    if (rowNum) {
      for (var c = 0; c < dataHeader.length; c++) {
        var colName = dataHeader[c];
        if (colName === 'task_id') continue;
        var col = hdrMap[colName];
        if (col !== undefined) sheet.getRange(rowNum, col + 1).setValue(taskRow[c]);
      }
      Logger.log('[setupTasks_] 更新: ' + taskId);
    } else {
      var newRow = new Array(header.length).fill('');
      for (var c2 = 0; c2 < dataHeader.length; c2++) {
        var col2 = hdrMap[dataHeader[c2]];
        if (col2 !== undefined) newRow[col2] = taskRow[c2];
      }
      sheet.appendRow(newRow);
      Logger.log('[setupTasks_] 追加: ' + taskId);
    }
  }
}

/**
 * 付録 A.2: 古いダッシュトークンと送信済みフラグを削除（§ScriptProperties クリーンアップ）。
 * GAS ScriptProperties はプロパティ数 500件上限があるため、週次トリガ等で定期実行する。
 * エディタから手動で実行するか、installCleanupTrigger を一度実行してトリガを登録する。
 * @param {number} daysToKeep 保持日数（デフォルト 90日）
 */
function cleanupOldDashTokens(daysToKeep) {
  daysToKeep = typeof daysToKeep === 'number' ? daysToKeep : 90;
  var cutoff = Date.now() - daysToKeep * 86400 * 1000;
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var deleted = 0;
  // 管理対象プレフィックス: dashToken / 夕方フラグ / 朝フラグ / 週次トークン / 週次フラグ（付録 A.2）
  var PREFIXES = [DASH_TOKEN_PROP_PREFIX_, 'sent:', 'morning:', WEEK_TOKEN_PROP_PREFIX_, 'sent_week:'];
  for (var key in all) {
    var matchedPrefix = null;
    for (var pi = 0; pi < PREFIXES.length; pi++) {
      if (key.indexOf(PREFIXES[pi]) === 0) { matchedPrefix = PREFIXES[pi]; break; }
    }
    if (!matchedPrefix) continue;
    var dateStr = key.slice(matchedPrefix.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    if (new Date(dateStr).getTime() < cutoff) {
      props.deleteProperty(key);
      deleted++;
    }
  }
  // LIFF 不透明 oid（JSON の exp または iat で期限判定。キー末尾は日付ではないため別ループ）
  var nowMs = Date.now();
  for (var key2 in all) {
    if (key2.indexOf(LIFF_OPAQUE_OPEN_PREFIX_) !== 0) continue;
    var raw2 = props.getProperty(key2);
    var del = false;
    try {
      var o2 = JSON.parse(raw2 || '{}');
      if (!o2 || o2.v !== 1) {
        del = true;
      } else {
        var exp2 = Number(o2.exp);
        if (!isNaN(exp2) && exp2 > 0) {
          if (nowMs > exp2) del = true;
        } else {
          var iat2 = Number(o2.iat);
          if (!isNaN(iat2) && iat2 > 0 && iat2 < cutoff) del = true;
          else if (isNaN(iat2) || iat2 <= 0) del = true;
        }
      }
    } catch (e2) {
      del = true;
    }
    if (del) {
      props.deleteProperty(key2);
      deleted++;
    }
  }
  Logger.log('[cleanupOldDashTokens] 削除件数=' + deleted + ' (daysToKeep=' + daysToKeep + ')');
}

/**
 * cleanupOldDashTokens を週次（毎週月曜 3:00）で実行するトリガを登録する。
 * エディタから 1 回だけ手動実行すること。
 */
function installCleanupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'cleanupOldDashTokens') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('cleanupOldDashTokens')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(3)
    .inTimezone(TZ_)
    .create();
  Logger.log('[installCleanupTrigger] 月曜 3 時（' + TZ_ + '）クリーンアップトリガを登録しました。');
}

// ─────────────────────────────────────────────────────────────
// 週次振り返り機能（§1.4・§3.6・§5.7）
// ─────────────────────────────────────────────────────────────

/**
 * 週次トークンのスクリプトプロパティキーを返す。
 * @private
 */
function weekTokenPropKey_(weekStartJst) {
  return WEEK_TOKEN_PROP_PREFIX_ + weekStartJst;
}

/**
 * 週次ダッシュトークンを冪等に発行。同じ weekStart に 2 回目以降は既存トークンを返す。
 * @private
 */
function issueWeekToken_(weekStartJst) {
  var props = PropertiesService.getScriptProperties();
  var key = weekTokenPropKey_(weekStartJst);
  var existing = props.getProperty(key);
  if (existing) {
    Logger.log('[issueWeekToken_] 既存トークンを返却（' + weekStartJst + '）');
    return existing;
  }
  var token = Utilities.getUuid().replace(/-/g, '');
  props.setProperty(key, token);
  Logger.log('[issueWeekToken_] 新規トークンを発行（' + weekStartJst + '）');
  return token;
}

/**
 * 週次送信済みフラグで 1 週 1 プッシュを保証する（付録 A.3）。
 * キーは 'sent_week:{weekStartJst}'（その週の月曜の JST 日付）。
 * 日次・朝の withLock_ とは別: ScriptLock 下で未送信なら fn を呼び、fn が true（LINE 200 確定）のときだけフラグを立てる。
 * @param {function(): boolean} fn 成功時 true（例: sendWeeklyReviewImpl_）
 * @private
 */
function withWeeklyLock_(weekStartJst, fn) {
  var fullKey = 'sent_week:' + weekStartJst;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(8000);
  } catch (e) {
    Logger.log('[withWeeklyLock_] ロック取得タイムアウト。スキップ（' + fullKey + '）');
    return;
  }
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty(fullKey)) {
      Logger.log('[withWeeklyLock_] 実行済みのためスキップ（' + fullKey + '）');
      return;
    }
    var committed = false;
    try {
      committed = fn() === true;
    } catch (err) {
      Logger.log('[withWeeklyLock_] 実行中に例外: ' + String(err.message || err));
      committed = false;
    }
    if (committed) {
      props.setProperty(fullKey, '1');
      Logger.log('[withWeeklyLock_] 送信成功を確定（' + fullKey + '）');
    } else {
      Logger.log('[withWeeklyLock_] 送信が完了しなかったため sent_week は未設定（再実行可）: ' + fullKey);
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * 週次トークンを検証する。
 * @returns {{ ok: boolean, error?: string }}
 */
function assertWeeklyToken_(weekStartJst, tokenParam) {
  if (isSkipDashTokenCheck_()) {
    Logger.log('[SECURITY WARNING] SKIP_DASH_TOKEN_CHECK が有効です。weekStart=' + weekStartJst);
    return { ok: true };
  }
  var key = weekTokenPropKey_(weekStartJst);
  var stored = PropertiesService.getScriptProperties().getProperty(key);
  if (!stored) {
    return { ok: false, error: 'token_not_issued' };
  }
  var t = tokenParam != null ? String(tokenParam).trim() : '';
  if (!t) {
    return { ok: false, error: 'token_missing' };
  }
  if (t !== String(stored).trim()) {
    return { ok: false, error: 'invalid_token' };
  }
  return { ok: true };
}

/**
 * task_id → category_id のマップを Tasks 行配列から構築する。
 * @private
 */
function buildTaskCategoryMapFromRows_(taskRows) {
  var h = taskRows[0];
  var ixId = h.indexOf('task_id');
  var ixCat = h.indexOf('category_id');
  var ixActive = h.indexOf('active');
  var map = {};
  if (ixId < 0 || ixCat < 0) return map;
  for (var r = 1; r < taskRows.length; r++) {
    var row = taskRows[r];
    var id = String(row[ixId] || '').trim();
    if (!id) continue;
    if (ixActive >= 0) {
      var a = row[ixActive];
      if (a === false || String(a).toUpperCase() === 'FALSE') continue;
    }
    map[id] = String(row[ixCat] || '').trim();
  }
  return map;
}

/**
 * Categories シートから { map: {category_id → info}, order: [id,...] } を返す。
 * @private
 */
function buildCategoryInfoMap_(ss) {
  var catSheet = ss.getSheetByName('Categories');
  var map = {};
  var order = [];
  if (!catSheet) return { map: map, order: order };
  var cRows = catSheet.getDataRange().getValues();
  var ch = cRows[0];
  var cxId = ch.indexOf('category_id');
  var cxName = ch.indexOf('display_name');
  var cxColor = ch.indexOf('color');
  var cxSort = ch.indexOf('sort_order');
  var cxActive = ch.indexOf('active');
  if (cxId < 0) return { map: map, order: order };
  for (var ci = 1; ci < cRows.length; ci++) {
    var crow = cRows[ci];
    var catId = String(crow[cxId] || '').trim();
    if (!catId) continue;
    if (cxActive >= 0) {
      var av = crow[cxActive];
      if (av === false || String(av).toUpperCase() === 'FALSE') continue;
    }
    var sord = cxSort >= 0 ? Number(crow[cxSort]) : ci;
    if (isNaN(sord)) sord = ci;
    map[catId] = {
      category_id: catId,
      display_name: cxName >= 0 ? String(crow[cxName] || catId).trim() : catId,
      color: cxColor >= 0 ? String(crow[cxColor] || '#94A3B8').trim() : '#94A3B8',
      sort_order: sord,
    };
    order.push({ id: catId, ord: sord });
  }
  order.sort(function (a, b) { return a.ord - b.ord; });
  return { map: map, order: order };
}

/**
 * 1日分のタスクリスト（[{ task_id, status }]）からカテゴリ別集計を返す。
 * @private
 */
function buildDayCategoryStats_(dayTasks, taskCatMap, catInfoResult) {
  var catMap = catInfoResult.map;
  var catOrder = catInfoResult.order;
  var stats = {};
  var NONE = '__none__';

  for (var i = 0; i < dayTasks.length; i++) {
    var t = dayTasks[i];
    var cid = (taskCatMap[t.task_id] || '');
    if (!catMap[cid]) cid = NONE;
    if (!stats[cid]) {
      if (cid === NONE) {
        stats[NONE] = { category_id: NONE, display_name: 'その他', color: '#94A3B8', sort_order: 9999, done: 0, not_done: 0, total: 0 };
      } else {
        var info = catMap[cid];
        stats[cid] = { category_id: cid, display_name: info.display_name, color: info.color, sort_order: info.sort_order, done: 0, not_done: 0, total: 0 };
      }
    }
    stats[cid].total++;
    if (t.status === 'done') stats[cid].done++;
    else stats[cid].not_done++;
  }

  var result = [];
  for (var k = 0; k < catOrder.length; k++) {
    var s = stats[catOrder[k].id];
    if (s && s.total > 0) result.push(s);
  }
  var noneStats = stats[NONE];
  if (noneStats && noneStats.total > 0) result.push(noneStats);
  return result;
}

/**
 * 週次ダッシュボードモデルを構築する（§3.6）。
 * weekStartJst: 月曜の JST 日付（YYYY-MM-DD）
 * 達成率 = 月〜金の日次達成率の算術平均（Daily 行なし日は 0%・分母に含む）。
 * @returns {{ ok, week_start, week_end, weekly_achievement_percent, mood_message, data_days, days, no_data }}
 */
function buildWeeklyDashboardModel_(ss, weekStartJst) {
  var dailySheet = ss.getSheetByName('Daily');
  var tasksSheet = ss.getSheetByName('Tasks');
  if (!dailySheet || !tasksSheet) {
    throw new Error('シート Daily または Tasks が見つかりません。');
  }

  // 月〜金の日付リストを生成
  var DOW_JP = ['日', '月', '火', '水', '木', '金', '土'];
  var startDate = new Date(weekStartJst + 'T12:00:00+09:00');
  var weekDates = [];
  for (var i = 0; i < 5; i++) {
    var d = new Date(startDate.getTime() + i * 86400000);
    weekDates.push({
      date: Utilities.formatDate(d, TZ_, 'yyyy-MM-dd'),
      dow: DOW_JP[d.getDay()],
    });
  }

  // Daily シートを読み込み
  var dailyRows = dailySheet.getDataRange().getValues();
  var header = dailyRows[0];
  var ciDate = header.indexOf('date');
  var ciTask = header.indexOf('task_id');
  var ciStat = header.indexOf('status');
  if (ciDate < 0 || ciTask < 0 || ciStat < 0) {
    throw new Error('Daily の 1 行目に date / task_id / status 列が必要です。');
  }

  var tRows = tasksSheet.getDataRange().getValues();
  var taskCatMap = buildTaskCategoryMapFromRows_(tRows);
  var catInfoResult = buildCategoryInfoMap_(ss);

  // 日付ごとにグループ化（対象週のみ）
  var targetDates = {};
  for (var wi = 0; wi < weekDates.length; wi++) targetDates[weekDates[wi].date] = true;

  var rowsByDate = {};
  for (var r = 1; r < dailyRows.length; r++) {
    var row = dailyRows[r];
    var dd = formatDateCell_(row[ciDate], TZ_);
    if (!targetDates[dd]) continue;
    if (!rowsByDate[dd]) rowsByDate[dd] = [];
    rowsByDate[dd].push({
      task_id: String(row[ciTask] || '').trim(),
      status: normalizeStatus_(row[ciStat]),
    });
  }

  // 曜日ごとの集計（§3.6: Daily 行なし日は 0% を分母に含む）
  var days = [];
  var totalPctSum = 0;
  var dataCount = 0;
  for (var di = 0; di < weekDates.length; di++) {
    var wd = weekDates[di];
    var dayTasks = rowsByDate[wd.date] || [];
    var done = 0;
    var total = dayTasks.length;
    for (var ti = 0; ti < dayTasks.length; ti++) {
      if (dayTasks[ti].status === 'done') done++;
    }
    var pct = total > 0 ? Math.round(done / total * 100) : 0;
    totalPctSum += pct;
    if (total > 0) dataCount++;
    var cats = buildDayCategoryStats_(dayTasks, taskCatMap, catInfoResult);
    days.push({
      date: wd.date,
      dow: wd.dow,
      achievement_percent: pct,
      has_data: total > 0,
      counts: { done: done, not_done: total - done, total: total },
      categories: cats,
    });
  }

  var weeklyPct = Math.round(totalPctSum / 5);

  // §3.6.1: 全日データなし
  if (dataCount === 0) {
    return {
      ok: true,
      week_start: weekStartJst,
      week_end: weekDates[4].date,
      weekly_achievement_percent: 0,
      mood_message: '今週はまだデータがありません',
      data_days: 0,
      days: days,
      no_data: true,
    };
  }

  return {
    ok: true,
    week_start: weekStartJst,
    week_end: weekDates[4].date,
    weekly_achievement_percent: weeklyPct,
    mood_message: moodMessage_(weeklyPct),
    data_days: dataCount,
    days: days,
    no_data: false,
  };
}

/**
 * 週次 LINE プッシュの実処理（§1.4 W-4: シンプル本文）。
 * @returns {boolean} ユーザー向け週次 LINE を HTTP 200 で送れたら true（withWeeklyLock_ が sent_week をコミットする）
 * @private
 */
function sendWeeklyReviewImpl_(weekStartJst) {
  var props = PropertiesService.getScriptProperties();
  var lineToken = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var userId = props.getProperty('LINE_USER_ID');
  if (!lineToken || !userId) {
    Logger.log('[sendWeeklyReview] LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID 未設定のため週次を送れません');
    return false;
  }

  var ss;
  try {
    ss = getBoundSpreadsheet_();
  } catch (e0) {
    Logger.log('[sendWeeklyReview] getBoundSpreadsheet_ 失敗: ' + String(e0));
    return linePushTextWeekly_(lineToken, userId, '【やったかい週次】スプレッドシートに接続できませんでした。');
  }

  var model;
  try {
    model = buildWeeklyDashboardModel_(ss, weekStartJst);
  } catch (e) {
    Logger.log('[sendWeeklyReview] モデル構築失敗: ' + String(e));
    return linePushTextWeekly_(lineToken, userId, '【やったかい週次】集計に失敗しました。');
  }

  var weekToken = issueWeekToken_(weekStartJst);
  var liffUrl = (props.getProperty('LIFF_URL') || '').trim();

  // W-4: シンプル本文（週次達成率 + LIFF URL のみ）
  var lines = [];
  lines.push('【やったかい週次】' + model.week_start + '〜' + model.week_end);
  if (model.no_data) {
    lines.push('今週はまだデータがありません。');
  } else {
    lines.push('週間達成率: ' + model.weekly_achievement_percent + '%　' + model.mood_message);
    if (model.data_days < 5) {
      lines.push('（' + model.data_days + '日分のデータで集計）');
    }
  }
  if (liffUrl) {
    var oid = issueWeeklyLiffOpaqueOpen_(weekStartJst, weekToken);
    var oidEnc = encodeURIComponent(oid);
    // LIFF が liff.line.me → エンドポイントへ遷移するとき、トップレベルの oid が GAS に届かないことがある。
    // liff.state に ?oid= を載せておけば parseWebAppQuery_ が st.oid として復元する（LINE 推奨の引き回し経路）。
    var stateQuery = '?oid=' + oidEnc;
    var qOpen = 'oid=' + oidEnc + '&liff.state=' + encodeURIComponent(stateQuery);
    var sep = liffUrl.indexOf('?') >= 0 ? '&' : '?';
    lines.push('');
    lines.push('振り返り: ' + liffUrl + sep + qOpen);
  }

  var ok = linePushTextWeekly_(lineToken, userId, lines.join('\n'));
  if (ok) {
    Logger.log('[sendWeeklyReview] 送信完了（weekStart=' + weekStartJst + '）');
  } else {
    Logger.log('[sendWeeklyReview] LINE 送信失敗（weekStart=' + weekStartJst + '）。同週の手動再実行で再送可');
  }
  return ok;
}

/**
 * 土曜 8 時台に実行。先週月〜金を集計して LINE + LIFF で届ける（§1.4 W-2）。
 * withWeeklyLock_ で 1 週 1 プッシュを保証する（付録 A.3）。
 * weekStart は「直近の月曜（JST）」に正規化する。
 * - 土曜トリガ実行時: その週の月曜（意図どおり）
 * - 土曜以外の手動実行時: 「今日-5日」のようなズレが起きず、常に今週の振り返りになる
 */
function sendWeeklyReview() {
  var today = new Date();
  var todayJst = Utilities.formatDate(today, TZ_, 'yyyy-MM-dd');
  var weekStartJst = mostRecentMondayJst_(todayJst);
  Logger.log('[sendWeeklyReview] start todayJst=' + todayJst + ' weekStartJst=' + weekStartJst);
  withWeeklyLock_(weekStartJst, function () {
    return sendWeeklyReviewImpl_(weekStartJst);
  });
}

/**
 * テスト用: 今週分の `sent_week:{月曜}` を削除してから `sendWeeklyReview` を再実行する。
 *
 * 通常の `sendWeeklyReview` は 1 週 1 回にロックされるため、既に `sent_week:` が立っていると
 * `[withWeeklyLock_] 実行済みのためスキップ` となり再送できない。本関数はそのロックだけを明示的に外す。
 *
 * **安全装置**: スクリプト プロパティ `ALLOW_WEEKLY_TEST_RESEND` が `true`（大文字小文字無視）のときだけ動作する。
 * テスト後は **必ずプロパティを削除**すること（本番で常時 true にしないこと）。
 */
function resendWeeklyReviewAfterClearingSentWeek() {
  var props = PropertiesService.getScriptProperties();
  var allow = (props.getProperty('ALLOW_WEEKLY_TEST_RESEND') || '').trim().toLowerCase();
  if (allow !== 'true') {
    throw new Error(
      'ALLOW_WEEKLY_TEST_RESEND が true ではありません。プロジェクト設定 → スクリプト プロパティで true を設定し、テスト後に削除してください。'
    );
  }
  var todayJst = Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd');
  var weekStartJst = mostRecentMondayJst_(todayJst);
  var k = 'sent_week:' + weekStartJst;
  props.deleteProperty(k);
  Logger.log('[resendWeeklyReviewAfterClearingSentWeek] deleted ' + k + ' → sendWeeklyReview()');
  sendWeeklyReview();
}

/**
 * 週次ロック `sent_week:YYYY-MM-DD` を Script Properties から削除する（テスト・再送前用）。
 *
 * Google の「プロジェクトの設定 → スクリプトのプロパティ」は **50 件超**だと一覧に出ない・
 * **読み取り専用**のため、該当キーはここから削除する。
 *
 * - **既定**: `sent_week:2026-05-04` を削除（ログの weekStart と一致させる場合）。
 * - **別の月曜を消す**: スクリプト プロパティ `SENT_WEEK_DELETE_TARGET` に `yyyy-MM-dd`（その週の月曜）だけを入れてから本関数を実行。試し終わったら `SENT_WEEK_DELETE_TARGET` は削除してよい。
 */
function deleteSentWeekForTest() {
  var props = PropertiesService.getScriptProperties();
  var datePart = (props.getProperty('SENT_WEEK_DELETE_TARGET') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    datePart = '2026-05-04';
  }
  var key = 'sent_week:' + datePart;
  props.deleteProperty(key);
  Logger.log('[deleteSentWeekForTest] deleted ' + key);
}

/**
 * JST の日付（yyyy-MM-dd）から、その日を含む週の「直近の月曜（JST）」を返す。
 * @param {string} dateJst yyyy-MM-dd
 * @returns {string} yyyy-MM-dd（月曜）
 * @private
 */
function mostRecentMondayJst_(dateJst) {
  // 12:00 JST 固定で Date を作り、境界（タイムゾーン差・夏時間等）で日付がズレないようにする
  var base = new Date(String(dateJst) + 'T12:00:00+09:00');
  var dow = base.getDay(); // 0=Sun ... 6=Sat (JST)
  var daysSinceMonday = (dow + 6) % 7; // Mon=0, Tue=1, ... Sun=6
  var monday = new Date(base.getTime() - daysSinceMonday * 86400000);
  return Utilities.formatDate(monday, TZ_, 'yyyy-MM-dd');
}

/**
 * sendWeeklyReview を毎週土曜 8 時に実行するトリガを 1 本だけ登録する（§1.4 W-2）。
 * GAS エディタから 1 回だけ手動実行すること。
 */
function installWeeklyReviewTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var toDel = [];
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendWeeklyReview') toDel.push(triggers[i]);
  }
  for (var j = 0; j < toDel.length; j++) ScriptApp.deleteTrigger(toDel[j]);
  ScriptApp.newTrigger('sendWeeklyReview')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(WEEKLY_REVIEW_HOUR_JST_)
    .inTimezone(TZ_)
    .create();
  Logger.log('[installWeeklyReviewTrigger] 土曜 ' + WEEKLY_REVIEW_HOUR_JST_ + ' 時トリガを登録しました。');
}

/**
 * LIFF クライアントから google.script.run で呼ぶ週次ダッシュボード JSON 取得。
 * 名前末尾に _ を付けない（google.script.run の制約）。
 */
function getWeeklyDashboardJsonForClient(weekStartJst, clientToken) {
  var ws = (weekStartJst && String(weekStartJst).trim()) || '';
  if (!ws || !/^\d{4}-\d{2}-\d{2}$/.test(ws)) {
    return { ok: false, error: 'invalid_week_start' };
  }
  var gate = assertWeeklyToken_(ws, clientToken);
  if (!gate.ok) return { ok: false, error: gate.error };
  var ss;
  try {
    ss = getBoundSpreadsheet_();
  } catch (err) {
    return { ok: false, error: 'no_spreadsheet', message: String(err.message || err) };
  }
  try {
    return buildWeeklyDashboardModel_(ss, ws);
  } catch (err2) {
    return { ok: false, error: 'build_failed', message: String(err2.message || err2) };
  }
}

/**
 * doGet の週次モード処理（§5.7）。
 * weekStart パラメータがあるときに doGet から委譲される。
 * @private
 */
function doGetWeekly_(weekStart, tokenParam, format) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    if (format === 'json') {
      return jsonOutput_({ ok: false, error: 'invalid_week_start', week_start: weekStart });
    }
    return liffHtmlOutput_('<p>weekStart が不正です。yyyy-MM-dd で指定してください。</p>');
  }

  var gate = assertWeeklyToken_(weekStart, tokenParam);
  if (!gate.ok) {
    if (format === 'json') {
      return jsonOutput_({ ok: false, error: gate.error, week_start: weekStart });
    }
    return liffHtmlOutput_('<p>' + escapeHtml_(weeklyTokenErrorHtmlHint_(gate.error)) + '</p>');
  }

  var ss;
  try {
    ss = getBoundSpreadsheet_();
  } catch (err) {
    if (format === 'json') {
      return jsonOutput_({ ok: false, error: 'no_spreadsheet', message: String(err.message || err) });
    }
    return liffHtmlOutput_(
      '<p>スプレッドシートを取得できません。スプレッドシートから <code>ensureSpreadsheetBinding</code> を 1 回実行してください。</p>'
    );
  }

  var model;
  try {
    model = buildWeeklyDashboardModel_(ss, weekStart);
  } catch (err) {
    if (format === 'json') {
      return jsonOutput_({ ok: false, error: 'build_failed', message: String(err.message || err) });
    }
    return liffHtmlOutput_('<p>集計に失敗しました: ' + escapeHtml_(String(err.message || err)) + '</p>');
  }

  if (format === 'json') return jsonOutput_(model);
  return htmlWeeklyMessage_(weekStart, tokenParam, model);
}

/**
 * 週次 LIFF HTML（§5.7）。
 * カテゴリ別色分け積み上げ横棒グラフ（Y軸=曜日、X軸=達成率）を描画する。
 * キャラクター（■2）は表示しない（W-5）。
 */
function htmlWeeklyMessage_(weekStartJst, tokenStr, model) {
  var defaultWeekJson = JSON.stringify(weekStartJst);
  var defaultTokenJson = JSON.stringify(String(tokenStr || ''));
  var bakedJson = (model && model.ok) ? jsonLiteralForScriptTag_(model) : 'null';

  var css = [
    '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}',
    'body{font-family:"Noto Sans JP","Hiragino Kaku Gothic ProN",system-ui,sans-serif;',
    'padding:env(safe-area-inset-top,0) 16px calc(40px + env(safe-area-inset-bottom,0));',
    'max-width:480px;margin:0 auto;background:#fafafa;color:#1E293B;}',
    '#st{min-height:1.4em;padding:10px 0 2px;font-size:13px;color:#64748B;}',
    '.top{text-align:center;padding:16px 0 10px;}',
    '.period{font-size:12px;color:#94A3B8;margin:0 0 6px;letter-spacing:.04em;}',
    '.wpct{font-size:48px;font-weight:900;color:#1E293B;margin:0;line-height:1.1;}',
    '.mood{font-size:15px;font-weight:700;color:#64748B;margin:6px 0 0;}',
    '.notice{font-size:11px;color:#B45309;background:#FFFBEB;border:1px solid #FDE68A;',
    'border-radius:8px;padding:6px 12px;margin:10px auto 0;display:inline-block;}',
    'h2{font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.06em;',
    'margin:20px 0 10px;border-bottom:1px solid #E2E8F0;padding-bottom:4px;}',
    '.chart{display:flex;flex-direction:column;gap:12px;margin:0 0 16px;}',
    '.day-row{display:flex;align-items:center;gap:8px;}',
    '.dow{font-size:13px;font-weight:700;color:#475569;width:22px;flex-shrink:0;text-align:right;}',
    '.bar-wrap{flex:1;height:26px;background:#F1F5F9;border-radius:6px;overflow:hidden;display:flex;}',
    '.bar-seg{height:100%;}',
    '.bar-pct{font-size:12px;font-weight:700;color:#475569;width:38px;flex-shrink:0;text-align:right;}',
    '.no-data-lbl{height:100%;width:100%;display:flex;align-items:center;padding:0 10px;font-size:11px;color:#94A3B8;font-style:italic;}',
    '.legend{display:flex;flex-wrap:wrap;gap:10px;margin:4px 0 16px;}',
    '.leg{display:flex;align-items:center;gap:5px;font-size:12px;color:#64748B;}',
    '.ldot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}',
    '.footer{margin-top:24px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:11px;color:#94A3B8;text-align:center;}',
  ].join('');

  var js = [
    '(function(){',
    'var WS0=' + defaultWeekJson + ',T0=' + defaultTokenJson + ';',
    'var __D__=' + bakedJson + ';',
    'var qs=new URLSearchParams(window.location.search);',
    'var WS=(qs.get("weekStart")||"").trim()||WS0,T=(qs.get("token")||"").trim()||T0;',
    'var root=document.getElementById("app"),stEl=document.getElementById("st");',
    'function h(tag,text,cls){var e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}',
    'function sc(c){var s=String(c||"#94A3B8").trim();return/^(#[0-9a-fA-F]{3,8}|rgb[a]?\\([^)]*\\)|[a-zA-Z]{2,30})$/.test(s)?s:"#94A3B8";}',
    'function fmt(d){var p=d.split("-");return parseInt(p[1],10)+"/"+parseInt(p[2],10);}',
    'function paint(data){',
    '  if(!data||data.ok===false){stEl.textContent="エラー: "+(data&&data.error||"unknown");return;}',
    '  stEl.textContent="";while(root.firstChild)root.removeChild(root.firstChild);',
    '  var frag=document.createDocumentFragment();',
    // ヘッダ: 期間・週次達成率・メッセージ
    '  var top=document.createElement("div");top.className="top";',
    '  top.appendChild(h("p",fmt(data.week_start||"")+"（月）〜"+fmt(data.week_end||"")+"（金）","period"));',
    '  top.appendChild(h("p",data.no_data?"－":data.weekly_achievement_percent+"%","wpct"));',
    '  top.appendChild(h("p",data.mood_message||"","mood"));',
    '  if(!data.no_data&&(data.data_days||0)<5){',
    '    top.appendChild(h("div","今週は"+data.data_days+"日分のデータで集計しています","notice"));}',
    '  frag.appendChild(top);',
    // 全日からカテゴリ情報を収集（凡例・色用）
    '  var catSet={},catOrder=[];',
    '  var days=data.days||[];',
    '  for(var di=0;di<days.length;di++){var cs=days[di].categories||[];',
    '    for(var ci=0;ci<cs.length;ci++){var c=cs[ci];if(!catSet[c.category_id]){',
    '      catSet[c.category_id]={display_name:c.display_name,color:c.color,sort_order:c.sort_order||999};',
    '      catOrder.push(c.category_id);}}}',
    '  catOrder.sort(function(a,b){return(catSet[a].sort_order||999)-(catSet[b].sort_order||999);});',
    // グラフ
    '  frag.appendChild(h("h2","曜日別達成率"));',
    '  var chart=document.createElement("div");chart.className="chart";',
    '  for(var di=0;di<days.length;di++){',
    '    var day=days[di];',
    '    var row=document.createElement("div");row.className="day-row";',
    '    row.appendChild(h("span",day.dow,"dow"));',
    '    var bw=document.createElement("div");bw.className="bar-wrap";',
    '    if(!day.has_data){',
    '      bw.appendChild(h("div","未記入","no-data-lbl"));',
    '    }else{',
    '      var total=day.counts&&day.counts.total?day.counts.total:0;',
    '      var dc=day.categories||[];',
    '      for(var ci=0;ci<dc.length;ci++){var cat=dc[ci];if(!cat.done)continue;',
    '        var seg=document.createElement("div");seg.className="bar-seg";',
    '        seg.style.width=(total>0?cat.done/total*100:0).toFixed(1)+"%";',
    '        seg.style.background=sc(cat.color);bw.appendChild(seg);}',
    '    }',
    '    row.appendChild(bw);',
    '    row.appendChild(h("span",day.has_data?day.achievement_percent+"%":"－","bar-pct"));',
    '    chart.appendChild(row);',
    '  }',
    '  frag.appendChild(chart);',
    // 凡例
    '  if(catOrder.length>0){var leg=document.createElement("div");leg.className="legend";',
    '    for(var ki=0;ki<catOrder.length;ki++){var cid=catOrder[ki];var ci=catSet[cid];',
    '      var item=document.createElement("div");item.className="leg";',
    '      var dot=document.createElement("span");dot.className="ldot";dot.style.background=sc(ci.color);',
    '      item.appendChild(dot);item.appendChild(h("span",ci.display_name));leg.appendChild(item);}',
    '    frag.appendChild(leg);}',
    '  root.appendChild(frag);',
    '}',
    // 埋め込みデータがあれば即描画、なければ RPC
    'if(__D__&&__D__.ok===true){stEl.textContent="";paint(__D__);}',
    'else{google.script.run.withSuccessHandler(paint).withFailureHandler(function(err){stEl.textContent="取得に失敗しました: "+(err&&err.message?err.message:String(err));}).getWeeklyDashboardJsonForClient(WS,T);}',
    '})();',
  ].join('\n');

  var html =
    '<!DOCTYPE html><html><head>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<meta charset="UTF-8"><title>やったかい 週次振り返り</title>' +
    '<style>' + css + '</style>' +
    '</head><body>' +
    '<p id="st">読み込み中…</p>' +
    '<div id="app"></div>' +
    '<script>' + js + '<\/script>' +
    '</body></html>';

  return liffHtmlOutput_(html);
}

/**
 * 投資図解「24時間」ページの URL をメールで送る（エディタから手動実行）。
 * スクリプトプロパティ:
 *   INVEST24H_PAGE_URL（任意）… 未設定時は https://invest-24h-20260422.surge.sh/
 *   INVEST24H_NOTIFY_TO（任意）… カンマ区切りの送信先。未設定時は Session.getActiveUser().getEmail()
 * Gmail の送信制限・スパム判定は Google 側のポリシーに従う。
 */
function sendInvest24hDigestEmail() {
  var props = PropertiesService.getScriptProperties();
  var url = (props.getProperty('INVEST24H_PAGE_URL') || 'https://invest-24h-20260422.surge.sh/').trim();
  var toRaw = (props.getProperty('INVEST24H_NOTIFY_TO') || '').trim();
  var recipients = [];
  if (toRaw) {
    var parts = toRaw.split(',');
    for (var i = 0; i < parts.length; i++) {
      var e = String(parts[i] || '').trim();
      if (e) recipients.push(e);
    }
  }
  if (recipients.length === 0) {
    var self = Session.getActiveUser().getEmail();
    if (!self) throw new Error('送信先メールが取得できません。INVEST24H_NOTIFY_TO を設定するか、ログインしたユーザーで実行してください。');
    recipients.push(self);
  }
  var subject = '【投資図解】24時間まとめ ' + Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd');
  var body =
    '投資図解（直近24時間まとめ）を更新しました。\n\n' +
    url +
    '\n\n---\nやったかい GAS（sendInvest24hDigestEmail）から送信';
  for (var j = 0; j < recipients.length; j++) {
    MailApp.sendEmail({ to: recipients[j], subject: subject, body: body });
    Logger.log('[sendInvest24hDigestEmail] sent to ' + recipients[j]);
  }
}

function linePushText_(token, userId, text) {
  var url = 'https://api.line.me/v2/bot/message/push';
  var payload = {
    to: userId,
    messages: [{ type: 'text', text: text }],
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code !== 200) {
    throw new Error('LINE push HTTP ' + code + ': ' + body);
  }
}

/**
 * 週次 LINE 専用。429 / 5xx 時は短い待ちのあと最大 3 回まで再試行する。
 * 日次・朝は linePushText_ のみ（挙動を変えない）。
 * @returns {boolean} いずれかの試行で HTTP 200 なら true
 * @private
 */
function linePushTextWeekly_(token, userId, text) {
  var url = 'https://api.line.me/v2/bot/message/push';
  var maxAttempts = 3;
  var pauseMs = [0, 1500, 3500];
  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    if (pauseMs[attempt] > 0) Utilities.sleep(pauseMs[attempt]);
    var payload = {
      to: userId,
      messages: [{ type: 'text', text: text }],
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };
    try {
      var res = UrlFetchApp.fetch(url, options);
      var code = res.getResponseCode();
      var body = res.getContentText();
      if (code === 200) return true;
      var snippet = body && String(body).length > 500 ? String(body).slice(0, 500) + '…' : String(body);
      Logger.log('[linePushTextWeekly_] attempt ' + (attempt + 1) + '/' + maxAttempts + ' HTTP ' + code + ' ' + snippet);
      if (code === 429 || (code >= 500 && code <= 599)) continue;
      return false;
    } catch (fetchErr) {
      Logger.log('[linePushTextWeekly_] attempt ' + (attempt + 1) + ' fetch error: ' + String(fetchErr));
    }
  }
  return false;
}

/**
 * Tasks（active）にあって Daily に無い task_id 行を当日分として追記（status / updated_at は空）
 */
function ensureDailyRowsForToday_(ss, todayStr, tz) {
  var tasksSheet = ss.getSheetByName('Tasks');
  var dailySheet = ss.getSheetByName('Daily');
  if (!tasksSheet || !dailySheet) {
    throw new Error('ensureDailyRows: Tasks または Daily が見つかりません。');
  }

  var taskRows = tasksSheet.getDataRange().getValues();
  var th = taskRows[0];
  var ixId = th.indexOf('task_id');
  var ixActive = th.indexOf('active');
  var ixOrder = th.indexOf('sort_order');
  if (ixId < 0) throw new Error('ensureDailyRows: Tasks に task_id 列が必要です。');

  var masters = [];
  for (var r = 1; r < taskRows.length; r++) {
    var row = taskRows[r];
    var id = String(row[ixId] || '').trim();
    if (!id) continue;
    if (ixActive >= 0) {
      var a = row[ixActive];
      if (a === false || String(a).toUpperCase() === 'FALSE') continue;
    }
    var ord = ixOrder >= 0 ? Number(row[ixOrder]) : r;
    if (isNaN(ord)) ord = r;
    masters.push({ id: id, ord: ord });
  }
  masters.sort(function (x, y) {
    return x.ord - y.ord;
  });

  var dailyRows = dailySheet.getDataRange().getValues();
  if (dailyRows.length < 1) throw new Error('ensureDailyRows: Daily にヘッダ行が必要です。');
  var dh = dailyRows[0];
  var ciDate   = dh.indexOf('date');
  var ciTask   = dh.indexOf('task_id');
  var ciStatus = dh.indexOf('status'); // ヘッダから動的取得（列追加にも対応）
  if (ciDate < 0 || ciTask < 0) {
    throw new Error('ensureDailyRows: Daily に date / task_id 列が必要です。');
  }

  var have = {};
  for (var i = 1; i < dailyRows.length; i++) {
    var dr = dailyRows[i];
    var d = formatDateCell_(dr[ciDate], tz);
    if (d !== todayStr) continue;
    var tid = String(dr[ciTask] || '').trim();
    if (tid) have[tid] = true;
  }

  var toAppend = [];
  for (var j = 0; j < masters.length; j++) {
    var mid = masters[j].id;
    if (!have[mid]) {
      // ヘッダ列数に合わせた行を生成（列追加にも対応）
      var newRow = new Array(dh.length).fill('');
      newRow[ciDate] = todayStr;
      newRow[ciTask] = mid;
      if (ciStatus >= 0) newRow[ciStatus] = '×'; // デフォルト☓（ユーザーが◯にタップで変更）
      toAppend.push(newRow);
    }
  }

  if (toAppend.length === 0) return;

  var last = dailySheet.getLastRow();
  if (last < 1) last = 1;
  dailySheet.getRange(last + 1, 1, toAppend.length, dh.length).setValues(toAppend);
}
