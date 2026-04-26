#!/usr/bin/env node
/**
 * Phase 0 helper: fetch latest videos per channel via YouTube Data API v3.
 *
 * Goal:
 * - For each channel (@handle URL), find up to N latest uploads, pick the first "market_related"
 *   candidate within window (2d/7d) based on title/description heuristics.
 * - Emit Phase0-ish JSON (research-prompt-youtube.md compatible) WITHOUT transcript_excerpts yet.
 *
 * Usage:
 *   YOUTUBE_API_KEY=... node scripts/phase0_fetch_youtube_data_api.mjs --window 2d --asof "2026-04-25T23:30:00+09:00" --out phase0.json
 *
 * Notes:
 * - This script does not require OAuth; API key is enough for public data.
 * - Transcript fetching is handled by a separate yt-dlp step.
 */

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = {
    window: "2d",
    asof: null,
    out: null,
    max_backtrack: 5,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--window" && argv[i + 1]) out.window = argv[++i];
    else if (a === "--asof" && argv[i + 1]) out.asof = argv[++i];
    else if (a === "--out" && argv[i + 1]) out.out = argv[++i];
    else if (a === "--max-backtrack" && argv[i + 1]) out.max_backtrack = Number(argv[++i]);
  }
  return out;
}

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function isoNowJst() {
  // JST = UTC+9
  const now = new Date();
  const ms = now.getTime() + 9 * 60 * 60 * 1000;
  const j = new Date(ms);
  const yyyy = j.getUTCFullYear();
  const mm = String(j.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(j.getUTCDate()).padStart(2, "0");
  const hh = String(j.getUTCHours()).padStart(2, "0");
  const mi = String(j.getUTCMinutes()).padStart(2, "0");
  const ss = String(j.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`;
}

function windowMs(video_window) {
  if (video_window === "2d") return 2 * 24 * 60 * 60 * 1000;
  if (video_window === "7d") return 7 * 24 * 60 * 60 * 1000;
  throw new Error(`window must be 2d or 7d, got: ${video_window}`);
}

function withinWindow(publishedAtIso, asOfIso, video_window) {
  const asOf = new Date(asOfIso);
  const pub = new Date(publishedAtIso);
  const dt = asOf.getTime() - pub.getTime();
  return dt >= 0 && dt <= windowMs(video_window);
}

function isProbablyMarketVideo(title, description) {
  const t = `${title || ""} ${description || ""}`.toLowerCase();
  // Positive keywords (JP/EN)
  const pos = [
    "日経",
    "ダウ",
    "nasdaq",
    "s&p",
    "sp500",
    "米株",
    "日本株",
    "為替",
    "ドル円",
    "金利",
    "frb",
    "fed",
    "日銀",
    "cpi",
    "pce",
    "雇用統計",
    "決算",
    "インフレ",
    "景気",
    "利下げ",
    "利上げ",
    "相場",
    "市場",
    "株",
    "債券",
    "原油",
    "金",
    "ビットコイン",
    "btc",
  ];
  const neg = [
    "雑談",
    "告知",
    "ライブ告知",
    "質問コーナー",
    "メンバーシップ",
    "登録",
    "shorts",
    "#shorts",
  ];
  const hasPos = pos.some((k) => t.includes(k.toLowerCase()));
  const hasNeg = neg.some((k) => t.includes(k.toLowerCase()));
  return hasPos && !hasNeg;
}

async function apiGet(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function resolveChannelId(apiKey, channelUrl) {
  // Try handle extraction from /@handle
  const m = channelUrl.match(/youtube\.com\/@([^/?#]+)/i);
  const handle = m ? `@${m[1]}` : null;
  if (!handle) throw new Error(`Cannot extract handle from URL: ${channelUrl}`);

  // YouTube Data API: search for channel by q=handle (best-effort).
  // Note: There is no perfect handle->channelId endpoint without OAuth in older APIs,
  // but search(type=channel) is workable for our fixed list.
  const q = encodeURIComponent(handle);
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=5&q=${q}&key=${encodeURIComponent(apiKey)}`;
  const j = await apiGet(url);
  const items = Array.isArray(j.items) ? j.items : [];
  if (!items.length) throw new Error(`Channel not found for handle: ${handle}`);

  // Pick the one whose channelTitle contains handle-ish? fallback first.
  const best =
    items.find((it) => (it?.snippet?.channelTitle || "").toLowerCase().includes(m[1].toLowerCase())) ||
    items[0];
  const channelId = best?.snippet?.channelId || best?.id?.channelId;
  if (!channelId) throw new Error(`Missing channelId for handle: ${handle}`);
  return { handle, channelId };
}

async function listLatestUploads(apiKey, channelId, maxResults) {
  // Use search endpoint to list videos ordered by date for channel.
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(
      channelId
    )}&type=video&order=date&maxResults=${encodeURIComponent(String(maxResults))}&key=${encodeURIComponent(apiKey)}`;
  const j = await apiGet(url);
  const items = Array.isArray(j.items) ? j.items : [];
  return items
    .map((it) => {
      const videoId = it?.id?.videoId;
      const sn = it?.snippet || {};
      return {
        video_id: videoId,
        title: sn.title || "",
        description: sn.description || "",
        published_at: sn.publishedAt || null,
        channel_title: sn.channelTitle || "",
      };
    })
    .filter((x) => x.video_id && x.published_at);
}

async function buildPhase0() {
  const { window, asof, out, max_backtrack } = parseArgs(process.argv);
  const apiKey = mustEnv("YOUTUBE_API_KEY");
  const as_of = asof || isoNowJst();

  const channelsMd = fs.readFileSync(
    path.resolve(".cursor/skills/invest-youtube-matome/references/channels.md"),
    "utf8"
  );
  const urls = [...channelsMd.matchAll(/https:\/\/www\.youtube\.com\/@[^\s|)]+/g)].map((m) => m[0]);
  if (!urls.length) throw new Error("No channel URLs found in references/channels.md");

  const channels = [];
  for (const channel_url of urls) {
    const entry = {
      channel_handle: null,
      channel_url,
      included: true,
      skip_reason: null,
      video: null,
    };
    try {
      const { handle, channelId } = await resolveChannelId(apiKey, channel_url);
      entry.channel_handle = handle;
      const uploads = await listLatestUploads(apiKey, channelId, Math.max(1, max_backtrack));
      const picked = uploads.find((v) => {
        if (!withinWindow(v.published_at, as_of, window)) return false;
        return isProbablyMarketVideo(v.title, v.description);
      });
      if (!picked) {
        entry.skip_reason = "no_market_video_in_window";
        entry.video = null;
      } else {
        entry.video = {
          video_id: picked.video_id,
          url: `https://www.youtube.com/watch?v=${picked.video_id}`,
          title: picked.title,
          published_at: picked.published_at,
          market_related: true,
          evidence_grade: "description_only",
          evidence_notes: "Phase0: Data APIで動画特定。字幕/引用は後段（yt-dlp）で補完。",
          transcript_excerpts: [],
          claim_candidates: [],
        };
      }
    } catch (e) {
      entry.channel_handle = entry.channel_handle || channel_url;
      entry.skip_reason = "fetch_failed";
      entry.video = null;
      entry.fetch_error = String(e?.message || e);
    }
    channels.push(entry);
  }

  const phase0 = {
    as_of,
    video_window: window,
    channels,
    trends: { x_themes: [], google_trends_keywords: [] },
  };

  const s = JSON.stringify(phase0, null, 2) + "\n";
  if (out) fs.writeFileSync(path.resolve(out), s, "utf8");
  else process.stdout.write(s);
}

buildPhase0().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});

