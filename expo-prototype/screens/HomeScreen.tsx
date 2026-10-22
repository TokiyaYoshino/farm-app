import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW, RADIUS, workTypeColor } from "../ui/tokens";
import Btn from "../ui/Btn";
import { useStore } from "../lib/store";
import { canUseAiFeature } from "../lib/ai";
import { lastSpray } from "../lib/pesticideUsage";
import { PestAdviceSheet, AdviseSheet, SearchChatSheet, PhotoDiagnosisSheet, diagnosisForAdvise } from "./AiSheets";
import { todayStr, toDateStr, shiftDays } from "../lib/date";
import { dispName } from "../lib/text";

// ─── ダッシュボード（src/App.tsx tab==="home" ブロックの移植・実データ）───
interface Props {
  onGoReport: () => void;
  onQuickReport: () => void;
  /** 「作業を選ぶ」シートを開く（App が持つ。＋記録と同じもの） */
  onOpenEntry: (mode: "record" | "plan") => void;
}

const fmtElapsed = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export default function HomeScreen({ onGoReport, onQuickReport, onOpenEntry }: Props) {
  const {
    reports, schedules, comments, wxAuto, wxLoading, weatherCoords, cropName, userName,
    crops, pesticides,
    workStartedAt, startWork, stopWork, refreshing, refresh, openQuickReport,
  } = useStore();
  // 今日の一手の詳細（農薬名）は押すと開く。ふだんは「日付 · 場所」の1行だけ
  const [showSprayDetail, setShowSprayDetail] = useState(false);
  const [showPestAdvice, setShowPestAdvice] = useState(false);
  const [showAdvise, setShowAdvise] = useState(false);
  // 相談から開く先（橋渡し）。docs/decisions/20260908-advice-handoff.md
  const [homeSheet, setHomeSheet] = useState<"chat" | "diag" | null>(null);
  const [advisePhoto, setAdvisePhoto] = useState<{ text: string; label: string } | null>(null);
  const [recordQuery, setRecordQuery] = useState("");

  // 作業タイマーの経過秒（Web版 workElapsed と同一の1秒更新）
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!workStartedAt) { setElapsed(0); return; }
    const started = new Date(workStartedAt).getTime();
    setElapsed(Math.floor((Date.now() - started) / 1000));
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [workStartedAt]);

  const today = new Date();
  const todayStr = toDateStr(today);
  // 「直近7日の作業」「今週の収穫」の統計カードは外した（収穫は分析タブで見る。docs/decisions/20261004-home-declutter.md）
  const todayScheds = schedules.filter(s => s.date === todayStr);

  const scheduleTitle = (s: typeof schedules[number]) => (s.title && s.title !== s.work_type ? s.title : "");
  // 予定から記録を始める（記録タブと同じ。予定の日付・作業・作物・圃場・担当を入れて入力シートを開く）
  const recordFromSchedule = (s: typeof schedules[number]) => openQuickReport({
    date: s.date,
    work_type: s.work_type || undefined,
    crop_id: crops.find(c => c.name === s.crop)?.id,
    field: s.field || undefined,
    user_id: s.assigned_user_id ?? s.user_id,
  });

  const feed = comments.slice(0, 3).map(cm => {
    if (cm.target_type === "report") {
      const r = reports.find(x => String(x.id) === cm.target_id);
      return r ? { cm, label: `${cropName(r.crop_id)} · ${r.date}` } : null;
    }
    const sc = schedules.find(x => x.id === cm.target_id);
    return sc ? { cm, label: `${sc.work_type || sc.title} · ${sc.date}` } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  // 天気は単独カードにせず、今日の一手の1行目に入れる（散布判断に効く情報なので同じカードで読む）。
  // docs/decisions/20261004-home-declutter.md
  const weatherRow = !wxLoading && wxAuto ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "baseline", gap: 6, minWidth: 0 }}>
        <Text style={{ fontSize: 17, fontWeight: "700", color: C.text }}>{wxAuto.temp}°</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: C.textSub, flexShrink: 1 }}>
          {wxAuto.label}{weatherCoords?.name ? ` · ${weatherCoords.name}` : ""}
        </Text>
      </View>
      {wxAuto.humidity !== undefined && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Feather name="droplet" size={12} color={C.info} />
          <Text style={{ fontSize: 12, color: C.textSub }}>{wxAuto.humidity}%</Text>
        </View>
      )}
      {wxAuto.rain !== undefined && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Feather name="cloud-rain" size={12} color={C.rain} />
          <Text style={{ fontSize: 12, color: C.textSub }}>{wxAuto.rain}mm</Text>
        </View>
      )}
    </View>
  ) : null;

  // 相談・記録一覧を1枚に並べる行（hairline 区切り）
  const linkRow = (first: boolean) => ({
    flexDirection: "row" as const, alignItems: "center" as const, gap: 10,
    paddingVertical: 13,
    borderTopWidth: first ? 0 : 1, borderTopColor: C.hairline,
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.ink} />}
    >
      {/* 作業セッション（Web版の「作業中」カード。作業中のみ表示） */}
      {workStartedAt && (
        <View style={{ backgroundColor: C.card, borderRadius: RADIUS.card, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12, ...SHADOW.card }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: C.danger }} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: C.text, flex: 1 }}>作業中</Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.text, fontVariant: ["tabular-nums"] }}>
              {fmtElapsed(elapsed)}
            </Text>
            <Btn variant="secondary" size="sm" onPress={stopWork}>終了する</Btn>
          </View>
        </View>
      )}

      {/* ── 今日の一手（Web版 src/App.tsx と同一の設計）──────────────
          競合調査で残った差別化は「記録する場所とAIに聞く場所が同一プロダクト内に
          ある」の一点だけ（docs/decisions/20260823-pest-advice-history.md）。
          その入口が天気カード内の小さなテキストリンクだったため、主役として出す。

          上段の「前回の散布から◯日」はAPIを呼ばずに自分の記録から出している。
          押す前に「このアプリは自分の農場を把握している」ことが伝わるのが要点。
          数字は lastSpray() を通し、助言のプロンプトと同じ集計を使う。 */}
      {canUseAiFeature("pestControlAdvice") && (() => {
        const ls = lastSpray({ reports, crops, pesticides });
        return (
          <View style={{ backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12 }}>
            {weatherRow && (
              <View style={{ paddingBottom: 10, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: C.hairline }}>
                {weatherRow}
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 }}>
              <Feather name="wind" size={12} color={C.textMuted} />
              <Text style={{ fontSize: 11, color: C.textMuted }}>今日の一手</Text>
            </View>
            {ls ? (
              <>
                <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>
                  前回の散布から
                  <Text style={{ fontSize: 22 }}> {ls.daysSince ?? "—"} </Text>
                  日
                </Text>
                {/* 常に出す説明は1行まで（オーナー 2026-10-04）。農薬名は押すと開く */}
                <Pressable onPress={() => setShowSprayDetail(v => !v)} accessibilityLabel="前回の散布の詳細"
                  style={showSprayDetail ? { marginTop: 6, backgroundColor: C.well, borderRadius: RADIUS.row, paddingVertical: 10, paddingHorizontal: 12 } : { marginTop: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: C.textSub, flexShrink: 1 }}>
                      {`${Number(ls.date.slice(5, 7))}/${Number(ls.date.slice(8, 10))}`} · {ls.where}
                    </Text>
                    <Feather name={showSprayDetail ? "chevron-up" : "chevron-down"} size={13} color={C.textSub} />
                  </View>
                  {showSprayDetail && (
                    <View style={{ marginTop: 8, gap: 2 }}>
                      {ls.products.length > 0
                        ? ls.products.map(p => <Text key={p} style={{ fontSize: 13, color: C.text, lineHeight: 21 }}>{dispName(p)}</Text>)
                        : <Text style={{ fontSize: 13, color: C.textSub }}>農薬の記録なし</Text>}
                    </View>
                  )}
                </Pressable>
              </>
            ) : (
              <Text style={{ fontSize: 13, color: C.textSub, lineHeight: 20 }}>
                防除を記録すると、次の散布時期を出せます
              </Text>
            )}
            <Btn variant="soft" size="md" style={{ alignSelf: "stretch", marginTop: 12 }}
              onPress={() => setShowPestAdvice(true)}
              icon={<Feather name="wind" size={14} color={C.ink} />}>
              {/* 押すと処理が走るボタンなので動詞（シートの見出しは「次の散布時期」のまま。2026-10-17） */}
              次の散布時期を調べる
            </Btn>
          </View>
        );
      })()}
      {/* 相談機能が使えない環境では天気だけを1行のカードで出す */}
      {!canUseAiFeature("pestControlAdvice") && weatherRow && (
        <View style={{ backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12 }}>
          {weatherRow}
        </View>
      )}

      {/* 今日の予定 */}
      <View style={{ backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12 }}>
        <Text style={{ fontSize: 11, fontWeight: "500", color: C.textMuted, marginBottom: 8 }}>今日の予定</Text>
        {todayScheds.length === 0 ? (
          // 空のときは何の欄かと、入れると何が起きるかを書く（記録タブの「今日」と同じ。オーナー 2026-10-04）。
          // 以前の「作業を追加」は予定ではなく作業記録を開いていた。記録は右下の「＋記録」、ここは予定を入れる入口にする
          <View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: C.textSub }}>今日の予定はまだありません</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Btn variant="secondary" size="sm" onPress={() => onOpenEntry("plan")} icon={<Feather name="calendar" size={13} color={C.text} />}>予定を入れる</Btn>
              {!workStartedAt && (
                <Btn variant="soft" size="sm" onPress={startWork} icon={<Feather name="play" size={13} color={C.ink} />}>作業を開始</Btn>
              )}
            </View>
          </View>
        ) : todayScheds.map((s, i) => {
          const wc = s.work_type ? workTypeColor(s.work_type) : null;
          return (
            <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
              {/* 作業名を太字の主見出しにし、作業の色は小さな点で示す（印だけだと行の真ん中が空いた。オーナー 2026-10-04） */}
              <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: wc?.fg ?? C.textMuted }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: C.text }}>
                  {scheduleTitle(s) || [s.work_type, s.crop].filter(Boolean).join(" · ") || "予定"}
                </Text>
                {(() => {
                  const sub = (scheduleTitle(s) ? [s.work_type, s.crop, s.field] : [s.field]).filter(Boolean).join(" · ");
                  return sub ? <Text numberOfLines={1} style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{sub}</Text> : null;
                })()}
              </View>
              <Btn variant="secondary" size="sm" onPress={() => recordFromSchedule(s)} icon={<Feather name="clipboard" size={13} color={C.text} />}>記録にする</Btn>
            </View>
          );
        })}
        {todayScheds.length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: C.hairline, paddingTop: 9, marginTop: 4, flexDirection: "row", gap: 8 }}>
            {!workStartedAt && (
              <Btn variant="soft" size="sm" onPress={startWork} icon={<Feather name="play" size={13} color={C.ink} />}>作業を開始（タイマー）</Btn>
            )}
            <Btn variant="tertiary" size="sm" onPress={() => onOpenEntry("plan")} icon={<Feather name="plus" size={13} color={C.textSub} />}>予定を入れる</Btn>
          </View>
        )}
      </View>

      {/* 相談・記録一覧・圃場マップを1枚のカードに行で並べる（docs/decisions/20261004-home-declutter.md）。
          相談の行は「今日の予定」の直後・先頭行のまま。文言と開く先も変えない
          （entry_point の比較を壊さないため。docs/decisions/20260912-release-line.md の凍結）。

          作物の相談（予定が空でも・記録が無くても使える導線）。
          「今日の予定」の直後に置く：予定が無いときにここで詰まるのが本来の課題。
          やりとりは作付けごとに残り、助言した作業は作業記録と照合される */}
      <View style={{ backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingVertical: 1, paddingHorizontal: 16, marginBottom: 12 }}>
        {canUseAiFeature("nextActionAdvice") && (
          <Pressable onPress={() => setShowAdvise(true)} style={linkRow(true)}>
            <Feather name="message-circle" size={16} color={C.ink} />
            {/* 補足文（灰色の小さな2行）はオーナー判断で外した（2026-10-04「美しくない」）。
                見出し・位置・開く先は変えていない（entry_point の比較は位置と導線で見る） */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                {/* 別画面へ移るだけの行なので体言止め（CLAUDE.md UI文言の語形。2026-10-17） */}
                {crops.length === 1 ? `${crops[0].name}の相談` : "相談"}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={C.textMuted} />
          </Pressable>
        )}

        {/* 記録一覧への導線 */}
        <Pressable onPress={onGoReport} style={linkRow(!canUseAiFeature("nextActionAdvice"))}>
          <Feather name="clipboard" size={16} color={C.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>記録一覧</Text>
            <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{reports.length}件の作業記録</Text>
          </View>
          <Feather name="chevron-right" size={16} color={C.textMuted} />
        </Pressable>

        {/* 圃場マップは 管理＞圃場 へ移した。毎日開くホームに、初日に1回見れば足りる行を置かない
            （docs/decisions/20261010-feature-inventory.md #14 → 20261017-first-day-walkthrough.md） */}
      </View>

      {/* 新着コメント */}
      {feed.length > 0 && (
        <View style={{ backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}>
            <Feather name="message-square" size={11} color={C.textMuted} />
            <Text style={{ fontSize: 11, fontWeight: "500", color: C.textMuted }}>新着コメント</Text>
          </View>
          {feed.map(({ cm, label }, i) => (
            <View key={cm.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, color: C.text }}>
                  <Text style={{ fontWeight: "700" }}>{userName(cm.user_id)}</Text>
                  <Text style={{ color: C.textSub }}>：{cm.message}</Text>
                </Text>
                <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{label}</Text>
              </View>
              <Feather name="chevron-right" size={14} color={C.textMuted} />
            </View>
          ))}
        </View>
      )}

      <PestAdviceSheet open={showPestAdvice} onClose={() => setShowPestAdvice(false)} entryPoint="home" />
      {/* 作物が1件ならその作付け、0件・複数なら畑全体。目立つ入口を常に畑全体
          （＝農薬の登録情報を照合できない側）へ固定しない
          （docs/decisions/20260906-general-advice-entry.md） */}
      <AdviseSheet
        open={showAdvise}
        onClose={() => { setShowAdvise(false); setAdvisePhoto(null); }}
        entryPoint="home"
        cropId={crops.length === 1 ? crops[0].id : null}
        photoDiagnosis={advisePhoto}
        onAskRecords={q => { setRecordQuery(q); setShowAdvise(false); setHomeSheet("chat"); }}
        onAskPhoto={() => { setShowAdvise(false); setHomeSheet("diag"); }}
      />
      <SearchChatSheet open={homeSheet === "chat"} onClose={() => setHomeSheet(null)} entryPoint="home" initialQuestion={recordQuery} />
      <PhotoDiagnosisSheet
        open={homeSheet === "diag"}
        onClose={() => setHomeSheet(null)}
        entryPoint="home"
        onAdvise={d => { setAdvisePhoto(diagnosisForAdvise(d)); setHomeSheet(null); setShowAdvise(true); }}
      />
    </ScrollView>
  );
}
