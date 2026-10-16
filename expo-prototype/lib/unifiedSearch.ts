// ─── 言葉で探す（記録・相談・AIの出力をまとめて）────────────────────────
// 迷ったときに、去年の自分の判断を引き出すための部品（docs/decisions/20261012-solo-learning-loop.md の ② 届く）。
// AIを通さない文字の一致だけで探す。答えを作るのは「記録に聞く」の役目で、ここは出典そのものを並べる。
// 表記の揺れ（ひらがな／カタカナ・全角／半角・大文字／小文字）は吸収する。

export type SearchKind = "record" | "advice" | "ai";
export interface SearchItem {
  kind: SearchKind;
  id: string;
  /** YYYY-MM-DD（新しい順に並べる） */
  date: string;
  /** 一覧の見出し（作業名・AI出力の種類など）。見出しの言葉でも当てる */
  title: string;
  /** 探す対象の本文 */
  text: string;
}
export interface SearchHit extends SearchItem { snippet: string }

/** 比較用に表記を揃える。NFKC で全角英数を半角に、カタカナをひらがなに、英字を小文字に */
export function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function splitTerms(query: string): string[] {
  return query.split(/[\s　]+/).map(s => s.trim()).filter(Boolean);
}

const RADIUS = 24;

/** 最初に当たった言葉の前後を抜き出す。正規化しても文字数は変わらない前提で位置を合わせる */
export function snippetOf(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= RADIUS * 2) return flat;
  const n = normalize(flat);
  const pos = terms.map(t => n.indexOf(normalize(t))).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const from = Math.max(0, pos - RADIUS);
  const to = Math.min(flat.length, pos + RADIUS * 2);
  return `${from > 0 ? "…" : ""}${flat.slice(from, to)}${to < flat.length ? "…" : ""}`;
}

/** 言葉をすべて含むもの（かつ）を新しい順に返す */
export function searchItems(items: SearchItem[], query: string): SearchHit[] {
  const terms = splitTerms(query);
  if (terms.length === 0) return [];
  const nTerms = terms.map(normalize);
  return items
    .filter(it => {
      const hay = normalize(`${it.title} ${it.text}`);
      return nTerms.every(t => hay.includes(t));
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(it => ({ ...it, snippet: snippetOf(it.text, terms) }));
}

/**
 * すべて含むもの（かつ）を探し、0件なら言葉のどれかを含むもの（または）に広げる。
 * 言葉を足して絞るほど0件になり目的の記録に辿り着けない「強制AND」は、競合レビューで不満に挙がっていた
 * （docs/research/competitor-app-reviews-2026-08.md の 4.）。広げたときは画面でそう言う（mode="any"）
 */
export function searchWithFallback(items: SearchItem[], query: string): { hits: SearchHit[]; mode: "all" | "any" } {
  const terms = splitTerms(query);
  const all = searchItems(items, query);
  if (all.length > 0 || terms.length < 2) return { hits: all, mode: "all" };
  const seen = new Map<string, SearchHit>();
  terms.forEach(t => searchItems(items, t).forEach(h => { if (!seen.has(`${h.kind}:${h.id}`)) seen.set(`${h.kind}:${h.id}`, { ...h, snippet: snippetOf(h.text, terms) }); }));
  return { hits: [...seen.values()].sort((a, b) => b.date.localeCompare(a.date)), mode: "any" };
}
