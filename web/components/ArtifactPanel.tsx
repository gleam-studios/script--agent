"use client";

import { useState } from "react";
import type { Artifact, Snapshot } from "@/lib/types";
import { STAGES, STAGE_LABELS } from "@/lib/types";
import { getStudioAutoStageUserMessage } from "@/lib/studio-auto-kickoff";
import { downloadArtifactsZip } from "@/lib/export-artifacts";
import type { PipelineProgress } from "@/lib/stage5-pipeline";
import StageGroup from "./StageGroup";

interface Props {
  projectName: string;
  hasProject: boolean;
  artifacts: Artifact[];
  snapshots: Snapshot[];
  currentStage: number;
  /** 与右侧流程条联动：当前查看哪一阶段的产物（1–5） */
  viewStage: number;
  collapsed: boolean;
  onToggle: () => void;
  onRestore: (snapshot: Snapshot) => void;
  onCreateSnapshot: () => void;
  /** 从最新一条助手回复重新解析并写入指定阶段产物 */
  onReExtractStage?: (stageId: number) => void;
  onArtifactUpsert?: (patch: Omit<Artifact, "updatedAt"> & { updatedAt?: string }) => void;
  onArtifactRemove?: (stage: number, subKey: string) => void;
  onArtifactRemoveSubtree?: (rootSubKey: string) => void;
  /** 代发当前 viewStage 的「自动开始」用户消息（与右侧流程条原播放键一致） */
  onStartThisStage?: () => void;
  hasApiKey?: boolean;
  chatLoading?: boolean;
  pipelineProgress?: PipelineProgress | null;
  onPausePipeline?: () => void;
  onResumePipeline?: () => void;
}

export default function ArtifactPanel({
  projectName,
  hasProject,
  artifacts,
  snapshots,
  currentStage,
  viewStage,
  collapsed,
  onToggle,
  onRestore,
  onCreateSnapshot,
  onReExtractStage,
  onArtifactUpsert,
  onArtifactRemove,
  onArtifactRemoveSubtree,
  onStartThisStage,
  hasApiKey = false,
  chatLoading = false,
  pipelineProgress,
  onPausePipeline,
  onResumePipeline,
}: Props) {
  const [exporting, setExporting] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsResult, setStatsResult] = useState<string | null>(null);
  const stage5Artifacts = artifacts.filter((a) => a.stage === 5);
  const canEpisodeCheck = hasProject && stage5Artifacts.length > 0;

  const stageCount = new Set(artifacts.map((a) => a.stage)).size;
  const canExport = hasProject && artifacts.length > 0 && !exporting;

  async function handleExportZip() {
    if (!canExport) return;
    setExporting(true);
    try {
      await downloadArtifactsZip(projectName || "未命名项目", artifacts);
    } catch (e) {
      console.error(e);
      alert("导出失败，请稍后重试。");
    } finally {
      setExporting(false);
    }
  }

  async function handleEpisodeCheck() {
    if (!canEpisodeCheck) return;
    const text = stage5Artifacts.map((a) => `## ${a.label}\n\n${a.content}`).join("\n\n---\n\n");
    setStatsLoading(true);
    setStatsResult(null);
    setStatsOpen(true);
    try {
      const res = await fetch("/api/episode-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || res.statusText);
      setStatsResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setStatsResult(e instanceof Error ? e.message : String(e));
    } finally {
      setStatsLoading(false);
    }
  }

  if (collapsed) {
    return (
      <div className="flex w-10 flex-col items-center border-l border-zinc-800 py-3">
        <button
          onClick={onToggle}
          className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          title="展开产物面板"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </button>
      </div>
    );
  }

  const groupedByStage = (stageId: number) =>
    artifacts.filter((a) => a.stage === stageId);

  const snapshotsForStage = (stageId: number) =>
    snapshots.filter((sn) => sn.stage === stageId);

  const viewStageSafe = Math.min(5, Math.max(1, viewStage)) as 1 | 2 | 3 | 4 | 5;
  const kickoffReady = Boolean(getStudioAutoStageUserMessage(viewStageSafe)?.trim());
  const startDisabled =
    !hasProject || !hasApiKey || chatLoading || !kickoffReady || !onStartThisStage;
  const startThisStageTitle = !hasApiKey
    ? "请先配置 API Key"
    : chatLoading
      ? "对话生成中，请稍候"
      : !kickoffReady
        ? "本阶段暂无代发文案"
        : `代发一条用户消息，开始「${STAGE_LABELS[viewStageSafe] ?? ""}」模板交付`;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header：标题 + 工具（阶段切换在右侧流程条） */}
      <div className="shrink-0 border-b border-zinc-800">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            产物记录
          </span>
          <div className="flex gap-1">
          <button
            type="button"
            onClick={handleEpisodeCheck}
            disabled={!canEpisodeCheck}
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
            title={
              !hasProject
                ? "请先选择项目"
                : stage5Artifacts.length === 0
                  ? "暂无分集产物，无法体检"
                  : "分集体检：幕数、汉字量、估时（对齐 knowledge 与 episode-stats）"
            }
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleExportZip}
            disabled={!canExport}
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
            title={
              !hasProject
                ? "请先选择项目"
                : artifacts.length === 0
                  ? "暂无产物可导出"
                  : `打包下载 ZIP（${stageCount} 个阶段，每阶段一个 .md）`
            }
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          </button>
          <button
            onClick={onCreateSnapshot}
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="创建快照"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="收起"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        </div>
      </div>

      {/* 当前阶段产物 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {!hasProject ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-zinc-600 text-center">
              对话开始后，各阶段产物<br />将自动分类显示在此处
            </p>
          </div>
        ) : (
          <StageGroup
            key={viewStage}
            stageId={viewStage}
            stageLabel={STAGE_LABELS[viewStage] ?? STAGES.find((st) => st.id === viewStage)?.label ?? ""}
            artifacts={groupedByStage(viewStage)}
            stageSnapshots={snapshotsForStage(viewStage)}
            isActive={currentStage === viewStage}
            onRestoreSnapshot={onRestore}
            onReExtractStage={onReExtractStage}
            onArtifactUpsert={onArtifactUpsert}
            onArtifactRemove={onArtifactRemove}
            onArtifactRemoveSubtree={onArtifactRemoveSubtree}
            onStartThisStage={onStartThisStage}
            startThisStageDisabled={startDisabled}
            startThisStageTitle={startThisStageTitle}
            pipelineProgress={pipelineProgress}
            onPausePipeline={onPausePipeline}
            onResumePipeline={onResumePipeline}
          />
        )}
      </div>

      {statsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setStatsOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="分集体检结果"
          >
            <div className="mb-2 flex items-start justify-between gap-2 text-xs text-zinc-300">
              <span>分集体检（启发式，对齐 tools/episode-stats）</span>
              <button
                type="button"
                className="shrink-0 text-zinc-500 hover:text-white"
                onClick={() => setStatsOpen(false)}
              >
                关闭
              </button>
            </div>
            {statsLoading ? (
              <p className="text-xs text-zinc-500">计算中…</p>
            ) : (
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-zinc-300">
                {statsResult}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
