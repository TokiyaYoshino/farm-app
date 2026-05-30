import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import {
  ChevronLeft, ChevronRight, Plus, X,
  CalendarDays, ClipboardList, UserCircle,
  PackageCheck, Clock, Leaf, RefreshCw,
} from "lucide-react";

export type Schedule = {
  id: string;
  user_id: number;
  title: string;
  date: string;
  note?: string;
  crop?: string;
  created_at: string;
};

type ReportRow = {
  id: number; user_id: number; crop_id: number; date: string;
  work_type: string; quantity: string; work_time: string; note: string; field: string;
};
type CropRow = { id: number; name: string };
type UserRow = { id: number; name: string };

interface Props {
  reports: ReportRow[];
  schedules: Schedule[];
  crops: CropRow[];
  users: UserRow[];
  onAddSchedule: (date: string, title: string, note: string, crop: string) => Promise<boolean>;
}

const C = {
  primary: "#2d6a2d", primary2: "#3a8a3a", primary3: "#e8f5e9", primary4: "#c8e6c9",
  text: "#1a2e1a", textSub: "#4a6a4a", textMuted: "#8aaa8a",
  bg: "#f4f7f2", card: "#ffffff", border: "#dde8dd",
  danger: "#c0392b",
  blue: "#1565c0", blueBg: "#e3f2fd", blue4: "#bbdefb",
};
const css = (o: CSSProperties): CSSProperties => o;
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export default function CalendarView({ reports, schedules, crops, users, onAddSchedule }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [viewYear, setViewYear]     = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth]   = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ title: "", note: "", crop: "" });
  const [adding, setAdding]         = useState(false);
  const [addError, setAddError]     = useState("");

  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

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

  const cropName = (id: number) => crops.find(c => c.id === id)?.name ?? "未設定";
  const userName = (id: number) => users.find(u => u.id === id)?.name ?? "未設定";

  const closePopup = () => {
    setSelectedDate(null);
    setShowForm(false);
    setForm({ title: "", note: "", crop: "" });
    setAddError("");
  };

  const handleAdd = async () => {
    if (!selectedDate || !form.title.trim()) return;
    setAdding(true);
    setAddError("");
    const ok = await onAddSchedule(selectedDate, form.title.trim(), form.note.trim(), form.crop);
    setAdding(false);
    if (ok) {
      setForm({ title: "", note: "", crop: "" });
      setShowForm(false);
    } else {
      setAddError("追加に失敗しました。もう一度お試しください。");
    }
  };

  const dayReports   = selectedDate ? (byDateR[selectedDate] ?? []) : [];
  const daySchedules = selectedDate ? (byDateS[selectedDate] ?? []) : [];
  const isEmpty = dayReports.length === 0 && daySchedules.length === 0;

  return (
    <>
      <div style={css({ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.06)" })}>
        {/* Month nav */}
        <div style={css({ background: `linear-gradient(135deg,${C.primary} 0%,${C.primary2} 100%)`, color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" })}>
          <button onClick={goPrev} style={css({ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, padding: "5px 9px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center" })}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <div style={css({ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, fontSize: 15 })}>
            <CalendarDays size={15} strokeWidth={2} />
            {viewYear}年{viewMonth + 1}月
          </div>
          <button onClick={goNext} style={css({ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, padding: "5px 9px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center" })}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Day-of-week header */}
        <div style={css({ display: "grid", gridTemplateColumns: "repeat(7,1fr)", background: C.primary3 })}>
          {DOW.map((d, i) => (
            <div key={d} style={css({ textAlign: "center" as const, padding: "5px 0", fontSize: 11, fontWeight: 700, color: i === 0 ? C.danger : i === 6 ? C.blue : C.textSub })}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid cells */}
        <div style={css({ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "1px", background: C.border })}>
          {days.map((date, idx) => {
            const isToday = date === today;
            const isSel   = date === selectedDate;
            const dow     = idx % 7;
            const rCnt    = date ? (byDateR[date]?.length ?? 0) : 0;
            const sCnt    = date ? (byDateS[date]?.length ?? 0) : 0;
            return (
              <div
                key={idx}
                onClick={() => date && setSelectedDate(isSel ? null : date)}
                style={css({ background: isSel ? C.primary3 : C.card, minHeight: 54, padding: "4px 3px 3px", cursor: date ? "pointer" : "default", userSelect: "none" as const })}
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
                    {rCnt > 0 && (
                      <div style={css({ background: C.primary3, borderRadius: 3, padding: "1px 2px", fontSize: 9, fontWeight: 700, color: C.primary, textAlign: "center" as const, border: `1px solid ${C.primary4}`, marginBottom: 1, lineHeight: "1.4" })}>
                        作業{rCnt}
                      </div>
                    )}
                    {sCnt > 0 && (
                      <div style={css({ background: C.blueBg, borderRadius: 3, padding: "1px 2px", fontSize: 9, fontWeight: 700, color: C.blue, textAlign: "center" as const, border: `1px solid ${C.blue4}`, lineHeight: "1.4" })}>
                        予定{sCnt}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={css({ display: "flex", gap: 16, padding: "7px 14px", borderTop: `1px solid ${C.border}`, background: C.bg })}>
          <span style={css({ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textMuted })}>
            <span style={css({ background: C.primary3, border: `1px solid ${C.primary4}`, borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700, color: C.primary })}>作業</span>
            作業報告
          </span>
          <span style={css({ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textMuted })}>
            <span style={css({ background: C.blueBg, border: `1px solid ${C.blue4}`, borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700, color: C.blue })}>予定</span>
            スケジュール
          </span>
        </div>
      </div>

      {/* Bottom sheet */}
      {selectedDate && (
        <div
          style={css({ position: "fixed", inset: 0, background: "rgba(0,0,0,0.46)", zIndex: 350, display: "flex", alignItems: "flex-end" })}
          onClick={closePopup}
        >
          <div
            style={css({ background: C.card, borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "82vh", overflowY: "auto", padding: "16px 16px 48px", boxShadow: "0 -4px 24px rgba(0,0,0,0.18)" })}
            onClick={e => e.stopPropagation()}
          >
            <div style={css({ width: 36, height: 4, background: C.border, borderRadius: 4, margin: "0 auto 14px" })} />

            {/* Sheet header */}
            <div style={css({ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 })}>
              <div style={css({ display: "flex", alignItems: "center", gap: 8 })}>
                <div style={css({ background: C.primary3, borderRadius: 8, padding: "5px 7px" })}>
                  <CalendarDays size={15} color={C.primary} strokeWidth={2} />
                </div>
                <span style={css({ fontWeight: 700, fontSize: 15, color: C.text })}>{selectedDate}</span>
              </div>
              <button
                onClick={() => { setShowForm(f => !f); setForm({ title: "", note: "", crop: "" }); setAddError(""); }}
                style={css({
                  display: "flex", alignItems: "center", gap: 5,
                  background: showForm ? C.bg : `linear-gradient(135deg,${C.blue},#1976d2)`,
                  color: showForm ? C.textSub : "#fff",
                  border: showForm ? `1.5px solid ${C.border}` : "none",
                  borderRadius: 10, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                })}
              >
                {showForm ? <X size={13} strokeWidth={2.5} /> : <Plus size={13} strokeWidth={2.5} />}
                {showForm ? "キャンセル" : "予定を追加"}
              </button>
            </div>

            {/* Add form */}
            {showForm && (
              <div style={css({ background: C.blueBg, borderRadius: 12, padding: 14, marginBottom: 14, border: `1px solid ${C.blue4}` })}>
                <div style={css({ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 10 })}>新しい予定</div>
                <input
                  autoFocus
                  style={css({ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.blue4}`, fontSize: 14, marginBottom: 8, background: "#fff", color: C.text, boxSizing: "border-box" })}
                  placeholder="タイトル *"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleAdd()}
                />
                <select
                  style={css({ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.blue4}`, fontSize: 14, marginBottom: 8, background: "#fff", color: C.text, boxSizing: "border-box" })}
                  value={form.crop}
                  onChange={e => setForm(f => ({ ...f, crop: e.target.value }))}
                >
                  <option value="">作物（任意）</option>
                  {crops.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <input
                  style={css({ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.blue4}`, fontSize: 14, marginBottom: 10, background: "#fff", color: C.text, boxSizing: "border-box" })}
                  placeholder="メモ（任意）"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                />
                {addError && <div style={css({ color: C.danger, fontSize: 12, marginBottom: 8 })}>{addError}</div>}
                <button
                  onClick={handleAdd}
                  disabled={adding || !form.title.trim()}
                  style={css({
                    width: "100%", padding: "11px 0", borderRadius: 8, border: "none",
                    background: adding || !form.title.trim() ? C.border : `linear-gradient(135deg,${C.blue},#1976d2)`,
                    color: adding || !form.title.trim() ? C.textMuted : "#fff",
                    fontSize: 14, fontWeight: 700,
                    cursor: adding || !form.title.trim() ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  })}
                >
                  {adding ? <><RefreshCw size={14} strokeWidth={2} />追加中...</> : "追加する"}
                </button>
              </div>
            )}

            {/* Reports for this day */}
            {dayReports.length > 0 && (
              <div style={css({ marginBottom: 14 })}>
                <div style={css({ fontSize: 12, fontWeight: 700, color: C.primary, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 })}>
                  <ClipboardList size={13} strokeWidth={2} color={C.primary} />
                  作業報告 {dayReports.length}件
                </div>
                {dayReports.map(r => (
                  <div key={r.id} style={css({ background: C.primary3, borderRadius: 10, padding: "10px 12px", marginBottom: 7, border: `1px solid ${C.primary4}` })}>
                    <div style={css({ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 })}>
                      <span style={css({ fontWeight: 700, fontSize: 13, color: C.primary })}>{r.work_type}</span>
                      {r.field && <span style={css({ fontSize: 11, background: "#fff", borderRadius: 5, padding: "1px 7px", color: C.textSub, fontWeight: 600 })}>{r.field}</span>}
                      <span style={css({ fontSize: 11, color: C.textMuted, marginLeft: "auto" })}>{cropName(r.crop_id)}</span>
                    </div>
                    <div style={css({ display: "flex", gap: 10, fontSize: 11, color: C.textMuted, flexWrap: "wrap" as const, alignItems: "center" })}>
                      {r.quantity  && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><PackageCheck size={10} strokeWidth={2} />{r.quantity}kg</span>}
                      {r.work_time && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Clock size={10} strokeWidth={2} />{r.work_time}h</span>}
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}><UserCircle size={10} strokeWidth={2} />{userName(r.user_id)}</span>
                    </div>
                    {r.note && (
                      <div style={css({ fontSize: 11, color: C.textSub, marginTop: 5, padding: "5px 8px", background: "rgba(255,255,255,0.6)", borderRadius: 6, borderLeft: `3px solid ${C.primary4}` })}>
                        {r.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Schedules for this day */}
            {daySchedules.length > 0 && (
              <div>
                <div style={css({ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 })}>
                  <CalendarDays size={13} strokeWidth={2} color={C.blue} />
                  予定 {daySchedules.length}件
                </div>
                {daySchedules.map(s => (
                  <div key={s.id} style={css({ background: C.blueBg, borderRadius: 10, padding: "10px 12px", marginBottom: 7, border: `1px solid ${C.blue4}` })}>
                    <div style={css({ fontWeight: 700, fontSize: 13, color: C.blue, marginBottom: s.crop || s.note ? 4 : 0 })}>{s.title}</div>
                    {s.crop && (
                      <div style={css({ fontSize: 11, color: C.textMuted, display: "flex", alignItems: "center", gap: 4 })}>
                        <Leaf size={10} strokeWidth={2} />{s.crop}
                      </div>
                    )}
                    {s.note && <div style={css({ fontSize: 11, color: C.textSub, marginTop: 4 })}>{s.note}</div>}
                  </div>
                ))}
              </div>
            )}

            {isEmpty && !showForm && (
              <div style={css({ textAlign: "center" as const, padding: "24px 0", color: C.textMuted, fontSize: 13 })}>
                この日の記録はありません
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
