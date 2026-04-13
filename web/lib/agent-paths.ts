import path from "path";

/** 仓库根（含 agent/、knowledge/、skills/）。Electron 打包时由主进程设置 SCRIPT_AGENT_ROOT。 */
export function resolveAgentRoot(): string {
  const env = process.env.SCRIPT_AGENT_ROOT?.trim();
  if (env) return path.resolve(env);
  return path.resolve(process.cwd(), "..");
}

/** 项目 JSON 目录。Electron 下通常指向 userData/data/projects。 */
export function resolveDataProjectsDir(): string {
  const env = process.env.SCRIPT_AGENT_DATA_DIR?.trim();
  if (env) return path.resolve(env);
  return path.resolve(process.cwd(), "..", "data", "projects");
}
