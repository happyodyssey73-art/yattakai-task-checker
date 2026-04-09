#!/usr/bin/env node
/**
 * yattakai-task-checker — タスク一覧・追加・完了切替・全体チェック
 *
 * 使い方:
 *   node src/cli.mjs              … 要約（未完了があれば終了コード 1）
 *   node src/cli.mjs list         … 一覧
 *   node src/cli.mjs add "件名"   … 追加
 *   node src/cli.mjs done <id>    … 完了にする
 *   node src/cli.mjs undone <id>  … 未完了に戻す
 *   node src/cli.mjs check        … 未完了のみ表示（CI 用・未完了なら 1）
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_FILE = join(__dirname, "..", "tasks.json");

function load() {
  if (!existsSync(TASKS_FILE)) {
    return { tasks: [] };
  }
  const raw = readFileSync(TASKS_FILE, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data.tasks)) {
    throw new Error("tasks.json の形式が不正です（tasks 配列が必要）");
  }
  return data;
}

function save(data) {
  writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function newId() {
  return randomBytes(4).toString("hex");
}

function summarize(data) {
  const total = data.tasks.length;
  const done = data.tasks.filter((t) => t.done).length;
  const open = total - done;
  return { total, done, open, incomplete: data.tasks.filter((t) => !t.done) };
}

function printSummary(s) {
  console.log(`タスク: ${s.done}/${s.total} 完了、未完了 ${s.open} 件`);
  if (s.open > 0) {
    console.log("\n未完了:");
    for (const t of s.incomplete) {
      console.log(`  [${t.id}] ${t.title}`);
    }
  }
}

function usage() {
  console.log(`yattakai-task-checker

コマンド:
  (なし) / status     要約表示。未完了があれば終了コード 1
  list                全タスク一覧
  add "<title>"       タスク追加
  done <id>           完了にする
  undone <id>         未完了に戻す
  check               未完了のみ表示（未完了があれば終了コード 1）

データ: ${TASKS_FILE}
`);
}

const argv = process.argv.slice(2);
const cmd = argv[0] === undefined || argv[0] === "status" ? "status" : argv[0];

try {
  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    usage();
    process.exit(0);
  }

  let data = load();

  if (cmd === "list") {
    if (data.tasks.length === 0) {
      console.log("タスクはありません。add で追加してください。");
      process.exit(0);
    }
    for (const t of data.tasks) {
      const mark = t.done ? "✓" : " ";
      console.log(`[${mark}] ${t.id}\t${t.title}`);
    }
    process.exit(0);
  }

  if (cmd === "add") {
    const title = argv.slice(1).join(" ").trim();
    if (!title) {
      console.error('使い方: node src/cli.mjs add "やること"');
      process.exit(1);
    }
    const id = newId();
    data.tasks.push({ id, title, done: false });
    save(data);
    console.log(`追加しました [${id}] ${title}`);
    process.exit(0);
  }

  if (cmd === "done" || cmd === "undone") {
    const id = argv[1];
    if (!id) {
      console.error(`使い方: node src/cli.mjs ${cmd} <id>`);
      process.exit(1);
    }
    const t = data.tasks.find((x) => x.id === id);
    if (!t) {
      console.error(`ID が見つかりません: ${id}`);
      process.exit(1);
    }
    t.done = cmd === "done";
    save(data);
    console.log(`${cmd === "done" ? "完了" : "未完了に戻しました"} [${id}] ${t.title}`);
    process.exit(0);
  }

  if (cmd === "check") {
    const s = summarize(data);
    if (s.open === 0) {
      console.log("すべて完了しています。");
      process.exit(0);
    }
    console.log(`未完了 ${s.open} 件:`);
    for (const t of s.incomplete) {
      console.log(`  [${t.id}] ${t.title}`);
    }
    process.exit(1);
  }

  if (cmd === "status") {
    const s = summarize(data);
    printSummary(s);
    process.exit(s.open > 0 ? 1 : 0);
  }

  console.error(`不明なコマンド: ${cmd}`);
  usage();
  process.exit(1);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
