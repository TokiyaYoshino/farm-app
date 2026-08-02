import type { ReactNode, CSSProperties } from "react";
import { C, SHADOW } from "./tokens";

// ─── ボトムシート共通シェル ──────────────────────────────────
// 下からせり上がるモーダル。オーバーレイタップで閉じる。上部につまみバー。
interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxHeight?: string;   // 可変高さの上限（default 90vh）
  height?: string;      // 固定高さ（マップ等）。指定時は maxHeight より優先
  zIndex?: number;      // default 450
  padBottom?: number;   // コンテンツ下部の余白（default 44）
}

export default function BottomSheet({
  open, onClose, children, maxHeight = "90vh", height, zIndex = 450, padBottom = 44,
}: Props) {
  if (!open) return null;

  const overlay: CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(20,21,24,0.32)",
    zIndex, display: "flex", alignItems: "flex-end",
    animation: "fadeIn 0.2s ease",
  };
  const sheet: CSSProperties = {
    background: C.card, borderRadius: "24px 24px 0 0", width: "100%",
    ...(height ? { height } : { maxHeight }),
    overflowY: "auto", paddingBottom: `calc(${padBottom}px + env(safe-area-inset-bottom))`,
    animation: "slideUp 0.25s ease",
    display: "flex", flexDirection: "column",
    boxShadow: SHADOW.float,
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="閉じる"
          style={{ display: "flex", justifyContent: "center", padding: "12px 0 6px", border: "none", background: "none", cursor: "pointer", flexShrink: 0 }}
        >
          <div style={{ width: 38, height: 4, background: C.well, borderRadius: 4 }} />
        </button>
        {children}
      </div>
    </div>
  );
}
