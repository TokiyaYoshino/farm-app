// ─── 判断メモ（相談のやりとり → その日の記録に添える一文）──────────────────
// 1人の農家が「聞きながら判断 → 日記に残る → 翌年の自分が使う」ための、残す側の部品。
// メモは**相談で実際に出た文だけ**で組む（質問・結論の一文・見ておくこと）。
// 新しくAIに要約させないのは、本人が考えていない理由を作文されると、
// 翌年の自分が誤った根拠で判断するため（docs/decisions/20261012-solo-learning-loop.md）。

const MAX_SENTENCE = 80;

/** 返答の結論の一文。返答は結論を先に書く決まり（20260829-ai-output-structure.md）なので最初の一文を使う */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const m = trimmed.match(/^[^。\n]*。?/);
  const s = (m ? m[0] : trimmed).trim();
  return s.length > MAX_SENTENCE ? `${s.slice(0, MAX_SENTENCE)}…` : s;
}

const mdOf = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

export function buildJudgmentMemo({ question, reply, watchPoints, date }: {
  question: string;
  reply: string;
  watchPoints: string[] | null | undefined;
  /** 相談した日（YYYY-MM-DD） */
  date: string;
}): string {
  const q = question.trim();
  const a = firstSentence(reply);
  if (!q || !a) return "";
  const lines = [`判断メモ（${mdOf(date)}の相談）`, `聞いたこと: ${q}`, `答え: ${a}`];
  const watch = (watchPoints ?? []).map(w => w.trim()).filter(Boolean).slice(0, 2);
  if (watch.length) lines.push(`見ておくこと: ${watch.map(w => `・${w}`).join(" ")}`);
  return lines.join("\n");
}
