import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { C } from "./tokens";

// ─── ケバブ（⋮）ドロップダウンメニュー ───────────────────────
// 一覧行の削除など補助操作を集約。開閉は親の openId/setOpenId で制御
// （画面全体のクリックで閉じる既存挙動を再利用するため controlled）。
export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  menuKey: string;
  openId: string | null;
  setOpenId: (v: string | null) => void;
  items: RowMenuItem[];
}

export default function RowMenu({ menuKey, openId, setOpenId, items }: Props) {
  const open = openId === menuKey;
  return (
    <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpenId(open ? null : menuKey)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 6, color: C.textMuted, display: "flex" }}
      >
        <MoreVertical size={16} strokeWidth={2} />
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "100%", background: C.card, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", border: `1px solid ${C.border}`, zIndex: 50, minWidth: 120, overflow: "hidden" }}>
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => { setOpenId(null); it.onClick(); }}
              style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", color: it.danger ? C.danger : C.text, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
