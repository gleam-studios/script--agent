#!/usr/bin/env node
/**
 * 启发式提取每集「集尾卡点类型」与「### 集尾」块（非完整 parser）。
 */

import fs from "fs";
import path from "path";

function usage() {
  console.log(`usage: node hook-tail-list.mjs --dir DIR [--format md|csv]
       node hook-tail-list.mjs --file PATH [--format md|csv]

  --dir DIR      扫描目录下所有 .md
  --file PATH    单文件
  --format md|csv   默认 md

局限：依赖标题字面「### 集尾」「本集集尾卡点类型」；模板占位符「第[集数]集」则 episode 显示为 ?。
  acts 列：统计「#### 幕」标题出现次数（与主控集-场-幕规则对齐）。
`);
}

function countActHeadings(text) {
  const m = text.match(/^####\s*幕(?:\s|$|\d)/gm);
  return m ? m.length : 0;
}

function listMdFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(dir, f));
}

function extractEpisodeNo(text) {
  const m = text.match(/^##\s*第\s*(\d+)\s*集\s*$/m);
  if (m) return m[1];
  if (/第\[集数\]集/.test(text)) return "?";
  return "?";
}

function extractCliffhangerType(text) {
  const m = text.match(/\*\*本集集尾卡点类型\*\*\s*[:：]\s*(.+)$/m);
  if (m) return m[1].trim();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.includes("本集集尾卡点类型")) {
      const idx = line.indexOf("本集集尾卡点类型");
      const tail = line.slice(idx);
      const parts = tail.split(/[:：]/);
      if (parts.length >= 2) {
        return parts
          .slice(1)
          .join("：")
          .replace(/^\s*\[|\]\s*$/g, "")
          .replace(/\*\*/g, "")
          .trim();
      }
    }
  }
  return "";
}

function sectionAfterHeading(text, headingLine) {
  const re = new RegExp(`^${headingLine}\\s*$`, "m");
  const m = text.match(re);
  if (!m || m.index === undefined) return "";
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(/\n###\s+/);
  const block = next === -1 ? rest : rest.slice(0, next);
  return block.replace(/^\s*\n/, "").trim();
}

function extractTailSection(text) {
  const finalTail = sectionAfterHeading(text, "### 集尾");
  if (finalTail) return finalTail;
  return sectionAfterHeading(text, "### 集尾卡点");
}

function preview(s, max = 120) {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return one.slice(0, max) + "…";
}

function escapeCsv(s) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseArgs(argv) {
  const opts = { dir: null, file: null, format: "md" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { kind: "help" };
    if (a === "--dir") opts.dir = argv[++i];
    else if (a === "--file") opts.file = argv[++i];
    else if (a === "--format") opts.format = argv[++i];
    else return { kind: "bad_arg" };
  }
  if (!opts.dir && !opts.file) return { kind: "missing" };
  if (opts.dir && opts.file) return { kind: "conflict" };
  return { kind: "ok", opts };
}

const parsed = parseArgs(process.argv);
if (parsed.kind !== "ok") {
  usage();
  process.exit(parsed.kind === "help" ? 0 : 1);
}

const { opts } = parsed;
const files = opts.file ? [path.resolve(opts.file)] : listMdFiles(path.resolve(opts.dir));

const rows = [];
for (const f of files.sort()) {
  const text = fs.readFileSync(f, "utf-8");
  rows.push({
    file: path.basename(f),
    episode: extractEpisodeNo(text),
    acts: countActHeadings(text),
    cliffhanger_type: extractCliffhangerType(text),
    tail_preview: preview(extractTailSection(text)),
  });
}

if (opts.format === "csv") {
  console.log("episode,file,acts,cliffhanger_type,tail_preview");
  for (const r of rows) {
    console.log(
      [r.episode, r.file, String(r.acts), escapeCsv(r.cliffhanger_type), escapeCsv(r.tail_preview)].join(",")
    );
  }
} else {
  console.log("| episode | file | acts | cliffhanger_type | tail_preview |");
  console.log("|---:|---|---:|---|---|");
  for (const r of rows) {
    console.log(
      `| ${r.episode} | ${r.file} | ${r.acts} | ${preview(r.cliffhanger_type, 36)} | ${preview(r.tail_preview, 72)} |`
    );
  }
}
