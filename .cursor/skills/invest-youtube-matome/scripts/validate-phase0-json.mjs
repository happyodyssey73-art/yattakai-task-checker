#!/usr/bin/env node
/**
 * Phase 0: research-prompt-youtube 返却 JSON の必須キー検査（足場）
 * Usage: node scripts/validate-phase0-json.mjs --file path/to/phase0.json
 */

import fs from "node:fs";
import path from "node:path";

const SKIP_REASONS = new Set([
  "no_market_video_in_window",
  "user_excluded",
  "fetch_failed",
  "parse_error",
]);

function parseArgs(argv) {
  const out = { file: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) out.file = argv[++i];
  }
  return out;
}

function main() {
  const { file } = parseArgs(process.argv);
  if (!file) {
    console.error("Usage: node scripts/validate-phase0-json.mjs --file <json>");
    process.exit(2);
  }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error(`[FAIL] not found: ${abs}`);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    console.error(`[FAIL] JSON parse: ${e.message}`);
    process.exit(1);
  }

  const errors = [];
  if (!data.as_of) errors.push("missing top-level as_of");
  if (data.video_window !== "2d" && data.video_window !== "7d") {
    errors.push(`video_window must be 2d or 7d, got: ${data.video_window}`);
  }
  if (!Array.isArray(data.channels)) errors.push("channels must be an array");

  for (let i = 0; i < (data.channels || []).length; i++) {
    const ch = data.channels[i];
    const p = `channels[${i}]`;
    if (!ch || typeof ch !== "object") {
      errors.push(`${p}: not an object`);
      continue;
    }
    if (typeof ch.included !== "boolean") errors.push(`${p}.included boolean required`);
    if (!ch.channel_handle) errors.push(`${p}.channel_handle required`);
    if (!ch.channel_url) errors.push(`${p}.channel_url required`);

    if (ch.included === true) {
      if (ch.video === null || ch.video === undefined) {
        if (!ch.skip_reason || !SKIP_REASONS.has(ch.skip_reason)) {
          errors.push(
            `${p}: video is null but skip_reason missing or invalid (allowed: ${[...SKIP_REASONS].join(", ")})`
          );
        }
      } else if (typeof ch.video === "object") {
        const v = ch.video;
        const vp = `${p}.video`;
        ["video_id", "url", "title", "published_at", "market_related", "evidence_grade"].forEach((k) => {
          if (v[k] === undefined || v[k] === null || v[k] === "") {
            errors.push(`${vp}.${k} required`);
          }
        });
        if (!Array.isArray(v.claim_candidates)) {
          errors.push(`${vp}.claim_candidates must be array`);
        }

        // deep.html 用の引用断片（任意だが、型があれば検査する）
        if (v.transcript_excerpts !== undefined) {
          if (!Array.isArray(v.transcript_excerpts)) {
            errors.push(`${vp}.transcript_excerpts must be array when present`);
          } else {
            if (v.transcript_excerpts.length > 3) {
              errors.push(`${vp}.transcript_excerpts max length is 3`);
            }
            for (let j = 0; j < v.transcript_excerpts.length; j++) {
              const ex = v.transcript_excerpts[j];
              const ep = `${vp}.transcript_excerpts[${j}]`;
              if (!ex || typeof ex !== "object") {
                errors.push(`${ep} not an object`);
                continue;
              }
              if (!ex.text || typeof ex.text !== "string") errors.push(`${ep}.text string required`);
              if (typeof ex.start_sec !== "number" || !Number.isFinite(ex.start_sec) || ex.start_sec < 0) {
                errors.push(`${ep}.start_sec non-negative number required`);
              }
              if (ex.end_sec !== undefined) {
                if (typeof ex.end_sec !== "number" || !Number.isFinite(ex.end_sec) || ex.end_sec < 0) {
                  errors.push(`${ep}.end_sec must be non-negative number when present`);
                }
              }
              if (!ex.grade || typeof ex.grade !== "string") errors.push(`${ep}.grade string required`);
            }
          }
        }
      }
    } else {
      if (ch.video != null) errors.push(`${p}: included false but video is not null`);
    }
  }

  if (!data.trends || typeof data.trends !== "object") {
    errors.push("trends object required (may be empty keys)");
  }

  if (errors.length) {
    for (const e of errors) console.error(`[FAIL] ${e}`);
    process.exit(1);
  }
  console.log(`[OK] ${abs}`);
  process.exit(0);
}

main();
