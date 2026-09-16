// ─── 相談タブ（Web の 20260909-single-ai-entry-threads.md の Expo 版）────────
//
// 相談の入口をボトムナビに置く。Web は「主題ごとのスレッド」（advice_threads）に
// 集約したが、**Expo は作付け単位のまま**にしてある。スレッド方式の移植は範囲が
// 大きく、申請物を安定させるほうを優先したため（docs/decisions/20260912-release-line.md
// の「Web で調整し、固まったら Expo に反映する」）。見た目は揃うが、まとまる単位が違う。
//
// 一覧に「やること」の未実施件数を出すのは、タブを「行かないと何も起きない場所」に
// しないため。件数は保存せず lib/adviceMatch.ts で毎回計算する（記録は後から増減する）。
import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useStore } from "../lib/store";
import { matchActions, countMatches } from "../lib/adviceMatch";
import { AdviseSheet, SearchChatSheet, PhotoDiagnosisSheet, diagnosisForAdvise } from "./AiSheets";
import { C, RADIUS, SHADOW } from "../ui/tokens";

/** 相談の対象。畑全体は cropId=null で、一覧では先頭に固定する */
interface Target {
  cropId: number | null;
  title: string;
  sub: string;
  todo: number;
  done: number;
}

export default function AdviceScreen() {
  const { crops, reports, adviceCounts, reloadAdviceCounts } = useStore();

  // 開いている相談の対象。undefined は閉じている（null は「畑全体」なので兼用できない）
  const [openCropId, setOpenCropId] = useState<number | null | undefined>(undefined);
  // 相談から開く先（橋渡し）。docs/decisions/20260908-advice-handoff.md
  const [sheet, setSheet] = useState<"chat" | "diag" | null>(null);
  const [advisePhoto, setAdvisePhoto] = useState<{ text: string; label: string } | null>(null);
  const [recordQuery, setRecordQuery] = useState("");

  // 相談を閉じたら件数を取り直す。やることが増えているので、一覧のバッジを合わせる
  useEffect(() => { void reloadAdviceCounts(); }, [reloadAdviceCounts]);
  const onOpen = (cropId: number | null) => setOpenCropId(cropId);

  const targets = useMemo<Target[]>(() => {
    const build = (cropId: number | null, title: string, sub: string): Target => {
      const acts = adviceCounts[cropId ?? 0] ?? [];
      // 作付けが決まっていれば その作物の記録、畑全体なら農場全体の記録と照合する
      const target = cropId == null ? reports : reports.filter(r => r.crop_id === cropId);
      const m = countMatches(matchActions(acts, target));
      return { cropId, title, sub, todo: m.pending + m.overdue, done: m.done };
    };
    return [
      build(null, "畑全体", "作物を指定しない相談"),
      ...crops.map(c => {
        const days = c.start_date
          ? Math.round((Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) - Date.parse(`${c.start_date}T00:00:00Z`)) / 86400000)
          : null;
        return build(c.id, c.name, days != null ? `作付けから${days}日` : "作付け日は未設定");
      }),
    ];
  }, [crops, reports, adviceCounts]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      {/* 空状態の一行だけ置き、説明文は書かない（20260824-no-manual-test.md）。
          汎用AIとの違いはここでしか言えないので、そこだけ明示する */}
      <Text style={{ fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 12 }}>
        その作付けの記録と農薬の登録内容もふまえて答えます。
      </Text>

      <View style={{ backgroundColor: C.card, borderRadius: RADIUS.card, ...SHADOW.card, paddingHorizontal: 16 }}>
        {targets.map((t, i) => (
          <Pressable
            key={t.cropId ?? "all"}
            onPress={() => onOpen(t.cropId)}
            style={{
              flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14,
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline,
            }}
          >
            <Feather
              name={t.cropId == null ? "map" : "feather"}
              size={16}
              color={t.cropId == null ? C.textSub : C.ink}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>{t.title}</Text>
              {/* 「相談はまだありません」とは書かない。ここで数えているのは会話ではなく
                  「やること」の行なので、会話があっても0件になりうる。裏の取れない断定を
                  画面に出さない（判定不可に倒す、の原則）*/}
              <Text style={{ fontSize: 11.5, color: C.textMuted, marginTop: 2 }}>{t.sub}</Text>
            </View>
            {t.todo > 0 ? (
              <View style={{ backgroundColor: C.warningBg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: C.warning }}>やること{t.todo}</Text>
              </View>
            ) : t.done > 0 ? (
              <View style={{ backgroundColor: C.inkSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: C.ink }}>実施済み</Text>
              </View>
            ) : null}
            <Feather name="chevron-right" size={16} color={C.textMuted} />
          </Pressable>
        ))}
      </View>

      <AdviseSheet
        open={openCropId !== undefined}
        entryPoint="thread"
        onClose={() => { setOpenCropId(undefined); setAdvisePhoto(null); void reloadAdviceCounts(); }}
        cropId={openCropId ?? null}
        photoDiagnosis={advisePhoto}
        onAskRecords={q => { setRecordQuery(q); setOpenCropId(undefined); setSheet("chat"); }}
        onAskPhoto={() => { setOpenCropId(undefined); setSheet("diag"); }}
      />
      <SearchChatSheet open={sheet === "chat"} onClose={() => setSheet(null)} initialQuestion={recordQuery} />
      <PhotoDiagnosisSheet
        open={sheet === "diag"}
        entryPoint="thread_tool"
        onClose={() => setSheet(null)}
        onAdvise={d => { setAdvisePhoto(diagnosisForAdvise(d)); setSheet(null); setOpenCropId(null); }}
      />
    </ScrollView>
  );
}
