"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

const STORAGE_KEY = "bl-agent-settings";

function load(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function save(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (s: Settings) => void;
}

export default function SettingsDialog({ open, onClose, settings, onSave }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  if (!open) return null;

  function handleSave() {
    save(draft);
    onSave(draft);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <h2 className="mb-5 text-lg font-semibold text-zinc-100">API 设置</h2>

        <label className="mb-1 block text-sm text-zinc-400">API URL</label>
        <input
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
          value={draft.apiUrl}
          onChange={(e) => setDraft({ ...draft, apiUrl: e.target.value })}
          placeholder="https://api.openai.com/v1/chat/completions"
        />

        <label className="mb-1 block text-sm text-zinc-400">API Key</label>
        <input
          type="password"
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
          value={draft.apiKey}
          onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
          placeholder="sk-..."
        />

        <label className="mb-1 block text-sm text-zinc-400">模型名称</label>
        <input
          className="mb-6 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
          value={draft.model}
          onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          placeholder="gpt-4o"
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export { load as loadSettings };
