import fs from "fs";
import path from "path";
import type { Project, ProjectSummary } from "./types";
import { resolveDataProjectsDir } from "./agent-paths";

const DATA_DIR = resolveDataProjectsDir();

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

export function listProjects(): ProjectSummary[] {
  ensureDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const summaries: ProjectSummary[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, f), "utf-8");
      const p: Project = JSON.parse(raw);
      summaries.push({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        currentStage: p.currentStage,
        onboardingStatus: p.onboardingStatus,
        originMode: p.originMode,
      });
    } catch {
      // skip corrupt files
    }
  }
  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return summaries;
}

export function getProject(id: string): Project | null {
  ensureDir();
  const fp = filePath(id);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return null;
  }
}

export function saveProject(project: Project): void {
  ensureDir();
  project.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath(project.id), JSON.stringify(project, null, 2), "utf-8");
}

export function deleteProject(id: string): boolean {
  const fp = filePath(id);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}
