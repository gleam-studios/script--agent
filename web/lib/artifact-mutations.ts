import type { Artifact } from "./types";

export function artifactKey(a: Pick<Artifact, "stage" | "subKey">): string {
  return `${a.stage}:${a.subKey}`;
}

/** ISO 时间戳 */
export function artifactNow(): string {
  return new Date().toISOString();
}

/**
 * 在列表中按 stage+subKey 替换或追加一条。
 * 允许空正文（用于新建占位槽、或清空后暂存）；删除条目须用 `removeArtifactByKey` / 界面「移除」。
 */
export function upsertArtifact(
  existing: Artifact[],
  next: Omit<Artifact, "updatedAt"> & { updatedAt?: string }
): Artifact[] {
  const key = artifactKey(next);
  const content = next.content.trim();
  const base = existing.filter((a) => artifactKey(a) !== key);

  const merged: Artifact = {
    ...next,
    content,
    updatedAt: next.updatedAt ?? artifactNow(),
  };
  return [...base, merged].sort((a, b) => {
    if (a.stage !== b.stage) return a.stage - b.stage;
    return (a.subKey || "").localeCompare(b.subKey || "");
  });
}

export function removeArtifactByKey(existing: Artifact[], stage: number, subKey: string): Artifact[] {
  const key = `${stage}:${subKey}`;
  return existing.filter((a) => artifactKey(a) !== key);
}

/**
 * 收集从 rootSubKey 起、沿 parentKey 向下的整条子树（含根）。
 */
export function collectSubtreeSubKeys(artifacts: Artifact[], rootSubKey: string): Set<string> {
  const rm = new Set<string>([rootSubKey]);
  let prev = -1;
  while (rm.size !== prev) {
    prev = rm.size;
    for (const a of artifacts) {
      if (a.parentKey && rm.has(a.parentKey)) {
        rm.add(a.subKey);
      }
    }
  }
  return rm;
}

export function removeSubtreeFromList(artifacts: Artifact[], rootSubKey: string): Artifact[] {
  const rm = collectSubtreeSubKeys(artifacts, rootSubKey);
  return artifacts.filter((a) => !rm.has(a.subKey));
}

/** 手写「角色」槽位用：与 extract slug 规则一致，仅字母数字与下划线 */
export function slugifyCharName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "unnamed";
}
