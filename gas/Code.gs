/**
 * yattakai-task-checker — コンテナバインド GAS（スプレッドシートから開く想定）
 *
 * スクリプト プロパティ:
 *   LINE_CHANNEL_ACCESS_TOKEN, LINE_USER_ID（必須）
 *   GEMINI_API_KEY（任意）… 設定時に §6.1 Gemini で ■2 を生成。未設定時は §6.2 テンプレのみ
 *   AVATAR_BASE_URL（任意）… キャラ画像を配信する URL（末尾スラッシュなし）。例: https://yattakai-avatars.surge.sh
 *                             未設定時は LIFF でテキストのみ表示（フォールバック）
 *   LIFF_URL（任意）… 設定時のみプッシュ末尾に「ダッシュボード: …?date=…&token=…」を付与
 *   SKIP_DASH_TOKEN_CHECK（任意）… true のとき token 検証をスキップ（開発用のみ・本番は設定しない）
 *
 * シート: Daily / Tasks / Quotes（§4）… シート名は SPEC どおり英字
 *
 * Web アプリ doGet:
 *   ?format=json&date=yyyy-MM-dd&token=… … ダッシュボード用 DTO（token は当日プッシュで発行）
 *   上記以外 … LIFF 向け HTML（google.script.run で JSON 相当データを取得）
 *
 * 初回セットアップ: エディタから installDailyReminderTrigger を 1 回実行（毎日 17:40 JST に sendDailyReminder）。
 * 変更後は gas で clasp push のあと、ウェブアプリを「新バージョン」で再デプロイすること。
 */

/** 当日ダッシュ用トークンをスクリプトプロパティに保存するキー接頭辞 */
var DASH_TOKEN_PROP_PREFIX_ = 'yattakai_dash_token_';

function generateDashToken_() {
  return Utilities.getUuid().replace(/-/g, '');
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
    .inTimezone(Session.getScriptTimeZone())
    .create();
}

function sendDailyReminder() {
  var tz = Session.getScriptTimeZone();
  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var userId = props.getProperty('LINE_USER_ID');
  if (!token || !userId) {
    throw new Error('スクリプト プロパティに LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID を設定してください。');
  }

  var model = buildDailyDashboardModel_(ss, todayStr, tz, { ensureTodayRows: true });
  if (!model.ok) {
    linePushText_(token, userId, '【やったかい】' + todayStr + ' の Daily 行がありません。');
    return;
  }

  var lines = formatDailyReminderLines_(model);

  var dashToken = generateDashToken_();
  PropertiesService.getScriptProperties().setProperty(dashTokenPropKey_(model.date), dashToken);

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
 * @param {{ ensureTodayRows?: boolean }} opts true のとき ensureDailyRowsForToday_ を実行（当日シート補完）
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   date?: string,
 *   achievement_percent?: number,
 *   mood_message?: string,
 *   counts?: { done: number, not_done: number, unset: number, total: number },
 *   tasks?: Array<{ task_id: string, label: string, status: string, status_mark: string }>,
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
  var ciDate = header.indexOf('date');
  var ciTask = header.indexOf('task_id');
  var ciStat = header.indexOf('status');
  if (ciDate < 0 || ciTask < 0 || ciStat < 0) {
    throw new Error('Daily の 1 行目に date / task_id / status 列が必要です。');
  }

  var todays = [];
  for (var r = 1; r < dailyRows.length; r++) {
    var row = dailyRows[r];
    var d = formatDateCell_(row[ciDate], tz);
    if (d === dateStr) {
      todays.push({
        task_id: String(row[ciTask] || '').trim(),
        raw: row[ciStat],
      });
    }
  }

  if (todays.length === 0) {
    return { ok: false, error: 'no_daily_rows', date: dateStr };
  }

  var done = 0;
  var notDone = 0;
  var unset = 0;
  for (var i = 0; i < todays.length; i++) {
    var st = normalizeStatus_(todays[i].raw);
    todays[i].status = st;
    if (st === 'done') done++;
    else if (st === 'not_done') notDone++;
    else unset++;
  }

  var denom = todays.length;
  var pct = Math.round((done / denom) * 100);
  // §3.3.1: 全タスクが未記入の場合は閾値テーブルとは別扱い（夕方時点でまだ記入前のケース）
  var mood;
  if (done === 0 && notDone === 0 && unset > 0) {
    mood = 'まだ記入されていません';
  } else {
    mood = moodMessage_(pct);
  }
  var taskMap = buildTaskLabelMap_(tasksSheet);

  var tasksOut = [];
  for (var j = 0; j < todays.length; j++) {
    var t = todays[j];
    var label = taskMap[t.task_id] || t.task_id || '(task_id なし)';
    tasksOut.push({
      task_id: t.task_id,
      label: label,
      status: t.status,
      status_mark: statusMark_(t.status),
    });
  }

  var section2 = buildSection2_(ss, dateStr, pct, mood);
  var categories = buildCategoryStatsMap_(ss, tasksSheet, tasksOut);

  return {
    ok: true,
    date: dateStr,
    achievement_percent: pct,
    mood_message: mood,
    counts: {
      done: done,
      not_done: notDone,
      unset: unset,
      total: denom,
    },
    tasks: tasksOut,
    categories: categories,
    section2: section2.dto,
    section2TextBlock: section2.textBlock,
  };
}

