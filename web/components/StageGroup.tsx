"use client";

import type { Artifact, Snapshot } from "@/lib/types";
import type { PipelineProgress } from "@/lib/stage5-pipeline";
import StageSnapshotSection from "./StageSnapshotSection";
import StageFlatManual from "./StageFlatManual";
import EpisodeTreeEditor from "./EpisodeTreeEditor";

interface Props {
  stageId: number;
  stageLabel: string;
  artifacts: Artifact[];
  stageSnapshots: Snapshot[];
  isActive: boolean;
  onRestoreSnapshot: (snapshot: Snapshot) => void;
  onReExtractStage?: (stageId: number) => void;
  onArtifactUpsert?: (patch: Omit<Artifact, "updatedAt"> & { updatedAt?: string }) => void;
  onArtifactRemove?: (stage: number, subKey: string) => void;
  onArtifactRemoveSubtree?: (rootSubKey: string) => void;
  /** 代发本阶段「自动开始」文案；不传则不显示按钮 */
  onStartThisStage?: () => void;
  startThisStageDisabled?: boolean;
  startThisStageTitle?: string;
  pipelineProgress?: PipelineProgress | null;
  onPausePipeline?: () => void;
  onResumePipeline?: () => void;
}

function PipelineProgressBar({
  progress,
  onPause,
  onResume,
}: {
  progress: PipelineProgress;
  onPause?: () => void;
  onResume?: () => void;
}) {
  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  const isRunning = progress.status === "running";
  const isPaused = progress.status === "paused";
  const isDone = progress.status === "done";
  const isError = progress.status === "error";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-300">
          {isDone
            ? `全部 ${progress.total} 集已生成`
            : isError
              ? progress.errorMessage || "流水线出错"
              : isPaused
                ? `已暂停（第 ${progress.current} / ${progress.total} 集）`
                : `正在写第 ${progress.current} / ${progress.total} 集…`}
        </span>
        <div className="flex gap-1">
          {isRunning && onPause && (
            <button
              type="button"
              onClick={onPause}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-amber-400 transition hover:bg-amber-950/50"
            >
              暂停
            </button>
          )}
          {isPaused && onResume && (
            <button
              type="button"
              onClick={onResume}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-indigo-400 transition hover:bg-indigo-950/50"
            >
              继续
            </button>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isDone
              ? "bg-emerald-500"
              : isError
                ? "bg-rose-500"
                : isPaused
                  ? "bg-amber-500"
                  : "bg-indigo-500"
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function StageGroup({
  stageId,
  stageLabel,
  artifacts,
  stageSnapshots,
  isActive,
  onRestoreSnapshot,
  onReExtractStage,
  onArtifactUpsert,
  onArtifactRemove,
  onArtifactRemoveSubtree,
  onStartThisStage,
  startThisStageDisabled,
  startThisStageTitle,
  pipelineProgress,
  onPausePipeline,
  onResumePipeline,
}: Props) {
  const isEpisodes = stageId === 5;

  return (
    <div className="space-y-2">
      <div className="flex w-full items-center gap-1.5 py-1">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                isActive ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {stageId}
            </span>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={`truncate text-sm font-medium ${isActive ? "text-zinc-100" : "text-zinc-400"}`}>
                {stageLabel}
              </span>
              {onStartThisStage ? (
                <button
                  type="button"
                  disabled={startThisStageDisabled || (isEpisodes && pipelineProgress?.status === "running")}
                  title={startThisStageTitle}
                  onClick={() => onStartThisStage()}
                  className="shrink-0 rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isEpisodes ? "连续分集" : "开始"}
                </button>
              ) : null}
            </div>
          </div>
          <span className="shrink-0 text-[10px] text-zinc-600">
            {artifacts.length > 0 ? `${artifacts.length} 项` : null}
            {artifacts.length > 0 && stageSnapshots.length > 0 ? " · " : null}
            {stageSnapshots.length > 0 ? `${stageSnapshots.length} 快照` : null}
            {artifacts.length === 0 && stageSnapshots.length === 0 ? "可手写" : null}
          </span>
        </div>
        {onReExtractStage ? (
          <button
            type="button"
            title="从左侧最新一条助手回复重新解析并写入本阶段"
            className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            onClick={() => onReExtractStage(stageId)}
          >
            重新记录
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] leading-relaxed text-zinc-500">
          {isEpisodes
            ? "分集为卡片总览（大屏 5 列），点卡片在弹窗中编辑整集；左侧解析会落入对应集。"
            : "下方槽位与工程验收项一致；可直接粘贴左侧助手输出，或点「重新记录」自动抓取。"}
        </p>

        {isEpisodes && pipelineProgress && (
          <PipelineProgressBar
            progress={pipelineProgress}
            onPause={onPausePipeline}
            onResume={onResumePipeline}
          />
        )}

        {onArtifactUpsert && onArtifactRemove && onArtifactRemoveSubtree ? (
          isEpisodes ? (
            <EpisodeTreeEditor
              artifacts={artifacts}
              onUpsert={onArtifactUpsert}
              onRemoveSubtree={onArtifactRemoveSubtree}
            />
          ) : (
            <StageFlatManual
              stageId={stageId}
              artifacts={artifacts}
              onUpsert={onArtifactUpsert}
              onRemove={onArtifactRemove}
            />
          )
        ) : null}

        {stageSnapshots.length > 0 ? (
          <StageSnapshotSection snapshots={stageSnapshots} onRestore={onRestoreSnapshot} />
        ) : null}
      </div>
    </div>
  );
}
