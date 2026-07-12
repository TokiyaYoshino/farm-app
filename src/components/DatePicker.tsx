import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, X } from "lucide-react";
import { C } from "../ui/tokens";

interface Props {
  label: string;
  value: string; // YYYY-MM-DD or ""
  onSelect: (date: string) => void;
  onClose: () => void;
}

const css = (o: CSSProperties): CSSProperties => o;
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export default function DatePicker({ label, value, onSelect, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const initYM = value || today;

  const [viewYear, setViewYear]   = useState(() => parseInt(initYM.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => parseInt(initYM.slice(5, 7)) - 1);
  const [selected, setSelected]   = useState(value);

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

  return (
    <div
      style={css({ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 450, display: "flex", alignItems: "flex-end" })}
      onClick={onClose}
    >
      <div
        style={css({ background: C.card, borderRadius: "20px 20px 0 0", width: "100%", padding: "16px 16px 48px", boxShadow: "0 -4px 24px rgba(0,0,0,0.2)" })}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={css({ width: 36, height: 4, background: C.border, borderRadius: 4, margin: "0 auto 14px" })} />

        {/* Header */}
        <div style={css({ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 })}>
          <div style={css({ display: "flex", alignItems: "center", gap: 7 })}>
            <div style={css({ background: C.primary3, borderRadius: 8, padding: "5px 7px" })}>
              <CalendarDays size={15} color={C.primary} strokeWidth={2} />
            </div>
            <span style={css({ fontWeight: 700, fontSize: 15, color: C.text })}>{label}を選択</span>
          </div>
          <button onClick={onClose} style={css({ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 8px", cursor: "pointer", display: "flex", color: C.textMuted })}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Month nav */}
        <div style={css({ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 })}>
          <button onClick={goPrev} style={css({ background: C.primary3, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", color: C.primary })}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <span style={css({ fontWeight: 700, fontSize: 14, color: C.text })}>{viewYear}年{viewMonth + 1}月</span>
          <button onClick={goNext} style={css({ background: C.primary3, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", color: C.primary })}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Day headers */}
        <div style={css({ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 2 })}>
          {DOW.map((d, i) => (
            <div key={d} style={css({ textAlign: "center" as const, padding: "4px 0", fontSize: 11, fontWeight: 700, color: i === 0 ? C.danger : i === 6 ? C.info : C.textSub })}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={css({ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px", marginBottom: 14 })}>
          {days.map((date, idx) => {
            const isToday    = date === today;
            const isSel      = date === selected;
            const dow        = idx % 7;
            return (
              <button
                key={idx}
                disabled={!date}
                onClick={() => date && setSelected(date)}
                style={css({
                  border: "none",
                  borderRadius: 8,
                  padding: "7px 2px",
                  cursor: date ? "pointer" : "default",
                  background: isSel ? C.primary : isToday ? C.primary3 : "transparent",
                  color: isSel ? "#fff" : isToday ? C.primary : dow === 0 ? C.danger : dow === 6 ? C.info : C.text,
                  fontSize: 13,
                  fontWeight: isSel || isToday ? 700 : 400,
                  outline: isSel ? `2px solid ${C.primary2}` : "none",
                  outlineOffset: 1,
                })}
              >
                {date ? parseInt(date.slice(8), 10) : ""}
              </button>
            );
          })}
        </div>

        {/* Selected display */}
        {selected && (
          <div style={css({ textAlign: "center" as const, fontSize: 13, color: C.textSub, marginBottom: 12 })}>
            選択中：<span style={{ fontWeight: 700, color: C.primary }}>{selected}</span>
          </div>
        )}

        {/* Actions */}
        <div style={css({ display: "flex", gap: 10 })}>
          {value && (
            <button
              onClick={() => onSelect("")}
              style={css({ flex: 1, padding: "12px 0", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, color: C.textSub, fontSize: 14, fontWeight: 600, cursor: "pointer" })}
            >
              クリア
            </button>
          )}
          <button
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
            style={css({
              flex: 2, padding: "12px 0", borderRadius: 10, border: "none",
              background: selected ? `linear-gradient(135deg,${C.primary},${C.primary2})` : C.border,
              color: selected ? "#fff" : C.textMuted,
              fontSize: 14, fontWeight: 700, cursor: selected ? "pointer" : "default",
            })}
          >
            この日付を設定
          </button>
        </div>
      </div>
    </div>
  );
}
