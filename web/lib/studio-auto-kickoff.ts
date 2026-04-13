/**
 * 进入编剧室后自动代发的首条用户消息（触发 STAGE 1 梗概草案）。
 * 若需禁止「无立项摘要也自动」，可在调用方增加 creativeBrief 判空后再传入 autoKickoffUserMessage。
 */
export const STUDIO_AUTO_STAGE1_USER_MESSAGE = [
  "我是编剧新手，请你作为编剧助理，在严格服从对话中【工程注入】里的立项信息与约束的前提下，",
  "结合侧栏「系列圣经」中已有内容（若为空则先按立项摘要合理占位，后续再补），",
  "直接输出 STAGE 1「剧情梗概」的模板交付物草案，结构完整、便于我审阅；无需我先发言或反问。",
].join("");

/** 全流程条「自动开始」：各阶段代发 user 一条，触发对应 STAGE 模板交付物（可与 knowledge 迭代对齐） */
export const STUDIO_AUTO_STAGE_USER_MESSAGE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: STUDIO_AUTO_STAGE1_USER_MESSAGE,
  2: [
    "请作为编剧助理，在严格服从【工程注入】与侧栏「系列圣经」的前提下，",
    "基于当前已确认的梗概与设定，直接输出 STAGE 2「核心人物小传」完整模板交付物：",
    "含人物矩阵总览、`## 主角一/二` 与 `## 配角一/二/…`（须带二级标题标头）、核心关系定义等，结构完整；无需我先发言或反问。",
  ].join(""),
  3: [
    "请作为编剧助理，在严格服从【工程注入】与侧栏「系列圣经」的前提下，",
    "基于当前人物与梗概，直接输出 STAGE 3「三幕式结构」模板交付物：第一幕/第二幕/第三幕及三幕式总检，结构完整；无需我先发言或反问。",
  ].join(""),
  4: [
    "请作为编剧助理，在严格服从【工程注入】与侧栏「系列圣经」的前提下，",
    "基于前三幕结构，直接输出 STAGE 4「核心事件链」模板交付物：各核心事件小节及事件链总检，结构完整；无需我先发言或反问。",
  ].join(""),
  5: [
    "请作为编剧助理，在严格服从【工程注入】与侧栏「系列圣经」的前提下，",
    "基于已定事件链与分集规划，直接输出 STAGE 5「分集剧本」模板交付物：按集、场次、幕拆分，结构完整；无需我先发言或反问。",
  ].join(""),
};

export function getStudioAutoStageUserMessage(stage: number): string | undefined {
  if (stage < 1 || stage > 5) return undefined;
  return STUDIO_AUTO_STAGE_USER_MESSAGE[stage as 1 | 2 | 3 | 4 | 5];
}
