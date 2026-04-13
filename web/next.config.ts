import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // `next build` 在 web/ 下执行时，仓库根为上一级（与 agent-paths 约定一致）
  outputFileTracingRoot: path.join(process.cwd(), ".."),
};

export default nextConfig;
