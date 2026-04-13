import { loadPrefillMetaPrompt } from "@/lib/prompt-loader";
import { completeChatNonStream } from "@/lib/openai-completion";
import {
  ADAPTATION_DISCUSSION_FOR_PLANNER_CHARS,
  ADAPTATION_PLANNING_EXCERPT_CHARS,
  ADAPTATION_SOURCE_ANALYSIS_INJECT_CHARS,
  CREATIVE_BRIEF_CONTEXT_CHARS,
} from "@/lib/source-materials";
import type { Message, Project, ProjectMeta, Settings } from "@/lib/types";

function excerpt(s: string, max: number): string {
  const t = s.trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…（后略）`;
}

function excerptMessages(msgs: Message[], maxChars: number): string {
  if (!msgs?.length) return "";
  const joined = msgs.map((m) => `${m.role}: ${m.content}`).join("\n\n");
  return excerpt(joined, maxChars);
}

function parseMetaJson(raw: string): Partial<ProjectMeta> | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : trimmed;
  try {
    const o = JSON.parse(body) as Record<string, unknown>;
    return {
      seriesTitle: typeof o.seriesTitle === "string" ? o.seriesTitle : undefined,
      episodeCount: typeof o.episodeCount === "string" ? o.episodeCount : undefined,
      episodeDurationMinutes:
        typeof o.episodeDurationMinutes === "number"
          ? o.episodeDurationMinutes
          : o.episodeDurationMinutes === null
            ? null
            : undefined,
      targetMarket: typeof o.targetMarket === "string" ? o.targetMarket : undefined,
      dialogueLanguage: typeof o.dialogueLanguage === "string" ? o.dialogueLanguage : undefined,
      extraNotes: typeof o.extraNotes === "string" ? o.extraNotes : undefined,
    };
  } catch {
    return null;
  }
}

function normalizeMeta(partial: Partial<ProjectMeta> | null, fallbackName: string): ProjectMeta {
  const m = partial ?? {};
  return {
    seriesTitle: typeof m.seriesTitle === "string" ? m.seriesTitle : fallbackName,
    episodeCount: typeof m.episodeCount === "string" ? m.episodeCount : "",
    episodeDurationMinutes:
      m.episodeDurationMinutes === null || typeof m.episodeDurationMinutes === "number"
        ? m.episodeDurationMinutes
        : null,
    targetMarket: typeof m.targetMarket === "string" ? m.targetMarket : "",
    dialogueLanguage: typeof m.dialogueLanguage === "string" ? m.dialogueLanguage : "",
    extraNotes: typeof m.extraNotes === "string" ? m.extraNotes : "",
  };
}

/**
 * 根据项目上下文抽取立项元数据（与 /api/onboarding/prefill-meta 行为一致）。
 * 应在 creativeBrief 已写入后再调用，以便摘要中含最新创作思路。
 */
export async function generatePrefillMetaFromProject(
  project: Project,
  settings: Settings
): Promise<
  | { ok: true; meta: ProjectMeta }
  | { ok: false; error: string; meta: ProjectMeta; prefillWarning?: string }
> {
  const fallbackName = project.name ?? "";
  const emptyMeta = normalizeMeta(null, fallbackName);

  const system = loadPrefillMetaPrompt();
  if (!system.trim()) {
    return { ok: false, error: "预填提示词未加载", meta: emptyMeta };
  }

  if (!settings?.apiKey) {
    return { ok: false, error: "缺少 API Key", meta: emptyMeta };
  }

  const ctxParts: string[] = [];
  ctxParts.push("### 原文分析（摘录）");
  ctxParts.push(excerpt(project.sourceAnalysis ?? "", ADAPTATION_SOURCE_ANALYSIS_INJECT_CHARS) || "（无）");
  ctxParts.push("");
  ctxParts.push("### 改编讨论（摘录）");
  ctxParts.push(excerptMessages(project.adaptationMessages ?? [], ADAPTATION_DISCUSSION_FOR_PLANNER_CHARS) || "（无）");
  ctxParts.push("");
  ctxParts.push("### 规划师对话（摘录）");
  ctxParts.push(excerptMessages(project.planningMessages ?? [], ADAPTATION_PLANNING_EXCERPT_CHARS) || "（无）");
  ctxParts.push("");
  ctxParts.push("### 创作思路摘要（摘录）");
  ctxParts.push(excerpt(project.creativeBrief ?? "", CREATIVE_BRIEF_CONTEXT_CHARS * 3) || "（无）");

  const userContent = `请根据以下上下文抽取立项元数据 JSON：\n\n${ctxParts.join("\n")}`;

  const result = await completeChatNonStream({
    settings,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    temperature: 0.1,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      meta: emptyMeta,
      prefillWarning: result.error,
    };
  }

  const parsed = parseMetaJson(result.content);
  const meta = normalizeMeta(parsed, fallbackName);
  return { ok: true, meta };
}
