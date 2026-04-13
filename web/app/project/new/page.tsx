"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "新剧本项目" }),
        });
        if (!res.ok) throw new Error("创建失败");
        const p = (await res.json()) as { id: string };
        if (!cancelled) router.replace(`/project/${p.id}/onboarding`);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "创建失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex h-full min-h-[200px] items-center justify-center bg-zinc-950 text-zinc-400">
      {error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-sm">正在创建项目…</p>}
    </div>
  );
}