/**
 * Categories シート + Tasks シートのカテゴリ列を使い、タスク集計結果をカテゴリ別に集計。
 * Categories シートが無い・category_id 列が無い場合はタスクを「その他」に集約して返す。
 * @returns Array<{ category_id, display_name, color, sort_order, done, not_done, unset, total }>
 */
function buildCategoryStatsMap_(ss, tasksSheet, tasksOut) {
  var tRows = tasksSheet.getDataRange().getValues();
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
          done: 0, not_done: 0, unset: 0, total: 0,
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
          sort_order: 9999, done: 0, not_done: 0, unset: 0, total: 0,
        };
        hasNone = true;
      }
      cid2 = NONE;
    }
    var cat = catMap[cid2];
    cat.total++;
    if (task.status === 'done') cat.done++;
    else if (task.status === 'not_done') cat.not_done++;
    else cat.unset++;
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
  lines.push(
    '（達成 ' + c.done + ' / 全体 ' + c.total + '、未 ' + c.not_done + '、未記入 ' + c.unset + '）'
  );
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
 * ウェブアプリ（LIFF エンドポイント）。
 * format=json … ダッシュボード DTO（?token= は sendDailyReminder 発行分と照合）
 */
function doGet(e) {
  e = e || {};
  var p = e.parameter || {};
  var tz = Session.getScriptTimeZone();
  var rawDate = (p.date && String(p.date).trim()) || '';
  var format = (p.format && String(p.format).trim().toLowerCase()) || '';
  var tokenParam = p.token != null && p.token !== undefined ? String(p.token) : '';

  // LIFF は認証フローで元クエリを liff.state に包んで渡す（例: ?liff.state=?date=X&token=Y）。
  // 直接の date / token が無い場合は liff.state をパースして補完する。
  var liffState = (p['liff.state'] && String(p['liff.state'])) || '';
  if (liffState && (!rawDate || !tokenParam)) {
    var sp = parseLiffState_(liffState);
    if (!rawDate && sp.date) rawDate = String(sp.date).trim();
    if (!tokenParam && sp.token) tokenParam = String(sp.token).trim();
    if (!format && sp.format) format = String(sp.format).trim().toLowerCase();
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
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    if (format === 'json') {
      return jsonOutput_({ ok: false, error: 'no_spreadsheet', message: String(err.message || err) });
    }
    return htmlMessage_('スプレッドシートを取得できません。コンテナバインドでデプロイしてください。', dateStr, format, null, tokenParam);
  }

  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var ensureRows = dateStr === todayStr;

  var model;
  try {
    model = buildDailyDashboardModel_(ss, dateStr, tz, { ensureTodayRows: ensureRows });
  } catch (err) {
    if (format === 'json') {
      return jsonOutput_({ ok: false, error: 'build_failed', message: String(err.message || err) });
    }
    return htmlMessage_(String(err.message || err), dateStr, format, null, tokenParam);
  }

  if (format === 'json') {
    return jsonOutput_(toPublicDashboardJson_(model));
  }

  var hint =
    model.ok === true
      ? '上の内容はスプレッドシートと同じ JSON から取得しています。'
      : '（この日の Daily 行がありません）';
  return htmlMessage_(hint, dateStr, format, model.ok === true ? model : null, tokenParam);
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
  var tz = Session.getScriptTimeZone();
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
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    return { ok: false, error: 'no_spreadsheet', message: String(err.message || err) };
  }
  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var ensureRows = d === todayStr;
  try {
    var model = buildDailyDashboardModel_(ss, d, tz, { ensureTodayRows: ensureRows });
    return toPublicDashboardJson_(model);
  } catch (err2) {
    return { ok: false, error: 'build_failed', message: String(err2.message || err2) };
  }
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
    var ss = SpreadsheetApp.getActiveSpreadsheet();
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

    var tz = Session.getScriptTimeZone();
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

    // 書き込み後の最新集計を返す → クライアントがドーナツ・カテゴリバー・達成率を差分更新
    var model = buildDailyDashboardModel_(ss, d, tz, {});
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
function htmlMessage_(message, dateStr, format, model, tokenStr) {
  var defaultDateJson = JSON.stringify(dateStr);
  var defaultTokenJson = JSON.stringify(String(tokenStr || ''));
  var escapedHint = escapeHtml_(message || '');
  // AVATAR_BASE_URL: 末尾スラッシュなし。未設定時は '' → 画像なし（テキストのみ）
  var avatarBaseUrl = (PropertiesService.getScriptProperties().getProperty('AVATAR_BASE_URL') || '').replace(/\/$/, '');

  var css = [
    'body{font-family:system-ui,sans-serif;padding:0 16px 40px;max-width:480px;margin:0 auto;background:#fafafa;color:#1E293B;}',
    '#st{min-height:1.4em;padding:10px 0 2px;font-size:13px;color:#64748B;}',
    '.top{text-align:center;padding:16px 0 6px;}',
    '.dlbl{font-size:12px;color:#94A3B8;margin:0 0 2px;letter-spacing:.04em;}',
    '.mlbl{font-size:15px;font-weight:700;color:#1E293B;margin:0;}',
    '.donut-wrap{display:flex;justify-content:center;padding:8px 0 4px;}',
    '.donut-svg{width:160px;height:160px;}',
    '.dpct{font-size:30px;font-weight:900;fill:#1E293B;dominant-baseline:middle;text-anchor:middle;}',
    '.clbl{text-align:center;font-size:12px;color:#64748B;margin:2px 0 16px;}',
    'h2{font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.08em;margin:18px 0 8px;border-bottom:1px solid #E2E8F0;padding-bottom:4px;}',
    '.catsec,.tasksec{margin-bottom:4px;}',
    '.crow{margin-bottom:12px;}',
    '.cnr{display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:5px;}',
    '.cdot{width:10px;height:10px;border-radius:50%;flex-shrink:0;display:inline-block;}',
    '.cfrac{margin-left:auto;font-size:13px;font-weight:700;color:#1E293B;}',
    '.cbar{height:8px;border-radius:4px;background:#F1F5F9;overflow:hidden;display:flex;}',
    '.bd,.bn,.bu{height:100%;}',
    '.bn{background:#FECACA;}',
    '.bu{background:#E2E8F0;}',
    'ul{list-style:none;padding:0;margin:0;}',
    '.ti{padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:6px;border:1px solid #E2E8F0;background:#fff;display:flex;align-items:center;gap:8px;}',
    '.tlbl{flex:1;min-width:0;word-break:break-all;}',
    '.tbtn{border:none;border-radius:8px;padding:6px 11px;font-size:16px;cursor:pointer;background:#F1F5F9;color:#94A3B8;transition:background .12s,color .12s;line-height:1;min-width:38px;flex-shrink:0;}',
    '.tbtn.a-done{background:#059669;color:#fff;}',
    '.tbtn.a-nd{background:#DC2626;color:#fff;}',
    '.tbtn:disabled{opacity:.4;cursor:not-allowed;}',
    '.td{border-color:#A7F3D0;background:#F0FDF4;}',
    '.tn{border-color:#FECACA;background:#FEF2F2;}',
    '.tu{border-color:#E2E8F0;}',
    '.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;padding:8px 20px;border-radius:20px;font-size:13px;opacity:0;transition:opacity .3s;pointer-events:none;z-index:999;white-space:nowrap;}',
    '.toast.show{opacity:1;}',
    '.sec2{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin-top:4px;}',
    '.qt{font-size:14px;font-weight:700;color:#1E293B;margin:0 0 4px;line-height:1.6;}',
    '.qa{font-size:11px;color:#94A3B8;margin:0 0 10px;}',
    '.ch{display:flex;align-items:flex-start;gap:10px;margin:10px 0;}',
    '.ch.r{flex-direction:row-reverse;}',
    '.av{width:64px;height:64px;min-width:64px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#E2E8F0;}',
    '.bubble{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:8px 12px;font-size:13px;color:#334155;line-height:1.6;flex:1;}',
    '.ch.r .bubble{background:#EFF6FF;border-color:#BFDBFE;}',
    '.cn{font-size:10px;font-weight:700;color:#94A3B8;margin:0 0 2px;letter-spacing:.04em;}',
    '.dg{font-size:13px;color:#475569;margin:6px 0;line-height:1.6;}',
    '.footer{margin-top:28px;padding-top:14px;border-top:1px solid #E2E8F0;font-size:11px;color:#94A3B8;text-align:center;}',
    'a{color:#3B82F6;text-decoration:none;}',
  ].join('');

  var js = [
    '(function(){',
    'var D=' + defaultDateJson + ',T=' + defaultTokenJson + ',AV=' + JSON.stringify(avatarBaseUrl) + ',NS="http://www.w3.org/2000/svg";',
    'var root=document.getElementById("app"),stEl=document.getElementById("st");',
    'var qs=new URLSearchParams(window.location.search);',
    'var date=(qs.get("date")||"").trim()||D,token=(qs.get("token")||"").trim()||T;',
    'stEl.textContent="読み込み中…";while(root.firstChild)root.removeChild(root.firstChild);',
    'function h(tag,text,cls){var e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}',
    'function svgE(tag){return document.createElementNS(NS,tag);}',
    'function sa(el,k,v){el.setAttribute(k,v);}',
    // Color sanitizer
    'function sc(c){var s=String(c||"#94A3B8").trim();return/^(#[0-9a-fA-F]{3,8}|rgb[a]?\\([^)]*\\)|[a-zA-Z]{2,30})$/.test(s)?s:"#94A3B8";}',
    // Donut SVG builder (§3.5: segment = category task-count share)
    'function mkDonut(cats,total,pct){',
    '  var wrap=document.createElement("div");wrap.className="donut-wrap";wrap.id="donut-wrap";',
    '  var svg=svgE("svg");sa(svg,"viewBox","0 0 180 180");sa(svg,"class","donut-svg");',
    '  var circ=2*Math.PI*62,cum=0;',
    '  if(total>0&&cats&&cats.length){',
    '    for(var i=0;i<cats.length;i++){var cat=cats[i],sh=cat.total/total;',
    '      var c=svgE("circle");sa(c,"cx","90");sa(c,"cy","90");sa(c,"r","62");sa(c,"fill","none");',
    '      sa(c,"stroke",sc(cat.color));sa(c,"stroke-width","28");',
    '      sa(c,"stroke-dasharray",(sh*circ).toFixed(2)+" "+circ.toFixed(2));',
    '      sa(c,"stroke-dashoffset",(circ*(0.25-cum)).toFixed(2));',
    '      svg.appendChild(c);cum+=sh;}',
    '  }else{var bg=svgE("circle");sa(bg,"cx","90");sa(bg,"cy","90");sa(bg,"r","62");',
    '    sa(bg,"fill","none");sa(bg,"stroke","#E2E8F0");sa(bg,"stroke-width","28");svg.appendChild(bg);}',
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
    '    seg(cat.done/cat.total*100,"bd",cat.color);seg(cat.not_done/cat.total*100,"bn",null);seg(cat.unset/cat.total*100,"bu",null);',
    '    row.appendChild(bar);}',
    '  return row;',
    '}',
    // showToast
    'function showToast(msg){var t=document.getElementById("toast");if(!t)return;t.textContent=msg;t.className="toast show";setTimeout(function(){t.className="toast";},2500);}',
    // applyTaskStyle: li のクラスとボタンのアクティブ状態を同期
    'function applyTaskStyle(li,st){',
    '  li.className="ti "+(st==="done"?"td":st==="not_done"?"tn":"tu");',
    '  var btns=li.querySelectorAll(".tbtn");',
    '  for(var i=0;i<btns.length;i++){var s=btns[i].dataset.status;btns[i].className="tbtn"+(s===st?" "+(st==="done"?"a-done":"a-nd"):"");}',
    '}',
    // mkStatusBtn: closure-in-loop を避けるため独立関数
    'function mkStatusBtn(s,taskId,li){',
    '  var btn=document.createElement("button");btn.dataset.status=s;',
    '  btn.textContent=s==="done"?"◯":"✕";',
    '  btn.addEventListener("click",function(){onTaskToggle(taskId,s,li);});',
    '  return btn;',
    '}',
    // mkTaskRow: ◯/✕ ボタン付きタスク行を生成
    'function mkTaskRow(t){',
    '  var li=document.createElement("li");',
    '  li.dataset.taskId=t.task_id;li.dataset.status=t.status||"unset";',
    '  var lbl=document.createElement("span");lbl.className="tlbl";lbl.textContent=t.label;',
    '  li.appendChild(lbl);',
    '  li.appendChild(mkStatusBtn("done",t.task_id,li));',
    '  li.appendChild(mkStatusBtn("not_done",t.task_id,li));',
    '  applyTaskStyle(li,t.status||"unset");',
    '  return li;',
    '}',
    // onTaskToggle: 楽観的更新 → GAS RPC → 失敗時ロールバック
    'function onTaskToggle(taskId,newStatus,li){',
    '  var prevStatus=li.dataset.status;',
    '  if(prevStatus===newStatus)return;',
    '  var btns=li.querySelectorAll(".tbtn");',
    '  for(var i=0;i<btns.length;i++)btns[i].disabled=true;',
    '  li.dataset.status=newStatus;applyTaskStyle(li,newStatus);',
    '  google.script.run',
    '    .withSuccessHandler(function(res){',
    '      for(var i=0;i<btns.length;i++)btns[i].disabled=false;',
    '      if(!res||!res.ok){li.dataset.status=prevStatus;applyTaskStyle(li,prevStatus);showToast("更新に失敗しました");return;}',
    '      updateSummary(res);',
    '    })',
    '    .withFailureHandler(function(){',
    '      for(var i=0;i<btns.length;i++)btns[i].disabled=false;',
    '      li.dataset.status=prevStatus;applyTaskStyle(li,prevStatus);showToast("通信エラーが発生しました");',
    '    })',
    '    .updateTaskStatus(date,token,taskId,newStatus);',
    '}',
    // updateSummary: タスクトグル後にドーナツ・達成率・カテゴリを差分更新
    'function updateSummary(data){',
    '  var c=data.counts||{};',
    '  var moodEl=document.getElementById("mood-lbl");if(moodEl)moodEl.textContent=data.mood_message||"";',
    '  var clblEl=document.getElementById("clbl");',
    '  if(clblEl)clblEl.textContent="達成 "+(c.done||0)+" / 全体 "+(c.total||0)+"、未 "+(c.not_done||0)+"、未記入 "+(c.unset||0);',
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
    '  var clblP=h("p","達成 "+(c.done||0)+" / 全体 "+(c.total||0)+"、未 "+(c.not_done||0)+"、未記入 "+(c.unset||0),"clbl");clblP.id="clbl";frag.appendChild(clblP);',
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
    // mkChar: name, text, imgFile, isRight
    '  function mkChar(name,text,imgFile,isRight){',
    '    var row=document.createElement("div");row.className="ch"+(isRight?" r":"");',
    '    var avEl=document.createElement("div");avEl.className="av";',
    '    if(AV&&imgFile){',
    '      var img=document.createElement("img");',
    '      img.style.cssText="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;";',
    '      img.src=AV+"/"+imgFile;img.alt=name;',
    '      img.onerror=function(){this.style.display="none";};',
    '      avEl.appendChild(img);',
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
    'google.script.run.withSuccessHandler(paint).withFailureHandler(function(err){stEl.textContent="取得に失敗しました: "+(err&&err.message?err.message:String(err));}).getDashboardJsonForClient(date,token);',
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

  return HtmlService.createHtmlOutput(html);
}

function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * §6.1 / §6.2: ■2 生成のオーケストレーター（Gemini 優先 → 失敗時テンプレフォールバック）。
 * Quotes から名言を決定的に 1 件取得し、Gemini のプロンプト参照 + テンプレ両方で共用。
 * 個人タスク全文はプロンプトに載せない（SPEC §6.1 方針）。
 * 戻り値: { dto, textBlock }
 */
function buildSection2_(ss, todayStr, achievementPercent, moodMessage) {
  var quotesSheet = ss.getSheetByName('Quotes');
  var quotes = quotesSheet ? loadActiveQuotes_(quotesSheet) : [];
  var quoteText, attribution;
  if (quotes.length > 0) {
    var idx = dayHash_(todayStr) % quotes.length;
    quoteText = quotes[idx].text;
    attribution = quotes[idx].attribution || '';
  } else {
    quoteText = finalFallbackQuoteText_();
    attribution = '';
  }

  // §6.1: Gemini 試行
  var geminiResult = callGeminiSection2_(achievementPercent, moodMessage, quoteText, attribution);
  if (geminiResult.ok) {
    Logger.log('[section2] Gemini 成功');
    return buildSection2DtoAndBlock_(geminiResult.dto, '（Gemini）');
  }

  // §6.2: テンプレフォールバック
  Logger.log('[section2] Gemini 失敗 → テンプレ経路 reason=' + (geminiResult.error || 'unknown'));
  var avatars = pickAvatarsByPercent_(achievementPercent);
  var vars = {
    quote: quoteText,
    achievement_percent: String(achievementPercent),
    mood_message: moodMessage,
    attribution: attribution,
  };
  // §5.1 フォロートーン: 達成率の数値をセリフ冒頭で突き付けない。今日への励ましを軸にする。
  var ichisanTpl = '「{{quote}}」という言葉を胸に刻んでおくんじゃ、ヒロ子ちゃん。ワシも共に見守っておるぞ。';
  var hirokoTpl = '「{{quote}}」か〜、マジ刺さるじゃん！今日まだ時間あるし、あたし動くっしょ！';
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
    ichisan: ichisanText,
    hiroko: hirokoText,
    ichisan_image: avatars.ichisan_image,
    hiroko_image: avatars.hiroko_image,
  };
  return buildSection2DtoAndBlock_(dto, '（テンプレ）');
}

