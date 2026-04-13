import { NextRequest } from "next/server";
import { getProject, saveProject } from "@/lib/project-store";
import { loadAdaptationAnalyzePrompt } from "@/lib/prompt-loader";
import { completeChatNonStream } from "@/lib/openai-completion";
import { totalSourceChars } from "@/lib/source-materials";
import type { OnboardingStatus, Project, Settings } from "@/lib/types";

export const runtime = "nodejs";

/** 单次请求送入模型的原文上限（字符） */
const ANALYZE_INPUT_MAX = 120_000;

export async function POST(req: NextRequest) {
  let body: { projectId?: string; settings?: Settings };
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

  const project = getProject(projectId);
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const mats = project.sourceMaterials ?? [];
  if (mats.length === 0) {
    return Response.json({ error: "请先上传或粘贴至少一份原文素材" }, { status: 400 });
  }

  const total = totalSourceChars(mats);
  let raw = mats.map((m) => `### ${m.label}\n${m.text}`).join("\n\n");
  if (raw.length > ANALYZE_INPUT_MAX) {
    raw = raw.slice(0, ANALYZE_INPUT_MAX) + "\n\n（后略：为控制单次请求长度已截断）";
  }

  const system = loadAdaptationAnalyzePrompt();
  if (!system.trim()) {
    return Response.json({ error: "分析提示词未加载" }, { status: 500 });
  }

  const userContent = `以下是需要分析的原文（项目内素材合计约 ${total} 字）：\n\n${raw}`;

  const result = await completeChatNonStream({
    settings,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  const sourceAnalysis = result.content.trim();
  const onboardingStatus: OnboardingStatus =
    project.onboardingStatus === "ready" ? "ready" : "planning";

  const merged: Project = {
    ...project,
    originMode: "adaptation" as const,
    sourceAnalysis,
    adaptationPhase: "analyzed" as const,
    onboardingStatus,
  };
  saveProject(merged);

  return Response.json({
    ok: true,
    sourceAnalysisLength: sourceAnalysis.length,
    project: merged,
  });
}
