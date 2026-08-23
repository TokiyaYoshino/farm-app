// 助言した作業（crop_advice_actions）と実際の作業記録（reports）の照合を1箇所に集約する。
//
// 収穫量を metrics.ts に、農薬の使用回数を pesticideUsage.ts に集約したのと同じ理由。
// 「言われた作業をやったか」の判定が画面とAIプロンプトで食い違うと、どちらを信じればよいか
// 分からなくなる。照合は必ずこのモジュールを通す。
//
// ── 設計方針 ────────────────────────────────────────────────
//
// 1. **照合結果を保存しない。** 毎回計算する。作業記録は後から追加・修正されるので、
//    「実施済み」をDBに書くと実態とずれる（pesticideUsage.ts と同じ）。
//
// 2. **判定は3値ではなく4値。** "done" / "pending" / "overdue" / "unmatchable"。
//    `work_type` が null（作業記録の語彙に載せられない助言）は **"unmatchable"** にする。
//    これを "pending"（未実施）に混ぜてはいけない。「まだやっていない」と
//    「そもそも記録から判断できない」は別物で、混ぜると
//    「やったのに未実施と言われる」か「できていないのに見逃す」のどちらかが起きる。
//
// 3. **期限が無い助言は期限切れにしない。** due_to が無ければ "pending" のまま。
//    LLM の「今週中」を日付に落とせなかっただけで催促するのは誤り。
//
// 4. **照合は作物・作業種別・期間の3条件。** 圃場は見ない（助言は作付け単位で出しており、
//    圃場を指定していないため。圃場で絞ると別圃場でやった作業を見落とす）。
/** 照合に使う作業記録の最小形。App.tsx の Report がそのまま渡る。
 *  Web 版には lib/types.ts が無いため、依存を作らず構造的に受ける
 *  （expo-prototype/lib/adviceMatch.ts とはこの型定義だけが異なる）。 */
export interface MatchReport {
  id: number;
  crop_id: number;
  date: string;
  work_type?: string | null;
  note?: string | null;
}

/** crop_advice_actions の1行。DBの列名に合わせる（store がそのまま渡す） */
export interface AdviceAction {
  id: string;
  crop_id: number;
  message_id: string;
  title: string;
  /** reports.work_type と同じ語彙。null は照合不可 */
  work_type: string | null;
  due_from: string | null;
  due_to: string | null;
  when_text: string | null;
  why: string | null;
  sort_order: number;
  dismissed_at: string | null;
  created_at: string;
}

/**
 * 照合の状態。
 * - "done"        … 期間内にその作業の記録がある
 * - "pending"     … まだ記録が無い（期限内、または期限なし）
 * - "overdue"     … 期限を過ぎても記録が無い
 * - "unmatchable" … 作業記録の語彙に落とせない助言。**「未実施」ではない**
 * - "dismissed"   … 利用者が「やらない」と判断した
 */
export type MatchStatus = "done" | "pending" | "overdue" | "unmatchable" | "dismissed";

export interface ActionMatch {
  action: AdviceAction;
  status: MatchStatus;
  /** 根拠にした作業記録（新しい順）。画面で「いつやったか」を出す */
  matchedReports: { id: number; date: string; work_type: string; note: string }[];
  /** 照合に使った期間。画面に必ず併記する（どの範囲を見たか分からないと信用できない） */
  windowStart: string;
  windowEnd: string | null;
}

/** 照合期間の開始日。助言が出た日を既定にする（それ以前の作業は「言われる前にやった」ので数えない）。
 *  due_from があればそちらを優先する（「開花後10日ごろ」など先の作業を指定された場合）。 */
function windowStartOf(a: AdviceAction): string {
  const created = a.created_at.slice(0, 10);
  if (!a.due_from) return created;
  // due_from が助言日より前を指していても、助言日より前には遡らない
  return a.due_from > created ? a.due_from : created;
}

const normalize = (s: string): string => s.normalize("NFKC").trim().toLowerCase();

/** その記録が助言の作業に当たるか。作業種別は完全一致で見る。
 *  部分一致（「防除」が「防除準備」に当たる等）は誤判定を生むため採らない。 */
function reportMatches(r: MatchReport, a: AdviceAction, start: string, end: string | null): boolean {
  if (r.crop_id !== a.crop_id) return false;
  if (!a.work_type) return false;
  if (normalize(r.work_type ?? "") !== normalize(a.work_type)) return false;
  if (r.date < start) return false;
  if (end && r.date > end) return false;
  return true;
}

/**
 * 1件の助言を作業記録と照合する。
 *
 * today は「今日」。期限切れの判定に使う（テストのため引数で受ける）。
 */
