#!/usr/bin/env node
/**
 * デプロイ完了通知（補助）
 *
 * Usage:
 *   node scripts/notify_deploy_complete.mjs --url https://example.surge.sh [--title "記事タイトル"]
 *
 * 既定の宛先: happyodyssey73@gmail.com（環境変数 DEPLOY_NOTIFY_TO で上書き可）
 *
 * 送信には Resend の API キーが必要:
 *   RESEND_API_KEY=re_xxxx
 *   RESEND_FROM="名前 <verified@yourdomain.com>" または Resend 側で許可された from
 *
 * キー未設定のときは送信をスキップし、手動メール用の文面を標準出力する（exit 0）。
 */

function parseArgs(argv) {
  const out = { url: null, title: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--url" && argv[i + 1]) out.url = argv[++i];
    else if (argv[i] === "--title" && argv[i + 1]) out.title = argv[++i];
  }
  return out;
}

const DEFAULT_TO = "happyodyssey73@gmail.com";

async function main() {
  const { url, title } = parseArgs(process.argv);
  if (!url) {
    console.error(
      "Usage: node scripts/notify_deploy_complete.mjs --url <公開URL> [--title <件名用テキスト>]"
    );
    process.exit(2);
  }

  const to = (process.env.DEPLOY_NOTIFY_TO || DEFAULT_TO).trim();
  const subjectBase = title ? `デプロイ完了: ${title}` : "デプロイ完了（invest-youtube-matome）";
  const html = `<p>次の URL で公開しました。</p><p><a href="${escapeHtml(
    url
  )}">${escapeHtml(url)}</a></p>`;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    console.log("[SKIP] RESEND_API_KEY / RESEND_FROM が無いためメール送信は行いません。");
    console.log("--- 手動で送る場合のコピー用 ---");
    console.log(`To: ${to}`);
    console.log(`Subject: ${subjectBase}`);
    console.log(`Body: ${url}`);
    console.log("---");
    console.log(
      "自動送信するには Resend で API キーと送信元を用意し、環境変数を設定してください（deploy-and-url.md 参照）。"
    );
    process.exit(0);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: subjectBase,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`[FAIL] Resend API: ${res.status} ${text}`);
    process.exit(1);
  }

  console.log(`[OK] 通知メール送信: ${to}`);
  try {
    const j = JSON.parse(text);
    if (j.id) console.log(`     id: ${j.id}`);
  } catch {
    /* ignore */
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
