import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { C, RADIUS } from "./tokens";
import { btn } from "./styles";

// ─── 折りたたみ（結論は常時・前提は畳む）───────────────────────
//
// AI の回答は、結論そのものより「出典・限界・注意書き」の方が長くなる。
// 実測（2026-08-29 / 作付けの相談）では本文74字に対して注釈が179字あり、
// 注釈が本文の2.4倍を占めていた。しかも注釈はほぼ固定文言なので、会話が
// 続くほど同じ文で画面が埋まる。
//
// 消すわけにはいかない（どこまでが目安かを利用者が区別できなくなる）ので、
// 「読める場所に畳んでおく」に倒す。防除助言シートの「使った天気を見る」が
// 先に同じ形をしていたので、それを部品にして横展開した。
//
// 開閉は内部 state で持つ。呼び出し側に state を作らせない（同じ画面に
// 複数置くたびに useState が増えるのを避ける）。

interface Props {
  /** 閉じているときのラベル。「〜を見る」は付けない（この部品が付ける） */
  label: string;
  /** 件数。渡すとラベルに「（n件）」が付く */
  count?: number;
  /**
   * この部品が乗っている面。開いた中身の背景を1段ずらすために要る。
   * トークンの原則が「入れ子＝白→灰→白」なので、灰(well)の吹き出しの中で
   * また灰を敷くと階層が消えて、ただ文章が伸びたようにしか見えない。
   */
  on?: "bg" | "well";
  children: ReactNode;
}

export default function Disclosure({ label, count, on = "bg", children }: Props) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ ...btn("tertiary", "sm"), padding: 0, gap: 3 }}
      >
        {open ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
        {open ? `${label}を閉じる` : `${label}${count != null ? `（${count}件）` : ""}を見る`}
      </button>
      {open && (
        <div style={{
          marginTop: 6, background: on === "well" ? C.card : C.well, borderRadius: RADIUS.well,
          padding: "10px 12px", fontSize: 12, lineHeight: 1.7, color: C.textMuted,
        }}>
          {children}
        </div>
      )}
    </div>
  );
}
