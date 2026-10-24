// 農薬の作付けごとの使用状況（使用回数＋総使用回数の判定）の表示。
// src/components/PesticideUsageSummary.tsx の RN 移植（構造・文言・色は同一）。
//
// 管理タブ（農薬）の適用情報パネルと作業記録シートの2箇所から使う共用コンポーネント。
// 判定・集計そのものは lib/pesticideUsage.ts に集約してあり、ここは表示だけを持つ。
//
// 表示の原則（docs/decisions/20260805-pesticide-precheck.md）:
//   - 「OK」「安全」「使用可能」と読める表示は絶対に出さない
//   - "under"（上限に達していない）は事実だけを出す。可否は書かない
//   - 判定できないときは「判定できません／ラベルを確認」に倒す
//   - 集計期間と「商品単位の集計」の注記を必ず併記する
import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW, RADIUS } from "./tokens";
import { periodLabel, limitLabel, verdictMessage } from "../lib/pesticideUsage";
import type { UsageSummary } from "../lib/pesticideUsage";

interface Props {
  summaries: UsageSummary[];
  /** 見出し。省略時は見出しを出さない */
  title?: string;
  /**
   * true で要点（使用回数＋判定）のみを出し、詳細（原文・使用日）は行タップで展開する。
   * 作業記録シートが煩雑になるのを防ぐため、シート側では true を渡す。
   */
  compact?: boolean;
  /** 未設定の作物への導線。渡すとリンクを出す */
  onSetupCrop?: () => void;
}

/** 判定バッジ。"under" にはバッジを出さない（何かを保証したように見せないため）。 */
function VerdictBadge({ verdict }: { verdict: UsageSummary["verdict"] }) {
  if (verdict === "over") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.warningBg, borderRadius: RADIUS.pill, paddingVertical: 2, paddingHorizontal: 8 }}>
        <Feather name="alert-triangle" size={11} color={C.warning} />
        <Text style={{ fontSize: 11, fontWeight: "700", color: C.warning }}>超過の疑い</Text>
      </View>
    );
  }
  if (verdict === "unknown") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.well, borderRadius: RADIUS.pill, paddingVertical: 2, paddingHorizontal: 8 }}>
        <Feather name="help-circle" size={11} color={C.textSub} />
        <Text style={{ fontSize: 11, fontWeight: "700", color: C.textSub }}>上限不明</Text>
      </View>
    );
  }
  return null;
}

const metaText = { fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 17 } as const;

function SummaryRow({ s, compact, onSetupCrop }: { s: UsageSummary; compact: boolean; onSetupCrop?: () => void }) {
  const [open, setOpen] = useState(false);
  // 管理タブでも作物ごとの説明・集計期間・使用日は押したときだけ出す。印と回数だけで一覧できるようにする。
  // 超過の疑いの文だけは常に出す（気づいてほしいので隠さない）（オーナー 2026-10-17）
  void compact;
  const showDetail = open;
  const message = verdictMessage(s);

  return (
    <View style={{ backgroundColor: C.card, borderRadius: RADIUS.row, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6, shadowColor: "#101114", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 }}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }}
      >
        <Feather name={open ? "chevron-down" : "chevron-right"} size={13} color={C.textMuted} />
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: C.text, flexShrink: 1 }}>{s.cropName}</Text>
        <VerdictBadge verdict={s.verdict} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: C.text, marginLeft: "auto" }}>{s.usedCount}回使用</Text>
      </Pressable>

      {/* "under" でも上限との対比は事実として出す。可否は書かない */}
      {!!message && (s.verdict === "over" || open) && (
        <Text style={[metaText, s.verdict === "over" ? { color: C.warning, fontWeight: "700" } : { color: C.textSub }]}>
          {message}
        </Text>
      )}

      {s.verdict === "unknown" && s.unknownReason === "no_famic_crop_name" && onSetupCrop && (
        <Pressable onPress={onSetupCrop} style={{ paddingTop: 4 }}>
          <Text style={{ color: C.ink, fontSize: 12, fontWeight: "600" }}>ラベル上の作物名を選ぶ →</Text>
        </Pressable>
      )}

      {showDetail && (
        <View style={{ marginTop: 4 }}>
          {s.verdict === "under" && s.limit != null && (
            <Text style={metaText}>ラベルの上限 {s.limit}回（使用の可否を示すものではありません）</Text>
          )}
          <Text style={metaText}>集計期間: {periodLabel(s)}</Text>
          {!!s.famicCropName && (
            <Text style={metaText}>ラベル上の作物名: {s.famicCropName}{s.matchedRows > 0 ? `（適用${s.matchedRows}件）` : ""}</Text>
          )}
          {s.limitTexts.length > 0 && (
            <Text style={metaText}>使える回数 {limitLabel(s)}（ラベル記載）</Text>
          )}
          {s.usedDates.length > 0 && (
            <Text style={metaText}>使用日: {s.usedDates.map(d => d.slice(5).replace("-", "/")).join("、")}</Text>
          )}
        </View>
      )}
    </View>
  );
}

export default function PesticideUsageSummary({ summaries, title, compact = false, onSetupCrop }: Props) {
  if (summaries.length === 0) return null;
  // 気づいてほしい順に並べる: 超過の疑い → 上限不明 → それ以外
  const order: Record<UsageSummary["verdict"], number> = { over: 0, unknown: 1, under: 2 };
  const sorted = [...summaries].sort((a, b) => order[a.verdict] - order[b.verdict]);

  return (
    <View>
      {!!title && (
        <Text style={{ fontSize: 11, fontWeight: "600", color: C.textMuted, letterSpacing: 0.4, marginBottom: 6, textTransform: "uppercase" }}>
          {title}
        </Text>
      )}
      <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, padding: 6 }}>
        {sorted.map(s => (
          <SummaryRow key={s.cropId} s={s} compact={compact} onSetupCrop={onSetupCrop} />
        ))}
        {/* 補足は1行まで（グレーの長文を置かない）。定数 PRODUCT_UNIT_NOTE / LABEL_CHECK_NOTE は
            AIへ渡す文にも使うので変えず、画面だけ短くする（2026-10-24） */}
        <Text numberOfLines={1} style={{ fontSize: 11, color: C.textMuted, paddingHorizontal: 6, paddingBottom: 6, paddingTop: 2 }}>
          同じ成分の別製品は数えません。<Text style={{ color: C.textSub, fontWeight: "700" }}>使う前にラベルを確認</Text>
        </Text>
      </View>
    </View>
  );
}

/** 影付きカードとして単体で置くときのラッパ（作業記録シート用）。 */
export function PesticideUsageCard(props: Props) {
  if (props.summaries.length === 0) return null;
  return (
    <View style={{ backgroundColor: C.card, borderRadius: RADIUS.card, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12, ...SHADOW.card }}>
      <PesticideUsageSummary {...props} />
    </View>
  );
}
