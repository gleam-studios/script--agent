import fs from "fs";
import path from "path";

export const runtime = "nodejs";

/** 返回 knowledge/03_SERIES_BIBLE.md 作为项目圣经插入骨架 */
export async function GET() {
  const abs = path.resolve(process.cwd(), "..", "knowledge", "03_SERIES_BIBLE.md");
  try {
    const text = fs.readFileSync(abs, "utf-8");
    return Response.json({ content: text });
  } catch {
    return Response.json(
      { error: "无法读取 knowledge/03_SERIES_BIBLE.md", content: "" },
      { status: 500 }
    );
  }
}
