// 農薬の使用回数の集計・総使用回数（上限）の判定を1箇所に集約する。
//
// 収穫量の集計を src/lib/metrics.ts に集約した前例と同じ理由。AI記録検索チャットの
// プロンプト（App.tsx の formatPesticideLimits）と画面表示で違う数字・違う判定が出ると、
// どちらを信じればよいか分からなくなる。集計は必ずこのモジュールを通す。
//
// 設計方針は docs/decisions/20260805-pesticide-precheck.md。要点：
//
//   1. 判定は非対称。「超過の疑い」だけを返し、「OK・安全・使用可能」は決して返さない。
//      "under" は「まだ上限に達していない」という事実であって使用の可否ではない。
//   2. 上限が数値として確定できないときは必ず "unknown"（判定不可）に倒す。
//      FAMIC の total_count は「14回以内(土壌灌注は2回以内…)」のような自然文を含み、
//      部分一致で数値を拾うと誤判定になる。誤って警告を出し損ねることより、
//      誤って安心させることの方が有害。
//   3. 集計単位は作付け（crops）。総使用回数は生育期間中の上限のため年単位にはしない。
//   4. 商品単位の集計。同一有効成分を含む他剤との合算はしない（次段の課題）。
//      過小評価になりうるため、画面・プロンプトの双方でその旨を必ず明示する。

/** 集計に必要な最小限のフィールドだけを要求する。App.tsx の Report がそのまま渡る。 */
export interface UsageReport {
  crop_id: number;
  date: string;
  /** レガシーの単一農薬列。新形式が空の記録はこちらを見る */
  pesticide_id?: string;
  /** 新形式（jsonb 配列） */
  pesticides_used?: { id: string; amount: string | null }[];
}

/** App.tsx の Crop がそのまま渡る。 */
export interface UsageCrop {
  id: number;
  name: string;
  start_date: string;
  /** FAMIC 登録適用部の作物名との手動紐付け。未設定なら判定不可 */
  famic_crop_name?: string | null;
}

/** App.tsx の PesticideRegistration がそのまま渡る。 */
export interface UsageRegistration {
  crop_name: string;
  pest_name: string;
  /** 有効成分を含む農薬の総使用回数。FAMIC 原文（正規化しない） */
  total_count: string;
  usage_count?: string;
  usage_timing?: string;
}

/**
 * 判定結果。
 * - "over"    … 実績が上限に達している/超えている疑い（警告を出す）
 * - "under"   … 数値の上限が採れて、実績がまだそれに達していない（**可否の判断ではない**）
 * - "unknown" … 判定不可（紐付け未設定・適用行なし・上限が自然文）
 */
export type UsageVerdict = "over" | "under" | "unknown";

/** "unknown" になった理由。画面では理由ごとに違う導線を出す。 */
export type UnknownReason =
  | "no_famic_crop_name"      // 作付けに FAMIC 作物名が紐付いていない
  | "no_registration"         // その農薬の適用情報をまだ取得していない
  | "no_matching_row"         // 紐付け済みだが一致する適用行が無い
  | "unparsable_total_count"; // 適用行はあるが総使用回数が数値化できない自然文

export interface UsageSummary {
  cropId: number;
  cropName: string;
  /** 紐付け済みの FAMIC 作物名。未設定なら null */
  famicCropName: string | null;
  /** 集計期間の開始日（この日以降を数える）。画面に必ず併記する */
  periodStart: string;
  /** 集計の基準日（今日）。期間の表示に使う */
  periodEnd: string;
  /** 集計期間が作付け開始日ではなく直近1年で丸められたか（多年生果樹） */
  periodClamped: boolean;
  /** 使用回数。1レポート＝1回 */
  usedCount: number;
  /** 使用日（昇順）。画面・プロンプトで内訳を出す用 */
  usedDates: string[];
  verdict: UsageVerdict;
  /** 数値として確定できた上限。複数の適用行が一致したときは最小値（安全側） */
  limit: number | null;
  /** 判定の根拠にした適用行の総使用回数（FAMIC 原文）。複数あれば重複を除いて並べる */
  limitTexts: string[];
  /** 一致した適用行の件数 */
  matchedRows: number;
  unknownReason: UnknownReason | null;
}

