#!/usr/bin/env node
/**
 * invest-youtube-matome: 生成HTMLの機械チェック（補助）
 * Usage: node scripts/check_invest_youtube_matome.mjs --file path/to/page.html
 *
 * 必須 id: iyt-read-path, iyt-executive, iyt-dual-signal, iyt-character-dialogue, iyt-my-strategy（html-compact-template.md）
 *
 * 公開本文領域: HTML コメント除去後。`data-iyt-quote="1"` の span 内は売買語スキャンから除外。
 * 製作メタスキャン: 同上＋ `aside.iyt-devonly` ブロック除去後。
 */

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = { file: null, mode: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) {
      out.file = argv[++i];
    } else if (argv[i] === "--mode" && argv[i + 1]) {
      out.mode = argv[++i];
    }
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

/** 引用ラッパ（平文のみネスト禁止推奨）。内側は売買ヒューリスティックから除外 */
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

const META_PATTERNS = [
  /サブエージェント/,
  /本ページ作成時点/,
  /一次確認まで至っていない/,
  /WebSearchでは/,
];

const BUY_ADVICE_PATTERNS = [
  /いま買い/,
  /今すぐ買/,
  /全ツッパ/,
  /全ツ\b/,
  /絶対に上がる/,
];

/** `id="iyt-character-dialogue"` の section 内側（機械チェック用） */
function extractCharacterDialogueInner(html) {
  const re =
    /<section\b[^>]*\bid=["']iyt-character-dialogue["'][^>]*>([\s\S]*?)<\/section>/i;
  const m = html.match(re);
  return m ? m[1] : null;
}

function stripTagsForTextProbe(s) {
  return s
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function extractImgSrcs(html) {
  const out = [];
  const re = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function resolveAssetPath(htmlFileAbs, assetRelOrAbs) {
  if (!assetRelOrAbs) return null;
  if (/^(https?:)?\/\//i.test(assetRelOrAbs)) return null;
  if (/^data:/i.test(assetRelOrAbs)) return null;
  const baseDir = path.dirname(htmlFileAbs);
  return path.resolve(baseDir, assetRelOrAbs);
}

function checkCharacterImageAssets(htmlFileAbs, html, issues, warns) {
  const srcs = extractImgSrcs(html);
  const charSrcs = srcs.filter((s) => /^assets\/characters\//.test(s));
  if (!charSrcs.length) return;

  for (const src of charSrcs) {
    const abs = resolveAssetPath(htmlFileAbs, src);
    if (!abs) continue;
    if (!fs.existsSync(abs)) {
      issues.push(`キャラ画像: 参照先が存在しません: ${src}`);
      continue;
    }
    if (!/\.(png|svg|webp|jpg|jpeg)$/i.test(src)) {
      warns.push(`キャラ画像: 拡張子が想定外です（png 推奨）: ${src}`);
    }
  }
}

function hasOpenIytChatSurface(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].isChatSurface) return true;
  }
  return false;
}

function checkChatSurfaceScope(html, warns) {
  // `.iyt-chat-row` が存在するのに、祖先に `.iyt-chat-surface` が無いと UI が崩れやすい（丸縁・左右固定・吹き出し色が外れる）
  const tagRe = /<\/?[a-zA-Z][a-zA-Z0-9-]*\b[^>]*>/g;
  const stack = [];
  let m;

  const getTagName = (tag) => {
    const mm = tag.match(/^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/);
    return mm ? mm[1].toLowerCase() : null;
  };
  const isClosing = (tag) => /^<\s*\//.test(tag);
  const isSelfClosing = (tag) => /\/>\s*$/.test(tag);
  const getClassAttr = (tag) => {
    const mm = tag.match(/\bclass=["']([^"']+)["']/i);
    return mm ? mm[1] : "";
  };

  while ((m = tagRe.exec(html))) {
    const tag = m[0];
    const name = getTagName(tag);
    if (!name) continue;

    if (isClosing(tag)) {
      // 素朴に1つpop（本HTMLは整形されている前提）
      stack.pop();
      continue;
    }

    const cls = getClassAttr(tag);
    const hasChatSurface = /\biyt-chat-surface\b/.test(cls);
    const hasChatRow = /\biyt-chat-row\b/.test(cls);
    const hasIytDialogue = /\bid=["']iyt-character-dialogue["']/.test(tag);

    stack.push({ name, isChatSurface: hasChatSurface || (hasIytDialogue && /\biyt-chat-surface\b/.test(cls)) });

    if (hasChatRow && !hasOpenIytChatSurface(stack)) {
      warns.push(
        "会話UI: .iyt-chat-row が .iyt-chat-surface の外にあります（丸縁・左右固定・吹き出し色が崩れます）。"
      );
      // 1回出れば十分
      break;
    }

    if (isSelfClosing(tag)) stack.pop();
  }
}

function main() {
  const { file, mode } = parseArgs(process.argv);
  if (!file) {
    console.error(
      "Usage: node scripts/check_invest_youtube_matome.mjs --file <html> [--mode compact|deep]"
    );
    process.exit(2);
  }

  const htmlFileAbs = path.resolve(file);
  const html = readHtml(htmlFileAbs);
  const issues = [];
  const warns = [];
  const metaBody = prepareForMetaScan(html);
  const buyBody = prepareForBuyScan(html);

  const inferredMode =
    mode ||
    (/\bdeep\.html\b/i.test(file) ? "deep" : "compact");
  if (inferredMode !== "compact" && inferredMode !== "deep") {
    issues.push(`mode: invalid --mode (expected compact|deep), got: ${inferredMode}`);
  }

  const hasSelf = /自己責任|自己の責任/.test(html);
  const hasNotAdvice = /投資助言ではありません|投資助言ではない|助言ではありません/.test(html);
  if (!hasSelf || !hasNotAdvice) {
    issues.push("免責: 「自己責任」および「投資助言ではない」相当の表現が見つかりません。");
  }

  if (!/youtube\.com\/(watch\?v=|@)/i.test(html) && !/youtu\.be\//i.test(html)) {
    issues.push("YouTube: watch または @ のリンクが見つかりません。");
  }

  if (inferredMode === "compact") {
    if (!/<table\b/i.test(html) && !/role=["']table["']/i.test(html)) {
      warns.push(
        "比較表: <table> または role=table が見つかりません（divグリッドのみの場合は手動確認）。"
      );
    }
  }

  if (inferredMode === "compact") {
    if (!/\bid=["']iyt-my-strategy["']/.test(html)) {
      issues.push(
        "My Strategy: id=iyt-my-strategy のブロックが見つかりません（html-compact-template 準拠）。"
      );
    }
  }

  if (inferredMode === "compact") {
    if (!/\bid=["']iyt-read-path["']/.test(html)) {
      issues.push(
        "読みレール: id=iyt-read-path（まず読む3つ）がありません。exemplar.md・html-structure.md 準拠で表より上に置いてください。"
      );
    }

    if (!/\bid=["']iyt-executive["']/.test(html)) {
      issues.push("Executive strip: id=iyt-executive が見つかりません（compact 必須）。");
    }

    if (!/\bid=["']iyt-dual-signal["']/.test(html)) {
      issues.push("二重信号機: id=iyt-dual-signal が見つかりません（compact 必須）。");
    }
  } else if (inferredMode === "deep") {
    // deep.html 必須 id（references/html-deep-template.md）
    const deepIds = [
      "iyt-deep-header",
      "iyt-deep-channel-cards",
      "iyt-deep-clusters",
      "iyt-deep-verify-map",
      "iyt-deep-footer",
    ];
    for (const id of deepIds) {
      if (!new RegExp(`\\bid=[\"']${id}[\"']`).test(html)) {
        issues.push(`deep: required id missing: ${id}`);
      }
    }
    // deep は引用が主役なので、最低でも1つは引用ラッパがあること（無ければ深掘りにならない）
    if (!/\bdata-iyt-quote=["']1["']/.test(html)) {
      warns.push("deep: data-iyt-quote が見つかりません（引用が無い deep になっています）。");
    }
  }

  const dialogueInner = extractCharacterDialogueInner(html);
  if (inferredMode === "compact") {
    if (!dialogueInner) {
      issues.push(
        "キャラ対話: id=iyt-character-dialogue の <section> がありません（html-character-dialogue.md・exemplar.md 準拠）。"
      );
    } else {
      const probe = stripTagsForTextProbe(dialogueInner);
      if (!/ヒロ子/.test(probe)) {
        issues.push(
          "キャラ対話: ブロック内に「ヒロ子」の表記がありません（ラベルまたは本文で明示してください）。"
        );
      }
      if (!/イチさん/.test(probe) && !/\bワシ\b/.test(probe)) {
        issues.push(
          "キャラ対話: イチさん側の表記がありません（「イチさん:」ラベル、または一人称「ワシ」を本文に含めてください）。"
        );
      }
    }
  }

  if (inferredMode === "compact") {
    const idxDialogue = html.search(/\bid=["']iyt-character-dialogue["']/i);
    const idxStrategy = html.search(/\bid=["']iyt-my-strategy["']/i);
    if (idxDialogue >= 0 && idxStrategy >= 0 && idxDialogue > idxStrategy) {
      issues.push(
        "キャラ対話: id=iyt-character-dialogue が id=iyt-my-strategy より後ろにあります（My Strategy より上に移してください）。"
      );
    }
  }

  if (inferredMode === "compact") {
    if (!/保存されません|保存されない|ローカルに保存/.test(html)) {
      warns.push("My Strategy: 「保存されない」相当の注記が見つかりません。");
    }
  }

  if (!/直近2日|直近7日|2d|7d/.test(html)) {
    warns.push("鮮度: 「直近2日/直近7日」等の窓明示が弱い可能性があります。");
  }

  if (/自動字幕/.test(html) && !/(誤認識|限界|注意)/.test(html)) {
    warns.push("自動字幕: 言及があるのに「誤認識」「限界」「注意」のいずれも見つかりません。");
  }

  if (!/前提ズレ|本音の対立/.test(html)) {
    warns.push("不一致ラベル: 「前提ズレ」「本音の対立」が見つかりません（該当クラスタが無い場合はスキップ可）。");
  }

  if (!/<main\b/i.test(html)) {
    warns.push("レイアウト: <main> が見つかりません（html-structure.md 推奨）。");
  }

  if (!/\bsection-card\b/.test(html)) {
    warns.push("レイアウト: class=section-card のブロックが見つかりません（html-structure.md 推奨）。");
  }

  if (!/lucide\.createIcons\s*\(/.test(html)) {
    warns.push("Lucide: lucide.createIcons() が見つかりません（html-structure.md 推奨）。");
  }

  // 会話UI/キャラ画像は compact では重要。deep でもあってよいが必須ではない（deep は引用が主役）
  if (inferredMode === "compact") {
    checkChatSurfaceScope(html, warns);
    checkCharacterImageAssets(htmlFileAbs, html, issues, warns);
  }

  if (/\biyt-devonly\b/.test(metaBody)) {
    issues.push("公開本文: iyt-devonly クラスが本文領域に残っています（開発用 aside 以外への使用禁止）。");
  }

  for (const re of META_PATTERNS) {
    if (re.test(metaBody)) {
      issues.push(`公開ノイズ: 製作メタっぽい表現にマッチ: ${re.source}`);
    }
  }

  for (const re of BUY_ADVICE_PATTERNS) {
    if (re.test(buyBody)) {
      warns.push(`売買表現ヒット（引用span・blockquote外）: ${re.source} — 引用外の断定でないか確認してください。`);
    }
  }

  for (const w of warns) {
    console.warn(`[WARN] ${w}`);
  }
  if (issues.length) {
    for (const e of issues) {
      console.error(`[FAIL] ${e}`);
    }
    process.exit(1);
  }

  console.log(`[OK] ${htmlFileAbs}`);
  process.exit(0);
}

main();
