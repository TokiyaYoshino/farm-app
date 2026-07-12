import type { ReactNode, CSSProperties } from "react";
import { C } from "./tokens";

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
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    zIndex, display: "flex", alignItems: "flex-end",
    animation: "fadeIn 0.2s ease",
  };
  const sheet: CSSProperties = {
    background: C.card, borderRadius: "20px 20px 0 0", width: "100%",
    ...(height ? { height } : { maxHeight }),
    overflowY: "auto", paddingBottom: padBottom,
    animation: "slideUp 0.25s ease",
    display: "flex", flexDirection: "column",
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 4, margin: "12px auto 0", flexShrink: 0 }} />
        {children}
      </div>
    </div>
  );
}