/** dto から LINE 用テキストブロックを組み立てるヘルパー */
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
 * §6.1: Gemini API で ■2 を生成。
 * 失敗時（キー未設定 / タイムアウト / HTTP エラー / JSON 不正 / 必須キー欠落）は
 * { ok: false, error } を返し、呼び出し元（buildSection2_）がテンプレに切り替える。
 *
 * スクリプトプロパティ: GEMINI_API_KEY（未設定なら即テンプレフォールバック）
 * プロンプトに個人タスク名・プライベート情報は含めない。
 */
function callGeminiSection2_(achievementPercent, moodMessage, quoteText, attribution) {
  var apiKey = (PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '').trim();
  if (!apiKey) return { ok: false, error: 'api_key_not_set' };

  var quoteRef = '「' + quoteText + '」' + (attribution ? '（' + attribution + '）' : '');
  var prompt = [
    'あなたはキャラクター対話の生成AIです。以下の口調ルールを一字一句厳守してセリフを書いてください。',
    '口調ルールに違反したセリフは絶対に出力しないでください。',
    '',
    CHAR_VOICE_RULES_,
    '',
    '▼ イチさんの口調 NG 例（絶対に使わない）:',
    '  NG: 「焦らず、まずは一歩踏み出すことが大切だよ」→ 「だよ」禁止',
    '  NG: 「まずは一歩を踏み出しましょう」→ 丁寧語禁止',
    '  NG: 「今日はここまでにしよう」→ 一人称「ワシ」なし・語尾不正',
    '  OK: 「焦りは禁物じゃ。まず一歩、踏み出すんじゃよ、ヒロ子ちゃん」',
    '  OK: 「ワシの経験上、こういうときこそ守りを固めるんじゃ」',
    '',
    '今日の状況（これだけを使うこと・個人情報は含まない）:',
    '  達成率: ' + achievementPercent + '%',
    '  今日のメッセージ: 「' + moodMessage + '」',
    '  参考名言: ' + quoteRef,
    '',
    'ルール:',
    '  - 各セリフは 1〜2 文（短め・簡潔に）',
    '  - 個人のタスク名・プライベート情報は出力しない',
    '  - イチさんは必ず「ワシ」を使い、語尾は必ず「〜じゃ／〜じゃな／〜のじゃ」で終わること',
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
        temperature: 0.7,
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
      ichisan: parsed.ichisan.trim(),
      hiroko: parsed.hiroko.trim(),
      ichisan_image: avatars.ichisan_image,
      hiroko_image: avatars.hiroko_image,
    },
  };
}

