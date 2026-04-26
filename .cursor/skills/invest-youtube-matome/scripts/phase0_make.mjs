#!/usr/bin/env node
/**
 * Phase 0 maker: Data API -> transcripts (yt-dlp) -> validate.
 *
 * Usage:
 *   YOUTUBE_API_KEY=... node scripts/phase0_make.mjs --window 2d --out phase0.json
 *
 * Outputs:
 * - phase0.raw.json  (data api only)
 * - phase0.json      (enriched)
 */

import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = { window: "2d", out: "phase0.json" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--window" && argv[i + 1]) out.window = argv[++i];
    else if (argv[i] === "--out" && argv[i + 1]) out.out = argv[++i];
  }
  return out;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", encoding: "utf8" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status);
}

const { window, out } = parseArgs(process.argv);
const raw = path.resolve(path.dirname(out), "phase0.raw.json");
const enriched = path.resolve(out);

run("node", [
  ".cursor/skills/invest-youtube-matome/scripts/phase0_fetch_youtube_data_api.mjs",
  "--window",
  window,
  "--out",
  raw,
]);

run("node", [
  ".cursor/skills/invest-youtube-matome/scripts/phase0_enrich_transcripts_ytdlp.mjs",
  "--in",
  raw,
  "--out",
  enriched,
]);

run("node", [
  ".cursor/skills/invest-youtube-matome/scripts/validate-phase0-json.mjs",
  "--file",
  enriched,
]);

console.log(`[OK] phase0 ready: ${enriched}`);

