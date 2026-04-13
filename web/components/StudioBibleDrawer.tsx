"use client";

import { useState } from "react";
import type { Artifact, Snapshot } from "@/lib/types";
import { diffBible, formatBibleDiffForDisplay } from "@/lib/bible-diff";
import { auditBibleVsCast } from "@/lib/bible-audit";

interface Props {
  open: boolean;
  onClose: () => void;
  hasProject: boolean;
  seriesBible: string;
  artifacts: Artifact[];
  snapshots: Snapshot[];
  onSeriesBibleChange: (next: string) => void;
}

export default function StudioBibleDrawer({
  open,
  onClose,
  hasProject,
  seriesBible,
  artifacts,
  snapshots,
  onSeriesBibleChange,
}: Props) {
  const [bibleDiffOpen, setBibleDiffOpen] = useState(false);
  const [bibleDiffText, setBibleDiffText] = useState("");
  const [insertingSkeleton, setInsertingSkeleton] = useState(false);

  const auditIssues = hasProject ? auditBibleVsCast(seriesBible, artifacts) : [];

  async function handleInsertSkeleton() {
    if (!hasProject) return;
    if (seriesBible.trim().length > 0) {
      if (!confirm("当前圣经非空，插入骨架将覆盖全文，确定吗？")) return;
    }
    setInsertingSkeleton(true);
    try {
      const res = await fetch("/api/bible-skeleton");
      const data = (await res.json()) as { content?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "读取失败");
      onSeriesBibleChange(data.content ?? "");
    } catch (e) {
      alert(e instanceof Error ? e.message : "插入失败");
    } finally {
      setInsertingSkeleton(false);
    }
  }

  function handleCompareBibleToLastSnapshot() {
    if (snapshots.length < 1) {
      alert("尚无快照：请先创建快照后再对比。");
      return;
    }
    const last = snapshots[snapshots.length - 1];
    const baseline = last.seriesBible ?? "";
    const lines = diffBible(baseline, seriesBible);
    setBibleDiffText(formatBibleDiffForDisplay(lines));
    setBibleDiffOpen(true);
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[45] bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
        role="dialog"
        aria-label="系列圣经"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">系列圣经（SSOT）</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="关闭"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <p className="mb-3 shrink-0 text-[10px] leading-relaxed text-zinc-500">
            项目内设定真源；与全局 knowledge/03 模板区分。对话与圣经冲突时以本正文为准。
          </p>
          <div className="mb-3 flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              disabled={!hasProject || insertingSkeleton}
              onClick={() => void handleInsertSkeleton()}
              className="rounded bg-zinc-700 px-2 py-1 text-[11px] text-zinc-200 disabled:opacity-50"
            >
              {insertingSkeleton ? "读取中…" : "插入骨架（knowledge/03）"}
            </button>
            <button
              type="button"
              disabled={!hasProject}
              onClick={handleCompareBibleToLastSnapshot}
              className="rounded bg-zinc-700 px-2 py-1 text-[11px] text-zinc-200 disabled:opacity-50"
            >
              与上次快照时的圣经对比
            </button>
          </div>
          <textarea
            value={seriesBible}
            onChange={(e) => onSeriesBibleChange(e.target.value)}
            placeholder="在此维护世界观、主线铁律、里程碑等…"
            className="min-h-0 flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-600/50 focus:outline-none focus:ring-1 focus:ring-indigo-600/30"
          />
          {auditIssues.length > 0 ? (
            <div className="mt-3 shrink-0 rounded border border-amber-900/60 bg-amber-950/20 px-2 py-1.5 text-[10px] text-amber-100/90">
              <span className="font-medium">人物名粗检：</span>
              圣经候选名未在人物产物中找到：{auditIssues.map((x) => x.name).join("、")}
            </div>
          ) : null}
        </div>
      </div>

      {bibleDiffOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setBibleDiffOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="圣经差异"
          >
            <div className="mb-2 flex items-start justify-between gap-2 text-xs text-zinc-300">
              <span>与上次快照时的圣经对比（- 删 / + 增）</span>
              <button
                type="button"
                className="shrink-0 text-zinc-500 hover:text-white"
                onClick={() => setBibleDiffOpen(false)}
              >
                关闭
              </button>
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-zinc-300">
              {bibleDiffText || "（无差异）"}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
