"use client";

import { useState } from "react";
import type { Snapshot } from "@/lib/types";

interface Props {
  snapshots: Snapshot[];
  onRestore: (snapshot: Snapshot) => void;
}

/** 与旧 SnapshotBar 相同的二次确认回溯交互，按阶段筛选后的列表 */
export default function StageSnapshotSection({ snapshots, onRestore }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleClick = (snap: Snapshot) => {
    if (confirmId === snap.id) {
      onRestore(snap);
      setConfirmId(null);
    } else {
      setConfirmId(snap.id);
    }
  };

  if (snapshots.length === 0) return null;

  const ordered = snapshots.slice().reverse();

  return (
    <div className="mt-2 border-t border-zinc-800/50 pt-2">
      <div className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        快照历史
      </div>
      <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
        {ordered.map((snap) => {
          const isConfirming = confirmId === snap.id;
          const time = new Date(snap.createdAt).toLocaleString("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <button
              key={snap.id}
              type="button"
              onClick={() => handleClick(snap)}
              onBlur={() => {
                if (confirmId === snap.id) setConfirmId(null);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${
                isConfirming
                  ? "bg-amber-900/30 text-amber-300 ring-1 ring-amber-600/40"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate">{isConfirming ? "确认回溯？" : snap.label}</div>
                <div className="mt-0.5 text-[9px] text-zinc-600">
                  {time} · {snap.messageCount} 条消息
                </div>
              </div>
              <svg
                className={`ml-2 h-3 w-3 shrink-0 ${isConfirming ? "text-amber-400" : "text-zinc-700"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
