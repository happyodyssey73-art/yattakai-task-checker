#!/usr/bin/env node
/**
 * invest-youtube-matome: 生成HTMLの機械チェック（補助）
 * Usage: node scripts/check_invest_youtube_matome.mjs --file path/to/page.html [--mode compact|deep]
 */

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = { file: null, mode: "compact" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) out.file = argv[++i];
    else if (argv[i] === "--mode" && argv[i + 1]) out.mode = argv[++i];
  }
  return out;
}

function readHtml(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function stripAsideDevonly(html) {
  return html.replace(/<aside\b[^>]*\biyt-devonly\b[^>]*>[\s\S]*?<\/aside>/gi, "");
}

function stripDataIytQuoteSpans(html) {
  return html.replace(/<span\b[^>]*\bdata-iyt-quote=["']1["'][^>]*>[\s\S]*?<\/span>/gi, "");
}

function prepareForMetaScan(html) {
  return stripAsideDevonly(stripHtmlComments(html));
}

function prepareForBuyScan(html) {
  let s = stripHtmlComments(html);
  s = stripAsideDevonly(s);
  s = s.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "");
  s = stripDataIytQuoteSpans(s);
  return s;
}

const META_PATTERNS = [/サブエージェント/, /本ページ作成時点/, /一次確認まで至っていない/, /WebSearchでは/];

const BUY_ADVICE_PATTERNS = [/いま買い/, /今すぐ買/, /全ツッパ/, /全ツ\b/, /絶対に上がる/];

function extractCharacterDialogueInner(html) {
  const re = /<section\b[^>]*\bid=["']iyt-character-dialogue["'][^>]*>([\s\S]*?)<\/section>/i;
  const m = html.match(re);
  return m ? m[1] : null;
}

function stripTagsForTextProbe(s) {
  return s
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function checkDeep(html, issues, warns) {
  const metaBody = prepareForMetaScan(html);
  const ids = [
    "iyt-deep-header",
    "iyt-deep-channel-cards",
    "iyt-deep-clusters",
    "iyt-deep-verify-map",
    "iyt-deep-footer",
  ];
  for (const id of ids) {
    if (!new RegExp(`\\bid=["']${id}["']`, "i").test(html)) {
      issues.push(`deep: id=${id} がありません（html-deep-template.md）。`);
    }
  }
  if (!/youtube\.com\/watch\?v=/.test(html) && !/youtu\.be\//.test(html)) {
    issues.push("YouTube: watch または youtu.be のリンクが見つかりません。");
  }
  if (!/自己責任|自己の責任/.test(html) || !/投資助言ではありません|投資助言ではない|助言ではありません/.test(html)) {
    issues.push("免責: 「自己責任」および「投資助言ではない」相当の表現が見つかりません。");
  }
  if (!/data-iyt-quote=["']1["']/.test(html)) {
    warns.push("deep: data-iyt-quote の引用がまだ少ない可能性があります。");
  }
  if (!/lucide\.createIcons\s*\(/.test(html)) {
    warns.push("Lucide: lucide.createIcons() が見つかりません。");
  }
  for (const re of META_PATTERNS) {
    if (re.test(metaBody)) issues.push(`公開ノイズ: 製作メタっぽい表現にマッチ: ${re.source}`);
  }
  const buyBody = prepareForBuyScan(html);
  for (const re of BUY_ADVICE_PATTERNS) {
    if (re.test(buyBody)) warns.push(`売買表現ヒット: ${re.source}`);
  }
}

function checkCompact(html, issues, warns) {
  const metaBody = prepareForMetaScan(html);
  const buyBody = prepareForBuyScan(html);

  if (!/自己責任|自己の責任/.test(html) || !/投資助言ではありません|投資助言ではない|助言ではありません/.test(html)) {
    issues.push("免責: 「自己責任」および「投資助言ではない」相当の表現が見つかりません。");
  }
  if (!/youtube\.com\/(watch\?v=|@)/i.test(html) && !/youtu\.be\//i.test(html)) {
    issues.push("YouTube: watch または @ のリンクが見つかりません。");
  }
  if (!/<table\b/i.test(html) && !/role=["']table["']/i.test(html)) {
    warns.push("比較表: <table> または role=table が見つかりません。");
  }
  if (!/\bid=["']iyt-my-strategy["']/.test(html)) {
    issues.push("My Strategy: id=iyt-my-strategy のブロックが見つかりません。");
  }
  if (!/\bid=["']iyt-read-path["']/.test(html)) {
    issues.push("読みレール: id=iyt-read-path がありません。");
  }
  if (!/\bid=["']iyt-executive["']/.test(html)) {
    issues.push("Executive strip: id=iyt-executive が見つかりません。");
  }
  if (!/\bid=["']iyt-dual-signal["']/.test(html)) {
    issues.push("二重信号機: id=iyt-dual-signal が見つかりません。");
  }
  const dialogueInner = extractCharacterDialogueInner(html);
  if (!dialogueInner) {
    issues.push("キャラ対話: id=iyt-character-dialogue の <section> がありません。");
  } else {
    const probe = stripTagsForTextProbe(dialogueInner);
    if (!/ヒロ子/.test(probe)) issues.push("キャラ対話: 「ヒロ子」の表記がありません。");
    if (!/イチさん/.test(probe) && !/\bワシ\b/.test(probe)) {
      issues.push("キャラ対話: イチさん側の表記がありません。");
    }
  }
  const idxDialogue = html.search(/\bid=["']iyt-character-dialogue["']/i);
  const idxStrategy = html.search(/\bid=["']iyt-my-strategy["']/i);
  if (idxDialogue >= 0 && idxStrategy >= 0 && idxDialogue > idxStrategy) {
    issues.push("キャラ対話: id=iyt-character-dialogue が id=iyt-my-strategy より後ろです。");
  }
  if (!/保存されません|保存されない|ローカルに保存/.test(html)) {
    warns.push("My Strategy: 「保存されない」相当の注記が見つかりません。");
  }
  if (!/直近2日|直近7日|2d|7d/.test(html)) {
    warns.push("鮮度: 「直近2日/直近7日」等の窓明示が弱い可能性があります。");
  }
  if (/自動字幕/.test(html) && !/(誤認識|限界|注意)/.test(html)) {
    warns.push("自動字幕: 注意文が弱い可能性があります。");
  }
  if (!/前提ズレ|本音の対立/.test(html)) {
    warns.push("不一致ラベル: 「前提ズレ」「本音の対立」が見つかりません。");
  }
  if (!/<main\b/i.test(html)) warns.push("レイアウト: <main> が見つかりません。");
  if (!/\bsection-card\b/.test(html)) warns.push("レイアウト: class=section-card が見つかりません。");
  if (!/lucide\.createIcons\s*\(/.test(html)) warns.push("Lucide: lucide.createIcons() が見つかりません。");
  if (/\biyt-devonly\b/.test(metaBody)) {
    issues.push("公開本文: iyt-devonly が残っています。");
  }
  for (const re of META_PATTERNS) {
    if (re.test(metaBody)) issues.push(`公開ノイズ: ${re.source}`);
  }
  for (const re of BUY_ADVICE_PATTERNS) {
    if (re.test(buyBody)) warns.push(`売買表現ヒット: ${re.source}`);
  }
}

function main() {
  const { file, mode } = parseArgs(process.argv);
  if (!file) {
    console.error("Usage: node scripts/check_invest_youtube_matome.mjs --file <html> [--mode compact|deep]");
    process.exit(2);
  }
  const html = readHtml(path.resolve(file));
  const issues = [];
  const warns = [];
  if (mode === "deep") checkDeep(html, issues, warns);
  else checkCompact(html, issues, warns);
  for (const w of warns) console.warn(`[WARN] ${w}`);
  if (issues.length) {
    for (const e of issues) console.error(`[FAIL] ${e}`);
    process.exit(1);
  }
  console.log(`[OK] ${path.resolve(file)}`);
}

main();
