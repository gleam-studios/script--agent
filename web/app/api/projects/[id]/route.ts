import { NextRequest } from "next/server";
import { getProject, saveProject, deleteProject } from "@/lib/project-store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }
  return Response.json(project);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const existing = getProject(id);
  if (!existing) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const updates = await req.json();
  const merged = { ...existing, ...updates, id: existing.id };
  saveProject(merged);
  return Response.json(merged);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const ok = deleteProject(id);
  if (!ok) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
