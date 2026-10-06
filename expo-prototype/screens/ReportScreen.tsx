import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW, RADIUS, workTypeColor, cropColor } from "../ui/tokens";
import Btn from "../ui/Btn";
import CalendarView from "./CalendarView";
import ScheduleAddSheet from "./ScheduleAddSheet";
import { EntryModeSwitch, WorkTiles, entryHeading, type TabMode } from "../ui/WorkTiles";
import ReportDetailSheet from "./ReportDetailSheet";
import Picker from "../ui/Picker";
import { useStore } from "../lib/store";
import { canUseAiFeature } from "../lib/ai";
import { DailyReportSheet, SearchChatSheet, PhotoDiagnosisSheet, AdviseSheet, diagnosisForAdvise } from "./AiSheets";
import { WORK_TEMPLATES, type Report } from "../lib/types";
import { todayStr as todayStrFn, shiftDays } from "../lib/date";

// ─── 作業記録（src/App.tsx tab==="report" ブロックの移植・実データ）──────
// 表示モード切替・検索バー・フィルタチップ・記録カード・未報告リスト。
export default function ReportScreen() {
  const { reports, schedules, crops, fields, users, pesticides, cropName, userName, commentCountOf, openQuickReport, refreshing, refresh } = useStore();

  // コピーして作成（Web版 handleCopyReport と同一: 日付は今日・数量はクリア）
  const copyReport = (r: Report) => {
    openQuickReport({
      user_id: r.user_id,
      crop_id: r.crop_id,
      field: r.field,
      work_type: r.work_type,
      work_category_id: r.work_category_id ?? undefined,
      quantity_unit: r.quantity_unit ?? "",
      work_start: r.work_start ?? undefined,
      work_end: r.work_end ?? undefined,
      note: r.note,
    });
  };

  // 既定は「記録する入口」。カレンダーと記録一覧は見返すための画面なので、入口から開く
  // （オーナー 2026-10-04「タブを開いたら自分のやりたいことがすぐできる」。docs/decisions/20261004-home-declutter.md）
  const [reportView, setReportView] = useState<"start" | "list">("start");
  // 記録｜予定｜カレンダー の切替。タブを開くたびに「記録」から始まる（App はタブごとに画面を作り直す）
  const [entryMode, setEntryMode] = useState<TabMode>("record");
  const [planWorkType, setPlanWorkType] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [query, setQuery] = useState("");
  const [filterCrop, setFilterCrop] = useState(0);
  const [filterField, setFilterField] = useState("");
  const [filterWorkType, setFilterWorkType] = useState("");
  const [filterUser, setFilterUser] = useState(0);
  const [pickerFor, setPickerFor] = useState<"crop" | "field" | "work" | "user" | null>(null);
  const [aiSheet, setAiSheet] = useState<"report" | "chat" | "diag" | "advise" | null>(null);
  // 相談 ⇄ 記録検索 ⇄ 写真診断 の橋渡し（docs/decisions/20260908-advice-handoff.md）。
  // 用事を持ち込んだ窓で完結させるか、正しい場所へ渡す
  const [advisePhoto, setAdvisePhoto] = useState<{ text: string; label: string } | null>(null);
  const [recordQuery, setRecordQuery] = useState("");
  const [adviseCropId, setAdviseCropId] = useState<number | null>(null);

  const todayStr = todayStrFn();

  const filterActive = !!(query || filterCrop || filterField || filterWorkType || filterUser);
  const filtered = reports.filter(r =>
    (!query || [r.note, cropName(r.crop_id), r.field, r.work_type].join(" ").includes(query)) &&
    (!filterCrop || r.crop_id === filterCrop) &&
    (!filterField || r.field === filterField) &&
    (!filterWorkType || r.work_type === filterWorkType) &&
    (!filterUser || r.user_id === filterUser)
  );

  const scheduleTitle = (s: typeof schedules[number]) => (s.title && s.title !== s.work_type ? s.title : "");

  // 予定と実績のマッチング（Web版 matchReportToSchedule と同一の緩い判定）
  const matchReport = (s: typeof schedules[number]) =>
    reports.find(r => r.user_id === (s.assigned_user_id ?? s.user_id) && r.date === s.date) ?? null;

  const todayScheds = schedules.filter(s => s.date === todayStr);

  // 未報告は直近60日ぶんだけ出す。期限の下限が無いと数か月前の予定が積み上がり、
  // 直近の作業が埋もれる（実測: 6月の予定が9月の一覧の先頭に残っていた）
  const unreportedCutoff = shiftDays(-60);
  const unreportedAll = schedules.filter(s => s.date < todayStr && !matchReport(s));
  const unreported = unreportedAll.filter(s => s.date >= unreportedCutoff);
  const unreportedOlder = unreportedAll.length - unreported.length;
  // 60日より前の未報告は畳んでおき、「ほかに◯件」を押すと開く（常時出す注記はやめた）
  const [showOlderUnreported, setShowOlderUnreported] = useState(false);
  const unreportedShown = showOlderUnreported ? unreportedAll : unreported;
  // 一覧の日付は M/D に短くする（年は今年なら要らない）
  const shortDate = (d: string) => (d.slice(0, 4) === todayStr.slice(0, 4) ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : d);

  const chip = (active: boolean) => ({
    backgroundColor: active ? C.inkSoft : C.well,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  });
  const chipText = (active: boolean) => ({
    fontSize: 12,
    fontWeight: "600" as const,
    color: active ? C.ink : C.textSub,
  });

  const workers = users.filter(u => u.role !== "viewer");

  // 予定から記録を始める（予定の日付・作業・作物・圃場・担当を入れた状態で入力シートを開く）
  const recordFromSchedule = (s: typeof schedules[number]) => {
    openQuickReport({
      date: s.date,
      work_type: s.work_type || undefined,
      crop_id: crops.find(c => c.name === s.crop)?.id,
      field: s.field || undefined,
      user_id: s.assigned_user_id ?? s.user_id,
    });
  };

  // ── 今日の流れ（記録タブ F 案。docs/decisions/20261004-home-declutter.md）──
  // 時刻のある今日の記録と「今」の行を時刻順に、時刻のない記録・予定はその後に並べる。
  // 予定には時刻が無いので、時間軸ではなく「今日やること」として最後に置く
  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayReports = reports.filter(r => r.date === todayStr);
  type FlowItem =
    | { kind: "report"; time: string | null; r: Report }
    | { kind: "now"; time: string };
  // 「今」は時刻のある記録の並びの中の目印（押す場所ではない。記録の入口は上のタイル）。
  // 時刻のある記録が無い日は目印も出さない
  const timedReports = todayReports.filter(r => !!r.work_start);
  const flow: FlowItem[] = timedReports.length === 0 ? [] : [
    ...timedReports.map(r => ({ kind: "report" as const, time: r.work_start ?? null, r })),
    { kind: "now" as const, time: nowHHMM },
  ].sort((a, b) => ((a.time ?? "") < (b.time ?? "") ? -1 : 1));
  const untimedReports = todayReports.filter(r => !r.work_start);
  const todayEmpty = todayReports.length === 0 && todayScheds.length === 0;
  const todayLabel = `${now.getMonth() + 1}月${now.getDate()}日（${"日月火水木金土"[now.getDay()]}）`;


  const secLabel = { fontSize: 11, fontWeight: "500" as const, color: C.textMuted, marginTop: 22, marginBottom: 8, paddingHorizontal: 4 };
  const listCard = { backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingHorizontal: 16 };
  const listRow = (first: boolean) => ({
    flexDirection: "row" as const, alignItems: "center" as const, gap: 10,
    paddingVertical: 13, borderTopWidth: first ? 0 : 1, borderTopColor: C.hairline,
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.ink} />}
    >
      {reportView === "start" && (
        <>
          {/* 作業を選ぶ → 記録 or 予定（記録タブ F 案＋予定の入口。ホームの「＋記録」シートと同じ部品）。
              予定にすると見出しと受け皿の色が変わる（予定のつもりで記録する取り違えを防ぐ） */}
          <EntryModeSwitch mode={entryMode} onChange={setEntryMode} withCalendar />
          {entryMode === "calendar" ? (
            // カレンダーは自分から見にいくもの（オーナー 2026-10-04）。選んだらタイル以下を置き換える
            <View style={{ marginTop: 14 }}><CalendarView /></View>
          ) : (
          <>
          <Text style={[secLabel, { marginTop: 14, color: entryHeading(entryMode).color }]}>{entryHeading(entryMode).text}</Text>
          <WorkTiles mode={entryMode} onPick={t => (entryMode === "plan" ? setPlanWorkType(t) : openQuickReport({ work_type: t }))} />

          {/* 今日の流れ */}
          <Text style={secLabel}>今日 {todayLabel}</Text>
          {todayEmpty ? (
            // 予定も記録も無い日は、何の欄かと次に何が起きるかだけを書く（オーナー 2026-10-04「予定が入っていないとわかりにくい」）
            <View style={{ ...listCard, paddingVertical: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.textSub }}>今日の記録はまだありません</Text>
              <Text style={{ fontSize: 12, color: C.textSub, marginTop: 4, lineHeight: 18 }}>上の作業を押すと、ここに並びます</Text>
            </View>
          ) : (
          <View style={{ ...listCard, paddingVertical: 4 }}>
            {flow.map((it, i) => (
              <View key={it.kind === "report" ? `r${it.r.id}` : "now"} style={{ flexDirection: "row", gap: 10, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline }}>
                <Text style={{ width: 40, fontSize: 11, color: it.kind === "now" ? C.ink : C.textMuted, fontWeight: it.kind === "now" ? "700" : "400", paddingTop: it.kind === "now" ? 0 : 9, fontVariant: ["tabular-nums"] }}>
                  {it.kind === "now" ? "今" : it.time}
                </Text>
                {it.kind === "report" ? (
                  <Pressable onPress={() => setSelectedReport(it.r)} style={{ flex: 1, backgroundColor: C.inkSoft, borderRadius: RADIUS.row, paddingVertical: 8, paddingHorizontal: 12 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: C.ink }}>{[it.r.work_type, cropName(it.r.crop_id)].filter(Boolean).join(" · ")}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
                      {[it.r.work_start && it.r.work_end ? `${it.r.work_start}〜${it.r.work_end}` : "", it.r.field, it.r.quantity ? `${it.r.quantity}${it.r.quantity_unit || "kg"}` : ""].filter(Boolean).join(" · ")}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2 }} accessibilityLabel={`現在時刻 ${nowHHMM}`}>
                    <View style={{ width: 7, height: 7, borderRadius: RADIUS.pill, backgroundColor: C.ink }} />
                    <View style={{ flex: 1, height: 1.5, backgroundColor: C.ink }} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: C.ink, fontVariant: ["tabular-nums"] }}>{nowHHMM}</Text>
                  </View>
                )}
              </View>
            ))}
            {/* 時刻のない今日の記録 */}
            {untimedReports.map((r, i) => (
              <Pressable key={`u${r.id}`} onPress={() => setSelectedReport(r)} style={listRow(flow.length === 0 && i === 0)}>
                <View style={{ width: 9, height: 9, borderRadius: RADIUS.pill, backgroundColor: cropColor(r.crop_id) }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: 14, color: C.text }}>{[r.work_type, cropName(r.crop_id)].filter(Boolean).join(" · ")}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{r.field}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textMuted} />
              </Pressable>
            ))}
            {/* 今日の予定（時刻が無いので最後に。押すと予定の内容を入れて記録） */}
            {todayScheds.map((sc, i) => {
              const assignedUser = users.find(u => u.id === (sc.assigned_user_id ?? sc.user_id));
              return (
                <Pressable key={sc.id} onPress={() => recordFromSchedule(sc)} style={listRow(flow.length === 0 && untimedReports.length === 0 && i === 0)}>
                  <View style={{ backgroundColor: C.infoBg, borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: C.info }}>予定</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: 14, color: C.text }}>{scheduleTitle(sc) || [sc.work_type, sc.crop].filter(Boolean).join(" · ")}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{[sc.field, assignedUser?.name].filter(Boolean).join(" · ")}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={C.textMuted} />
                </Pressable>
              );
            })}
          </View>
          )}

          {/* 未報告の作業（過去の予定で記録が無いもの）→ 押すとその日付で記録 */}
          {unreportedAll.length > 0 && (
            <>
              <Text style={secLabel}>未報告の作業 {unreportedAll.length}件</Text>
              <View style={listCard}>
                {unreportedShown.map((s, i) => {
                  const assignedUser = users.find(u => u.id === (s.assigned_user_id ?? s.user_id));
                  return (
                    <Pressable key={s.id} onPress={() => recordFromSchedule(s)} style={listRow(i === 0)}>
                      <View style={{ width: 7, height: 7, borderRadius: RADIUS.pill, backgroundColor: C.warning }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: 14, color: C.text }}>{scheduleTitle(s) || s.work_type}</Text>
                        <Text numberOfLines={1} style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                          {[shortDate(s.date), s.crop, assignedUser?.name].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                      {commentCountOf("schedule", s.id) > 0 && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Feather name="message-square" size={11} color={C.ink} />
                          <Text style={{ fontSize: 11, fontWeight: "600", color: C.ink }}>{commentCountOf("schedule", s.id)}</Text>
                        </View>
                      )}
                      <Feather name="chevron-right" size={16} color={C.textMuted} />
                    </Pressable>
                  );
                })}
                {unreportedOlder > 0 && !showOlderUnreported && (
                  <Pressable onPress={() => setShowOlderUnreported(true)} style={[listRow(unreportedShown.length === 0), { paddingVertical: 12 }]}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSub }}>ほかに{unreportedOlder}件（60日より前）</Text>
                    <Feather name="chevron-down" size={14} color={C.textSub} />
                  </Pressable>
                )}
              </View>
            </>
          )}

          {/* 見返す画面への移動（体言止めの行）。カレンダーは上の切替へ移した。
              前回と同じ内容での記録は記録一覧の「コピーして作成」 */}
          <Text style={secLabel}>見返す</Text>
          <View style={listCard}>
            <Pressable onPress={() => setReportView("list")} style={listRow(true)}>
              <Feather name="search" size={16} color={C.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>記録一覧</Text>
                <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{reports.length}件の作業記録・検索・コピーして作成</Text>
              </View>
              <Feather name="chevron-right" size={16} color={C.textMuted} />
            </Pressable>
          </View>
          </>
          )}
        </>
      )}

      {/* 記録一覧から入口へ戻る */}
      {reportView !== "start" && (
        <Pressable onPress={() => setReportView("start")} style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 6, paddingRight: 12, marginBottom: 10 }}>
          <Feather name="chevron-left" size={18} color={C.ink} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.ink }}>記録</Text>
          <Text style={{ fontSize: 14, color: C.textMuted }}>  /  記録一覧</Text>
        </Pressable>
      )}


      {reportView === "list" && (
        <>
          {/* 検索バー */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 10 }}>
            <Feather name="search" size={16} color={C.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="メモ・作物・圃場・作業で検索"
              placeholderTextColor={C.textMuted}
              style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.text, padding: 0 }}
            />
            {!!query && (
              <Pressable onPress={() => setQuery("")}>
                <Feather name="x" size={15} color={C.textMuted} />
              </Pressable>
            )}
          </View>

          {/* フィルタチップ（タップでピッカー） */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
            <Pressable onPress={() => setPickerFor("crop")} style={chip(!!filterCrop)}>
              <Text style={chipText(!!filterCrop)}>作物：{filterCrop ? cropName(filterCrop) : "すべて"}</Text>
            </Pressable>
            <Pressable onPress={() => setPickerFor("field")} style={chip(!!filterField)}>
              <Text style={chipText(!!filterField)}>圃場：{filterField || "すべて"}</Text>
            </Pressable>
            <Pressable onPress={() => setPickerFor("work")} style={chip(!!filterWorkType)}>
              <Text style={chipText(!!filterWorkType)}>作業：{filterWorkType || "すべて"}</Text>
            </Pressable>
            <Pressable onPress={() => setPickerFor("user")} style={chip(!!filterUser)}>
              <Text style={chipText(!!filterUser)}>担当：{filterUser ? userName(filterUser) : "すべて"}</Text>
            </Pressable>
          </ScrollView>

          {/* 件数＋クリア＋AI機能ボタン群（Web版と同一の並び） */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, minHeight: 28, gap: 8 }}>
            <Text style={{ fontSize: 12, color: C.textMuted }}>{filtered.length}件の記録</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: "center" }}>
              {filterActive && (
                <Btn variant="tertiary" size="sm" onPress={() => { setQuery(""); setFilterCrop(0); setFilterField(""); setFilterWorkType(""); setFilterUser(0); }}>条件をクリア</Btn>
              )}
              <Btn variant="secondary" size="sm" onPress={() => setAiSheet("report")} icon={<Feather name="star" size={13} color={C.text} />}>日報にまとめる</Btn>
              {canUseAiFeature("recordSearchChat") && (
                <Btn variant="secondary" size="sm" onPress={() => setAiSheet("chat")} icon={<Feather name="message-square" size={13} color={C.text} />}>記録に聞く</Btn>
              )}
              {canUseAiFeature("pestDiagnosis") && (
                <Btn variant="secondary" size="sm" onPress={() => setAiSheet("diag")} icon={<Feather name="camera" size={13} color={C.text} />}>写真で診断</Btn>
              )}
            </ScrollView>
          </View>

          {/* 結果 */}
          {filtered.length === 0 ? (
            <View style={{ paddingVertical: 32, paddingHorizontal: 16, alignItems: "center" }}>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>
                {filterActive ? "条件に一致する記録がありません" : "まだ作業報告がありません"}
              </Text>
            </View>
          ) : filtered.slice(0, 100).map(r => {
            const wc = r.work_type ? workTypeColor(r.work_type) : null;
            const meta = [
              r.quantity ? `${r.quantity}${r.quantity_unit || "kg"}` : "",
              (r.work_start && r.work_end) ? `${r.work_start}〜${r.work_end}` : r.work_time ? `${r.work_time}h` : "",
              r.pesticide_id ? (pesticides.find(p => p.id === r.pesticide_id)?.name ?? "") : "",
              userName(r.user_id),
              r.weather ? `${r.weather}${r.temp ? ` ${r.temp}°C` : ""}` : "",
            ].filter(Boolean).join("  ·  ");
            return (
              <View key={r.id} style={{ backgroundColor: C.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, ...SHADOW.card }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: cropColor(r.crop_id) }} />
                    <Text style={{ fontWeight: "700", fontSize: 14, color: C.text }}>{cropName(r.crop_id)}</Text>
                    {!!r.field && <Text numberOfLines={1} style={{ fontSize: 12, color: C.textMuted }}>· {r.field}</Text>}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {wc && (
                      <View style={{ backgroundColor: wc.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: wc.fg }}>{r.work_type}</Text>
                      </View>
                    )}
                    {commentCountOf("report", r.id) > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.inkSoft, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 }}>
                        <Feather name="message-square" size={11} color={C.ink} />
                        <Text style={{ fontSize: 11, fontWeight: "600", color: C.ink }}>{commentCountOf("report", r.id)}</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 11, color: C.textMuted }}>{r.date}</Text>
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: C.border, marginTop: 8, marginBottom: 12 }} />
                <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{meta}</Text>
                {!!r.note && (
                  <View style={{ marginTop: 8, borderLeftWidth: 2, borderLeftColor: C.border, paddingLeft: 10 }}>
                    <Text style={{ fontSize: 12, color: C.textSub }}>{r.note}</Text>
                  </View>
                )}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <Btn variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setSelectedReport(r)}>詳細を見る</Btn>
                  <Btn variant="soft" size="sm" style={{ flex: 1 }} onPress={() => copyReport(r)} icon={<Feather name="copy" size={12} color={C.ink} />}>コピーして作成</Btn>
                </View>
              </View>
            );
          })}
        </>
      )}

      <ScheduleAddSheet open={planWorkType !== null} onClose={() => setPlanWorkType(null)} initialWorkType={planWorkType ?? undefined} />
      <ReportDetailSheet
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onAdvise={(d, cropId) => {
          setAdvisePhoto(diagnosisForAdvise(d));
          setAdviseCropId(cropId);
          setSelectedReport(null);
          setAiSheet("advise");
        }}
      />
      <DailyReportSheet open={aiSheet === "report"} onClose={() => setAiSheet(null)} entryPoint="record_list" />
      <SearchChatSheet open={aiSheet === "chat"} onClose={() => setAiSheet(null)} entryPoint="record_list" initialQuestion={recordQuery} />
      <PhotoDiagnosisSheet
        open={aiSheet === "diag"}
        onClose={() => setAiSheet(null)}
        entryPoint="record_list"
        onAdvise={d => { setAdvisePhoto(diagnosisForAdvise(d)); setAiSheet("advise"); }}
      />
      <AdviseSheet
        open={aiSheet === "advise"}
        onClose={() => { setAiSheet(null); setAdvisePhoto(null); setAdviseCropId(null); }}
        entryPoint="record_list"
        cropId={adviseCropId}
        photoDiagnosis={advisePhoto}
        onAskRecords={q => { setRecordQuery(q); setAiSheet("chat"); }}
        onAskPhoto={() => setAiSheet("diag")}
      />

      {/* フィルタピッカー */}
      <Picker
        open={pickerFor === "crop"}
        title="作物で絞り込み"
        options={[{ key: "0", label: "すべて" }, ...crops.map(c => ({ key: String(c.id), label: c.name }))]}
        value={String(filterCrop)}
        onSelect={v => setFilterCrop(Number(v))}
        onClose={() => setPickerFor(null)}
      />
      <Picker
        open={pickerFor === "field"}
        title="圃場で絞り込み"
        options={[{ key: "", label: "すべて" }, ...fields.map(f => ({ key: f.name, label: f.name }))]}
        value={filterField}
        onSelect={setFilterField}
        onClose={() => setPickerFor(null)}
      />
      <Picker
        open={pickerFor === "work"}
        title="作業で絞り込み"
        options={[{ key: "", label: "すべて" }, ...WORK_TEMPLATES.map(t => ({ key: t, label: t }))]}
        value={filterWorkType}
        onSelect={setFilterWorkType}
        onClose={() => setPickerFor(null)}
      />
      <Picker
        open={pickerFor === "user"}
        title="担当で絞り込み"
        options={[{ key: "0", label: "すべて" }, ...workers.map(u => ({ key: String(u.id), label: u.name }))]}
        value={String(filterUser)}
        onSelect={v => setFilterUser(Number(v))}
        onClose={() => setPickerFor(null)}
      />
    </ScrollView>
  );
}
