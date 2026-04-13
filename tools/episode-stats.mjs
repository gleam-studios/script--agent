#!/usr/bin/env node
/**
 * 启发式统计单集剧本体量（非完整 parser）。
 * 中文按「字」计：统计 CJK 统一表意文字 + 全角标点常见 subset；对白区优先取「关键对白」块。
 */

import fs from "fs";
import path from "path";
import process from "process";

const CJK_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g;

function countCjk(str) {
  const m = str.match(CJK_RE);
  return m ? m.length : 0;
}

function stripMarkdownNoise(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ");
}

function extractKeyDialogueBlock(text) {
  const idx = text.search(/\*\*关键对白\*\*|关键对白[:：]/);
  if (idx === -1) return "";
  const rest = text.slice(idx);
  const stop = rest.search(/\n## |\n\*\*[^(关键对白)]/);
  const block = stop === -1 ? rest : rest.slice(0, stop);
  return block;
}

function countActHeadings(text) {
  // 不用 \\b：JS 词边界对中文「幕」不可靠
  const m = text.match(/^####\s*幕(?:\s|$|\d)/gm);
  return m ? m.length : 0;
}

function extractDialogueLines(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let inKey = false;
  for (const line of lines) {
    if (/^\*\*关键对白\*\*\s*$|^关键对白[:：]\s*$/.test(line.trim())) {
      inKey = true;
      continue;
    }
    if (inKey && (/^##\s+/.test(line) || /^\*\*[^*]+\*\*\s*$/.test(line.trim()))) {
      if (!/^关键对白/.test(line)) inKey = false;
    }
    if (inKey && /^\s*[-*]\s*.+[：:].+/.test(line)) {
      out.push(line);
    }
  }
  return out.join("\n");
}

function usage() {
  console.log(`usage: node episode-stats.mjs [--file PATH] [--wps N] [--max-chars N] [--max-seconds N] [--min-acts N] [--strict]

  --file PATH     读取该文件；省略则从 stdin 读入（Ctrl+D 结束）
  --wps N         语速（字/秒），默认 4.5
  --max-chars N   关键对白区 CJK 上限（仅 strict 时参与校验）；默认 380
  --max-seconds N 按「全篇 CJK / wps」估算秒数上限；默认 120
  --min-acts N    「幕」数量下限（匹配 ^#### 幕）；默认 8；设为 0 可关闭该项 strict 校验
  --strict        超标时 exit 1

启发式说明：
  - dialogue_chars：优先统计「关键对白」列表行（- 角色：…）；若无则退化为全篇 CJK
  - total_chars：全篇 CJK（去部分 markdown）
  - act_headings_count：统计 Markdown 标题「#### 幕…」出现次数（与主控集-场-幕模板对齐）
`);
}

async function readInput(filePath) {
  if (filePath) {
    return fs.readFileSync(path.resolve(filePath), "utf-8");
  }
  const chunks = [];
  for await (const ch of process.stdin) chunks.push(ch);
  return Buffer.concat(chunks).toString("utf-8");
}

function parseArgs(argv) {
  const opts = {
    file: null,
    wps: 4.5,
    maxChars: 380,
    maxSeconds: 120,
    minActs: 8,
    strict: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--strict") opts.strict = true;
    else if (a === "--file") opts.file = argv[++i];
    else if (a === "--wps") opts.wps = Number(argv[++i]);
    else if (a === "--max-chars") opts.maxChars = Number(argv[++i]);
    else if (a === "--max-seconds") opts.maxSeconds = Number(argv[++i]);
    else if (a === "--min-acts") opts.minActs = Number(argv[++i]);
    else {
      console.error("unknown arg:", a);
      usage();
      process.exit(1);
    }
  }
  if (!Number.isFinite(opts.wps) || opts.wps <= 0) opts.wps = 4.5;
  if (!Number.isFinite(opts.minActs) || opts.minActs < 0) opts.minActs = 8;
  return { opts };
}

const parsed = parseArgs(process.argv);
if (parsed.help) {
  usage();
  process.exit(0);
}

const { opts } = parsed;

const raw = await readInput(opts.file);
const cleaned = stripMarkdownNoise(raw);
const keyBlock = extractKeyDialogueBlock(raw);
const bulletDialogue = extractDialogueLines(raw);
const dialogueSource = bulletDialogue.length > 0 ? bulletDialogue : keyBlock.length > 0 ? keyBlock : cleaned;
const dialogueChars = countCjk(dialogueSource);
const totalChars = countCjk(cleaned);
const estSecondsTotal = totalChars / opts.wps;
const estSecondsDialogue = dialogueChars / opts.wps;
const actHeadingsCount = countActHeadings(raw);

const lines = raw.split(/\r?\n/).length;
console.log(
  JSON.stringify(
    {
      dialogue_chars: dialogueChars,
      total_cjk_chars: totalChars,
      estimated_seconds_by_total: Math.round(estSecondsTotal * 10) / 10,
      estimated_seconds_by_dialogue: Math.round(estSecondsDialogue * 10) / 10,
      act_headings_count: actHeadingsCount,
      min_acts_threshold: opts.minActs,
      wps: opts.wps,
      lines,
    },
    null,
    2
  )
);

let fail = false;
if (opts.strict) {
  if (dialogueChars > opts.maxChars) {
    console.error(`strict: dialogue_chars ${dialogueChars} > max-chars ${opts.maxChars}`);
    fail = true;
  }
  if (estSecondsTotal > opts.maxSeconds) {
    console.error(
      `strict: estimated_seconds_by_total ${estSecondsTotal.toFixed(1)} > max-seconds ${opts.maxSeconds}`
    );
    fail = true;
  }
  if (opts.minActs > 0 && actHeadingsCount < opts.minActs) {
    console.error(
      `strict: act_headings_count ${actHeadingsCount} < min-acts ${opts.minActs}`
    );
    fail = true;
  }
}
process.exit(fail ? 1 : 0);
