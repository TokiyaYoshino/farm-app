import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { C, SHADOW } from "../ui/tokens";
import { btn } from "../ui/styles";

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
        style={css({ background: C.card, borderRadius: "24px 24px 0 0", width: "100%", padding: "12px 16px calc(44px + env(safe-area-inset-bottom))", boxShadow: SHADOW.float })}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <button onClick={onClose} aria-label="閉じる" style={css({ display: "flex", justifyContent: "center", width: "100%", padding: "0 0 14px", border: "none", background: "none", cursor: "pointer" })}>
          <div style={css({ width: 38, height: 4, background: C.well, borderRadius: 4 })} />
        </button>

        {/* Header */}
        <div style={css({ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 })}>
          <span style={css({ fontWeight: 700, fontSize: 17, color: C.text })}>{label}を選択</span>
          <button onClick={onClose} style={css({ width: 32, height: 32, borderRadius: 999, background: C.well, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted })}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Month nav */}
        <div style={css({ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 })}>
          <button onClick={goPrev} style={css({ width: 34, height: 34, background: C.well, border: "none", borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSub })}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <span style={css({ fontWeight: 700, fontSize: 15, color: C.text })}>{viewYear}年{viewMonth + 1}月</span>
          <button onClick={goNext} style={css({ width: 34, height: 34, background: C.well, border: "none", borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSub })}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Day headers */}
        <div style={css({ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 })}>
          {DOW.map((d) => (
            <div key={d} style={css({ textAlign: "center" as const, padding: "4px 0", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: C.textMuted })}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={css({ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px", marginBottom: 14 })}>
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
                  position: "relative",
                  border: "none",
                  borderRadius: 12,
                  aspectRatio: "1",
                  cursor: date ? "pointer" : "default",
                  background: isSel ? C.ink : "transparent",
                  color: isSel ? "#fff" : dow === 0 ? C.danger : dow === 6 ? C.info : C.text,
                  fontSize: 14,
                  fontWeight: isSel || isToday ? 700 : 400,
                })}
              >
                {date ? parseInt(date.slice(8), 10) : ""}
                {isToday && !isSel && <span style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: C.ink }} />}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div style={css({ display: "flex", gap: 10 })}>
          {value && (
            <button onClick={() => onSelect("")} style={{ ...btn("secondary", "md"), flex: 1, color: C.textSub }}>
              クリア
            </button>
          )}
          <button
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
            style={{ ...btn("primary", "md"), flex: 2, ...(selected ? {} : { background: C.well, color: C.textMuted, boxShadow: "none", cursor: "default" }) }}
          >
            この日付を設定
          </button>
        </div>
      </div>
    </div>
  );
}
