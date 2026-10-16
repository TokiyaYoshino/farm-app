import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { C, RADIUS, SHADOW } from "../ui/tokens";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { toDateStr } from "../lib/date";
import { dispName } from "../lib/text";
import type { Report } from "../lib/types";
import { searchWithFallback, type SearchItem, type SearchKind } from "../lib/unifiedSearch";
import ReportDetailSheet from "./ReportDetailSheet";

// ─── 言葉で探す ＋ AIの出力履歴の棚 ─────────────────────────────────
// ② 届く（docs/decisions/20261012-solo-learning-loop.md）。記録・相談・AIの出力を1つの欄で探す。
// AIの出力履歴はリポジトリのように種類ごとの棚に分け、溜まっても使えるようにする:
//   棚には件数（今月の件数）だけ → 開くと「残したもの／今月／先月／それより前（畳む）」。
// 最後の日付は出さない（何の日付か分かりにくい。オーナー 2026-10-12）。
// 「残す」は当面この端末に保存する（ai_outputs に列を足すまでの仮置き）。

export interface AiOutputLite {
  id: string;
  kind: string;
  created_at: string;
  target_date: string | null;
  field: string | null;
}
interface AdviceMsg { id: string; crop_id: number | null; role: "user" | "assistant"; content: string; created_at: string }

const KIND_ORDER = ["advice", "pest_advice", "diagnosis", "daily_report", "voice_structure", "search_chat"];
const PREVIEW = 5;

const localDate = (iso: string) => toDateStr(new Date(iso));
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

const cardStyle = { backgroundColor: C.card, borderRadius: RADIUS.card, ...SHADOW.card, marginBottom: 12 };

function SecTitle({ icon, children }: { icon: keyof typeof Feather.glyphMap; children: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, marginBottom: 10 }}>
      <Feather name={icon} size={14} color={C.textSub} />
      <Text style={{ fontSize: 13, fontWeight: "700", color: C.textSub, letterSpacing: 0.5 }}>{children}</Text>
    </View>
  );
}

