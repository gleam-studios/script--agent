"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type {
  Settings,
  Message,
  Project,
  Artifact,
  Snapshot,
  ProjectMeta,
  OnboardingStatus,
  OriginMode,
} from "@/lib/types";
import {
  upsertArtifact as upsertArtifactInList,
  removeArtifactByKey,
  removeSubtreeFromList,
  artifactNow,
} from "@/lib/artifact-mutations";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { detectStage, detectStageFromContent, isConfirmMessage } from "@/lib/stage-detect";
import { evaluateStageGate } from "@/lib/stage-gate";
import { buildProjectContext } from "@/lib/project-context";
import { SOURCE_ANALYSIS_CONTEXT_CHARS } from "@/lib/source-materials";
import { getStudioAutoStageUserMessage, STUDIO_AUTO_STAGE1_USER_MESSAGE } from "@/lib/studio-auto-kickoff";
import {
  parseTargetEpisodeCount,
  maxExistingEpisodeNum,
  extractPrevEpisodeSummary,
  buildEpisodeUserMessage,
  type PipelineProgress,
} from "@/lib/stage5-pipeline";
import {
  extractArtifacts,
  mergeArtifactsWithPolicy,
  looksLikeTemplateDeliverable,
  reExtractForPreferredStage,
  stage2FullReplaceOpts,
} from "@/lib/artifact-extract";
import ChatWindow, { type ChatWindowHandle } from "@/components/ChatWindow";
import SettingsDialog, { loadSettings } from "@/components/SettingsDialog";
import ArtifactPanel from "@/components/ArtifactPanel";
import StudioProcessRail from "@/components/StudioProcessRail";
import StudioBibleDrawer from "@/components/StudioBibleDrawer";

function normalizeMeta(p: Project): ProjectMeta {
  const m = p.meta;
  return {
    seriesTitle: m?.seriesTitle ?? p.name ?? "",
    episodeCount: m?.episodeCount ?? "",
    episodeDurationMinutes: m?.episodeDurationMinutes ?? null,
    targetMarket: m?.targetMarket ?? "",
    dialogueLanguage: m?.dialogueLanguage ?? "",
    extraNotes: m?.extraNotes ?? "",
  };
}