/** §4.4 Quotes: 必須列を検査し active=TRUE・text 非空のみ */
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
    list.push({
      text: text,
      attribution: h.indexOf('attribution') >= 0 ? String(row[h.indexOf('attribution')] || '').trim() : '',
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
  if (cell === null || cell === undefined) return 'unset';
  var s = String(cell).trim();
  if (s === '') return 'unset';
  if (s === '◯' || s === '○' || s === '〇' || s === '✓' || s === '✔') return 'done';
  if (s === '×' || s === '✕' || s === 'x' || s === 'X') return 'not_done';
  return 'unset';
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

function buildTaskLabelMap_(tasksSheet) {
  var rows = tasksSheet.getDataRange().getValues();
  var h = rows[0];
  var ixId = h.indexOf('task_id');
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
  for (var key in all) {
    var isToken = key.indexOf(DASH_TOKEN_PROP_PREFIX_) === 0;
    var isSent = key.indexOf('sent:') === 0;
    if (!isToken && !isSent) continue;
    var dateStr = isToken
      ? key.slice(DASH_TOKEN_PROP_PREFIX_.length)
      : key.slice('sent:'.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    if (new Date(dateStr).getTime() < cutoff) {
      props.deleteProperty(key);
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
    .create();
  Logger.log('[installCleanupTrigger] 週次クリーンアップトリガを登録しました。');
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
  var ciDate = dh.indexOf('date');
  var ciTask = dh.indexOf('task_id');
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
      toAppend.push([todayStr, mid, '', '']);
    }
  }

  if (toAppend.length === 0) return;

  var last = dailySheet.getLastRow();
  if (last < 1) last = 1;
  dailySheet.getRange(last + 1, 1, toAppend.length, 4).setValues(toAppend);
}
