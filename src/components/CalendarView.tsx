import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { C, SHADOW, workTypeColor } from "../ui/tokens";
import CommentThread from "../ui/CommentThread";
import {
  ChevronLeft, ChevronRight, Plus, X,
  CalendarDays, ClipboardList, UserCircle,
  PackageCheck, Clock, Leaf, RefreshCw,
  FlaskConical,
  CloudRain, Droplets,
  ArrowUpDown,
} from "lucide-react";

export type Schedule = {
  id: string;
  user_id: number;
  assigned_user_id?: number;
  work_type?: string;
  title: string;
  date: string;
  note?: string;
  crop?: string;
  field?: string;
  created_at: string;
};

export type Comment = {
  id: string;
  target_type: string;
  target_id: string;
  user_id: number;
  message: string;
  created_at: string;
};

type ReportRow = {
  id: number; user_id: number; crop_id: number; date: string;
  work_type: string; quantity: string; work_time: string; note: string;
  field: string; image_url?: string; weather?: string; temp?: string;
  humidity?: string; rain?: string; pesticide_id?: string; pesticide_amount?: string;
  work_start?: string | null; work_end?: string | null;
};
type CropRow = { id: number; name: string };
type UserRow = { id: number; name: string; role?: string };
type PesticideRow = { id: string; name: string; type: string };
type DetailItem = { kind: "report"; data: ReportRow } | { kind: "schedule"; data: Schedule };

interface Props {
  reports: ReportRow[];
  schedules: Schedule[];
  crops: CropRow[];
  users: UserRow[];
  pesticides: PesticideRow[];
  currentUserId: number;
  onAddSchedule: (date: string, title: string, note: string, crop: string, assignedUserId: number | null, workType: string) => Promise<boolean>;
  onLoadComments: (targetType: string, targetId: string) => Promise<Comment[]>;
  onAddComment: (targetType: string, targetId: string, message: string) => Promise<boolean>;
  onEditComment: (id: string, message: string) => Promise<boolean>;
}

const css = (o: CSSProperties): CSSProperties => o;
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const WORK_TYPES = ["収穫", "施肥", "防除", "播種", "灌水", "草刈り", "剪定", "その他"];


const shortName = (name: string) => name.slice(0, 2);

