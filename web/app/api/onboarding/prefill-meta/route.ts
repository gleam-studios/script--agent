import { NextRequest } from "next/server";
import { getProject } from "@/lib/project-store";
import { generatePrefillMetaFromProject } from "@/lib/onboarding-prefill-meta";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";

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

  const out = await generatePrefillMetaFromProject(project, settings);
  if (!out.ok) {
    return Response.json({ error: out.error, meta: out.meta }, { status: 502 });
  }

  return Response.json({ ok: true, meta: out.meta });
}
