"use client";

import type { Artifact } from "@/lib/types";
import {
  STAGE1_SLOTS,
  STAGE2_FIXED_SLOTS,
  STAGE3_SLOTS,
  STAGE4_FIXED_SLOTS,
} from "@/lib/stage-slot-schema";
import { slugifyCharName } from "@/lib/artifact-mutations";
import ArtifactSlotEditor from "./ArtifactSlotEditor";

interface Props {
  stageId: number;
  artifacts: Artifact[];
  onUpsert: (patch: Omit<Artifact, "updatedAt"> & { updatedAt?: string }) => void;
  onRemove: (stage: number, subKey: string) => void;
}

function maxEventIndex(arts: Artifact[]): number {
  let m = 0;
  for (const a of arts) {
    if (a.stage !== 4) continue;
    const x = /^event_(\d+)$/.exec(a.subKey);
    if (x) m = Math.max(m, parseInt(x[1], 10) || 0);
  }
  return Math.max(m, 1);
}

/** 下一个 `supporting_pN` 序号（与解析落库一致） */
function nextSupportingPIndex(arts: Artifact[]): number {
  let max = 0;
  for (const a of arts) {
    if (a.stage !== 2) continue;
    const x = /^supporting_p(\d+)$/.exec(a.subKey);
    if (x) max = Math.max(max, parseInt(x[1], 10) || 0);
  }
  return max + 1;
}

