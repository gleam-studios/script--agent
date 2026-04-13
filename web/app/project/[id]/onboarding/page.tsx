"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import type {
  AdaptationPhase,
  Message,
  OriginMode,
  Project,
  ProjectMeta,
  SourceMaterial,
  Settings,
} from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { loadSettings } from "@/components/SettingsDialog";
import SettingsDialog from "@/components/SettingsDialog";
import PlanningChatPanel from "@/components/PlanningChatPanel";
import { buildAdaptationDiscussBootstrap, buildPlanningBootstrap } from "@/lib/planning-bootstrap";
import {
  SOURCE_MATERIALS_MAX_CHARS,
  assertSourceMaterialsWithinLimit,
  totalSourceChars,
} from "@/lib/source-materials";

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

function effectiveAdaptPhase(p: Project): AdaptationPhase {
  if ((p.originMode ?? "original") !== "adaptation") return "idle";
  return p.adaptationPhase ?? "upload";
}

export default function OnboardingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [originTab, setOriginTab] = useState<OriginMode>("original");
  const [adaptPhase, setAdaptPhase] = useState<AdaptationPhase>("idle");

  const [meta, setMeta] = useState<ProjectMeta>({
    seriesTitle: "",
    episodeCount: "",
    episodeDurationMinutes: null,
    targetMarket: "",
    dialogueLanguage: "",
    extraNotes: "",
  });
  const [materials, setMaterials] = useState<SourceMaterial[]>([]);
  const [planningMessages, setPlanningMessages] = useState<Message[]>([]);
  const [adaptationMessages, setAdaptationMessages] = useState<Message[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pasteLabel, setPasteLabel] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefDraft, setBriefDraft] = useState("");
  const [creativeBrief, setCreativeBrief] = useState("");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const adaptationMessagesRef = useRef<Message[]>([]);

  useEffect(() => {
    adaptationMessagesRef.current = adaptationMessages;
  }, [adaptationMessages]);

  const planningBootstrap = useMemo(() => buildPlanningBootstrap(meta, materials), [meta, materials]);

  const adaptationDiscussBootstrap = useMemo(
    () => buildAdaptationDiscussBootstrap(project?.sourceAnalysis, materials),
    [project?.sourceAnalysis, materials]
  );

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) {
        setProject(null);
        return;
      }
      const p: Project = await res.json();
      setProject(p);
      setMeta(normalizeMeta(p));
      setMaterials(p.sourceMaterials ?? []);
      setPlanningMessages(p.planningMessages ?? []);
      setAdaptationMessages(p.adaptationMessages ?? []);
      setCreativeBrief(p.creativeBrief ?? "");
      const om: OriginMode = p.originMode ?? "original";
      setOriginTab(om);
      let nextAdapt = effectiveAdaptPhase(p);
      if (
        om === "adaptation" &&
        p.adaptationPhase === "planner" &&
        (p.creativeBrief ?? "").trim().length > 0
      ) {
        nextAdapt = "meta";
      }
      setAdaptPhase(nextAdapt);
      const st = p.onboardingStatus ?? "ready";
      if (om === "original" && (st === "planning" || st === "ready")) setStep(2);
      else if (om === "original") setStep(1);
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateMeta<K extends keyof ProjectMeta>(key: K, value: ProjectMeta[K]) {
    setMeta((m) => ({ ...m, [key]: value }));
  }

  function requestOriginTab(next: OriginMode) {
    if (next === originTab) return;
    const serverMode = project?.originMode ?? "original";
    if (serverMode === "adaptation" && next === "original") {
      const hasProgress =
        (project?.sourceAnalysis?.trim()?.length ?? 0) > 0 ||
        (adaptationMessages?.length ?? 0) > 0 ||
        (planningMessages?.length ?? 0) > 0;
      if (hasProgress && !confirm("已保存为改编立项。切换到原创将仅影响本页向导展示，已存数据仍保留在项目内。继续？")) {
        return;
      }
    }
    setOriginTab(next);
  }

  function addMaterial(mat: SourceMaterial) {
    const { ok, total } = assertSourceMaterialsWithinLimit(materials, mat.text.length);
    if (!ok) {
      alert(`素材总字数将超过上限（${SOURCE_MATERIALS_MAX_CHARS}），当前约 ${total} 字。`);
      return false;
    }
    setMaterials((prev) => [...prev, mat]);
    return true;
  }

  function removeMaterial(mid: string) {
    setMaterials((prev) => prev.filter((m) => m.id !== mid));
  }

  function handleAddPaste() {
    const text = pasteBody.trim();
    if (!text) {
      alert("请先粘贴正文");
      return;
    }
    const label = pasteLabel.trim() || `粘贴 ${new Date().toLocaleString()}`;
    const mat: SourceMaterial = {
      id: nanoid(10),
      kind: "paste",
      label,
      text,
      createdAt: new Date().toISOString(),
    };
    if (addMaterial(mat)) {
      setPasteBody("");
      setPasteLabel("");
    }
  }

  async function handleFile(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase();
      let text = "";
      let kind: SourceMaterial["kind"] = "txt";
      if (lower.endsWith(".docx")) {
        kind = "docx";
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/parse-docx", { method: "POST", body: fd });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok) {
          alert(data.error || "docx 解析失败");
          continue;
        }
        text = data.text ?? "";
      } else {
        text = await file.text();
      }
      const mat: SourceMaterial = {
        id: nanoid(10),
        kind,
        label: file.name,
        text,
        createdAt: new Date().toISOString(),
      };
      if (!addMaterial(mat)) break;
    }
  }

  async function handleSaveStep1() {
    if (!meta.seriesTitle.trim()) {
      alert("请填写剧名");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: meta.seriesTitle.trim(),
          meta: { ...meta, seriesTitle: meta.seriesTitle.trim() },
          sourceMaterials: materials,
          onboardingStatus: "planning",
          originMode: "original",
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      const p: Project = await res.json();
      setProject(p);
      setOriginTab("original");
      setStep(2);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const persistPlanning = useCallback(
    async (msgs: Message[]) => {
      try {
        await fetch(`/api/projects/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planningMessages: msgs }),
        });
      } catch {
        // ignore
      }
    },
    [id]
  );

  const persistAdaptation = useCallback(
    async (msgs: Message[]) => {
      try {
        await fetch(`/api/projects/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adaptationMessages: msgs }),
        });
      } catch {
        // ignore
      }
    },
    [id]
  );

  function handlePlanningAssistantDone(_full: string, snapshot: Message[]) {
    void persistPlanning(snapshot);
  }

  function handleAdaptationAssistantDone(_full: string, snapshot: Message[]) {
    void persistAdaptation(snapshot);
  }

  function openBriefModalOriginal() {
    const lastAssistant = [...planningMessages].reverse().find((m) => m.role === "assistant");
    setBriefDraft((lastAssistant?.content ?? "").trim() || project?.creativeBrief?.trim() || "");
    setBriefOpen(true);
  }

  async function handleFinishOnboardingOriginal() {
    const brief = briefDraft.trim();
    if (!brief) {
      alert("请填写或粘贴《创作思路确认书》正文");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creativeBrief: brief,
          onboardingStatus: "ready",
          planningMessages,
          meta,
          sourceMaterials: materials,
          name: meta.seriesTitle.trim() || project?.name,
          originMode: "original",
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      setBriefOpen(false);
      alert("已进入编剧室：请从 STAGE 1 剧情梗概开始。");
      router.push(`/studio/${id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMaterialsAndAnalyze() {
    if (!materials.length) {
      alert("请先上传或粘贴至少一份原文");
      return;
    }
    if (!settings.apiKey) {
      setSettingsOpen(true);
      return;
    }
    setSaving(true);
    setAnalyzing(true);
    try {
      const put = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceMaterials: materials,
          originMode: "adaptation",
          adaptationPhase: "upload",
          onboardingStatus: "planning",
        }),
      });
      if (!put.ok) throw new Error("保存素材失败");
      const res = await fetch("/api/onboarding/analyze-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, settings }),
      });
      const data = (await res.json()) as { error?: string; project?: Project };
      if (!res.ok) {
        alert(data.error || "分析失败");
        return;
      }
      if (data.project) setProject(data.project);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "分析失败");
    } finally {
      setSaving(false);
      setAnalyzing(false);
    }
  }

  async function putAdaptPhase(phase: AdaptationPhase) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adaptationPhase: phase }),
    });
    if (!res.ok) throw new Error("保存失败");
    const p: Project = await res.json();
    setProject(p);
    setAdaptPhase(phase);
  }

  async function handleEnterDiscuss() {
    setSaving(true);
    try {
      await putAdaptPhase("discuss");
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateAdaptPlan() {
    if (!settings.apiKey) {
      setSettingsOpen(true);
      return;
    }
    const latestDiscuss =
      adaptationMessages.length >= adaptationMessagesRef.current.length
        ? adaptationMessages
        : adaptationMessagesRef.current;
    setGeneratingPlan(true);
    try {
      const res = await fetch("/api/onboarding/generate-adaptation-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          settings,
          adaptationMessages: latestDiscuss,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        project?: Project;
        meta?: ProjectMeta;
        prefillOk?: boolean;
        prefillWarning?: string;
      };
      if (!res.ok) {
        alert(data.error || "生成失败");
        return;
      }
      if (data.project) {
        setProject(data.project);
        setCreativeBrief(data.project.creativeBrief ?? "");
        setPlanningMessages(data.project.planningMessages ?? []);
        setAdaptationMessages(data.project.adaptationMessages ?? latestDiscuss);
      }
      if (data.meta) setMeta(data.meta);
      if (data.prefillOk === false && data.prefillWarning) {
        alert(`预填未完全成功：${data.prefillWarning}。你可手动修改表单。`);
      }
      setAdaptPhase("meta");
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGeneratingPlan(false);
    }
  }

  async function handleFinishAdaptMeta() {
    if (!meta.seriesTitle.trim()) {
      alert("请填写剧名");
      return;
    }
    if (!creativeBrief.trim()) {
      alert("规划正文为空，请填写或返回上一步重新生成");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: meta.seriesTitle.trim(),
          meta: { ...meta, seriesTitle: meta.seriesTitle.trim() },
          onboardingStatus: "ready",
          originMode: "adaptation",
          adaptationPhase: "ready",
          sourceMaterials: materials,
          planningMessages,
          adaptationMessages,
          creativeBrief: creativeBrief.trim(),
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      alert("已进入编剧室：请从 STAGE 1 剧情梗概开始。");
      router.push(`/studio/${id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">
        加载中…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-400">
        <p>项目不存在</p>
        <Link href="/" className="text-indigo-400 hover:underline">
          返回编剧室
        </Link>
      </div>
    );
  }

  const totalChars = totalSourceChars(materials);
  const status = project.onboardingStatus ?? "ready";
  const serverMode = project.originMode ?? "original";
  const isAdaptationUi = originTab === "adaptation";
  /** 本地选了改编但尚未写入服务端时，仍显示「上传」步 */
  const phase: AdaptationPhase =
    isAdaptationUi && serverMode !== "adaptation" ? "upload" : isAdaptationUi ? adaptPhase : "idle";

  const materialsBlock = (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
        <span>素材（上传 / 粘贴）</span>
        <span>
          约 {totalChars} / {SOURCE_MATERIALS_MAX_CHARS} 字
        </span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.docx,text/plain"
        multiple
        className="hidden"
        aria-hidden
        onChange={(e) => {
          void handleFile(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-900/40 transition hover:bg-indigo-500"
        >
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          选择文件上传
        </button>
        <span className="text-[11px] leading-snug text-zinc-500">
          支持 .txt、Word（.docx），可多选；Word 会在服务端转为纯文本保存
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          value={pasteLabel}
          onChange={(e) => setPasteLabel(e.target.value)}
          placeholder="粘贴素材标题（可选）"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs sm:max-w-xs"
        />
        <button type="button" onClick={handleAddPaste} className="rounded bg-zinc-700 px-2 py-1.5 text-xs text-zinc-200">
          加入粘贴正文
        </button>
      </div>
      <textarea
        value={pasteBody}
        onChange={(e) => setPasteBody(e.target.value)}
        rows={5}
        placeholder="在此粘贴大纲、灵感或网文片段…"
        className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-[11px]"
      />
      <ul className="mt-2 space-y-1 text-[11px] text-zinc-500">
        {materials.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 rounded bg-zinc-900/80 px-2 py-1">
            <span className="truncate">
              {m.label} · {m.kind} · {m.text.length} 字
            </span>
            <button type="button" onClick={() => removeMaterial(m.id)} className="shrink-0 text-rose-400">
              删除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const metaForm = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs">
        <span className="text-zinc-500">剧名</span>
        <input
          value={meta.seriesTitle}
          onChange={(e) => updateMeta("seriesTitle", e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
          placeholder="必填"
        />
      </label>
      <label className="block text-xs">
        <span className="text-zinc-500">目标集数 / 区间</span>
        <input
          value={meta.episodeCount}
          onChange={(e) => updateMeta("episodeCount", e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
          placeholder="如 60 或 30～45"
        />
      </label>
      <label className="block text-xs">
        <span className="text-zinc-500">单集时长（分钟）</span>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={meta.episodeDurationMinutes ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            updateMeta("episodeDurationMinutes", v === "" ? null : Number(v));
          }}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
          placeholder="如 2"
        />
      </label>
      <label className="block text-xs">
        <span className="text-zinc-500">目标市场</span>
        <input
          value={meta.targetMarket}
          onChange={(e) => updateMeta("targetMarket", e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs sm:col-span-2">
        <span className="text-zinc-500">台词语言</span>
        <input
          value={meta.dialogueLanguage}
          onChange={(e) => updateMeta("dialogueLanguage", e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
          placeholder="如 中文 / 英文"
        />
      </label>
      <label className="block text-xs sm:col-span-2">
        <span className="text-zinc-500">备注</span>
        <textarea
          value={meta.extraNotes}
          onChange={(e) => updateMeta("extraNotes", e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">项目立项</h1>
            <p className="text-[11px] text-zinc-500">
              {isAdaptationUi ? "上传原文 → 分析 → 改编讨论 → 立项表单 → 编剧室" : "填写元数据与素材 → 策划对齐 → 进入编剧室"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              API 设置
            </button>
            <Link href="/" className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800">
              返回编剧室
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-500">模式</span>
          <div className="inline-flex rounded-lg border border-zinc-700 p-0.5">
            <button
              type="button"
              onClick={() => requestOriginTab("original")}
              className={`rounded-md px-3 py-1 text-xs ${
                originTab === "original" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              原创
            </button>
            <button
              type="button"
              onClick={() => requestOriginTab("adaptation")}
              className={`rounded-md px-3 py-1 text-xs ${
                originTab === "adaptation" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              改编
            </button>
          </div>
          {serverMode === "adaptation" && (
            <span className="text-[10px] text-zinc-600">（服务端已保存为改编）</span>
          )}
        </div>

        {status === "ready" && (
          <div className="mb-4 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200/90">
            本项目已完成立项。你可继续调整策划，或
            <Link href={`/studio/${id}`} className="ml-1 text-indigo-400 underline">
              进入编剧室
            </Link>
            。
          </div>
        )}

        {!isAdaptationUi && (
          <>
            <div className="mb-4 flex gap-2 text-xs">
              <span
                className={`rounded-full px-2 py-0.5 ${step === 1 ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-500"}`}
              >
                1 元数据与素材
              </span>
              <span className="text-zinc-600">→</span>
              <span
                className={`rounded-full px-2 py-0.5 ${step === 2 ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-500"}`}
              >
                2 策划对齐
              </span>
            </div>

            {step === 1 && (
              <div className="space-y-4">
                {metaForm}
                {materialsBlock}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveStep1()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {saving ? "保存中…" : "保存并进入策划"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-400"
                  >
                    已有保存：去策划
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  ← 返回修改元数据与素材
                </button>
                <PlanningChatPanel
                  settings={settings}
                  messages={planningMessages}
                  planningBootstrap={planningBootstrap}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onMessagesChange={setPlanningMessages}
                  onAssistantDone={handlePlanningAssistantDone}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openBriefModalOriginal}
                    className="rounded-lg bg-emerald-800 px-4 py-2 text-sm text-emerald-100"
                  >
                    确认创作思路并进入编剧室
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {isAdaptationUi && (
          <div className="space-y-6">
            <p className="text-[10px] text-zinc-500">
              改编流程：上传 → 分析 → 讨论 → 立项表单
              {phase !== "idle" && phase !== "upload" && (
                <span className="ml-2 text-zinc-600">
                  （当前：{phase === "ready" ? "已完成" : phase}）
                </span>
              )}
            </p>

            {(phase === "idle" || phase === "upload") && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-400">请先上传或粘贴待改编原文（至少一份）。保存后将调用模型做一次结构化分析。</p>
                {materialsBlock}
                <button
                  type="button"
                  disabled={saving || analyzing}
                  onClick={() => void handleSaveMaterialsAndAnalyze()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {analyzing ? "分析中…" : saving ? "保存中…" : "保存原文并开始分析"}
                </button>
              </div>
            )}

            {phase === "analyzed" && (
              <div className="space-y-3">
                <h2 className="text-xs font-medium text-zinc-300">原文分析（只读）</h2>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 text-[11px] leading-relaxed text-zinc-300">
                  {project.sourceAnalysis || "（无）"}
                </pre>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleEnterDiscuss()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  进入改编讨论
                </button>
              </div>
            )}

            {phase === "discuss" && (
              <div className="space-y-3">
                <PlanningChatPanel
                  key="adapt-discuss"
                  layout="fixedScroll"
                  settings={settings}
                  messages={adaptationMessages}
                  planningBootstrap={adaptationDiscussBootstrap}
                  chatEndpoint="/api/adaptation-discuss"
                  onOpenSettings={() => setSettingsOpen(true)}
                  onMessagesChange={setAdaptationMessages}
                  onAssistantDone={handleAdaptationAssistantDone}
                  headerTitle="改编策略讨论（不产出 STAGE 模板正文）"
                  emptyHint="基于上文分析，讨论改编方向、体量与删留策略。"
                  inputPlaceholder="输入你的想法或追问…"
                />
                <button
                  type="button"
                  disabled={saving || generatingPlan}
                  onClick={() => void handleGenerateAdaptPlan()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {generatingPlan ? "正在生成规划…" : "下一步：自动生成规划并填写立项信息"}
                </button>
              </div>
            )}

            {phase === "planner" && !(project?.creativeBrief ?? "").trim() && (
              <div className="space-y-3 rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-100/90">
                <p className="text-xs leading-relaxed">
                  检测到旧版流程停留在「规划师对话」步骤且尚无规划正文。点击下方将按当前讨论记录自动生成规划并进入立项表单。
                </p>
                <button
                  type="button"
                  disabled={generatingPlan}
                  onClick={() => void handleGenerateAdaptPlan()}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {generatingPlan ? "生成中…" : "一键生成规划并进入立项表单"}
                </button>
              </div>
            )}

            {phase === "meta" && (
              <div className="space-y-4">
                <p className="text-xs text-zinc-400">请确认或修改立项信息（已由上文自动预填，可手工调整）。</p>
                {metaForm}
                <div>
                  <label className="block text-xs text-zinc-500">
                    规划全文（《创作思路确认书》，可编辑）
                  </label>
                  <textarea
                    value={creativeBrief}
                    onChange={(e) => setCreativeBrief(e.target.value)}
                    rows={14}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 font-mono text-[11px] leading-relaxed text-zinc-200"
                    placeholder="规划正文将显示在此…"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleFinishAdaptMeta()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "保存中…" : "确认并进入编剧室"}
                </button>
              </div>
            )}

            {phase === "ready" && serverMode === "adaptation" && (
              <p className="text-xs text-zinc-500">改编立项已完成，请从顶部链接进入编剧室。</p>
            )}
          </div>
        )}
      </main>

      {briefOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !saving && setBriefOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h2 className="mb-2 text-sm font-semibold text-zinc-100">保存《创作思路确认书》</h2>
            <p className="mb-2 text-[11px] text-zinc-500">可编辑后保存；将进入编剧室主流程（STAGE 1 起）。</p>
            <textarea
              value={briefDraft}
              onChange={(e) => setBriefDraft(e.target.value)}
              rows={12}
              className="mb-3 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] leading-relaxed"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setBriefOpen(false)}
                className="rounded px-3 py-1.5 text-xs text-zinc-400"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleFinishOnboardingOriginal()}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存并进入"}
              </button>
            </div>
          </div>
        </div>
      )}

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={setSettings} />

      {generatingPlan && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 bg-black/55 text-zinc-100">
          <p className="text-sm font-medium">正在生成规划并预填表单</p>
          <p className="text-xs text-zinc-400">请稍候，可能需要数十秒…</p>
        </div>
      )}
    </div>
  );
}
