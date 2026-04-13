import JSZip from "jszip";
import type { Artifact } from "./types";
import { STAGES, STAGE_LABELS } from "./types";

function sanitizePathSegment(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim() || "未命名";
}

function isSceneRootSubKeyExport(subKey: string): boolean {
  return /^ep\d+\.scene\d+$/u.test(subKey);
}

function sortMusBySubKey(a: Artifact, b: Artifact): number {
  const na = parseInt(a.subKey.replace(/^.*\.m(\d+)$/u, "$1"), 10) || 0;
  const nb = parseInt(b.subKey.replace(/^.*\.m(\d+)$/u, "$1"), 10) || 0;
  return na - nb;
}

/** 集根仅 `epN`；场次下再挂幕（与 StageGroup / extractStage5 一致） */
function orderedStage5(
  artifacts: Artifact[]
): {
  epKey: string;
  overview?: Artifact;
  scenes: { scene: Artifact; mus: Artifact[] }[];
  extras: Artifact[];
}[] {
  const items = [...artifacts];
  const epKeys = new Set<string>();
  for (const a of items) {
    if (!a.parentKey && /^ep\d+$/u.test(a.subKey)) epKeys.add(a.subKey);
  }

  const sortedKeys = Array.from(epKeys).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return na - nb;
  });

  return sortedKeys.map((epKey) => {
    const overview = items.find((a) => a.subKey === epKey && !a.parentKey);
    const direct = items.filter((a) => a.parentKey === epKey);
    const sceneRoots = direct
      .filter((a) => isSceneRootSubKeyExport(a.subKey))
      .sort((a, b) => a.subKey.localeCompare(b.subKey));
    const scenes = sceneRoots.map((scene) => ({
      scene,
      mus: items.filter((a) => a.parentKey === scene.subKey).sort(sortMusBySubKey),
    }));
    const extras = direct.filter((a) => !isSceneRootSubKeyExport(a.subKey));
    return { epKey, overview, scenes, extras };
  });
}

function sortFlatStage(stage: number, artifacts: Artifact[]): Artifact[] {
  const items = [...artifacts];
  if (stage === 1) {
    const rank = (subKey: string) => (subKey === "oneliner" ? 0 : subKey === "outline" ? 1 : 2);
    return items.sort((a, b) => rank(a.subKey) - rank(b.subKey) || a.subKey.localeCompare(b.subKey));
  }
  if (stage === 4) {
    const rank = (subKey: string) => {
      if (subKey === "chain_check") return 1_000_000;
      const m = /^event_(\d+)$/.exec(subKey);
      if (m) return parseInt(m[1], 10);
      return 500_000;
    };
    return items.sort((a, b) => rank(a.subKey) - rank(b.subKey) || a.subKey.localeCompare(b.subKey));
  }
  return items.sort((a, b) => a.subKey.localeCompare(b.subKey));
}

function buildStageMarkdown(stage: number, artifacts: Artifact[], projectName: string): string {
  const stageTitle = STAGE_LABELS[stage] || `STAGE ${stage}`;
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });

  const header = [
    `# ${stageTitle}`,
    "",
    `- **项目**：${projectName}`,
    `- **导出时间**：${exportedAt}`,
    `- **阶段**：STAGE ${stage}`,
    "",
    "---",
    "",
  ];

  if (stage === 5) {
    const blocks: string[] = [...header];
    for (const { epKey, overview, scenes, extras } of orderedStage5(artifacts)) {
      const epHeading = overview?.label || `第${epKey.replace(/\D/g, "") || "?"}集`;
      blocks.push(`## ${epHeading}`);
      blocks.push("");
      if (overview?.content?.trim()) {
        blocks.push(overview.content.trim());
        blocks.push("");
      }
      for (const { scene, mus } of scenes) {
        blocks.push(`### ${scene.label}`);
        blocks.push("");
        if (scene.content?.trim()) {
          blocks.push(scene.content.trim());
          blocks.push("");
        }
        for (const mu of mus) {
          const muNum = mu.subKey.replace(/^.*\.m(\d+)$/u, "$1");
          blocks.push(`#### 幕 ${muNum}`);
          blocks.push("");
          blocks.push(mu.content.trim());
          blocks.push("");
        }
      }
      for (const ex of extras) {
        blocks.push(`### ${ex.label}`);
        blocks.push("");
        blocks.push(ex.content.trim());
        blocks.push("");
      }
      blocks.push("---");
      blocks.push("");
    }
    return blocks.join("\n").replace(/\n---\n\n$/u, "").trimEnd();
  }

  const blocks: string[] = [...header];
  for (const a of sortFlatStage(stage, artifacts)) {
    blocks.push(`## ${a.label}`);
    blocks.push("");
    blocks.push(a.content.trim());
    blocks.push("");
    blocks.push("---");
    blocks.push("");
  }
  return blocks.join("\n").replace(/\n---\n\n$/u, "").trimEnd();
}

function stageFileBaseName(stageId: number): string {
  const label = STAGE_LABELS[stageId] || `STAGE${stageId}`;
  return `${String(stageId).padStart(2, "0")}-${sanitizePathSegment(label)}`;
}

export async function downloadArtifactsZip(projectName: string, artifacts: Artifact[]): Promise<void> {
  if (artifacts.length === 0) return;

  const zip = new JSZip();
  const safeProject = sanitizePathSegment(projectName);
  const root = zip.folder(safeProject) ?? zip;

  for (const s of STAGES) {
    const stageArts = artifacts.filter((a) => a.stage === s.id);
    if (stageArts.length === 0) continue;
    const md = buildStageMarkdown(s.id, stageArts, projectName);
    root.file(`${stageFileBaseName(s.id)}.md`, md);
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeProject}-剧本产物-${stamp}.zip`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
