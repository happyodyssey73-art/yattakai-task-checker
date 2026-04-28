#!/usr/bin/env node
/**
 * Reads seed/tasks.csv + seed/categories.csv and writes gas/SeedMaster.generated.gs
 * so GAS setupCategories_ / setupTasks_ share a single source of truth with CSV import.
 *
 * Usage: npm run sync:seed-gas
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/**
 * RFC-style minimal CSV parser (handles quoted fields and doubled quotes).
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
  }
  return rows;
}

function toBool(v) {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  return s === "TRUE" || s === "1" || s === "YES";
}

function readTable(relPath) {
  const raw = readFileSync(join(ROOT, relPath), "utf8");
  // Strip UTF-8 BOM if present
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return parseCsv(text);
}

function buildTasksValues(rows) {
  if (rows.length < 2) throw new Error("tasks.csv: need header + at least one data row");
  const header = rows[0].map((h) => String(h).trim());
  const idx = (name) => {
    const j = header.indexOf(name);
    if (j < 0) throw new Error(`tasks.csv: missing column "${name}"`);
    return j;
  };
  const iId = idx("task_id");
  const iTitle = idx("title");
  const iShort = idx("display_short");
  const iCat = idx("category_id");
  const iActive = idx("active");
  const iOrder = idx("sort_order");

  const data = rows.slice(1).map((r) => ({
    task_id: String(r[iId] ?? "").trim(),
    title: String(r[iTitle] ?? "").trim(),
    display_short: String(r[iShort] ?? "").trim(),
    category_id: String(r[iCat] ?? "").trim(),
    active: toBool(r[iActive]),
    sort_order: Number.parseInt(String(r[iOrder] ?? "").trim(), 10),
  }));

  for (const d of data) {
    if (!d.task_id) throw new Error("tasks.csv: empty task_id");
    if (Number.isNaN(d.sort_order)) throw new Error(`tasks.csv: invalid sort_order for ${d.task_id}`);
  }

  data.sort((a, b) => a.sort_order - b.sort_order || a.task_id.localeCompare(b.task_id));

  const out = [
    ["task_id", "title", "display_short", "category_id", "active", "sort_order"],
    ...data.map((d) => [d.task_id, d.title, d.display_short, d.category_id, d.active, d.sort_order]),
  ];
  return out;
}

function buildCategoriesValues(rows) {
  if (rows.length < 2) throw new Error("categories.csv: need header + at least one data row");
  const header = rows[0].map((h) => String(h).trim());
  const idx = (name) => {
    const j = header.indexOf(name);
    if (j < 0) throw new Error(`categories.csv: missing column "${name}"`);
    return j;
  };
  const iId = idx("category_id");
  const iName = idx("display_name");
  const iColor = idx("color");
  const iOrder = idx("sort_order");
  const iActive = idx("active");

  const data = rows.slice(1).map((r) => ({
    category_id: String(r[iId] ?? "").trim(),
    display_name: String(r[iName] ?? "").trim(),
    color: String(r[iColor] ?? "").trim(),
    sort_order: Number.parseInt(String(r[iOrder] ?? "").trim(), 10),
    active: toBool(r[iActive]),
  }));

  for (const d of data) {
    if (!d.category_id) throw new Error("categories.csv: empty category_id");
    if (Number.isNaN(d.sort_order)) throw new Error(`categories.csv: invalid sort_order for ${d.category_id}`);
  }

  data.sort((a, b) => a.sort_order - b.sort_order || a.category_id.localeCompare(b.category_id));

  const out = [
    ["category_id", "display_name", "color", "sort_order", "active"],
    ...data.map((d) => [d.category_id, d.display_name, d.color, d.sort_order, d.active]),
  ];
  return out;
}

function emitGasFile(categoriesValues, tasksValues) {
  const banner =
    "/**\n" +
    " * AUTO-GENERATED from seed/categories.csv and seed/tasks.csv\n" +
    " * Do not edit by hand. Regenerate: npm run sync:seed-gas\n" +
    " * @fileoverview Master rows for setupCategories_ / setupTasks_ (SpreadsheetApp upsert).\n" +
    " */\n";

  const body =
    "var CATEGORIES_MASTER_ = " +
    JSON.stringify(categoriesValues, null, 2) +
    ";\n\n" +
    "var TASKS_MASTER_ = " +
    JSON.stringify(tasksValues, null, 2) +
    ";\n";

  const outPath = join(ROOT, "gas", "SeedMaster.generated.gs");
  writeFileSync(outPath, banner + body, "utf8");
  return outPath;
}

const tasksRows = readTable("seed/tasks.csv");
const catRows = readTable("seed/categories.csv");
const tasksValues = buildTasksValues(tasksRows);
const categoriesValues = buildCategoriesValues(catRows);
const outPath = emitGasFile(categoriesValues, tasksValues);
console.log("Wrote", outPath);
console.log("Categories rows (incl. header):", categoriesValues.length);
console.log("Tasks rows (incl. header):", tasksValues.length);
