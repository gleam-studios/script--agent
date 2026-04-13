import type { Artifact } from "./types";

const MIN_ONELINER = 8;
const MIN_ACT = 40;
const MIN_DETAIL = 80;

export interface StageGateItem {
  id: string;
  label: string;
  pass: boolean;
  hint?: string;
  /** 为 true 时不计入总 ok（仅提示） */
  optional?: boolean;
}

export interface StageGateResult {
  ok: boolean;
  items: StageGateItem[];
}

function byStage(artifacts: Artifact[], stage: number): Artifact[] {
  return artifacts.filter((a) => a.stage === stage);
}

function nonEmptyLen(s: string): number {
  return s.trim().length;
}

function countCharSheets(artifacts: Artifact[]): number {
  return artifacts.filter((a) => a.subKey.startsWith("char_")).length;
}

function hasEpisodeLevel(artifacts: Artifact[]): boolean {
  return artifacts.some(
    (a) =>
      /^ep\d+$/.test(a.subKey) ||
      a.subKey === "ep_placeholder" ||
      /^ep\?/.test(a.subKey)
  );
}

/**
 * 验收「当前阶段」产物是否达到可放行粗标准（与 artifact-extract 子键对齐）。
 */
export function evaluateStageGate(stage: number, artifacts: Artifact[]): StageGateResult {
  if (stage < 1 || stage > 5) {
    return { ok: true, items: [] };
  }

  const items: StageGateItem[] = [];
  const a = byStage(artifacts, stage);

  if (stage === 1) {
    const oneliner = a.find((x) => x.subKey === "oneliner");
    const detail = a.find((x) => x.subKey === "detail_synopsis");
    const outline = a.find((x) => x.subKey === "outline");
    const olOk = oneliner && nonEmptyLen(oneliner.content) >= MIN_ONELINER;
    items.push({
      id: "oneliner",
      label: "一句话梗概",
      pass: !!olOk,
      hint: olOk ? undefined : `需至少 ${MIN_ONELINER} 字（非空）`,
    });
    const bodyOk =
      (detail && nonEmptyLen(detail.content) >= MIN_DETAIL) ||
      (outline && nonEmptyLen(outline.content) >= MIN_DETAIL);
    items.push({
      id: "body",
      label: "完整大纲（长文）",
      pass: !!bodyOk,
      hint: bodyOk
        ? undefined
        : `「完整大纲」不少于 ${MIN_DETAIL} 字即可（旧数据中的「详细剧情梗概」仍计入）`,
    });
  }

  if (stage === 2) {
    const rel = a.find((x) => x.subKey === "relationship");
    const matrix = a.find((x) => x.subKey === "cast_matrix");
    const nChar = countCharSheets(a);
    items.push({
      id: "relationship",
      label: "核心关系定义",
      pass: !!(rel && nonEmptyLen(rel.content) >= 20),
      hint: "需有「核心关系定义」小节且非空",
    });
    const castOk = nChar >= 2 || !!(matrix && nonEmptyLen(matrix.content) >= 20);
    items.push({
      id: "cast",
      label: "至少两名主角小传或人物矩阵",
      pass: castOk,
      hint: castOk ? undefined : "需至少 2 个「角色N」小传，或有效「人物矩阵总览」",
    });
  }

  if (stage === 3) {
    for (const key of ["act1", "act2", "act3"] as const) {
      const sec = a.find((x) => x.subKey === key);
      const ok = !!(sec && nonEmptyLen(sec.content) >= MIN_ACT);
      items.push({
        id: key,
        label: key === "act1" ? "第一幕" : key === "act2" ? "第二幕" : "第三幕",
        pass: ok,
        hint: ok ? undefined : `正文建议不少于 ${MIN_ACT} 字`,
      });
    }
  }

  if (stage === 4) {
    const events = a.filter((x) => /^event_/.test(x.subKey));
    const chain = a.find((x) => x.subKey === "chain_check");
    items.push({
      id: "events",
      label: "至少一个核心事件",
      pass: events.length >= 1,
      hint: "需有「核心事件 N」小节",
    });
    items.push({
      id: "chain_check",
      label: "事件链总检（建议）",
      pass: !!(chain && nonEmptyLen(chain.content) >= 10),
      hint: "建议补充「事件链总检」以便串联",
      optional: true,
    });
  }

  if (stage === 5) {
    items.push({
      id: "episode",
      label: "至少一集分集产物",
      pass: hasEpisodeLevel(a),
      hint: "需解析出至少一集（第 N 集）结构产物",
    });
  }

  const ok = items.every((i) => i.optional || i.pass);
  return { ok, items };
}
