import type { Message } from "./types";
import { stripThinkingBlocks } from "./strip-thinking";

const STAGE_PATTERNS: [number, RegExp][] = [
  [5, /(?:^|\n)##?\s*第\s*\d+\s*集/],
  [5, /(?:^|\n)##?\s*第\s*\[集数\]\s*集/],
  [4, /(?:^|\n)##?\s*核心事件\s*\d/],
  [3, /(?:^|\n)##?\s*第[一二三]幕/],
  [2, /(?:^|\n)##?\s*角色[一二三四五六七八九十\d]+[：:]/],
  /** 兼容无 # 标题：「一句话梗概：…」单独成行（自动起草常见） */
  [1, /(?:^|\n)\s*一句话梗概\s*[：:]/],
  [1, /(?:^|\n)##?\s*(?:一句话梗概|完整大纲|详细剧情梗概)/],
];

/**
 * 仅当某一整行「以 STAGE 标记开头」时才视为阶段信号，避免把
 * 「我们将推进至 STAGE 2：…」等流程话术误判为结构化输出阶段。
 */
function lineDeclaresStage(content: string, stageNum: number): boolean {
  const re = new RegExp(
    `^\\s*(?:#{1,2}\\s+)?(?:\\*{0,2})?(?:【\\[［]\\s*)?STAGE\\s*${stageNum}\\b`,
    "m"
  );
  return content.split(/\r?\n/).some((line) => re.test(line));
}

function cleanThinkBlocks(content: string): string {
  return stripThinkingBlocks(content);
}

export function detectStageFromContent(content: string): number {
  const cleaned = cleanThinkBlocks(content);
  for (const [stage, re] of STAGE_PATTERNS) {
    if (re.test(cleaned)) return stage;
  }
  for (let s = 5; s >= 1; s--) {
    if (lineDeclaresStage(cleaned, s)) return s;
  }
  return 0;
}

export function detectStage(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const result = detectStageFromContent(msg.content);
    if (result > 0) return result;
  }
  return 0;
}

/** 避免「好的，我们改下第三幕」等讨论句误触自动快照 */
export function isConfirmMessage(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (/不确认|不要继续|先别|等等|暂时不|别进入|先不要/i.test(t)) return false;

  if (
    /确认\s*(?:进入|推进|阶段)|进入下一(?:阶段|步|集)?|下一阶段|下一集|继续推进|可以\s*进入|没问题了|就这样吧|^proceed$/i.test(
      t
    )
  ) {
    return true;
  }
  if (/(?:^|[\n。！？])\s*通过(?:[。.!！，,\s]|$)/m.test(t)) return true;
  if (/stage\s*\d/i.test(t) && /确认|继续|下一|OK/i.test(t)) return true;

  if (t.length <= 14 && /^(?:好的|OK|可以)[。.!！…\s]*$/i.test(t)) return true;

  return false;
}
