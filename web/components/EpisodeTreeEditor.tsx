"use client";

import { useEffect, useMemo, useState } from "react";
import type { Artifact } from "@/lib/types";
import ArtifactSlotEditor from "./ArtifactSlotEditor";

interface Props {
  artifacts: Artifact[];
  onUpsert: (patch: Omit<Artifact, "updatedAt"> & { updatedAt?: string }) => void;
  onRemoveSubtree: (rootSubKey: string) => void;
}

function isEpisodeRoot(a: Artifact): boolean {
  return !a.parentKey && (/^ep\d+$/u.test(a.subKey) || a.subKey === "ep_placeholder");
}

function isSceneRootSubKey(subKey: string): boolean {
  return /^ep\d+\.scene\d+$/u.test(subKey);
}

function epNumFromKey(epKey: string): number {
  if (epKey === "ep_placeholder") return 0;
  return parseInt(epKey.replace(/\D/g, ""), 10) || 0;
}

function nextEpisodeNum(all: Artifact[]): number {
  let max = 0;
  for (const a of all) {
    if (isEpisodeRoot(a)) {
      max = Math.max(max, epNumFromKey(a.subKey));
    }
  }
  return max + 1;
}

function nextSceneNum(epKey: string, all: Artifact[]): number {
  let max = 0;
  for (const a of all) {
    if (a.parentKey !== epKey || !isSceneRootSubKey(a.subKey)) continue;
    const m = a.subKey.match(/\.scene(\d+)$/u);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  return max + 1;
}

function nextMuNum(sceneKey: string, all: Artifact[]): number {
  let max = 0;
  for (const a of all) {
    if (a.parentKey !== sceneKey) continue;
    const m = a.subKey.match(/\.m(\d+)$/u);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  return max + 1;
}

function epLabel(overview: Artifact | undefined, epKey: string): string {
  const fromOverview = overview?.label?.replace(/\s*-\s*场次.*/u, "").trim();
  if (fromOverview) return fromOverview;
  if (epKey === "ep_placeholder") return "第?集（占位）";
  return `第${epNumFromKey(epKey)}集`;
}

function sceneCountForEp(epKey: string, all: Artifact[]): number {
  return all.filter((a) => a.parentKey === epKey && isSceneRootSubKey(a.subKey)).length;
}

/** 卡片摘要：去 Markdown 噪声后截断 */
function episodeCardExcerpt(markdown: string, maxLen: number): string {
  const t = markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*?|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= maxLen) return t || "（暂无概述）";
  return `${t.slice(0, maxLen)}…`;
}

export default function EpisodeTreeEditor({ artifacts, onUpsert, onRemoveSubtree }: Props) {
  const stage5 = useMemo(() => artifacts.filter((a) => a.stage === 7), [artifacts]);
  const [modalEpKey, setModalEpKey] = useState<string | null>(null);

  const epKeys = useMemo(() => {
    const s = new Set<string>();
    for (const a of stage5) {
      if (isEpisodeRoot(a)) s.add(a.subKey);
    }
    return Array.from(s).sort((a, b) => epNumFromKey(a) - epNumFromKey(b));
  }, [stage5]);

  useEffect(() => {
    if (!modalEpKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalEpKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalEpKey]);

  useEffect(() => {
    if (modalEpKey && !epKeys.includes(modalEpKey)) {
      setModalEpKey(null);
    }
  }, [modalEpKey, epKeys]);

  return (
    <div className="space-y-3">
      <p className="text-[10px] leading-relaxed text-zinc-500">
        分集以 <span className="text-zinc-400">5 列卡片</span>{" "}
        总览；点击卡片在弹窗中编辑本集（场次 / 幕 / 概述）。删除整集请在卡片上操作。
      </p>

      {epKeys.length === 0 ? (
        <button
          type="button"
          onClick={() =>
            onUpsert({
              stage: 7,
              subKey: "ep1",
              label: "第1集",
              content: "",
            })
          }
          className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/50 px-3 py-2 text-[11px] text-zinc-400 transition hover:border-indigo-600/50 hover:text-zinc-200"
        >
          添加第 1 集
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {epKeys.map((epKey) => (
            <EpisodeCard
              key={epKey}
              epKey={epKey}
              all={stage5}
              onOpen={() => setModalEpKey(epKey)}
              onRemove={() => {
                const overview = stage5.find((a) => a.subKey === epKey && !a.parentKey);
                const lab = epLabel(overview, epKey);
                if (confirm(`删除「${lab}」及其下所有场次与幕？`)) onRemoveSubtree(epKey);
              }}
            />
          ))}
        </div>
      )}

      {epKeys.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            const n = nextEpisodeNum(stage5);
            onUpsert({
              stage: 7,
              subKey: `ep${n}`,
              label: `第${n}集`,
              content: "",
            });
          }}
          className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-[11px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
        >
          + 添加第 {nextEpisodeNum(stage5)} 集
        </button>
      ) : null}

      {modalEpKey ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="episode-modal-title"
        >
          <button
            type="button"
            className="fixed inset-0 bg-zinc-950/75 backdrop-blur-[2px]"
            aria-label="关闭弹窗"
            onClick={() => setModalEpKey(null)}
          />
          <div className="relative z-10 my-auto w-full max-w-4xl rounded-xl border border-zinc-700/90 bg-zinc-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
              <h2 id="episode-modal-title" className="truncate text-sm font-semibold text-zinc-100">
                {epLabel(
                  stage5.find((a) => a.subKey === modalEpKey && !a.parentKey),
                  modalEpKey
                )}
              </h2>
              <button
                type="button"
                onClick={() => setModalEpKey(null)}
                className="shrink-0 rounded-md px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              >
                关闭
              </button>
            </div>
            <div className="max-h-[min(85vh,880px)] overflow-y-auto p-3 sm:p-4">
              <EpisodeBlock
                epKey={modalEpKey}
                all={stage5}
                onUpsert={onUpsert}
                onRemoveSubtree={onRemoveSubtree}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EpisodeCard({
  epKey,
  all,
  onOpen,
  onRemove,
}: {
  epKey: string;
  all: Artifact[];
  onOpen: () => void;
  onRemove: () => void;
}) {
  const overview = all.find((a) => a.subKey === epKey && !a.parentKey);
  const lab = epLabel(overview, epKey);
  const scenes = sceneCountForEp(epKey, all);
  const excerpt = episodeCardExcerpt(overview?.content ?? "", 100);
  const chars = (overview?.content ?? "").length;

  return (
    <div className="group relative flex min-h-[5.5rem] flex-col rounded-lg border border-zinc-800/90 bg-zinc-950/60 p-2.5 shadow-sm transition hover:border-indigo-500/45 hover:bg-zinc-900/50">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-0 flex-1 flex-col text-left"
      >
        <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-zinc-100">{lab}</span>
        <span className="mt-1.5 line-clamp-3 flex-1 text-[10px] leading-relaxed text-zinc-500">{excerpt}</span>
        <span className="mt-2 flex items-center justify-between gap-1 border-t border-zinc-800/60 pt-1.5 text-[9px] text-zinc-600">
          <span>{scenes} 场次</span>
          <span>{chars > 0 ? `${chars} 字` : "—"}</span>
        </span>
      </button>
      <button
        type="button"
        title="删除本集"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] text-zinc-600 opacity-0 transition hover:bg-rose-950/50 hover:text-rose-400 group-hover:opacity-100"
      >
        删除
      </button>
    </div>
  );
}

function EpisodeBlock({
  epKey,
  all,
  onUpsert,
  onRemoveSubtree,
}: {
  epKey: string;
  all: Artifact[];
  onUpsert: Props["onUpsert"];
  onRemoveSubtree: Props["onRemoveSubtree"];
}) {
  const overview = all.find((a) => a.subKey === epKey && !a.parentKey);
  const direct = all.filter((a) => a.parentKey === epKey);
  const sceneRoots = direct
    .filter((a) => isSceneRootSubKey(a.subKey))
    .sort((a, b) => a.subKey.localeCompare(b.subKey));
  const extras = direct.filter((a) => !isSceneRootSubKey(a.subKey));

  const epLab = epLabel(overview, epKey);

  const scenes = sceneRoots.map((scene) => ({
    scene,
    mus: all.filter((a) => a.parentKey === scene.subKey).sort((a, b) => {
      const na = parseInt(a.subKey.replace(/^.*\.m(\d+)$/u, "$1"), 10) || 0;
      const nb = parseInt(b.subKey.replace(/^.*\.m(\d+)$/u, "$1"), 10) || 0;
      return na - nb;
    }),
  }));

  return (
    <div className="rounded-lg border border-zinc-800/50 bg-zinc-950/20">
      <div className="space-y-2 p-2">
      <ArtifactSlotEditor
        label={`${epLab} · 本集概述`}
        value={overview?.content ?? ""}
        compact
        rows={8}
        textareaClassName="min-h-[min(12rem,28vh)]"
        onCommit={(content) =>
          onUpsert({
            stage: 7,
            subKey: epKey,
            label: epLab,
            content,
          })
        }
      />

      {scenes.map(({ scene, mus }) => (
        <SceneBlock
          key={scene.subKey}
          epKey={epKey}
          epLab={epLab}
          scene={scene}
          mus={mus}
          all={all}
          onUpsert={onUpsert}
          onRemoveSubtree={onRemoveSubtree}
        />
      ))}

      <button
        type="button"
        onClick={() => {
          const sn = nextSceneNum(epKey, all);
          const sk = `${epKey}.scene${sn}`;
          onUpsert({
            stage: 7,
            subKey: sk,
            parentKey: epKey,
            label: `${epLab} - 场次${sn}`,
            content: "",
          });
        }}
        className="w-full rounded-md border border-zinc-800 py-1.5 text-[10px] text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
      >
        + 本集添加场次 {nextSceneNum(epKey, all)}
      </button>

      {extras.length > 0 ? (
        <div className="space-y-1.5 pt-1">
          <p className="text-[9px] uppercase tracking-wide text-zinc-600">其他块（解析产物等）</p>
          {extras.map((a) => (
            <ArtifactSlotEditor
              key={a.subKey}
              label={a.label}
              value={a.content}
              compact
              rows={4}
              onCommit={(content) =>
                onUpsert({
                  stage: 7,
                  subKey: a.subKey,
                  parentKey: a.parentKey,
                  label: a.label,
                  content,
                })
              }
            />
          ))}
        </div>
      ) : null}
      </div>
    </div>
  );
}

function SceneBlock({
  epKey,
  epLab,
  scene,
  mus,
  all,
  onUpsert,
  onRemoveSubtree,
}: {
  epKey: string;
  epLab: string;
  scene: Artifact;
  mus: Artifact[];
  all: Artifact[];
  onUpsert: Props["onUpsert"];
  onRemoveSubtree: Props["onRemoveSubtree"];
}) {
  const [open, setOpen] = useState(true);
  const sceneMatch = scene.subKey.match(/scene(\d+)$/u);
  const sn = sceneMatch ? sceneMatch[1] : "?";

  return (
    <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/20">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-left text-[11px] font-medium text-zinc-300"
        >
          场次 {sn}
          <span className="ml-2 text-[10px] font-normal text-zinc-600">{mus.length} 幕</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("删除本场次及其下所有幕？")) onRemoveSubtree(scene.subKey);
          }}
          className="text-[10px] text-rose-500/80 hover:underline"
        >
          删除
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-zinc-800/40 p-2">
          <ArtifactSlotEditor
            label={`场次 ${sn} · 正文`}
            value={scene.content}
            compact
            rows={6}
            textareaClassName="min-h-[min(10rem,22vh)]"
            onCommit={(content) =>
              onUpsert({
                stage: 7,
                subKey: scene.subKey,
                parentKey: epKey,
                label: scene.label || `${epLab} - 场次${sn}`,
                content,
              })
            }
          />
          {mus.map((mu) => (
            <div key={mu.subKey} className="flex gap-2">
              <div className="min-w-0 flex-1">
                <ArtifactSlotEditor
                  label={mu.label}
                  value={mu.content}
                  compact
                  rows={4}
                  onCommit={(content) =>
                    onUpsert({
                      stage: 7,
                      subKey: mu.subKey,
                      parentKey: scene.subKey,
                      label: mu.label,
                      content,
                    })
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm("删除该幕？")) onRemoveSubtree(mu.subKey);
                }}
                className="self-start pt-6 text-[10px] text-rose-500/80 hover:underline"
              >
                删
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const mn = nextMuNum(scene.subKey, all);
              const mk = `${scene.subKey}.m${mn}`;
              onUpsert({
                stage: 7,
                subKey: mk,
                parentKey: scene.subKey,
                label: `${epLab} - 场次${sn} - 幕${mn}`,
                content: "",
              });
            }}
            className="w-full rounded border border-zinc-800 py-1 text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            + 添加幕 {nextMuNum(scene.subKey, all)}
          </button>
        </div>
      )}
    </div>
  );
}
