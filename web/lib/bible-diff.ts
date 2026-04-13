export type BibleDiffLineType = "same" | "add" | "remove";

export interface BibleDiffLine {
  type: BibleDiffLineType;
  text: string;
}

/** 按行简易 diff（Myers 风格 LCS），用于圣经版本对比 */
export function diffBible(a: string, b: string): BibleDiffLine[] {
  const la = a.split(/\r?\n/);
  const lb = b.split(/\r?\n/);
  const n = la.length;
  const m = lb.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        la[i] === lb[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: BibleDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (la[i] === lb[j]) {
      out.push({ type: "same", text: la[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "remove", text: la[i] });
      i++;
    } else {
      out.push({ type: "add", text: lb[j] });
      j++;
    }
  }
  while (i < n) {
    out.push({ type: "remove", text: la[i] });
    i++;
  }
  while (j < m) {
    out.push({ type: "add", text: lb[j] });
    j++;
  }
  return out;
}

export function formatBibleDiffForDisplay(lines: BibleDiffLine[]): string {
  return lines
    .map((l) => {
      if (l.type === "same") return ` ${l.text}`;
      if (l.type === "add") return `+${l.text}`;
      return `-${l.text}`;
    })
    .join("\n");
}