export default function SearchAndShelves<T extends AiOutputLite>({ part, aiOutputs, aiStatus, onRetryAi, kindLabel, summarize }: {
  /** 検索は振り返りの一番上、棚は下に置く（迷ったときに真っ先に使う道具なので。2026-10-16） */
  part: "search" | "shelves";
  aiOutputs: T[];
  /** AIの出力の取得状態。失敗を「まだありません」と見せない */
  aiStatus: "loading" | "ok" | "error";
  onRetryAi: () => void;
  kindLabel: Record<string, string>;
  summarize: (o: T) => string;
}) {
  const { reports, crops, pesticides, cropName, userName, currentUser } = useStore();
  const orgId = currentUser?.organization_id ?? null;

  // ── 相談の発言（全作物・畑全体） ──
  const [advice, setAdvice] = useState<AdviceMsg[]>([]);
  const [adviceFailed, setAdviceFailed] = useState(false);
  const [adviceReload, setAdviceReload] = useState(0);
  useEffect(() => {
    if (!orgId || part !== "search") return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("crop_advice_messages")
        .select("id,crop_id,role,content,created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (cancelled) return;
      setAdviceFailed(!!error);
      if (!error) setAdvice((data ?? []) as AdviceMsg[]);
    })();
    return () => { cancelled = true; };
  }, [orgId, adviceReload, part]);

  // ── 残したもの（端末内） ──
  const pinKey = `aiPinned_${orgId ?? "local"}`;
  const [pinned, setPinned] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(pinKey).then(v => setPinned(v ? JSON.parse(v) : [])).catch(() => setPinned([]));
  }, [pinKey]);
  const [pinNote, setPinNote] = useState<string | null>(null);
  const togglePin = (id: string) => {
    setPinNote(pinned.includes(id) ? null : id);
    const next = pinned.includes(id) ? pinned.filter(x => x !== id) : [id, ...pinned];
    setPinned(next);
    void AsyncStorage.setItem(pinKey, JSON.stringify(next)).catch(() => {});
  };

  // ── 探す対象をそろえる ──
  const pesticideNames = (r: Report) => {
    const ids = r.pesticides_used?.length ? r.pesticides_used.map(p => p.id) : r.pesticide_id ? [r.pesticide_id] : [];
    return ids.map(id => pesticides.find(p => p.id === id)?.name).filter(Boolean).map(n => dispName(n as string)).join(" ");
  };
  const adviceTitle = (m: AdviceMsg) => `相談（${m.crop_id == null ? "畑全体" : cropName(m.crop_id)}）`;
  const items = useMemo<SearchItem[]>(() => [
    ...reports.map(r => ({
      kind: "record" as const, id: `r${r.id}`, date: r.date,
      title: r.work_type || "未設定",
      text: [cropName(r.crop_id), r.field, r.quantity, pesticideNames(r), userName(r.user_id), r.note].filter(Boolean).join(" "),
    })),
    ...advice.map(m => ({ kind: "advice" as const, id: `m${m.id}`, date: localDate(m.created_at), title: adviceTitle(m), text: m.content })),
    ...aiOutputs.map(o => ({
      kind: "ai" as const, id: `a${o.id}`, date: (o.target_date ?? localDate(o.created_at)).slice(0, 10),
      title: kindLabel[o.kind] ?? o.kind, text: summarize(o),
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [reports, advice, aiOutputs, crops, pesticides]);

  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);
  const result = useMemo(() => searchWithFallback(items, query), [items, query]);
  const hits = result.hits;
  const [moreKinds, setMoreKinds] = useState<SearchKind[]>([]);
  const [openHit, setOpenHit] = useState<string | null>(null);
  const [detail, setDetail] = useState<Report | null>(null);

  // 相談の発言を開いたら、質問と返答の1往復で見せる（片方だけだと読めない）
  const advicePair = (msgId: string) => {
    const m = advice.find(x => `m${x.id}` === msgId);
    if (!m) return null;
    const thread = advice.filter(x => x.crop_id === m.crop_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const i = thread.findIndex(x => x.id === m.id);
    const q = m.role === "user" ? m : [...thread.slice(0, i)].reverse().find(x => x.role === "user");
    const a = m.role === "assistant" ? m : thread.slice(i + 1).find(x => x.role === "assistant");
    return { q: q?.content ?? "", a: a?.content ?? "" };
  };

  const onHit = (h: SearchItem) => {
    if (h.kind === "record") {
      const r = reports.find(x => `r${x.id}` === h.id);
      if (r) setDetail(r);
      return;
    }
    setOpenHit(openHit === h.id ? null : h.id);
  };

  const groups: { kind: SearchKind; label: string }[] = [
    { kind: "record", label: "記録" },
    { kind: "advice", label: "相談" },
    { kind: "ai", label: "AIの出力" },
  ];

  // ── 棚 ──
  const now = new Date();
  const thisMonth = toDateStr(now).slice(0, 7);
  const lastMonth = toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);
  const dateOf = (o: T) => (o.target_date ?? localDate(o.created_at)).slice(0, 10);
  const shelves = useMemo(() => {
    const kinds = Array.from(new Set(aiOutputs.map(o => o.kind)))
      .sort((a, b) => (KIND_ORDER.indexOf(a) + 99) % 99 - (KIND_ORDER.indexOf(b) + 99) % 99);
    return kinds.map(k => {
      const rows = aiOutputs.filter(o => o.kind === k).sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
      return { kind: k, rows, month: rows.filter(o => dateOf(o).startsWith(thisMonth)).length };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOutputs, thisMonth]);
  const [openShelf, setOpenShelf] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const [openItem, setOpenItem] = useState<string | null>(null);

  const aiRow = (o: T, first: boolean) => {
    const open = openItem === o.id;
    const isPinned = pinned.includes(o.id);
    return (
      <Pressable key={o.id} onPress={() => setOpenItem(open ? null : o.id)}
        style={{ paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: C.hairline }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {isPinned && <Feather name="bookmark" size={12} color={C.warning} />}
          <Text style={{ fontSize: 12, color: C.textMuted }}>{md(dateOf(o))}{o.field ? ` ・ ${o.field}` : ""}</Text>
        </View>
        <Text numberOfLines={open ? 12 : 2} style={{ fontSize: 13, color: C.text, lineHeight: 20, marginTop: 2 }}>{summarize(o)}</Text>
        {open && (
          <Pressable onPress={() => togglePin(o.id)} hitSlop={6}
            style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: isPinned ? C.warningBg : C.inkSoft }}>
            <Feather name="bookmark" size={12} color={isPinned ? C.warning : C.ink} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: isPinned ? C.warning : C.ink }}>{isPinned ? "残すのをやめる" : "残す"}</Text>
          </Pressable>
        )}
        {open && pinNote === o.id && (
          <Text style={{ fontSize: 11, color: C.textSub, marginTop: 4 }}>棚の一番上の「残したもの」に固定しました</Text>
        )}
      </Pressable>
    );
  };

  const subHead = (label: string) => (
    <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 10, marginBottom: 2 }}>{label}</Text>
  );

  return (
    <>
      {part === "search" && <>
      {/* ── 言葉で探す ── */}
      <SecTitle icon="search">言葉で探す</SecTitle>
      <View style={[cardStyle, { padding: 12 }]}>
        {/* 欄のどこを押しても入力が始まるようにする（スクロール直後の1回目のタップが取られていた） */}
        <Pressable onPress={() => inputRef.current?.focus()}
          style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.well, borderRadius: RADIUS.pill, paddingHorizontal: 14, minHeight: 48 }}>
          <Feather name="search" size={15} color={C.textMuted} />
          <TextInput ref={inputRef} value={query} onChangeText={setQuery} placeholder="例: べと病　たまねぎ 定植" placeholderTextColor={C.textMuted}
            returnKeyType="search" accessibilityLabel="記録・相談・AIの出力を言葉で探す"
            style={{ flex: 1, fontSize: 14, color: C.text, paddingVertical: 11, marginLeft: 8 }} />
          {!!query && (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="検索の言葉を消す">
              <Feather name="x-circle" size={16} color={C.textMuted} />
            </Pressable>
          )}
        </Pressable>
        {!query ? (
          <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 8, marginHorizontal: 4 }}>記録・相談・AIの出力をまとめて探します</Text>
        ) : hits.length === 0 ? (
          <Text style={{ fontSize: 13, color: C.textSub, marginTop: 12, marginHorizontal: 4 }}>「{query}」を含むものはありません</Text>
        ) : <>
          {result.mode === "any" && (
            <Text style={{ fontSize: 12, color: C.textSub, marginTop: 10, marginHorizontal: 4, lineHeight: 18 }}>
              すべての言葉を含むものは無かったので、どれかを含むものを出しています
            </Text>
          )}
          {groups.map(g => {
          const gh = hits.filter(h => h.kind === g.kind);
          if (gh.length === 0) return null;
          const shown = moreKinds.includes(g.kind) ? gh : gh.slice(0, PREVIEW);
          return (
            <View key={g.kind} style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: C.textSub, marginHorizontal: 4, marginBottom: 2 }}>{g.label}（{gh.length}件）</Text>
              {shown.map((h, i) => {
                const pair = openHit === h.id && h.kind === "advice" ? advicePair(h.id) : null;
                const full = openHit === h.id && h.kind === "ai" ? items.find(x => x.id === h.id)?.text : null;
                return (
                  <Pressable key={h.id} onPress={() => onHit(h)}
                    style={{ paddingVertical: 10, paddingHorizontal: 4, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: C.text }} numberOfLines={1}>{h.title}</Text>
                      <Text style={{ fontSize: 12, color: C.textMuted }}>{h.date.slice(0, 4)}/{md(h.date)}</Text>
                    </View>
                    {pair ? (
                      <View style={{ marginTop: 4, gap: 4 }}>
                        <Text style={{ fontSize: 12, color: C.textSub }}>聞いたこと: {pair.q}</Text>
                        <Text style={{ fontSize: 13, color: C.text, lineHeight: 20 }}>{pair.a}</Text>
                      </View>
                    ) : (
                      <Text numberOfLines={full ? 12 : 2} style={{ fontSize: 12, color: C.textSub, lineHeight: 18, marginTop: 2 }}>{full ?? h.snippet}</Text>
                    )}
                  </Pressable>
                );
              })}
              {gh.length > PREVIEW && !moreKinds.includes(g.kind) && (
                <Pressable onPress={() => setMoreKinds([...moreKinds, g.kind])} style={{ paddingVertical: 8, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: C.ink }}>残り{gh.length - PREVIEW}件を表示</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        </>}
        {/* 取得に失敗した側があれば、検索結果が欠けていることを言う */}
        {(adviceFailed || aiStatus === "error") && (
          <Pressable onPress={() => { setAdviceReload(n => n + 1); if (aiStatus === "error") onRetryAi(); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, marginHorizontal: 4 }}>
            <Feather name="alert-circle" size={13} color={C.warning} />
            <Text style={{ flex: 1, fontSize: 12, color: C.warning, lineHeight: 18 }}>
              {adviceFailed && aiStatus === "error" ? "相談とAIの出力" : adviceFailed ? "相談" : "AIの出力"}を読み込めなかったため、検索に含まれていません。押すと読み込み直します
            </Text>
          </Pressable>
        )}
      </View>

      <ReportDetailSheet report={detail} onClose={() => setDetail(null)} />
      </>}

      {part === "shelves" && <>
      {/* ── AIの出力履歴（種類ごとの棚）。誰が書いたかを隠さないため「AI」と明示する（CLAUDE.md） ── */}
      <SecTitle icon="clock">AIの出力履歴</SecTitle>
      <View style={[cardStyle, { paddingHorizontal: 16 }]}>
        {aiStatus === "loading" && (
          <Text style={{ color: C.textMuted, fontSize: 13, paddingVertical: 20, textAlign: "center" }}>読み込み中…</Text>
        )}
        {aiStatus === "error" && (
          <View style={{ alignItems: "center", paddingVertical: 18, gap: 10 }}>
            <Text style={{ color: C.textSub, fontSize: 13 }}>AIの出力を読み込めませんでした</Text>
            <Pressable onPress={onRetryAi} style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.inkSoft }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.ink }}>読み込み直す</Text>
            </Pressable>
          </View>
        )}
        {aiStatus === "ok" && shelves.length === 0 && (
          <Text style={{ color: C.textMuted, fontSize: 13, paddingVertical: 20, textAlign: "center" }}>AIの出力はまだありません</Text>
        )}
        {shelves.map((s, i) => {
          const open = openShelf === s.kind;
          const pin = s.rows.filter(o => pinned.includes(o.id));
          const rest = s.rows.filter(o => !pinned.includes(o.id));
          const cur = rest.filter(o => dateOf(o).startsWith(thisMonth));
          const prev = rest.filter(o => dateOf(o).startsWith(lastMonth));
          const older = rest.filter(o => !dateOf(o).startsWith(thisMonth) && !dateOf(o).startsWith(lastMonth));
          return (
            <View key={s.kind} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline }}>
              <Pressable onPress={() => { setOpenShelf(open ? null : s.kind); setShowOlder(false); setOpenItem(null); }}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14 }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: C.text }}>{kindLabel[s.kind] ?? s.kind}</Text>
                <Text style={{ fontSize: 13, color: C.textSub }}>{s.rows.length}件{s.month > 0 ? `（今月${s.month}件）` : ""}</Text>
                <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={C.textMuted} style={{ marginLeft: 6 }} />
              </Pressable>
              {open && (
                <View style={{ paddingBottom: 10 }}>
                  {pin.length > 0 && <>{subHead("残したもの")}{pin.map((o, j) => aiRow(o, j === 0))}</>}
                  {cur.length > 0 && <>{subHead("今月")}{cur.map((o, j) => aiRow(o, j === 0))}</>}
                  {prev.length > 0 && <>{subHead("先月")}{prev.map((o, j) => aiRow(o, j === 0))}</>}
                  {older.length > 0 && (
                    showOlder
                      ? <>{subHead("それより前")}{older.map((o, j) => aiRow(o, j === 0))}</>
                      : (
                        <Pressable onPress={() => setShowOlder(true)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10 }}>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: C.ink }}>それより前（{older.length}件）</Text>
                          <Feather name="chevron-down" size={14} color={C.ink} />
                        </Pressable>
                      )
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      </>}
    </>
  );
}