export function matchAction(a: AdviceAction, reports: MatchReport[], today: string): ActionMatch {
  const windowStart = windowStartOf(a);
  // 照合の終わりは期限で切らない。期限後にやった作業も「やった」として拾う
  // （期限切れの催促を出しておいて、後から入力された記録で消えないのは不親切）
  const windowEnd = null;

  const base = { action: a, windowStart, windowEnd };

  if (a.dismissed_at) {
    return { ...base, status: "dismissed", matchedReports: [] };
  }
  // work_type が無いものは記録と突き合わせられない。未実施と混ぜない
  if (!a.work_type) {
    return { ...base, status: "unmatchable", matchedReports: [] };
  }

  const matched = reports
    .filter(r => reportMatches(r, a, windowStart, windowEnd))
    .sort((x, y) => y.date.localeCompare(x.date))
    .map(r => ({ id: r.id, date: r.date, work_type: r.work_type ?? "", note: r.note ?? "" }));

  if (matched.length > 0) {
    return { ...base, status: "done", matchedReports: matched };
  }
  // 期限が無ければ催促しない（日付に落とせなかっただけで期限切れにするのは誤り）
  if (a.due_to && today > a.due_to) {
    return { ...base, status: "overdue", matchedReports: [] };
  }
  return { ...base, status: "pending", matchedReports: [] };
}

export const todayStr = (): string => new Date().toISOString().slice(0, 10);

/** 作物の全助言を照合する。並びは sort_order → created_at（新しい助言が先） */
export function matchActions(actions: AdviceAction[], reports: MatchReport[], today?: string): ActionMatch[] {
  const t = today ?? todayStr();
  return actions
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.sort_order - b.sort_order)
    .map(a => matchAction(a, reports, t));
}

export interface MatchCounts {
  done: number;
  pending: number;
  overdue: number;
  unmatchable: number;
  dismissed: number;
}

/** 状態ごとの件数。バッジ表示用 */
export function countMatches(matches: ActionMatch[]): MatchCounts {
  const c: MatchCounts = { done: 0, pending: 0, overdue: 0, unmatchable: 0, dismissed: 0 };
  matches.forEach(m => { c[m.status]++; });
  return c;
}

// ─── 表示文言（画面とAIプロンプトで同じ言い回しを使う）──────────────
// 「照合」「作業種別」のようなこちらの都合の語は出さない。記録を見て言っている、が
// 伝わればよい（docs/decisions/20260824-plain-language-and-crop-mapping.md）。
export function statusLabel(s: MatchStatus): string {
  switch (s) {
    case "done": return "やった";
    case "pending": return "まだ";
    case "overdue": return "期限すぎ";
    case "unmatchable": return "記録から分かりません";
    case "dismissed": return "やらない";
  }
}

/** 判断の根拠を1行で。「何を見てそう言っているか」を必ず出す */
export function matchDetail(m: ActionMatch): string {
  if (m.status === "dismissed") return "やらないことにした作業です。";
  if (m.status === "unmatchable") {
    return "記録の作業名と結びつかないので、やったかどうかは分かりません。";
  }
  const period = `${m.windowStart} からの記録を確認`;
  if (m.status === "done") {
    const ds = m.matchedReports.map(r => r.date.slice(5).replace("-", "/")).join("、");
    return `${period}：${m.matchedReports.length}件（${ds}）`;
  }
  const due = m.action.due_to ? `期限 ${m.action.due_to}` : "期限なし";
  return `${period}：見つかりません（${due}）`;
}

// ─── AIに渡すための整形 ──────────────────────────────────────
/**
 * 過去の助言と実施状況をプロンプト用に整形する。
 *
 * これがエージェントの要点。次に相談されたとき、**前に何を言ったか・それがやられたか**を
 * 踏まえて答えられるようにする。画面表示と同じ matchActions を通すので、
 * AI の言うことと画面のバッジが食い違わない。
 */
export function formatAdviceHistoryForPrompt(matches: ActionMatch[], maxItems = 20): string {
  if (matches.length === 0) return "";
  const lines = matches.slice(0, maxItems).map(m => {
    const a = m.action;
    const when = a.when_text ? `（${a.when_text}）` : "";
    return `- ${a.created_at.slice(0, 10)} に助言: ${a.title}${when} → ${statusLabel(m.status)}${
      m.status === "done" ? `（${m.matchedReports.map(r => r.date).join("、")}）` : ""
    }`;
  });
  const dropped = matches.length - Math.min(matches.length, maxItems);
  return [
    "",
    "## これまでにこの作付けへ出した助言と、作業記録から分かる実施状況",
    "同じ助言を繰り返さず、「まだ」のものは事情を尋ねるか代替を示すこと。",
    // statusLabel と同じ語を使う。ここがずれると AI の言うことと画面のバッジが食い違う
    "「記録から分かりません」は「やっていない」という意味ではない。実施していないと決めつけないこと。",
    ...lines,
    ...(dropped > 0 ? [`（ほか${dropped}件は省略）`] : []),
  ].join("\n");
}