export default function StageFlatManual({ stageId, artifacts, onUpsert, onRemove }: Props) {
  const a = artifacts.filter((x) => x.stage === stageId);

  if (stageId === 1) {
    const fixedKeys = new Set(STAGE1_SLOTS.map((s) => s.subKey));
    const extras = a.filter((x) => !fixedKeys.has(x.subKey));
    return (
      <div className="space-y-2">
        {STAGE1_SLOTS.map((slot) => {
          const art = a.find((x) => x.subKey === slot.subKey);
          const isOutline = slot.subKey === "outline";
          return (
            <ArtifactSlotEditor
              key={slot.subKey}
              label={slot.label}
              value={art?.content ?? ""}
              rows={isOutline ? 30 : 6}
              textareaClassName={
                isOutline ? "min-h-[min(22rem,42vh)]" : undefined
              }
              onCommit={(content) =>
                onUpsert({
                  stage: 1,
                  subKey: slot.subKey,
                  label: slot.label,
                  content,
                })
              }
            />
          );
        })}
        {extras.map((x) => (
          <div key={x.subKey} className="relative">
            <ArtifactSlotEditor
              label={x.label || x.subKey}
              value={x.content}
              onCommit={(content) =>
                onUpsert({
                  stage: 1,
                  subKey: x.subKey,
                  label: x.label,
                  content,
                })
              }
            />
            <button
              type="button"
              onClick={() => onRemove(1, x.subKey)}
              className="absolute right-2 top-2 text-[10px] text-zinc-600 hover:text-rose-500"
            >
              移除条目
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (stageId === 2) {
    const fixedKeys = new Set(STAGE2_FIXED_SLOTS.map((s) => s.subKey));
    const chars = a.filter(
      (x) =>
        !fixedKeys.has(x.subKey) &&
        (x.subKey.startsWith("char_") || x.subKey.startsWith("supporting_"))
    );
    const nextSupportingIdx = nextSupportingPIndex(a);
    return (
      <div className="space-y-2">
        {STAGE2_FIXED_SLOTS.map((slot) => {
          const art = a.find((x) => x.subKey === slot.subKey);
          return (
            <ArtifactSlotEditor
              key={slot.subKey}
              label={slot.label}
              value={art?.content ?? ""}
              onCommit={(content) =>
                onUpsert({
                  stage: 2,
                  subKey: slot.subKey,
                  label: slot.label,
                  content,
                })
              }
            />
          );
        })}
        {chars.map((x) => (
          <div key={x.subKey} className="relative">
            <ArtifactSlotEditor
              label={x.label}
              value={x.content}
              onCommit={(content) =>
                onUpsert({
                  stage: 2,
                  subKey: x.subKey,
                  label: x.label,
                  content,
                })
              }
            />
            <button
              type="button"
              onClick={() => onRemove(2, x.subKey)}
              className="absolute right-2 top-2 text-[10px] text-zinc-600 hover:text-rose-500"
            >
              移除
            </button>
          </div>
        ))}
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("主角/双男主之一：姓名或代号（用于标签与键名）");
              if (name == null) return;
              const t = name.trim();
              if (!t) return;
              const subKey = `char_${slugifyCharName(t)}`;
              onUpsert({
                stage: 2,
                subKey,
                label: `主角：${t}`,
                content: "",
              });
            }}
            className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-[11px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
          >
            + 添加主角小传
          </button>
          <button
            type="button"
            onClick={() => {
              const n = nextSupportingPIndex(a);
              onUpsert({
                stage: 2,
                subKey: `supporting_p${n}`,
                label: `配角${n}`,
                content: "",
              });
            }}
            className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-[11px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
            title={`将创建 supporting_p${nextSupportingIdx}，与「## 配角一」解析键位一致时可对照编号`}
          >
            + 添加配角小传（下一格：配角{nextSupportingIdx}）
          </button>
        </div>
        {a.filter(
          (x) =>
            !fixedKeys.has(x.subKey) &&
            !x.subKey.startsWith("char_") &&
            !x.subKey.startsWith("supporting_")
        ).map((x) => (
          <div key={x.subKey} className="relative">
            <ArtifactSlotEditor
              label={x.label || x.subKey}
              value={x.content}
              onCommit={(content) =>
                onUpsert({
                  stage: 2,
                  subKey: x.subKey,
                  label: x.label,
                  content,
                })
              }
            />
            <button
              type="button"
              onClick={() => onRemove(2, x.subKey)}
              className="absolute right-2 top-2 text-[10px] text-zinc-600 hover:text-rose-500"
            >
              移除条目
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (stageId === 3) {
    return (
      <div className="space-y-2">
        {STAGE3_SLOTS.map((slot) => {
          const art = a.find((x) => x.subKey === slot.subKey);
          return (
            <ArtifactSlotEditor
              key={slot.subKey}
              label={slot.label}
              value={art?.content ?? ""}
              onCommit={(content) =>
                onUpsert({
                  stage: 3,
                  subKey: slot.subKey,
                  label: slot.label,
                  content,
                })
              }
            />
          );
        })}
        {a.filter((x) => !STAGE3_SLOTS.some((s) => s.subKey === x.subKey)).map((x) => (
          <div key={x.subKey} className="relative">
            <ArtifactSlotEditor
              label={x.label || x.subKey}
              value={x.content}
              onCommit={(content) =>
                onUpsert({
                  stage: 3,
                  subKey: x.subKey,
                  label: x.label,
                  content,
                })
              }
            />
            <button
              type="button"
              onClick={() => onRemove(3, x.subKey)}
              className="absolute right-2 top-2 text-[10px] text-zinc-600 hover:text-rose-500"
            >
              移除条目
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (stageId === 4) {
    const maxEv = maxEventIndex(a);
    const fixedKeys = new Set(STAGE4_FIXED_SLOTS.map((s) => s.subKey));
    const extras = a.filter(
      (x) => !fixedKeys.has(x.subKey) && !/^event_\d+$/.test(x.subKey)
    );

    return (
      <div className="space-y-2">
        {Array.from({ length: maxEv }, (_, i) => i + 1).map((n) => {
          const subKey = `event_${n}`;
          const art = a.find((x) => x.subKey === subKey);
          return (
            <ArtifactSlotEditor
              key={subKey}
              label={`核心事件 ${n}`}
              value={art?.content ?? ""}
              onCommit={(content) =>
                onUpsert({
                  stage: 4,
                  subKey,
                  label: `核心事件 ${n}`,
                  content,
                })
              }
            />
          );
        })}
        <button
          type="button"
          onClick={() => {
            const n = maxEv + 1;
            onUpsert({
              stage: 4,
              subKey: `event_${n}`,
              label: `核心事件 ${n}`,
              content: "",
            });
          }}
          className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-[11px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
        >
          + 添加核心事件 {maxEv + 1}
        </button>
        {extras.map((x) => (
          <div key={x.subKey} className="relative">
            <ArtifactSlotEditor
              label={x.label || x.subKey}
              value={x.content}
              onCommit={(content) =>
                onUpsert({
                  stage: 4,
                  subKey: x.subKey,
                  label: x.label,
                  content,
                })
              }
            />
            <button
              type="button"
              onClick={() => onRemove(4, x.subKey)}
              className="absolute right-2 top-2 text-[10px] text-zinc-600 hover:text-rose-500"
            >
              移除条目
            </button>
          </div>
        ))}
        {STAGE4_FIXED_SLOTS.map((slot) => {
          const art = a.find((x) => x.subKey === slot.subKey);
          return (
            <ArtifactSlotEditor
              key={slot.subKey}
              label={slot.label}
              value={art?.content ?? ""}
              optional={slot.optional}
              onCommit={(content) =>
                onUpsert({
                  stage: 4,
                  subKey: slot.subKey,
                  label: slot.label,
                  content,
                })
              }
            />
          );
        })}
      </div>
    );
  }

  return null;
}
