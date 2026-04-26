#!/usr/bin/env node
/**
 * Phase 0 helper: enrich Phase0 JSON with transcript excerpts using yt-dlp.
 *
 * Input: Phase0 JSON created by phase0_fetch_youtube_data_api.mjs (or compatible)
 * Output: Updated Phase0 JSON with:
 * - video.evidence_grade bumped to transcript_auto when captions are available
 * - video.transcript_excerpts[] (2-3) extracted from subtitles with timestamps
 *
 * Usage:
 *   node scripts/phase0_enrich_transcripts_ytdlp.mjs --in phase0.json --out phase0.enriched.json
 *
 * Requirements:
 * - yt-dlp must be installed and available on PATH.
 *
 * Notes:
 * - We prefer auto captions (ja/en) if available. Official captions are not always detectable.
 * - Excerpts are short and meant for deep.html quoting; each excerpt should be <= 240 chars.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = { in: null, out: null, max_excerpts: 3 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--in" && argv[i + 1]) out.in = argv[++i];
    else if (argv[i] === "--out" && argv[i + 1]) out.out = argv[++i];
    else if (argv[i] === "--max-excerpts" && argv[i + 1]) out.max_excerpts = Number(argv[++i]);
  }
  return out;
}

function die(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exit(1);
}

function runYtDlpJson(url) {
  const r = spawnSync("yt-dlp", ["-J", "--skip-download", url], { encoding: "utf8" });
  if (r.error) throw new Error(`yt-dlp spawn error: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`yt-dlp failed (${r.status}): ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout);
}

function pickSubtitleTracks(info) {
  // Prefer Japanese subtitles; fallback English.
  // yt-dlp exposes subtitles (manual) and automatic_captions.
  const picks = [];
  const pushTracks = (obj, grade) => {
    if (!obj || typeof obj !== "object") return;
    for (const lang of ["ja", "ja-JP", "en"]) {
      const arr = obj[lang];
      if (Array.isArray(arr) && arr.length) {
        // Prefer .vtt if available
        const vtt = arr.find((t) => (t.ext || "").toLowerCase() === "vtt") || arr[0];
        if (vtt?.url) picks.push({ lang, url: vtt.url, grade });
      }
    }
  };
  pushTracks(info.subtitles, "transcript_official");
  pushTracks(info.automatic_captions, "transcript_auto");
  return picks;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch subtitle failed ${res.status}`);
  return await res.text();
}

function parseVtt(vttText) {
  // Minimal WebVTT parser: returns cues {start_sec, end_sec, text}
  const lines = vttText.replace(/\r\n/g, "\n").split("\n");
  const cues = [];
  let i = 0;
  const timeRe = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
  const toSec = (hh, mm, ss, ms) =>
    Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
  while (i < lines.length) {
    const line = lines[i].trim();
    const m = line.match(timeRe);
    if (!m) {
      i++;
      continue;
    }
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end = toSec(m[5], m[6], m[7], m[8]);
    i++;
    const texts = [];
    while (i < lines.length && lines[i].trim() !== "") {
      const t = lines[i].trim().replace(/<[^>]+>/g, "");
      if (t) texts.push(t);
      i++;
    }
    const text = texts.join(" ").replace(/\s+/g, " ").trim();
    if (text) cues.push({ start_sec: start, end_sec: end, text });
    i++;
  }
  return cues;
}

function buildExcerpts(cues, maxExcerpts) {
  // Heuristic: pick 2-3 excerpts from early/middle/late, merging nearby cues.
  if (!cues.length) return [];
  const merged = [];
  for (const c of cues) {
    const prev = merged[merged.length - 1];
    if (prev && c.start_sec - prev.end_sec <= 1.2) {
      prev.end_sec = c.end_sec;
      prev.text = `${prev.text} ${c.text}`.replace(/\s+/g, " ").trim();
    } else {
      merged.push({ ...c });
    }
  }

  const targets = [0.12, 0.45, 0.75];
  const out = [];
  for (const p of targets) {
    if (out.length >= maxExcerpts) break;
    const idx = Math.min(merged.length - 1, Math.floor(merged.length * p));
    // Find nearest cue with reasonable length
    let best = null;
    for (let k = 0; k < 20; k++) {
      const j = idx + (k % 2 === 0 ? k : -k);
      if (j < 0 || j >= merged.length) continue;
      const t = merged[j].text;
      if (t.length >= 25 && t.length <= 240) {
        best = merged[j];
        break;
      }
    }
    if (!best) {
      best = merged[idx];
    }
    const text = best.text.length > 240 ? best.text.slice(0, 240) : best.text;
    const start_sec = Math.max(0, Math.floor(best.start_sec));
    const end_sec = Math.max(start_sec, Math.floor(best.end_sec));
    out.push({ text, start_sec, end_sec });
  }

  // Deduplicate by same start_sec
  const uniq = [];
  const seen = new Set();
  for (const e of out) {
    const key = `${e.start_sec}:${e.text.slice(0, 30)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(e);
  }
  return uniq.slice(0, maxExcerpts);
}

async function main() {
  const { in: inPath, out: outPath, max_excerpts } = parseArgs(process.argv);
  if (!inPath || !outPath) {
    die("Usage: node scripts/phase0_enrich_transcripts_ytdlp.mjs --in phase0.json --out phase0.enriched.json");
  }
  const absIn = path.resolve(inPath);
  const absOut = path.resolve(outPath);
  if (!fs.existsSync(absIn)) die(`not found: ${absIn}`);
  const data = JSON.parse(fs.readFileSync(absIn, "utf8"));
  if (!Array.isArray(data.channels)) die("invalid phase0: channels[] missing");

  for (const ch of data.channels) {
    const v = ch?.video;
    if (!v || !v.url) continue;
    try {
      const info = runYtDlpJson(v.url);
      const tracks = pickSubtitleTracks(info);
      if (!tracks.length) {
        v.transcript_excerpts = [];
        v.evidence_grade = v.evidence_grade || "description_only";
        v.evidence_notes = (v.evidence_notes || "") + " / 字幕取得不可（yt-dlp）";
        continue;
      }
      const track = tracks[0]; // best available by preference order
      const vtt = await fetchText(track.url);
      const cues = parseVtt(vtt);
      const excerpts = buildExcerpts(cues, Math.min(3, Math.max(1, max_excerpts)));
      v.transcript_excerpts = excerpts.map((e) => ({
        text: e.text,
        start_sec: e.start_sec,
        end_sec: e.end_sec,
        grade: track.grade,
        notes: track.grade === "transcript_auto" ? "自動字幕の可能性あり（誤認識に注意）" : undefined,
      }));
      v.evidence_grade = track.grade;
      v.evidence_notes =
        track.grade === "transcript_auto"
          ? "自動字幕に基づく引用（誤認識の可能性あり）"
          : "公式字幕/提供字幕に基づく引用";
    } catch (e) {
      v.transcript_excerpts = [];
      v.evidence_grade = v.evidence_grade || "description_only";
      v.evidence_notes = (v.evidence_notes || "") + ` / 字幕取得エラー: ${String(e?.message || e)}`;
    }
  }

  fs.writeFileSync(absOut, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`[OK] wrote: ${absOut}`);
}

main().catch((e) => die(e?.stack || e?.message || String(e)));

