import type { Artifact, Message, ProjectMeta } from "./types";
import { detectStage } from "./stage-detect";
import { evaluateStageGate } from "./stage-gate";
import { CREATIVE_BRIEF_CONTEXT_CHARS } from "./source-materials";

const STAGE1_OUTLINE_EXCERPT = 500;
const STAGE3_ACT_EXCERPT = 200;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * 将 STAGE 1-4 产物拼成供工程注入的摘要（约 2000 字以内），
 * 仅当已进入 STAGE 5 且 STAGE 4 已通过时注入。
 */
function buildStage14Summary(artifacts: Artifact[]): string {
  const lines: string[] = [];

  const s1Oneliner = artifacts.find((a) => a.stage === 1 && a.subKey === "oneliner");
  const s1Outline = artifacts.find((a) => a.stage === 1 && a.subKey === "outline");
  if (s1Oneliner?.content?.trim()) {
    lines.push(`[S1 一句话梗概] ${s1Oneliner.content.trim()}`);
  }
  if (s1Outline?.content?.trim()) {
    lines.push(`[S1 完整大纲摘要] ${truncate(s1Outline.content, STAGE1_OUTLINE_EXCERPT)}`);
  }

  const s2Rel = artifacts.find((a) => a.stage === 2 && a.subKey === "relationship");
  const s2Matrix = artifacts.find((a) => a.stage === 2 && a.subKey === "cast_matrix");
  const s2Chars = artifacts.filter(
    (a) => a.stage === 2 && (a.subKey.startsWith("char_") || a.subKey.startsWith("supporting_"))
  );
  if (s2Rel?.content?.trim()) {
    lines.push(`[S2 核心关系定义] ${s2Rel.content.trim()}`);
  }
  if (s2Matrix?.content?.trim()) {
    lines.push(`[S2 人物矩阵] ${s2Matrix.content.trim()}`);
  }
  if (s2Chars.length > 0) {
    lines.push(`[S2 角色列表] ${s2Chars.map((a) => a.label).join("、")}`);
  }

  for (const key of ["act1", "act2", "act3"] as const) {
    const act = artifacts.find((a) => a.stage === 3 && a.subKey === key);
    if (act?.content?.trim()) {
      const label = key === "act1" ? "第一幕" : key === "act2" ? "第二幕" : "第三幕";
      lines.push(`[S3 ${label}摘要] ${truncate(act.content, STAGE3_ACT_EXCERPT)}`);
    }
  }

  const s4Events = artifacts
    .filter((a) => a.stage === 4 && a.subKey.startsWith("event_"))
    .sort((a, b) => a.subKey.localeCompare(b.subKey));
  if (s4Events.length > 0) {
    const eventNames = s4Events.map((a) => {
      const nameMatch = a.content.match(/事件名称[：:]\s*(.+)/);
      return nameMatch ? `${a.label}：${nameMatch[1].trim()}` : a.label;
    });
    lines.push(`[S4 核心事件链] ${eventNames.join(" → ")}`);
  }

  if (lines.length === 0) return "";
  return `\n[已确认产物摘要（STAGE 1-4，须严格遵守人物名/时间线/因果关系/事件链）]\n${lines.join("\n")}`;
}

/**
 * 注入到 /api/chat 的工程侧状态。
 */
export function buildProjectContext(params: {
  messages: Message[];
  artifacts: Artifact[];
  maxApprovedStage: number;
  meta?: ProjectMeta | null;
  creativeBrief?: string;
  /** 立项模式；缺省视为原创 */
  originMode?: "original" | "adaptation";
  /** 改编：原文分析极短摘要（控 token） */
  sourceAnalysisExcerpt?: string;
}): string {
  const { messages, artifacts, maxApprovedStage, meta, creativeBrief, originMode, sourceAnalysisExcerpt } =
    params;
  const inferred = detectStage(messages);
  const approved = maxApprovedStage ?? 0;

  const parts: string[] = [];

  const mode = originMode ?? "original";
  if (mode === "adaptation") {
    parts.push(`[立项模式] 改编。须与立项策划摘要及原文分析结论一致；勿与改编主线矛盾。`);
    const sa = sourceAnalysisExcerpt?.trim();
    if (sa) {
      parts.push(`[原文分析要点（摘录）] ${sa}`);
    }
  } else {
    parts.push(`[立项模式] 原创。`);
  }

  if (meta && (meta.seriesTitle || meta.episodeCount || meta.targetMarket || meta.dialogueLanguage)) {
    parts.push(
      `[立项] 剧名：${meta.seriesTitle || "未填"}；集数/区间：${meta.episodeCount || "待确认"}；单集约 ${meta.episodeDurationMinutes ?? "?"} 分钟；目标市场：${meta.targetMarket || "待确认"}；台词语言：${meta.dialogueLanguage || "待确认"}。`
    );
  }

  const brief = creativeBrief?.trim();
  if (brief) {
    const excerpt = brief.slice(0, CREATIVE_BRIEF_CONTEXT_CHARS);
    const more = brief.length > CREATIVE_BRIEF_CONTEXT_CHARS;
    parts.push(
      `[立项策划摘要] 须与之一致（以下为前 ${CREATIVE_BRIEF_CONTEXT_CHARS} 字${more ? "，后略" : ""}）：${excerpt}${more ? "…" : ""}`
    );
  }

  parts.push(
    `[工程侧] 主创已在侧栏确认验收至 STAGE ${approved}（0 表示尚未确认）。当前对话最新推断阶段为 STAGE ${inferred || "未判定"}。`
  );

  if (inferred >= 1 && inferred <= 5) {
    const gate = evaluateStageGate(inferred, artifacts);
    if (!gate.ok) {
      parts.push(
        `当前阶段产物未满足验收清单：${gate.items
          .filter((i) => !i.pass)
          .map((i) => i.label)
          .join("、")}。请先补齐或请主创确认后再推进下一阶段交付物。`
      );
    }
  }

  if (approved > 0 && inferred > approved + 1) {
    parts.push(
      `推断阶段已高于「已验收」较多：请勿跳过中间 STAGE 的模板交付物；若主创同意越级，请其在对话中明确说明。`
    );
  }

  parts.push(`系列圣经以侧栏「系列圣经」正文为准；与对话冲突时以圣经为准。`);

  if (approved >= 4 && inferred >= 5) {
    parts.push(buildStage14Summary(artifacts));
  }

  return parts.join("");
}
