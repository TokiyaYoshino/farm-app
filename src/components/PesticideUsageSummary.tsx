// 農薬の作付けごとの使用状況（使用回数＋総使用回数の判定）の表示。
//
// 農薬管理タブの適用情報パネルと作業報告フォームの2箇所から使う共用コンポーネント。
// 判定・集計そのものは src/lib/pesticideUsage.ts に集約してあり、ここは表示だけを持つ。
//
// 表示の原則（docs/decisions/20260805-pesticide-precheck.md）:
//   - 「OK」「安全」「使用可能」と読める表示は絶対に出さない
//   - "under"（上限に達していない）は事実だけを出す。可否は書かない
//   - 判定できないときは「判定できません／ラベルを確認」に倒す
//   - 集計期間と「商品単位の集計」の注記を必ず併記する

import { useState } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle, HelpCircle, ChevronRight } from "lucide-react";
import { C, SHADOW, RADIUS } from "../ui/tokens";
import {
  periodLabel, limitLabel, verdictMessage,
  PRODUCT_UNIT_NOTE, LABEL_CHECK_NOTE,
} from "../lib/pesticideUsage";
import type { UsageSummary } from "../lib/pesticideUsage";

interface Props {
  summaries: UsageSummary[];
  /** 見出し。省略時は見出しを出さない */
  title?: string;
  /**
   * true で要点（使用回数＋判定）のみを出し、詳細（原文・使用日）は行タップで展開する。
   * 作業報告フォームが煩雑になるのを防ぐため、フォーム側では true を渡す。
   */
  compact?: boolean;
  /** 未設定の作物への導線。渡すとリンクを出す */
  onSetupCrop?: () => void;
}

const css = (o: CSSProperties): CSSProperties => o;

const S = {
  well:  css({ background: C.well, borderRadius: RADIUS.well, padding: 6 }),
  row:   css({ background: C.card, borderRadius: RADIUS.row, padding: "10px 12px", marginBottom: 6, boxShadow: "0 1px 2px rgba(16,17,20,.04)" }),
  head:  css({ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }),
  crop:  css({ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }),
  count: css({ fontSize: 13, fontWeight: 700, color: C.text, marginLeft: "auto", flexShrink: 0 }),
  meta:  css({ fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.6 }),
  note:  css({ fontSize: 11, color: C.textMuted, lineHeight: 1.6, padding: "2px 6px 6px" }),
};

/** 判定バッジ。"under" にはバッジを出さない（何かを保証したように見せないため）。 */
function VerdictBadge({ verdict }: { verdict: UsageSummary["verdict"] }) {
  if (verdict === "over") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.warningBg, color: C.warning, borderRadius: RADIUS.pill, padding: "2px 8px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
        <AlertTriangle size={11} strokeWidth={2.5} />超過の疑い
      </span>
    );
  }
  if (verdict === "unknown") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.well, color: C.textSub, borderRadius: RADIUS.pill, padding: "2px 8px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
        <HelpCircle size={11} strokeWidth={2.5} />判定不可
      </span>
    );
  }
  return null;
}

function SummaryRow({ s, compact, onSetupCrop }: { s: UsageSummary; compact: boolean; onSetupCrop?: () => void }) {
  const [open, setOpen] = useState(false);
  const showDetail = !compact || open;
  const message = verdictMessage(s);

  return (
    <div style={S.row}>
      <button
        onClick={() => compact && setOpen(o => !o)}
        style={{ ...S.head, width: "100%", background: "none", border: "none", padding: 0, cursor: compact ? "pointer" : "default", textAlign: "left" as const }}
      >
        {compact && (
          <ChevronRight size={13} strokeWidth={2.5} color={C.textMuted}
            style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
        )}
        <span style={S.crop}>{s.cropName}</span>
        <VerdictBadge verdict={s.verdict} />
        <span style={S.count}>{s.usedCount}回使用</span>
      </button>

      {/* "under" でも上限との対比は事実として出す。可否は書かない */}
      {s.verdict === "under" && s.limit != null && (
        <div style={S.meta}>
          総使用回数の上限 {s.limit}回に対して、集計期間の実績 {s.usedCount}回です（使用の可否を示すものではありません）。
        </div>
      )}

      {message && (
        <div style={{ ...S.meta, color: s.verdict === "over" ? C.warning : C.textSub, fontWeight: s.verdict === "over" ? 700 : 400 }}>
          {message}
        </div>
      )}

      {s.verdict === "unknown" && s.unknownReason === "no_famic_crop_name" && onSetupCrop && (
        <button
          onClick={onSetupCrop}
          style={{ background: "none", border: "none", padding: "4px 0 0", cursor: "pointer", color: C.ink, fontSize: 12, fontWeight: 600 }}
        >
          FAMIC 作物名を設定する →
        </button>
      )}

      {showDetail && (
        <div style={S.meta}>
          <div>集計期間: {periodLabel(s)}</div>
          {s.famicCropName && <div>FAMIC 作物名: {s.famicCropName}{s.matchedRows > 0 ? `（適用${s.matchedRows}件）` : ""}</div>}
          {s.limitTexts.length > 0 && (
            <div>総使用回数 {limitLabel(s)}<span style={{ color: C.textMuted }}>（FAMIC 原文）</span></div>
          )}
          {s.usedDates.length > 0 && (
            <div>使用日: {s.usedDates.map(d => d.slice(5).replace("-", "/")).join("、")}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PesticideUsageSummary({ summaries, title, compact = false, onSetupCrop }: Props) {
  if (summaries.length === 0) return null;
  // 気づいてほしい順に並べる: 超過の疑い → 判定不可 → それ以外
  const order: Record<UsageSummary["verdict"], number> = { over: 0, unknown: 1, under: 2 };
  const sorted = [...summaries].sort((a, b) => order[a.verdict] - order[b.verdict]);

  return (
    <div>
      {title && (
        <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, letterSpacing: 0.4, marginBottom: 6, textTransform: "uppercase" as const }}>
          {title}
        </div>
      )}
      <div style={S.well}>
        {sorted.map(s => (
          <SummaryRow key={s.cropId} s={s} compact={compact} onSetupCrop={onSetupCrop} />
        ))}
        <div style={S.note}>
          {PRODUCT_UNIT_NOTE}
          <strong style={{ color: C.textSub }}>{LABEL_CHECK_NOTE}</strong>
        </div>
      </div>
    </div>
  );
}

/** 影付きカードとして単体で置くときのラッパ（作業報告フォーム用）。 */
export function PesticideUsageCard(props: Props) {
  return (
    <div style={{ background: C.card, borderRadius: RADIUS.card, padding: "12px 14px", marginBottom: 12, boxShadow: SHADOW.card }}>
      <PesticideUsageSummary {...props} />
    </div>
  );
}
