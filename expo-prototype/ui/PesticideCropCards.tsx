import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, RADIUS } from "./tokens";
import { summarizeUsageByCrop, matchedRegistrations, type UsageCrop, type UsageReport } from "../lib/pesticideUsage";
import type { PesticideRegistration } from "../lib/types";
import { dispName } from "../lib/text";

// ─── 農薬の適用情報（作物ごとに1枚）──────────────────────────────────
// 散布前に見る順（農薬取締法の使用基準）に並べる: 自分の作物に登録があるか → 使用時期 → 回数 → 希釈 → 病害虫。
// 自分が作っている作物を先に出し、ラベルの内容と自分の使用回数を同じ1枚にまとめる。
// 作っていない作物の登録は下に畳む（植える前に調べる用）。「あと◯回使える」とは書かない
// （docs/decisions/20261017-first-day-walkthrough.md・相談で農薬について述べてよい範囲と同じ線）。

interface Props {
  pesticideId: string;
  crops: UsageCrop[];
  reports: UsageReport[];
  registrations: PesticideRegistration[];
  onSetupCrop?: () => void;
}

// FAMIC 原文は記載が無いと空や「-」で来る。空欄のまま見せると壊れて見えるので「記載なし」と出す
const blank = (x: string) => x === "" || /^[-－ー―‐]+$/.test(x);
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.map(x => dispName(x).trim()).filter(x => !blank(x)))];
const joinTwo = (xs: string[]) =>
  xs.length === 0 ? "記載なし" : xs.length <= 2 ? xs.join("／") : `${xs.slice(0, 2).join("／")} ほか${xs.length - 2}`;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingTop: 8 }}>
      <Text style={{ width: 76, fontSize: 12, color: C.textSub }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: C.text }}>{value}</Text>
    </View>
  );
}

export default function PesticideCropCards({ pesticideId, crops, reports, registrations, onSetupCrop }: Props) {
  const [showOthers, setShowOthers] = useState(false);
  const summaries = summarizeUsageByCrop({ pesticideId, crops, reports, registrations });
  const mine = new Set(summaries.flatMap(s => matchedRegistrations(registrations, s.famicCropName)));
  const others = registrations.filter(r => !mine.has(r));

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, padding: 6, gap: 6 }}>
        {summaries.map(s => {
          const rows = matchedRegistrations(registrations, s.famicCropName);
          const over = s.verdict === "over";
          const pests = uniq(rows.map(r => r.pest_name));
          return (
            <View key={s.cropId} style={{ backgroundColor: C.card, borderRadius: RADIUS.row, paddingVertical: 12, paddingHorizontal: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: C.text }}>{s.cropName}</Text>
                {over && <Feather name="alert-triangle" size={14} color={C.warning} />}
                <Text style={{ fontSize: 14, fontWeight: "700", color: over ? C.warning : C.text }}>
                  {s.usedCount}回使用{s.limit != null ? `／上限${s.limit}回` : ""}
                </Text>
              </View>
              {!s.famicCropName ? (
                onSetupCrop && (
                  <Pressable onPress={onSetupCrop} style={{ paddingTop: 8 }} accessibilityRole="button">
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.ink }}>ラベル上の作物名を選ぶ →</Text>
                  </Pressable>
                )
              ) : rows.length === 0 ? (
                // 一致しないことと、使えないことは別（ラベルが「野菜類」等の括りで書かれていることがある）
                <Text style={{ fontSize: 13, color: C.warning, paddingTop: 8 }}>ラベルにこの作物の記載が見つかりません</Text>
              ) : (
                <>
                  <Field label="使用時期" value={joinTwo(uniq(rows.map(r => r.usage_timing)))} />
                  <Field label="回数" value={joinTwo(uniq(rows.map(r => r.usage_count)))} />
                  <Field label="総使用回数" value={joinTwo(uniq(rows.map(r => r.total_count)))} />
                  <Field label="希釈" value={joinTwo(uniq(rows.map(r => r.dilution)))} />
                  <Field label="病害虫" value={joinTwo(pests)} />
                </>
              )}
            </View>
          );
        })}
      </View>

      {others.length > 0 && (
        <Pressable onPress={() => setShowOthers(v => !v)} accessibilityRole="button"
          style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 10 }}>
          <Feather name={showOthers ? "chevron-down" : "chevron-right"} size={14} color={C.textSub} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSub }}>ほかの作物の登録（{others.length}件）</Text>
        </Pressable>
      )}
      {showOthers && (
        <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, padding: 6, gap: 6 }}>
          {others.map((r, i) => (
            <View key={r.id ?? i} style={{ backgroundColor: C.card, borderRadius: RADIUS.row, paddingVertical: 10, paddingHorizontal: 14 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>{dispName(r.crop_name)}</Text>
              <Field label="使用時期" value={joinTwo(uniq([r.usage_timing]))} />
              <Field label="回数" value={joinTwo(uniq([r.usage_count]))} />
              <Field label="希釈" value={joinTwo(uniq([r.dilution]))} />
              <Field label="病害虫" value={joinTwo(uniq([r.pest_name]))} />
            </View>
          ))}
        </View>
      )}

      <Text style={{ fontSize: 12, color: C.textSub, marginTop: 8 }}>使う前に、必ず製品ラベルを確認してください</Text>
    </View>
  );
}