export default function CalendarView({
  reports, schedules, crops, users, pesticides, currentUserId,
  onAddSchedule, onLoadComments, onAddComment, onEditComment,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [viewYear, setViewYear]   = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ assignedUserId: 0, workType: "収穫", note: "", crop: "" });
  const [adding, setAdding]       = useState(false);
  const [addError, setAddError]   = useState("");

  // 詳細ビュー（コメントUIは CommentThread に集約）
  const [detail, setDetail]             = useState<DetailItem | null>(null);

  const [currentFilter, setCurrentFilter] = useState<"all"|"reports"|"schedules"|"user">("all");
  const [filterUserId, setFilterUserId]   = useState<number>(0);
  const [currentSort, setCurrentSort]     = useState<"date-desc"|"date-asc"|"user"|"work_type">("date-desc");
  const [showSortMenu, setShowSortMenu]   = useState(false);
  const [calView, setCalView]             = useState<"week"|"month">("month");
  const [weekStart, setWeekStart]         = useState<string>(() => {
    const d = new Date();
    const dow = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((dow + 6) % 7));
    return mon.toISOString().slice(0, 10);
  });

  const goPrev = () => {
    if (calView === "week") {
      const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d.toISOString().slice(0, 10));
    } else {
      if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
      else setViewMonth(m => m - 1);
    }
  };
  const goNext = () => {
    if (calView === "week") {
      const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d.toISOString().slice(0, 10));
    } else {
      if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
      else setViewMonth(m => m + 1);
    }
  };

  const weekDays = useMemo(() => {
    const days: string[] = [];
    const start = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }, [weekStart]);

  const days = useMemo((): (string | null)[] => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const grid: (string | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [viewYear, viewMonth]);

  const byDateR = useMemo(() => {
    const m: Record<string, ReportRow[]> = {};
    reports.forEach(r => { (m[r.date] ??= []).push(r); });
    return m;
  }, [reports]);

  const byDateS = useMemo(() => {
    const m: Record<string, Schedule[]> = {};
    schedules.forEach(s => { (m[s.date] ??= []).push(s); });
    return m;
  }, [schedules]);

  const cropName     = (id: number) => crops.find(c => c.id === id)?.name ?? "未設定";
  const userName     = (id: number) => users.find(u => u.id === id)?.name ?? "未設定";
  const pesticideName = (id?: string) => id ? (pesticides.find(p => p.id === id)?.name ?? "") : "";

  const resetForm = () => setForm({ assignedUserId: 0, workType: "収穫", note: "", crop: "" });

  const closePopup = () => {
    setSelectedDate(null);
    setShowForm(false);
    resetForm();
    setAddError("");
    setDetail(null);
  };

  const openDetail = (item: DetailItem) => setDetail(item);

  const backToList = () => setDetail(null);

  const handleAdd = async () => {
    if (!selectedDate || !form.workType) return;
    setAdding(true);
    setAddError("");
    const ok = await onAddSchedule(
      selectedDate, form.workType, form.note.trim(),
      form.crop, form.assignedUserId || null, form.workType,
    );
    setAdding(false);
    if (ok) { resetForm(); setShowForm(false); }
    else setAddError("追加に失敗しました。もう一度お試しください。");
  };

  const sortReports = (items: ReportRow[]) => [...items].sort((a, b) => {
    switch (currentSort) {
      case "date-asc":  return a.id - b.id;
      case "user":      return userName(a.user_id).localeCompare(userName(b.user_id), "ja");
      case "work_type": return a.work_type.localeCompare(b.work_type, "ja");
      default:          return b.id - a.id;
    }
  });
  const sortSchedules = (items: Schedule[]) => [...items].sort((a, b) => {
    switch (currentSort) {
      case "date-asc":  return a.created_at.localeCompare(b.created_at);
      case "user": {
        const ua = userName(a.assigned_user_id ?? a.user_id);
        const ub = userName(b.assigned_user_id ?? b.user_id);
        return ua.localeCompare(ub, "ja");
      }
      case "work_type": return (a.work_type || a.title).localeCompare(b.work_type || b.title, "ja");
      default:          return b.created_at.localeCompare(a.created_at);
    }
  });

  const baseReports   = selectedDate ? (byDateR[selectedDate] ?? []) : [];
  const baseSchedules = selectedDate ? (byDateS[selectedDate] ?? []) : [];
  const dayReports = sortReports(
    currentFilter === "schedules" ? [] :
    currentFilter === "user" && filterUserId ? baseReports.filter(r => r.user_id === filterUserId) :
    baseReports
  );
  const daySchedules = sortSchedules(
    currentFilter === "reports" ? [] :
    currentFilter === "user" && filterUserId ? baseSchedules.filter(s => (s.assigned_user_id ?? s.user_id) === filterUserId) :
    baseSchedules
  );
  const isEmpty = dayReports.length === 0 && daySchedules.length === 0;

  // セル内に表示するイベントリスト（最大2件）
  const cellItems = (date: string | null) => {
    if (!date) return { items: [] as Array<{ type: "r" | "s"; label: string }>, extra: 0 };
    const all: Array<{ type: "r" | "s"; label: string }> = [];
    const rs = (byDateR[date] ?? []).filter(r => {
      if (currentFilter === "schedules") return false;
      if (currentFilter === "user" && filterUserId && r.user_id !== filterUserId) return false;
      return true;
    });
    const ss = (byDateS[date] ?? []).filter(s => {
      if (currentFilter === "reports") return false;
      if (currentFilter === "user" && filterUserId && (s.assigned_user_id ?? s.user_id) !== filterUserId) return false;
      return true;
    });
    rs.forEach(r => {
      const uname = shortName(users.find(u => u.id === r.user_id)?.name ?? "");
      all.push({ type: "r", label: `${uname} ${r.work_type}` });
    });
    ss.forEach(s => {
      const uid = s.assigned_user_id ?? s.user_id;
      const uname = shortName(users.find(u => u.id === uid)?.name ?? "");
      all.push({ type: "s", label: `${uname} ${s.work_type || s.title}` });
    });
    return { items: all.slice(0, 2), extra: Math.max(0, all.length - 2) };
  };

  return (
    <>
      {/* ── カレンダー本体 ── */}
      <div style={css({ background: C.card, borderRadius: 20, overflow: "hidden", marginBottom: 14, boxShadow: SHADOW.card })}>
        {/* nav */}
        <div style={css({ padding: "12px 14px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" })}>
          <button onClick={goPrev} style={css({ width: 34, height: 34, background: C.well, border: "none", borderRadius: 999, color: C.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" })}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <div style={css({ display: "flex", alignItems: "center", gap: 8 })}>
            <div style={css({ fontWeight: 700, fontSize: 15, color: C.text })}>
              {calView === "week"
                ? `${weekDays[0].slice(5).replace("-","/")} 〜 ${weekDays[6].slice(5).replace("-","/")} `
                : `${viewYear}年${viewMonth + 1}月`}
            </div>
            <button
              onClick={() => setCalView(v => v === "week" ? "month" : "week")}
              style={css({ background: C.well, border: "none", borderRadius: 999, padding: "5px 12px", color: C.textSub, cursor: "pointer", fontSize: 11, fontWeight: 700 })}
            >
              {calView === "week" ? "週表示" : "月表示"}
            </button>
          </div>
          <button onClick={goNext} style={css({ width: 34, height: 34, background: C.well, border: "none", borderRadius: 999, color: C.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" })}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Day-of-week header */}
        <div style={css({ display: "grid", gridTemplateColumns: "repeat(7,1fr)" })}>
          {DOW.map((d) => (
            <div key={d} style={css({ textAlign: "center" as const, padding: "5px 0", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: C.textMuted })}>
              {d}
            </div>
          ))}
        </div>

        {/* 週表示グリッド */}
        {calView === "week" && (
          <div style={css({ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "1px", background: C.border })}>
            {weekDays.map((date) => {
              const isToday = date === today;
              const isSel   = date === selectedDate;
              const dow     = new Date(date + "T00:00:00").getDay();
              const { items, extra } = cellItems(date);
              return (
                <div
                  key={date}
                  onClick={() => setSelectedDate(isSel ? null : date)}
                  style={css({ background: isSel ? C.inkSoft : C.card, minHeight: 80, padding: "4px 2px 3px", cursor: "pointer", userSelect: "none" as const, overflow: "hidden" })}
                >
                  <div style={css({
                    fontSize: 12, fontWeight: isToday ? 800 : 500,
                    color: isToday ? "#fff" : dow === 0 ? C.danger : dow === 6 ? C.blue : C.text,
                    background: isToday ? C.primary : "transparent",
                    borderRadius: "50%", width: 22, height: 22,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 2px",
                  })}>
                    {Number(date.slice(8))}
                  </div>
                  {items.map((it, i) => (
                    <div key={i} style={css({ fontSize: 9, padding: "1px 2px", borderRadius: 3, marginBottom: 1, overflow: "hidden", whiteSpace: "nowrap" as const, textOverflow: "ellipsis", background: it.type === "r" ? C.inkSoft : C.infoBg, color: it.type === "r" ? C.ink : C.info, fontWeight: 600 })}>
                      {it.label}
                    </div>
                  ))}
                  {extra > 0 && <div style={css({ fontSize: 9, color: C.textMuted, textAlign: "center" as const })}>+{extra}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* 月表示グリッド */}
        {calView === "month" && (
        <div style={css({ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "1px", background: C.border })}>
          {days.map((date, idx) => {
            const isToday = date === today;
            const isSel   = date === selectedDate;
            const dow     = idx % 7;
            const { items, extra } = cellItems(date);
            return (
              <div
                key={idx}
                onClick={() => date && setSelectedDate(isSel ? null : date)}
                style={css({ background: isSel ? C.inkSoft : C.card, minHeight: 60, padding: "4px 2px 3px", cursor: date ? "pointer" : "default", userSelect: "none" as const, overflow: "hidden" })}
              >
                {date && (
                  <>
                    <div style={css({
                      fontSize: 12, fontWeight: isToday ? 800 : 500,
                      color: isToday ? "#fff" : dow === 0 ? C.danger : dow === 6 ? C.blue : C.text,
                      background: isToday ? C.primary : "transparent",
                      borderRadius: "50%", width: 22, height: 22,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto 2px",
                    })}>
                      {parseInt(date.slice(8), 10)}
                    </div>
                    {items.map((item, i) => (
                      <div key={i} style={css({
                        fontSize: 9, fontWeight: 700, lineHeight: "1.3",
                        padding: "1px 3px", borderRadius: 3, marginBottom: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                        background: item.type === "r" ? C.inkSoft : C.infoBg,
                        color: item.type === "r" ? C.ink : C.info,
                      })}>
                        {item.label}
                      </div>
                    ))}
                    {extra > 0 && (
                      <div style={css({ fontSize: 9, color: C.textMuted, textAlign: "center" as const, lineHeight: "1.3" })}>
                        +{extra}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        )}

        {/* Filter row */}
        <div style={css({ borderTop: `1px solid ${C.border}`, background: C.bg })}>
          <div style={css({ display: "flex", alignItems: "center", gap: 5, padding: "7px 10px" })}>
            {(["all", "reports", "schedules", "user"] as const).map(f => {
              const label = f === "all" ? "全表示" : f === "reports" ? "報告済み" : f === "schedules" ? "予定一覧" : "担当者別";
              const active = currentFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => { setCurrentFilter(f); setShowSortMenu(false); }}
                  style={css({
                    padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: active ? 700 : 500,
                    border: "none",
                    background: active ? C.inkSoft : C.well,
                    color: active ? C.ink : C.textSub,
                    cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0,
                  })}
                >
                  {label}
                </button>
              );
            })}
            <div style={css({ flex: 1 })} />
            <button
              onClick={() => setShowSortMenu(s => !s)}
              style={css({
                flexShrink: 0, padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                border: "none",
                background: showSortMenu ? C.inkSoft : C.well,
                color: showSortMenu ? C.ink : C.textSub,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
              })}
            >
              <ArrowUpDown size={12} strokeWidth={2} />並替
            </button>
          </div>
          {currentFilter === "user" && (
            <div style={css({ padding: "0 10px 7px" })}>
              <select
                value={filterUserId}
                onChange={e => setFilterUserId(Number(e.target.value))}
                style={css({ width: "100%", padding: "7px 12px", borderRadius: 999, border: `1px solid ${C.hairline}`, fontSize: 12, background: C.card, color: C.text, boxSizing: "border-box" })}
              >
                <option value={0}>全員</option>
                {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          {showSortMenu && (
            <div style={css({ padding: "0 10px 7px", display: "flex", gap: 5, flexWrap: "wrap" as const })}>
              {([
                { key: "date-desc" as const, label: "新しい順" },
                { key: "date-asc"  as const, label: "古い順" },
                { key: "user"      as const, label: "担当者名" },
                { key: "work_type" as const, label: "作業種別" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setCurrentSort(key); setShowSortMenu(false); }}
                  style={css({
                    padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: currentSort === key ? 700 : 400,
                    border: "none",
                    background: currentSort === key ? C.inkSoft : C.well,
                    color: currentSort === key ? C.ink : C.textSub,
                    cursor: "pointer",
                  })}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── ボトムシート ── */}
      {selectedDate && (
        <div
          style={css({ position: "fixed", inset: 0, background: "rgba(0,0,0,0.46)", zIndex: 350, display: "flex", alignItems: "flex-end" })}
          onClick={detail ? undefined : closePopup}
        >
          <div
            style={css({ background: C.card, borderRadius: "24px 24px 0 0", width: "100%", maxHeight: "88vh", overflowY: "auto", padding: "16px 16px calc(48px + env(safe-area-inset-bottom))", boxShadow: SHADOW.float })}
            onClick={e => e.stopPropagation()}
          >
            <div style={css({ width: 36, height: 4, background: C.border, borderRadius: 4, margin: "0 auto 14px" })} />

            {/* ── 詳細ビュー ── */}
            {detail ? (
              <>
                {/* 詳細ヘッダー */}
                <div style={css({ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 })}>
                  <button
                    onClick={backToList}
                    style={css({ background: C.well, border: "none", borderRadius: 999, padding: "7px 13px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: C.textSub })}
                  >
                    <ChevronLeft size={14} strokeWidth={2.5} />戻る
                  </button>
                  <span style={css({ fontWeight: 700, fontSize: 14, color: C.text, flex: 1 })}>
                    {detail.kind === "report"
                      ? `${userName(detail.data.user_id)} の作業報告`
                      : `${userName(detail.data.assigned_user_id ?? detail.data.user_id)} の予定`}
                  </span>
                  <button onClick={closePopup} style={css({ width: 32, height: 32, background: C.well, border: "none", borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted })}>
                    <X size={15} strokeWidth={2} />
                  </button>
                </div>

                {/* 詳細カード */}
                {detail.kind === "report" && (() => {
                  const r = detail.data;
                  return (
                    <div style={css({ background: C.well, borderRadius: 14, padding: 14, marginBottom: 14 })}>
                      <div style={css({ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 })}>
                        {(() => { const wc = workTypeColor(r.work_type); return (
                          <span style={css({ fontSize: 12, fontWeight: 700, color: wc.fg, background: wc.bg, borderRadius: 999, padding: "3px 10px" })}>{r.work_type}</span>
                        ); })()}
                        {r.field && <span style={css({ fontSize: 12, background: C.card, borderRadius: 999, padding: "3px 10px", color: C.textSub, fontWeight: 600 })}>{r.field}</span>}
                        <span style={css({ fontSize: 12, color: C.textMuted, marginLeft: "auto" })}>{r.date}</span>
                      </div>
                      <div style={css({ display: "flex", flexWrap: "wrap" as const, gap: 8, fontSize: 12, marginBottom: 8 })}>
                        <span style={css({ display: "flex", alignItems: "center", gap: 4, color: C.textSub })}><UserCircle size={12} strokeWidth={2} />{userName(r.user_id)}</span>
                        <span style={css({ display: "flex", alignItems: "center", gap: 4, color: C.textSub })}><Leaf size={12} strokeWidth={2} />{cropName(r.crop_id)}</span>
                        {r.quantity  && <span style={css({ display: "flex", alignItems: "center", gap: 4, color: C.textSub })}><PackageCheck size={12} strokeWidth={2} />{r.quantity}kg</span>}
                        {(r.work_start && r.work_end)
                          ? <span style={css({ display: "flex", alignItems: "center", gap: 4, color: C.textSub })}><Clock size={12} strokeWidth={2} />{r.work_start}〜{r.work_end}</span>
                          : r.work_time ? <span style={css({ display: "flex", alignItems: "center", gap: 4, color: C.textSub })}><Clock size={12} strokeWidth={2} />{r.work_time}h</span> : null}
                      </div>
                      {r.pesticide_id && (
                        <div style={css({ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.pesticide, background: C.pesticideBg, borderRadius: 7, padding: "4px 8px", marginBottom: 8, width: "fit-content" })}>
                          <FlaskConical size={12} strokeWidth={2} />
                          {pesticideName(r.pesticide_id)}{r.pesticide_amount ? ` / ${r.pesticide_amount}` : ""}
                        </div>
                      )}
                      {r.weather && (
                        <div style={css({ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" as const })}>
                          <span>{r.weather}{r.temp ? ` ${r.temp}°C` : ""}</span>
                          {r.humidity && r.humidity !== "" && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Droplets size={11} color={C.info} strokeWidth={2} />{r.humidity}%</span>}
                          {r.rain     && r.rain     !== "" && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><CloudRain size={11} color={C.rain} strokeWidth={2} />{r.rain}mm</span>}
                        </div>
                      )}
                      {r.note && (
                        <div style={css({ fontSize: 12, color: C.textSub, padding: "8px 12px", background: C.card, borderRadius: 10, marginBottom: r.image_url ? 10 : 0 })}>
                          {r.note}
                        </div>
                      )}
                      {r.image_url && (
                        <img src={r.image_url} alt="作業写真" style={{ width: "100%", borderRadius: 10, marginTop: 8, maxHeight: 240, objectFit: "cover", display: "block" }} />
                      )}
                    </div>
                  );
                })()}

                {detail.kind === "schedule" && (() => {
                  const s = detail.data;
                  return (
                    <div style={css({ background: C.well, borderRadius: 14, padding: 14, marginBottom: 14 })}>
                      <div style={css({ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 })}>
                        {(() => { const wc = workTypeColor(s.work_type || s.title); return (
                          <span style={css({ fontSize: 12, fontWeight: 700, color: wc.fg, background: wc.bg, borderRadius: 999, padding: "3px 10px" })}>{s.work_type || s.title}</span>
                        ); })()}
                        <span style={css({ fontSize: 12, color: C.textMuted, marginLeft: "auto" })}>{s.date}</span>
                      </div>
                      <div style={css({ display: "flex", flexWrap: "wrap" as const, gap: 8, fontSize: 12 })}>
                        {s.assigned_user_id && <span style={css({ display: "flex", alignItems: "center", gap: 4, color: C.textSub })}><UserCircle size={12} strokeWidth={2} />{userName(s.assigned_user_id)}</span>}
                        {s.crop && <span style={css({ display: "flex", alignItems: "center", gap: 4, color: C.textSub })}><Leaf size={12} strokeWidth={2} />{s.crop}</span>}
                      </div>
                      {s.note && (
                        <div style={css({ fontSize: 12, color: C.textSub, marginTop: 8, padding: "8px 12px", background: C.card, borderRadius: 10 })}>
                          {s.note}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* コメント（共通コンポーネント。@メンション対応） */}
                <CommentThread
                  targetType={detail.kind}
                  targetId={detail.kind === "report" ? String(detail.data.id) : detail.data.id}
                  currentUserId={currentUserId}
                  userName={userName}
                  users={users.filter(u => u.role !== "viewer")}
                  onLoad={onLoadComments}
                  onAdd={onAddComment}
                  onEdit={onEditComment}
                />
              </>
            ) : (
              /* ── 日付一覧ビュー ── */
              <>
                {/* Sheet header */}
                <div style={css({ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 })}>
                  <span style={css({ fontWeight: 700, fontSize: 17, color: C.text })}>{selectedDate}</span>
                  <div style={css({ display: "flex", gap: 6 })}>
                    <button
                      onClick={() => { setShowForm(f => !f); resetForm(); setAddError(""); }}
                      style={css({
                        display: "flex", alignItems: "center", gap: 5,
                        background: showForm ? C.well : C.ink,
                        color: showForm ? C.textSub : "#fff",
                        border: "none",
                        borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      })}
                    >
                      {showForm ? <X size={13} strokeWidth={2.5} /> : <Plus size={13} strokeWidth={2.5} />}
                      {showForm ? "キャンセル" : "予定を追加"}
                    </button>
                    <button onClick={closePopup} style={css({ width: 32, height: 32, background: C.well, border: "none", borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted })}>
                      <X size={15} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {/* 予定追加フォーム */}
                {showForm && (
                  <div style={css({ background: C.well, borderRadius: 14, padding: 14, marginBottom: 14 })}>
                    <div style={css({ fontSize: 12, fontWeight: 700, color: C.textSub, marginBottom: 10 })}>新しい予定</div>
                    <select autoFocus
                      style={css({ width: "100%", padding: "10px 12px", borderRadius: 12, border: "none", fontSize: 14, marginBottom: 8, background: C.card, color: C.text, boxSizing: "border-box" })}
                      value={form.assignedUserId || ""}
                      onChange={e => setForm(f => ({ ...f, assignedUserId: e.target.value ? Number(e.target.value) : 0 }))}
                    >
                      <option value="">作業者（任意）</option>
                      {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <select
                      style={css({ width: "100%", padding: "10px 12px", borderRadius: 12, border: "none", fontSize: 14, marginBottom: 8, background: C.card, color: C.text, boxSizing: "border-box" })}
                      value={form.workType}
                      onChange={e => setForm(f => ({ ...f, workType: e.target.value }))}
                    >
                      {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select
                      style={css({ width: "100%", padding: "10px 12px", borderRadius: 12, border: "none", fontSize: 14, marginBottom: 8, background: C.card, color: C.text, boxSizing: "border-box" })}
                      value={form.crop}
                      onChange={e => setForm(f => ({ ...f, crop: e.target.value }))}
                    >
                      <option value="">作物（任意）</option>
                      {crops.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <input
                      style={css({ width: "100%", padding: "10px 12px", borderRadius: 12, border: "none", fontSize: 14, marginBottom: 10, background: C.card, color: C.text, boxSizing: "border-box" })}
                      placeholder="メモ（任意）"
                      value={form.note}
                      onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    />
                    {addError && <div style={css({ color: C.danger, fontSize: 12, marginBottom: 8 })}>{addError}</div>}
                    <button
                      onClick={handleAdd}
                      disabled={adding}
                      style={css({
                        width: "100%", padding: "11px 0", borderRadius: 8, border: "none",
                        background: adding ? C.border : C.info,
                        color: adding ? C.textMuted : "#fff",
                        fontSize: 14, fontWeight: 700, cursor: adding ? "default" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      })}
                    >
                      {adding ? <><RefreshCw size={14} strokeWidth={2} />追加中...</> : "追加する"}
                    </button>
                  </div>
                )}

                {/* 作業報告リスト */}
                {dayReports.length > 0 && (
                  <div style={css({ marginBottom: 14 })}>
                    <div style={css({ fontSize: 12, fontWeight: 700, color: C.textSub, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 })}>
                      <ClipboardList size={13} strokeWidth={2} color={C.textMuted} />
                      作業報告 {dayReports.length}件
                    </div>
                    {dayReports.map(r => {
                      const wc = workTypeColor(r.work_type);
                      return (
                      <button
                        key={r.id}
                        onClick={() => openDetail({ kind: "report", data: r })}
                        style={css({ width: "100%", background: C.well, borderRadius: 14, padding: "10px 12px", marginBottom: 7, border: "none", textAlign: "left" as const, cursor: "pointer" })}
                      >
                        <div style={css({ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 })}>
                          <span style={css({ fontWeight: 700, fontSize: 11, color: wc.fg, background: wc.bg, borderRadius: 999, padding: "2px 8px" })}>{r.work_type}</span>
                          {r.field && <span style={css({ fontSize: 11, background: C.card, borderRadius: 999, padding: "2px 8px", color: C.textSub, fontWeight: 600 })}>{r.field}</span>}
                          <span style={css({ fontSize: 11, color: C.textMuted, marginLeft: "auto" })}>{cropName(r.crop_id)}</span>
                        </div>
                        <div style={css({ display: "flex", gap: 8, fontSize: 11, color: C.textMuted, alignItems: "center", flexWrap: "wrap" as const })}>
                          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><UserCircle size={10} strokeWidth={2} />{userName(r.user_id)}</span>
                          {r.quantity  && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><PackageCheck size={10} strokeWidth={2} />{r.quantity}kg</span>}
                          {(r.work_start && r.work_end)
                            ? <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Clock size={10} strokeWidth={2} />{r.work_start}〜{r.work_end}</span>
                            : r.work_time ? <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Clock size={10} strokeWidth={2} />{r.work_time}h</span> : null}
                          {r.image_url && <span style={{ display: "flex", alignItems: "center", gap: 3, color: C.textSub }}>📷 写真あり</span>}
                        </div>
                        {r.note && (
                          <div style={css({ fontSize: 11, color: C.textSub, marginTop: 5, padding: "4px 7px", background: C.card, borderRadius: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const })}>
                            {r.note}
                          </div>
                        )}
                      </button>
                      );
                    })}
                  </div>
                )}

                {/* 予定リスト */}
                {daySchedules.length > 0 && (
                  <div>
                    <div style={css({ fontSize: 12, fontWeight: 700, color: C.textSub, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 })}>
                      <CalendarDays size={13} strokeWidth={2} color={C.textMuted} />
                      予定 {daySchedules.length}件
                    </div>
                    {daySchedules.map(s => {
                      const wc = workTypeColor(s.work_type || s.title);
                      return (
                      <button
                        key={s.id}
                        onClick={() => openDetail({ kind: "schedule", data: s })}
                        style={css({ width: "100%", background: C.well, borderRadius: 14, padding: "10px 12px", marginBottom: 7, border: "none", textAlign: "left" as const, cursor: "pointer" })}
                      >
                        <div style={css({ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 })}>
                          <span style={css({ fontWeight: 700, fontSize: 11, color: wc.fg, background: wc.bg, borderRadius: 999, padding: "2px 8px" })}>{s.work_type || s.title}</span>
                          {s.assigned_user_id && (
                            <span style={css({ fontSize: 11, background: C.card, borderRadius: 999, padding: "2px 8px", color: C.textSub, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 })}>
                              <UserCircle size={10} strokeWidth={2} />{userName(s.assigned_user_id)}
                            </span>
                          )}
                        </div>
                        {s.crop && <div style={css({ fontSize: 11, color: C.textMuted, display: "flex", alignItems: "center", gap: 4 })}><Leaf size={10} strokeWidth={2} />{s.crop}</div>}
                        {s.note && <div style={css({ fontSize: 11, color: C.textSub, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const })}>{s.note}</div>}
                      </button>
                      );
                    })}
                  </div>
                )}

                {isEmpty && !showForm && (
                  <div style={css({ textAlign: "center" as const, padding: "24px 0", color: C.textMuted, fontSize: 13 })}>
                    この日の記録はありません
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