function StudioInner() {
  const params = useParams<{ id: string }>();
  const projectId = params.id ?? "";

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [seriesBible, setSeriesBible] = useState("");
  const [maxApprovedStage, setMaxApprovedStage] = useState(0);
  const [gateOverrideNote, setGateOverrideNote] = useState("");
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null);
  const [creativeBrief, setCreativeBrief] = useState("");
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [projectOriginMode, setProjectOriginMode] = useState<OriginMode>("original");
  const [projectSourceAnalysis, setProjectSourceAnalysis] = useState("");

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [bibleDrawerOpen, setBibleDrawerOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  /** 右侧产物区与流程条共用的「当前查看阶段」（1–5） */
  const [viewStage, setViewStage] = useState(1);

  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);

  const chatRef = useRef<ChatWindowHandle>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const seriesBibleSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const artifactsRef = useRef(artifacts);
  artifactsRef.current = artifacts;
  const pipelineAbortRef = useRef(false);

  const studioAutoKickoffMessage = useMemo(() => {
    if (!initialLoadComplete) return null;
    if (messages.length > 0) return null;
    if (!settings.apiKey) return null;
    if ((onboardingStatus ?? "ready") !== "ready") return null;
    return STUDIO_AUTO_STAGE1_USER_MESSAGE;
  }, [initialLoadComplete, messages.length, settings.apiKey, onboardingStatus]);

  const projectContext = useMemo(() => {
    const om = projectOriginMode ?? "original";
    const raw = projectSourceAnalysis.trim();
    const excerpt =
      om === "adaptation" && raw
        ? raw.length <= SOURCE_ANALYSIS_CONTEXT_CHARS
          ? raw
          : raw.slice(0, SOURCE_ANALYSIS_CONTEXT_CHARS) + "…"
        : undefined;
    return buildProjectContext({
      messages,
      artifacts,
      maxApprovedStage: maxApprovedStage ?? 0,
      meta: projectMeta ?? undefined,
      creativeBrief,
      originMode: om,
      sourceAnalysisExcerpt: excerpt,
    });
  }, [messages, artifacts, maxApprovedStage, projectMeta, creativeBrief, projectOriginMode, projectSourceAnalysis]);

  useEffect(() => {
    setSettings(loadSettings());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !settings.apiKey) {
      setSettingsOpen(true);
    }
  }, [mounted, settings.apiKey]);

  const loadProject = useCallback(async (id: string) => {
    setLoadError(null);
    setInitialLoadComplete(false);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) {
        setLoadError("项目不存在或无法加载");
        return;
      }
      const p: Project = await res.json();
      setProjectName(p.name);
      setMessages(p.messages);
      setArtifacts(p.artifacts);
      setSnapshots(p.snapshots);
      setCurrentStage(p.currentStage);
      setSeriesBible(p.seriesBible ?? "");
      setMaxApprovedStage(p.maxApprovedStage ?? 0);
      setGateOverrideNote(p.gateOverrideNote ?? "");
      setProjectMeta(normalizeMeta(p));
      setCreativeBrief(p.creativeBrief ?? "");
      setOnboardingStatus(p.onboardingStatus ?? "ready");
      setProjectOriginMode(p.originMode ?? "original");
      setProjectSourceAnalysis(p.sourceAnalysis ?? "");
      setInitialLoadComplete(true);
    } catch {
      setLoadError("加载失败");
    }
  }, []);

  useEffect(() => {
    if (!mounted || !projectId) return;
    void loadProject(projectId);
  }, [mounted, projectId, loadProject]);

  useEffect(() => {
    setViewStage(1);
  }, [projectId]);

  const persistProject = useCallback(
    (
      msgs: Message[],
      arts: Artifact[],
      stage: number,
      snaps?: Snapshot[],
      persistOverrides?: { seriesBible?: string; maxApprovedStage?: number; gateOverrideNote?: string }
    ) => {
      if (!projectId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const payload: Record<string, unknown> = {
            messages: msgs,
            artifacts: arts,
            currentStage: stage,
            seriesBible: persistOverrides?.seriesBible ?? seriesBible,
            maxApprovedStage: persistOverrides?.maxApprovedStage ?? maxApprovedStage,
            gateOverrideNote: persistOverrides?.gateOverrideNote ?? gateOverrideNote,
          };
          if (snaps) payload.snapshots = snaps;

          await fetch(`/api/projects/${projectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } catch {}
      }, 400);
    },
    [projectId, seriesBible, maxApprovedStage, gateOverrideNote]
  );

  const handleSeriesBibleChange = useCallback(
    (next: string) => {
      setSeriesBible(next);
      if (!projectId) return;
      if (seriesBibleSaveTimerRef.current) clearTimeout(seriesBibleSaveTimerRef.current);
      seriesBibleSaveTimerRef.current = setTimeout(async () => {
        try {
          await fetch(`/api/projects/${projectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seriesBible: next }),
          });
        } catch {}
      }, 600);
    },
    [projectId]
  );

  /** 未达标仍要标记已验（需填写原因）；「达标」路径由下方 effect 根据 Gate 自动写入 */
  const handleGateOverrideMark = useCallback(
    async (overrideNote?: string) => {
      if (!projectId || currentStage < 1) return;
      const nextMax = Math.max(currentStage, maxApprovedStage);
      const note = (overrideNote ?? "").trim() || "未达标仍标记";
      setMaxApprovedStage(nextMax);
      setGateOverrideNote(note);
      try {
        await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxApprovedStage: nextMax, gateOverrideNote: note }),
        });
      } catch {}
    },
    [projectId, currentStage, maxApprovedStage]
  );

  /** 当前对话阶段 Gate 通过时，自动将工程「已验至」提升到 currentStage（等同原「标为已验收」） */
  const autoApproveWhenGatePasses = useCallback(async () => {
    if (!projectId || currentStage < 1 || currentStage > 5) return;
    const gate = evaluateStageGate(currentStage, artifacts);
    if (!gate.ok) return;
    const nextMax = Math.max(currentStage, maxApprovedStage);
    if (nextMax <= maxApprovedStage) return;
    setMaxApprovedStage(nextMax);
    setGateOverrideNote("");
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxApprovedStage: nextMax, gateOverrideNote: "" }),
      });
    } catch {}
  }, [projectId, currentStage, artifacts, maxApprovedStage]);

  useEffect(() => {
    if (!initialLoadComplete) return;
    void autoApproveWhenGatePasses();
  }, [initialLoadComplete, autoApproveWhenGatePasses]);

  const runEpisodePipeline = useCallback(
    async (totalEpisodes: number) => {
      if (!chatRef.current) return;
      pipelineAbortRef.current = false;

      const startFrom = maxExistingEpisodeNum(artifactsRef.current) + 1;
      if (startFrom > totalEpisodes) {
        setPipelineProgress({ current: totalEpisodes, total: totalEpisodes, status: "done" });
        return;
      }

      setPipelineProgress({ current: startFrom, total: totalEpisodes, status: "running" });

      for (let ep = startFrom; ep <= totalEpisodes; ep++) {
        if (pipelineAbortRef.current) {
          setPipelineProgress((prev) =>
            prev ? { ...prev, status: "paused" } : null
          );
          return;
        }

        setPipelineProgress({ current: ep, total: totalEpisodes, status: "running" });

        const prevSummary =
          ep > 1 ? extractPrevEpisodeSummary(artifactsRef.current, ep - 1) : "";
        const userMsg = buildEpisodeUserMessage(ep, totalEpisodes, prevSummary);

        let reply = "";
        let retried = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          reply = await chatRef.current.sendUserMessage(userMsg);
          if (reply && reply !== "(模型未返回任何内容)") break;
          if (attempt === 0) {
            retried = true;
            await new Promise((r) => setTimeout(r, 2000));
          }
        }

        await new Promise((r) => setTimeout(r, 300));

        const epKey = `ep${ep}`;
        const parsed = artifactsRef.current.some(
          (a) => a.stage === 5 && a.subKey === epKey
        );

        if (!reply || (!parsed && !retried)) {
          setPipelineProgress({
            current: ep,
            total: totalEpisodes,
            status: "error",
            errorMessage: `第 ${ep} 集生成或解析失败`,
          });
          return;
        }

        if (ep < totalEpisodes) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      setPipelineProgress({ current: totalEpisodes, total: totalEpisodes, status: "done" });
    },
    []
  );

  const handleStartPipeline = useCallback(() => {
    const raw = projectMeta?.episodeCount ?? "";
    let total = parseTargetEpisodeCount(raw);

    if (!total) {
      const input = prompt(
        `请输入目标集数（当前立项填写的集数为「${raw || "未填"}」）：`
      );
      if (!input) return;
      total = parseTargetEpisodeCount(input);
      if (!total) {
        alert("无法解析为有效集数，请输入纯数字（如 40）。");
        return;
      }
    }

    if (
      !confirm(
        `即将启动自动流水线，从第 ${maxExistingEpisodeNum(artifacts) + 1} 集写到第 ${total} 集。\n全程无需手动干预，可随时暂停。确认开始？`
      )
    ) {
      return;
    }

    setViewStage(5);
    void runEpisodePipeline(total);
  }, [projectMeta, artifacts, runEpisodePipeline]);

  const handlePausePipeline = useCallback(() => {
    pipelineAbortRef.current = true;
  }, []);

  const handleResumePipeline = useCallback(() => {
    if (!pipelineProgress || pipelineProgress.status !== "paused") return;
    void runEpisodePipeline(pipelineProgress.total);
  }, [pipelineProgress, runEpisodePipeline]);

  const handleAutoStartStage = useCallback(
    (stage: 1 | 2 | 3 | 4 | 5) => {
      if (stage === 5) {
        handleStartPipeline();
        return;
      }
      const text = getStudioAutoStageUserMessage(stage);
      if (text) void chatRef.current?.sendUserMessage(text);
    },
    [handleStartPipeline]
  );

  function handleMessagesChange(newMessages: Message[]) {
    setMessages(newMessages);
    const stage = detectStage(newMessages);
    setCurrentStage(stage);
  }

  function artifactsWorthMerging(fullReply: string, list: Artifact[]): boolean {
    if (list.length === 0) return false;
    if (list.length === 1 && list[0].subKey === "full" && !looksLikeTemplateDeliverable(fullReply)) {
      return false;
    }
    return true;
  }

  function handleAssistantDone(fullReply: string, messagesSnapshot: Message[]) {
    let stage = detectStageFromContent(fullReply);
    if (stage === 0) {
      stage = detectStage(messagesSnapshot);
    }
    setCurrentStage(stage);

    const lastUserMsg = [...messagesSnapshot].reverse().find((m) => m.role === "user");
    const lastUserText = lastUserMsg?.content;

    let newArtifacts = artifacts;
    if (stage > 0) {
      let extracted = extractArtifacts(fullReply, stage);

      if (
        looksLikeTemplateDeliverable(fullReply) &&
        (extracted.length === 0 || (extracted.length === 1 && extracted[0].subKey === "full"))
      ) {
        for (let tryStage = 1; tryStage <= 5; tryStage++) {
          if (tryStage === stage) continue;
          const fallback = extractArtifacts(fullReply, tryStage);
          if (
            fallback.length > 0 &&
            !(fallback.length === 1 && fallback[0].subKey === "full") &&
            artifactsWorthMerging(fullReply, fallback)
          ) {
            extracted = fallback;
            stage = tryStage;
            setCurrentStage(tryStage);
            break;
          }
        }
      }

      if (artifactsWorthMerging(fullReply, extracted)) {
        const policy = stage2FullReplaceOpts(extracted, lastUserText);
        newArtifacts = mergeArtifactsWithPolicy(artifacts, extracted, policy);
        setArtifacts(newArtifacts);
      }
    } else if (looksLikeTemplateDeliverable(fullReply)) {
      for (let tryStage = 1; tryStage <= 5; tryStage++) {
        const fallback = extractArtifacts(fullReply, tryStage);
        if (
          fallback.length > 0 &&
          !(fallback.length === 1 && fallback[0].subKey === "full") &&
          artifactsWorthMerging(fullReply, fallback)
        ) {
          stage = tryStage;
          setCurrentStage(tryStage);
          const policy = stage2FullReplaceOpts(fallback, lastUserText);
          newArtifacts = mergeArtifactsWithPolicy(artifacts, fallback, policy);
          setArtifacts(newArtifacts);
          break;
        }
      }
    }

    persistProject(messagesSnapshot, newArtifacts, stage, snapshots);
    if (lastUserMsg && isConfirmMessage(lastUserMsg.content)) {
      autoSnapshot(stage, newArtifacts);
    }
  }

  async function autoSnapshot(stage: number, arts: Artifact[]) {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: `STAGE ${stage} 确认后`,
        }),
      });
      if (res.ok) {
        const snap: Snapshot = await res.json();
        setSnapshots((prev) => [...prev, snap]);
      }
    } catch {}
  }

  const handleArtifactUpsert = useCallback(
    (patch: Omit<Artifact, "updatedAt"> & { updatedAt?: string }) => {
      setArtifacts((prev) => {
        const next = upsertArtifactInList(prev, { ...patch, updatedAt: patch.updatedAt ?? artifactNow() });
        persistProject(messages, next, currentStage, snapshots);
        return next;
      });
    },
    [messages, currentStage, snapshots, persistProject]
  );

  const handleArtifactRemove = useCallback(
    (stage: number, subKey: string) => {
      setArtifacts((prev) => {
        const next = removeArtifactByKey(prev, stage, subKey);
        persistProject(messages, next, currentStage, snapshots);
        return next;
      });
    },
    [messages, currentStage, snapshots, persistProject]
  );

  const handleArtifactRemoveSubtree = useCallback(
    (rootSubKey: string) => {
      setArtifacts((prev) => {
        const next = removeSubtreeFromList(prev, rootSubKey);
        persistProject(messages, next, currentStage, snapshots);
        return next;
      });
    },
    [messages, currentStage, snapshots, persistProject]
  );

  const handleReExtractStage = useCallback(
    (preferredStage: number) => {
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (!lastAssistant?.content?.trim()) {
        alert("暂无助手回复，请先在左侧生成一条助手消息。");
        return;
      }
      const fullReply = lastAssistant.content;
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const lastUserText = lastUserMsg?.content;

      const result = reExtractForPreferredStage(fullReply, preferredStage);
      if (!result) {
        alert("未能从最新助手回复中解析出可记录的产物。请检查格式或确认最新一条是目标阶段的交付。");
        return;
      }

      const { extracted, stageUsed } = result;
      const s2Policy = stage2FullReplaceOpts(extracted, lastUserText);
      const replaceStages = new Set<number>([stageUsed]);
      if (s2Policy?.replaceStages) {
        for (const s of s2Policy.replaceStages) replaceStages.add(s);
      }
      const newArtifacts = mergeArtifactsWithPolicy(artifacts, extracted, {
        replaceStages: Array.from(replaceStages),
      });
      const nextPersistStage = Math.max(currentStage, stageUsed);
      setArtifacts(newArtifacts);
      setCurrentStage((prev) => Math.max(prev, stageUsed));
      persistProject(messages, newArtifacts, nextPersistStage, snapshots);
    },
    [messages, artifacts, currentStage, snapshots, persistProject]
  );

  async function handleCreateSnapshot() {
    if (!projectId) return;
    persistProject(messages, artifacts, currentStage, snapshots);
    try {
      const res = await fetch(`/api/projects/${projectId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: `手动快照 - STAGE ${currentStage}` }),
      });
      if (res.ok) {
        const snap: Snapshot = await res.json();
        setSnapshots((prev) => [...prev, snap]);
      }
    } catch {}
  }

  async function handleRestore(snapshot: Snapshot) {
    const trimmed = messages.slice(0, snapshot.messageCount);
    const restoredArtifacts = snapshot.artifacts;
    const bible = snapshot.seriesBible ?? "";
    setMessages(trimmed);
    setArtifacts(restoredArtifacts);
    setCurrentStage(snapshot.stage);
    setSeriesBible(bible);
    persistProject(trimmed, restoredArtifacts, snapshot.stage, snapshots, { seriesBible: bible });
  }

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
        无效的项目 ID
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-400">
        <p>{loadError}</p>
        <Link href="/" className="text-indigo-400 hover:underline">
          返回项目页
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-800">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Link
              href="/"
              className="shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            >
              返回项目页
            </Link>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              BL
            </div>
            <h1 className="truncate text-sm font-semibold text-zinc-200">短剧编剧室</h1>
            <span className="truncate text-xs text-zinc-500">· {projectName || "…"}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setBibleDrawerOpen(true)}
              disabled={!projectId}
              className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              title="项目设定真源（SSOT）"
            >
              系列圣经
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              title="API 设置"
            >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            </button>
          </div>
        </div>
        {onboardingStatus && onboardingStatus !== "ready" && (
          <div className="border-t border-zinc-800/80 px-4 py-2">
            <div className="rounded border border-amber-800/60 bg-amber-950/40 px-2 py-1.5 text-[10px] text-amber-100/90">
              立项未完成（{onboardingStatus === "pending_setup" ? "待填写" : "策划中"}）。
              <Link
                href={`/project/${projectId}/onboarding`}
                className="ml-1 underline text-indigo-300 hover:text-indigo-200"
              >
                去立项页
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex flex-1 overflow-hidden">
        <div className="w-[380px] shrink-0 overflow-hidden border-r border-zinc-800">
          <ChatWindow
            ref={chatRef}
            settings={settings}
            messages={messages}
            projectId={projectId}
            projectContext={projectContext}
            onOpenSettings={() => setSettingsOpen(true)}
            onMessagesChange={handleMessagesChange}
            onAssistantDone={handleAssistantDone}
            autoKickoffUserMessage={studioAutoKickoffMessage}
            onLoadingChange={setChatLoading}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1">
          <ArtifactPanel
            projectName={projectName || "未命名项目"}
            hasProject={!!projectId}
            artifacts={artifacts}
            snapshots={snapshots}
            currentStage={currentStage}
            viewStage={viewStage}
            collapsed={panelCollapsed}
            onToggle={() => setPanelCollapsed(!panelCollapsed)}
            onRestore={handleRestore}
            onCreateSnapshot={handleCreateSnapshot}
            onReExtractStage={handleReExtractStage}
            onArtifactUpsert={handleArtifactUpsert}
            onArtifactRemove={handleArtifactRemove}
            onArtifactRemoveSubtree={handleArtifactRemoveSubtree}
            hasApiKey={Boolean(settings.apiKey)}
            chatLoading={chatLoading}
            onStartThisStage={() => handleAutoStartStage(viewStage as 1 | 2 | 3 | 4 | 5)}
            pipelineProgress={viewStage === 5 ? pipelineProgress : null}
            onPausePipeline={handlePausePipeline}
            onResumePipeline={handleResumePipeline}
          />
          <StudioProcessRail
            key={projectId || "none"}
            artifacts={artifacts}
            currentStage={currentStage}
            viewStage={viewStage}
            onViewStageChange={setViewStage}
            maxApprovedStage={maxApprovedStage}
            gateOverrideNote={gateOverrideNote}
            onGateOverrideMark={handleGateOverrideMark}
          />
        </div>
      </main>

      <StudioBibleDrawer
        open={bibleDrawerOpen}
        onClose={() => setBibleDrawerOpen(false)}
        hasProject={!!projectId}
        seriesBible={seriesBible}
        artifacts={artifacts}
        snapshots={snapshots}
        onSeriesBibleChange={handleSeriesBibleChange}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={setSettings}
      />
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[200px] items-center justify-center bg-zinc-950 text-zinc-500">
          加载中…
        </div>
      }
    >
      <StudioInner />
    </Suspense>
  );
}
