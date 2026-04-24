import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // `next build` 在 web/ 下执行时，仓库根为上一级（与 agent-paths 约定一致）
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  /** 仅 externalize 当前项目已安装且确实会在服务端使用的包，避免 dev 中解析异常 */
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
