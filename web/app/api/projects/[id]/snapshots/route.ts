import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { getProject, saveProject } from "@/lib/project-store";
import type { Snapshot } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }
  return Response.json(project.snapshots);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  const snapshot: Snapshot = {
    id: nanoid(8),
    label: body.label || `STAGE ${project.currentStage} 快照`,
    createdAt: new Date().toISOString(),
    stage: project.currentStage,
    messageCount: project.messages.length,
    artifacts: JSON.parse(JSON.stringify(project.artifacts)),
    seriesBible: project.seriesBible ?? "",
  };

  project.snapshots.push(snapshot);
  saveProject(project);

  return Response.json(snapshot, { status: 201 });
}
