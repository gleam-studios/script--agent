import { NextRequest } from "next/server";
import { generatePrefillMetaFromProject } from "@/lib/onboarding-prefill-meta";
import { completeChatNonStream } from "@/lib/openai-completion";
import { buildAdaptationPlannerBootstrap } from "@/lib/planning-bootstrap";
import { getProject, saveProject } from "@/lib/project-store";
import { loadAdaptationPlannerPrompt } from "@/lib/prompt-loader";
import type { Message, OnboardingStatus, Project, ProjectMeta, Settings } from "@/lib/types";

export const runtime = "nodejs";

const USER_PLAN_REQUEST =
  "请根据系统提示中的全部上下文，直接输出一份完整的《创作思路确认书》（Markdown）。不要向用户提问；不要输出 STAGE 1～5 剧本模板结构；一次性写清方向与体量、人物量级、钩子与结构要点、改编删留策略等，便于立项与后续编剧室使用。";

function metaForBootstrap(p: Project): ProjectMeta {
  const m = p.meta;
  return {
    seriesTitle: m?.seriesTitle ?? p.name ?? "",
    episodeCount: m?.episodeCount ?? "",
    episodeDurationMinutes: m?.episodeDurationMinutes ?? null,
    targetMarket: m?.targetMarket ?? "",
    dialogueLanguage: m?.dialogueLanguage ?? "",
    extraNotes: m?.extraNotes ?? "",
  };
}

export async function POST(req: NextRequest) {
  let body: { projectId?: string; settings?: Settings; adaptationMessages?: Message[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.projectId;
  const settings = body.settings;
  if (!projectId || !settings?.apiKey) {
    return Response.json({ error: "需要 projectId 与 settings.apiKey" }, { status: 400 });
  }

  const existing = getProject(projectId);
  if (!existing) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  let project: Project =
    body.adaptationMessages && body.adaptationMessages.length > 0
      ? { ...existing, adaptationMessages: body.adaptationMessages }
      : existing;

  if ((project.originMode ?? "original") !== "adaptation") {
    return Response.json({ error: "仅改编立项可使用自动生成规划" }, { status: 400 });
  }

  if (!project.sourceAnalysis?.trim()) {
    return Response.json({ error: "缺少原文分析，请先完成分析步骤" }, { status: 400 });
  }

  const discuss = project.adaptationMessages ?? [];
  const hasDiscuss = discuss.some((m) => (m.content ?? "").trim().length > 0);
  if (!hasDiscuss) {
    return Response.json({ error: "请先完成改编讨论（至少一轮有效对话）" }, { status: 400 });
  }

  const base = loadAdaptationPlannerPrompt();
  if (!base.trim()) {
    return Response.json({ error: "规划师提示词未加载" }, { status: 500 });
  }

  const bootstrap = buildAdaptationPlannerBootstrap({
    meta: metaForBootstrap(project),
    materials: project.sourceMaterials ?? [],
    sourceAnalysis: project.sourceAnalysis,
    adaptationMessages: discuss,
    planningMessages: [],
  });

  const systemContent = `${base}\n\n---\n【立项上下文】\n${bootstrap.trim()}`;

  const planResult = await completeChatNonStream({
    settings,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: USER_PLAN_REQUEST },
    ],
    temperature: 0.25,
  });

  if (!planResult.ok) {
    return Response.json({ error: planResult.error }, { status: 502 });
  }

  const creativeBrief = planResult.content.trim();
  if (!creativeBrief) {
    return Response.json({ error: "模型未返回规划正文" }, { status: 502 });
  }

  const projectWithBrief: Project = { ...project, creativeBrief };
  const prefill = await generatePrefillMetaFromProject(projectWithBrief, settings);

  const onboardingStatus: OnboardingStatus =
    projectWithBrief.onboardingStatus === "ready" ? "ready" : "planning";

  const merged: Project = {
    ...projectWithBrief,
    adaptationPhase: "meta",
    onboardingStatus,
    planningMessages: [{ role: "assistant", content: creativeBrief }],
  };

  saveProject(merged);

  return Response.json({
    ok: true,
    project: merged,
    meta: prefill.meta,
    prefillOk: prefill.ok,
    prefillWarning: prefill.ok ? undefined : prefill.error,
  });
}
