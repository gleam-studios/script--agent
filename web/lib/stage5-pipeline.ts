import type { Artifact } from "./types";

/**
 * 从自由文本 episodeCount（如 "40"、"30~60"、"30-60 集"）解析为确定数字。
 * 区间取上界；无法解析返回 null。
 */
export function parseTargetEpisodeCount(raw: string): number | null {
  const s = raw.replace(/\s+/g, "").replace(/集$/u, "");
  const rangeM = s.match(/(\d+)[~～\-–—](\d+)/);
  if (rangeM) {
    const upper = parseInt(rangeM[2], 10);
    return Number.isFinite(upper) && upper > 0 ? upper : null;
  }
  const single = s.match(/(\d+)/);
  if (single) {
    const n = parseInt(single[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** 从 artifacts 中找到已有的、有实际内容的最大集号（ep1, ep2, …） */
export function maxExistingEpisodeNum(artifacts: Artifact[]): number {
  let max = 0;
  for (const a of artifacts) {
    if (a.stage !== 7) continue;
    const m = /^ep(\d+)$/.exec(a.subKey);
    if (!m) continue;
    const content = (a.content ?? "").trim();
    if (content.length < 40) continue;
    max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  return max;
}

/** 从上一集产物中提取集尾卡点或摘要（用于下一集指令的衔接） */
export function extractPrevEpisodeSummary(
  artifacts: Artifact[],
  epNum: number
): string {
  const epKey = `ep${epNum}`;
  const hook = artifacts.find(
    (a) => a.stage === 7 && a.subKey === `${epKey}.hook`
  );
  if (hook?.content?.trim()) {
    return `上一集（第${epNum}集）集尾卡点：${hook.content.trim().slice(0, 300)}`;
  }
  const overview = artifacts.find(
    (a) => a.stage === 7 && a.subKey === epKey && !a.parentKey
  );
  if (overview?.content?.trim()) {
    const text = overview.content.trim();
    return `上一集（第${epNum}集）概述：${text.slice(0, 300)}${text.length > 300 ? "…" : ""}`;
  }
  return "";
}

/** 构建自动流水线里「写第 N 集」的 user 消息 */
export function buildEpisodeUserMessage(
  epNum: number,
  totalEpisodes: number,
  prevSummary: string
): string {
  const parts: string[] = [
    `[自动流水线] 请严格服从【工程注入】与侧栏「系列圣经」，`,
    `按 \`Episode Development Script Template.md\` 模板，`,
    `输出 **第 ${epNum} 集**（全剧共 ${totalEpisodes} 集）的完整分集剧本。`,
    `须包含本集定位、剧情摘要、全部场次及每场下全部「幕」（单集幕数 ≥8）。`,
    `幕的「正文」须为一整段连续叙事（描写+动作+对白融合在同一段，不拆子字段）。`,
    `禁止在正文内出现「对白要点：」「动作/画面描述：」「画面/镜头：」等子标签——幕下只有时长、正文、衔接三个字段。`,
    `对白直接嵌入叙事：@角色名 [可选动作]："台词"，不同角色断行后继续叙事。`,
    `每幕正文须充实饱满，写清动作细节、环境氛围、角色情绪，不可一两句草草了事。`,
    `正文中每次提到任何资产（角色/物品/场景）必须用 @名称，与设定集一致。`,
    `**仅输出这一集，禁止输出其他集。**`,
  ];
  if (prevSummary) {
    parts.push(`\n${prevSummary}`);
    parts.push(`请确保本集与上一集剧情衔接。`);
  }
  if (epNum === 1) {
    parts.push(`\n这是全剧第一集，须建立关系钩子与主冲突。`);
  }
  if (epNum === totalEpisodes) {
    parts.push(`\n这是最后一集，须完成情绪兑现与结局。`);
  }
  parts.push(
    `\n须严格遵守工程注入中 [已确认产物摘要] 里的人物名、时间线、因果关系与事件链。`
  );
  return parts.join("");
}

export interface PipelineProgress {
  current: number;
  total: number;
  status: "running" | "paused" | "done" | "error";
  errorMessage?: string;
  /** 分集剧本流水线 vs 分集大纲流水线；用于「继续」恢复时与 viewStage 解耦 */
  kind?: "episode" | "outline";
}