// ─── 文字列の扱い ────────────────────────────────────────────
// FAMIC の CSV はカタカナが半角（「ｳﾞﾒ」等）で来ることがあり、利用者が入力する全角と
// そのままでは一致しない。突き合わせのときだけ NFKC で揃える（表示は常に原文のまま）。
const normalize = (s: string): string => s.normalize("NFKC").trim().toLowerCase();

/**
 * 総使用回数（FAMIC 原文）から数値の上限を取り出す。**厳格に**。
 *
 * 文字列全体が「N回以内」のときだけ数値化する。部分一致で拾うと
 * 「14回以内(土壌灌注は2回以内、散布は12回以内)」から 14 を取ってしまい、
 * 土壌灌注に使っている場合に上限を4倍近く緩めた誤判定になる。
 * 範囲・括弧・条件付き・空はすべて null（判定不可）に倒す。
 */
export function parseTotalCountLimit(totalCount: string | null | undefined): number | null {
  if (!totalCount) return null;
  // 全角数字「１４回以内」を半角に寄せるためだけに NFKC をかける。括弧は残るので
  // 条件付きの自然文が誤って単純形にはならない。
  const s = totalCount.normalize("NFKC").trim();
  const m = /^(\d+)回以内$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** ISO 日付文字列の1年前。2/29 は 3/1 に寄る（比較にしか使わないので許容）。 */
function oneYearBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 集計期間の開始日。
 *   max(作付け開始日, 今日 - 1年)
 * 多年生果樹（梅・みかん）では start_date が数年前のままになるため1年で丸める。
 * 丸めた事実は periodClamped で返し、画面に必ず併記する。
 */
export function usagePeriodStart(crop: UsageCrop, today: string): { start: string; clamped: boolean } {
  const floor = oneYearBefore(today);
  if (!crop.start_date) return { start: floor, clamped: true };
  return crop.start_date >= floor
    ? { start: crop.start_date, clamped: false }
    : { start: floor, clamped: true };
}

/** その記録でこの農薬が使われているか。新形式とレガシーの単一列の両方を見る。 */
export function reportUsesPesticide(r: UsageReport, pesticideId: string): boolean {
  if (r.pesticides_used && r.pesticides_used.length > 0) {
    return r.pesticides_used.some(u => u.id === pesticideId);
  }
  return r.pesticide_id === pesticideId;
}

export const todayStr = (): string => new Date().toISOString().slice(0, 10);

/**
 * 1つの農薬 × 1つの作付けの使用状況をまとめる。
 *
 * registrations はその農薬の適用行（FAMIC 登録適用部）。未取得なら空配列を渡す
 * （"unknown" / no_registration になる）。
 */
export function summarizeUsage(params: {
  pesticideId: string;
  crop: UsageCrop;
  reports: UsageReport[];
  registrations: UsageRegistration[];
  today?: string;
}): UsageSummary {
  const { pesticideId, crop, reports, registrations } = params;
  const today = params.today ?? todayStr();
  const { start, clamped } = usagePeriodStart(crop, today);

  // 期間の終わりは切らない。作業報告は事後入力だが日付を先に入れた記録もありうる。
  // 未来日付を落とすと使用回数が過小評価になり、警告を出し損ねる方向に倒れるため、
  // 「start 以降」で数える（画面の表記も「YYYY-MM-DD 以降」に揃える）。
  const usedDates = reports
    .filter(r => r.crop_id === crop.id && r.date >= start && reportUsesPesticide(r, pesticideId))
    .map(r => r.date)
    .sort();
  const usedCount = usedDates.length; // 1レポート＝1回

  const base = {
    cropId: crop.id,
    cropName: crop.name,
    famicCropName: crop.famic_crop_name?.trim() || null,
    periodStart: start,
    periodEnd: today,
    periodClamped: clamped,
    usedCount,
    usedDates,
  };

  const famic = base.famicCropName;
  if (!famic) {
    return { ...base, verdict: "unknown", limit: null, limitTexts: [], matchedRows: 0,
             unknownReason: "no_famic_crop_name" };
  }
  if (registrations.length === 0) {
    return { ...base, verdict: "unknown", limit: null, limitTexts: [], matchedRows: 0,
             unknownReason: "no_registration" };
  }

  // 紐付けは手動なので突き合わせも完全一致のみ。部分一致（「うめ」で「うめ以外の…」に
  // 当たる等）は誤判定を生むため採らない。一致しなければ素直に判定不可にする。
  const matched = registrations.filter(r => normalize(r.crop_name ?? "") === normalize(famic));
  if (matched.length === 0) {
    return { ...base, verdict: "unknown", limit: null, limitTexts: [], matchedRows: 0,
             unknownReason: "no_matching_row" };
  }

  const limitTexts = [...new Set(matched.map(r => r.total_count?.trim()).filter((t): t is string => !!t))];
  const limits = matched
    .map(r => parseTotalCountLimit(r.total_count))
    .filter((n): n is number => n != null);

  // 数値が採れた行が1つも無ければ判定不可。一部しか採れない場合も、採れたぶんの
  // 最小値で判定する（安全側）。
  if (limits.length === 0) {
    return { ...base, verdict: "unknown", limit: null, limitTexts, matchedRows: matched.length,
             unknownReason: "unparsable_total_count" };
  }
  const limit = Math.min(...limits);

  return {
    ...base,
    // 上限に達した時点で次の1回が超過になるため >= で警告する
    verdict: usedCount >= limit ? "over" : "under",
    limit,
    limitTexts,
    matchedRows: matched.length,
    unknownReason: null,
  };
}

/** 1つの農薬について、全作付けの使用状況を作付け順にまとめる。 */
export function summarizeUsageByCrop(params: {
  pesticideId: string;
  crops: UsageCrop[];
  reports: UsageReport[];
  registrations: UsageRegistration[];
  today?: string;
}): UsageSummary[] {
  return params.crops.map(crop =>
    summarizeUsage({
      pesticideId: params.pesticideId,
      crop,
      reports: params.reports,
      registrations: params.registrations,
      today: params.today,
    }),
  );
}

// ─── 表示文言（画面とAIプロンプトで同じ言い回しを使う）──────────────
// 「OK」「安全」「使用可能」と読める文言は絶対に置かない。

/** 判定に対応する警告・注意の文。"under" は事実だけを出すので文を持たない（null）。 */
export function verdictMessage(s: UsageSummary): string | null {
  if (s.verdict === "over") return "総使用回数の上限を超えている可能性があります。";
  if (s.verdict === "under") return null; // 事実のみ提示する。可否の断定はしない
  switch (s.unknownReason) {
    case "no_famic_crop_name":
      return "FAMIC 作物名が未設定のため、農薬の使用回数を判定できません。管理タブの作物から設定してください。";
    case "no_registration":
      return "この農薬の適用情報を取得していないため判定できません。「適用情報を見る」を一度実行してください。";
    case "no_matching_row":
      return "紐付けた FAMIC 作物名に一致する適用行がないため判定できません。製品ラベルの表示を確認してください。";
    default:
      return "総使用回数の判定はできません。製品ラベルの表示を確認してください。";
  }
}

/** 期間の表記。「2026-01-10 以降（直近1年）」。 */
export function periodLabel(s: UsageSummary): string {
  return `${s.periodStart} 以降${s.periodClamped ? "（直近1年）" : "（作付け開始から）"}`;
}

/** 総使用回数の原文。複数の適用行が一致したときは並べる。無ければ「記載なし」。 */
export function limitLabel(s: UsageSummary): string {
  return s.limitTexts.length > 0 ? s.limitTexts.join(" / ") : "総使用回数の記載なし";
}

export const PRODUCT_UNIT_NOTE =
  "商品単位の集計です（同一成分を含む他剤とは合算されません）。";
export const LABEL_CHECK_NOTE =
  "実際の使用時は必ず製品ラベルの表示を確認してください。";

// ─── AI記録検索チャット向けの整形 ────────────────────────────
/**
 * 農薬ごとの「登録上限」と「作付けごとの使用実績・判定」をプロンプト用に整形する。
 *
 * 画面表示と同じ summarizeUsage を通すので、AI の回答と画面の数字が食い違わない。
 * total_count は原文のまま渡す（docs/db-schema.md の「数値正規化しない」方針）。
 * 数値化した上限は判定の根拠としてのみ使い、原文と併記する。
 */
export function formatPesticideUsageForPrompt(params: {
  pesticides: { id: string; name: string }[];
  crops: UsageCrop[];
  reports: UsageReport[];
  registrationsByPesticide: Record<string, UsageRegistration[]>;
  today?: string;
  /** 1農薬あたりに載せる適用行の上限。超過ぶんは件数だけ注記する */
  maxRowsPerPesticide?: number;
  /**
   * ブロック全体の文字数上限。api/search-chat.ts が records を 20000 文字までしか
   * 受け付けないため、農薬が増えても記録本体の予算を食い潰さないように打ち切る。
   * 打ち切ったことは注記に出す（黙って削ると「全部見た」と誤解させる）。
   */
  maxChars?: number;
}): string {
  const today = params.today ?? todayStr();
  const maxRows = params.maxRowsPerPesticide ?? 20;
  const maxChars = params.maxChars ?? 8000;
  const blocks: string[] = [];

  params.pesticides.forEach(p => {
    const regs = params.registrationsByPesticide[p.id] ?? [];
    const summaries = summarizeUsageByCrop({
      pesticideId: p.id, crops: params.crops, reports: params.reports,
      registrations: regs, today,
    });
    // 使用実績も適用情報も無い農薬は載せない（プロンプトの文字数予算を食うだけ）
    const relevant = summaries.filter(s => s.usedCount > 0);
    if (relevant.length === 0 && regs.length === 0) return;

    const lines: string[] = [`- ${p.name}`];
    if (relevant.length === 0) {
      lines.push("  - 集計期間内の使用実績なし");
    }
    relevant.forEach(s => {
      const parts = [
        `作付け「${s.cropName}」（${periodLabel(s)}）`,
        `使用 ${s.usedCount}回${s.usedDates.length > 0 ? `（${s.usedDates.map(d => d.slice(5).replace("-", "/")).join("、")}）` : ""}`,
        `総使用回数 ${limitLabel(s)}`,
      ];
      if (s.verdict === "over") {
        parts.push(`判定: 上限（${s.limit}回）を超えている可能性あり`);
      } else if (s.verdict === "under") {
        parts.push(`判定: 上限 ${s.limit}回に対して実績 ${s.usedCount}回（可否の判断ではない）`);
      } else {
        parts.push(`判定: 不可（${verdictMessage(s)}）`);
      }
      lines.push(`  - ${parts.join(" / ")}`);
    });

    if (regs.length > 0) {
      lines.push("  - 登録適用（FAMIC原文）:");
      regs.slice(0, maxRows).forEach(r => {
        const detail = [
          r.usage_timing?.trim() && `使用時期 ${r.usage_timing.trim()}`,
          r.usage_count?.trim() && `本剤 ${r.usage_count.trim()}`,
          `総使用回数 ${r.total_count?.trim() || "記載なし"}`,
        ].filter(Boolean).join(" / ");
        lines.push(`    - ${r.crop_name || "作物不明"} / ${r.pest_name || "対象不明"}: ${detail}`);
      });
      if (regs.length > maxRows) {
        lines.push(`    - ほか${regs.length - maxRows}件は省略（全文は製品ラベル・登録情報で確認）`);
      }
    }
    blocks.push(lines.join("\n"));
  });

  if (blocks.length === 0) return "";

  const header = [
    "",
    "## 農薬の登録上限と使用実績（作付け単位・FAMIC登録情報は原文のまま）",
    `集計基準日: ${today}。期間は作付け開始日以降、1年を超える場合は直近1年。`,
    PRODUCT_UNIT_NOTE + LABEL_CHECK_NOTE,
    "「上限に達していない」ことは使用の可否を意味しない。判定不可の場合は断定しないこと。",
  ].join("\n");

  // 文字数上限に収まるぶんだけ載せる。落とした農薬は件数を明記し、AI が
  // 「載っていない＝使っていない」と読まないようにする。
  const kept: string[] = [];
  let used = header.length;
  for (const b of blocks) {
    if (used + b.length + 1 > maxChars) break;
    kept.push(b);
    used += b.length + 1;
  }
  if (kept.length === 0) return "";
  const dropped = blocks.length - kept.length;
  return [
    header,
    ...kept,
    ...(dropped > 0
      ? [`（文字数の都合でほか${dropped}件の農薬を省略。省略ぶんは使用実績が不明なので、範囲外として扱い断定しないこと）`]
      : []),
  ].join("\n");
}

// ─── 天気×防除タイミング助言（api/pest-control-advice.ts）向けの整形 ──────
//
// 天気だけを見た助言は汎用の生成AI（ChatGPT等）でも同じことができるため、それ自体に
// 課金価値は無い。課金できるのは「その農家自身の記録を読んだうえで答える」部分だけなので、
// 防除助言には必ず自農場の散布実績を渡す（docs/decisions/20260823-pest-advice-history.md）。
//
// 有効成分・系統（RACコード等）のデータを farm-app は持っていない。
// pesticide_registrations は FAMIC 登録適用部（商品 x 作物 x 病害虫の適用行）だけで、
// 成分の列を取り込んでいないため（api/pesticide-registration.ts の COL 定義を参照）。
// したがってここで出せるのは商品名の一致による連用までで、「同一系統の連用」は判定できない。
// summarizeUsage が同一成分の合算をしないのと同じ理由・同じ非対称性で、判定できないものは
// 判定不可のまま渡し、プロンプト側でも断定を禁じる。

/** 散布履歴の整形に必要なフィールド。App.tsx / expo の Report がそのまま渡る。 */
export interface SprayReport extends UsageReport {
  work_type?: string | null;
  field?: string | null;
}

/** 防除記録とみなすか。農薬が記録されていれば確実だが、農薬を選ばずに
 *  作業種別だけ「防除」「農薬散布」と入れた記録も拾う（実データに両方ある）。 */
export function isSprayReport(r: SprayReport): boolean {
  if (r.pesticides_used && r.pesticides_used.length > 0) return true;
  if (r.pesticide_id) return true;
  return /防除|散布/.test(r.work_type ?? "");
}

/** その記録で使われた農薬の名称。マスタに無いIDは落とす（推測で名前を作らない）。 */
function sprayedNames(r: SprayReport, pesticides: { id: string; name: string }[]): string[] {
  const ids = (r.pesticides_used && r.pesticides_used.length > 0)
    ? r.pesticides_used.map(u => u.id)
    : (r.pesticide_id ? [r.pesticide_id] : []);
  return ids
    .map(id => pesticides.find(p => p.id === id)?.name)
    .filter((n): n is string => !!n);
}

/** 日付のみの加減算。日付だけを扱うので UTC 固定で十分（oneYearBefore と同じ流儀）。 */
function shiftDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** from から to までの日数。パースできなければ null */
function diffDays(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

const monthDay = (d: string): string => d.slice(5).replace("-", "/");

/**
 * 自農場の防除履歴をプロンプト用に整形する。
 *
 * 散布記録が1件も無ければ空文字を返す（呼び出し側はブロックごと省く）。
 * 「記録が無い」ことを AI に「散布していない」と読ませないため、空のときは
 * ブロック自体を出さず、プロンプト側で別途その旨を指示する。
 */
export function formatSprayHistoryForPrompt(params: {
  reports: SprayReport[];
  crops: { id: number; name: string }[];
  pesticides: { id: string; name: string }[];
  today?: string;
  /** 直近の履歴に載せる件数の上限 */
  maxRecent?: number;
  /** 昨年同時期とみなす窓（今日の1年前 プラスマイナス この日数） */
  seasonWindowDays?: number;
  /** ブロック全体の文字数上限。超過ぶんは節数を明記して打ち切る */
  maxChars?: number;
}): string {
  const today = params.today ?? todayStr();
  const maxRecent = params.maxRecent ?? 12;
  const windowDays = params.seasonWindowDays ?? 14;
  const maxChars = params.maxChars ?? 3000;

  const cropNameOf = (id: number): string =>
    params.crops.find(c => c.id === id)?.name ?? "作物不明";

  const sprays = params.reports
    .filter(isSprayReport)
    .filter(r => r.date <= today) // 未来日の記録は履歴として扱わない
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  if (sprays.length === 0) return "";

  const label = (r: SprayReport): string => {
    const names = sprayedNames(r, params.pesticides);
    const where = [cropNameOf(r.crop_id), r.field?.trim()].filter(Boolean).join("・");
    // 農薬名が取れない記録は明示する（空欄にすると散布内容を想像させる）
    return `${where}: ${names.length > 0 ? names.join("、") : "農薬の記録なし"}`;
  };

  const sections: string[] = [];

  // 1) 前回の散布からの経過日数。助言が最も直接的に使う数字
  const last = sprays[0];
  const since = diffDays(last.date, today);
  const sinceLabel = since == null ? "" : since === 0 ? "（本日）" : `（${since}日前）`;
  sections.push(["### 前回の散布", `${last.date}${sinceLabel} ${label(last)}`].join("\n"));

  // 2) 直近の履歴
  const recent = sprays.slice(0, maxRecent);
  sections.push([
    `### 直近の散布履歴（新しい順・${recent.length}件）`,
    ...recent.map(r => {
      const d = diffDays(r.date, today);
      return `- ${r.date}${d == null ? "" : `（${d}日前）`} ${label(r)}`;
    }),
    ...(sprays.length > recent.length
      ? [`（ほか${sprays.length - recent.length}件は省略。省略ぶんも散布はしている）`]
      : []),
  ].join("\n"));

  // 3) 同一商品の繰り返し。系統ではなく商品名の一致であることを見出しで明示する
  const repeats = new Map<string, { crop: string; product: string; dates: string[] }>();
  sprays.forEach(r => {
    sprayedNames(r, params.pesticides).forEach(name => {
      const key = `${r.crop_id} ${name}`;
      const hit = repeats.get(key) ?? { crop: cropNameOf(r.crop_id), product: name, dates: [] };
      hit.dates.push(r.date);
      repeats.set(key, hit);
    });
  });
  const repeated = Array.from(repeats.values())
    .filter(x => x.dates.length >= 2)
    .sort((a, b) => b.dates.length - a.dates.length);
  if (repeated.length > 0) {
    sections.push([
      "### 同じ商品を繰り返し使っている組み合わせ（商品名の一致のみ）",
      ...repeated.slice(0, 8).map(x =>
        `- ${x.crop} / ${x.product}: ${x.dates.length}回（${x.dates.slice().sort().map(monthDay).join("、")}）`),
    ].join("\n"));
  }

  // 4) 昨年の同時期。果樹は多年生で年間サイクルが繰り返すため、
  //    去年の同じ頃に何を撒いたかは防除の判断材料になる
  const anchor = oneYearBefore(today);
  const from = shiftDays(anchor, -windowDays);
  const to = shiftDays(anchor, windowDays);
  const lastSeason = sprays.filter(r => r.date >= from && r.date <= to);
  sections.push([
    `### 昨年の同時期（${from} から ${to}）の防除`,
    ...(lastSeason.length > 0
      ? lastSeason.map(r => `- ${r.date} ${label(r)}`)
      : ["- 記録なし（この期間に散布記録が無い。散布しなかったのか記録し忘れたのかは区別できない）"]),
  ].join("\n"));

  const header = [
    "",
    "## この農場自身の防除記録",
    `集計基準日: ${today}。以下はすべて利用者本人が入力した実績で、一般論ではない。`,
  ].join("\n");

  const footer = [
    "注記（この記録から言えないこと）:",
    `- ${PRODUCT_UNIT_NOTE}有効成分・系統（RACコード等）のデータを持っていないため、`,
    "  同一系統の連用かどうかはここでは判定していない。",
    "- 記録に無い散布は把握できない。記録が無いことは散布していないことを意味しない。",
  ].join("\n");

  // 文字数上限に収まるぶんだけ載せる。落としたことは黙らせない
  const kept: string[] = [];
  let used = header.length + footer.length;
  for (const s of sections) {
    if (used + s.length + 2 > maxChars) break;
    kept.push(s);
    used += s.length + 2;
  }
  if (kept.length === 0) return "";
  const droppedSections = sections.length - kept.length;
  return [
    header,
    ...kept,
    ...(droppedSections > 0 ? [`（文字数の都合で${droppedSections}節を省略）`] : []),
    footer,
  ].join("\n\n");
}
