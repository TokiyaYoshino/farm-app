import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ChevronLeft, ChevronRight, Plus, X, Save, RefreshCw,
  Trash2, Leaf, MapPin, CalendarDays, ClipboardList,
} from "lucide-react";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

const C = {
  primary:   "#2d6a2d",
  primary2:  "#3a8a3a",
  primary3:  "#e8f5e9",
  primary4:  "#c8e6c9",
  danger:    "#c0392b",
  dangerBg:  "#fdecea",
  text:      "#1a2e1a",
  textSub:   "#4a6a4a",
  textMuted: "#8aaa8a",
  bg:        "#f4f7f2",
  card:      "#ffffff",
  border:    "#dde8dd",
};

const DEFAULT_BAR_COLOR = "#4CAF50";

interface Crop    { id: number; name: string; }
interface Field   { id: number; name: string; }
interface Project {
  id: string; org?: string; name: string;
  crop_id?: number; field?: string;
  start_date?: string; end_date?: string;
  status: "active" | "completed" | "archived";
  created_by?: number; created_at: string;
  color?: string;
}
interface Props {
  projects:       Project[];
  crops:          Crop[];
  fields:         Field[];
  currentOrg:     string;
  currentUserId?: number;
  isAdmin:        boolean;
  onAdd:    (p: Project) => void;
  onUpdate: (p: Project) => void;
  onDelete: (id: string) => void;
}

// ── レイアウト定数 ──────────────────────────────────────────
const COL_W   = 28;   // 日付列 1日あたりの幅 (px)
const LABEL_W = 150;  // 左固定列の幅 (px)
const ROW_H   = 56;   // データ行の高さ (px)
const MONTH_H = 28;   // 月名ヘッダー行の高さ (px)
const DAY_H   = 24;   // 日付ヘッダー行の高さ (px)

// ── 日付ユーティリティ ──────────────────────────────────────
function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function diffDays(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 0, 0, 0, 0);
}
function endOfMonth(y: number, m: number): Date {
  return new Date(y, m + 1, 0, 0, 0, 0, 0);
}

// ── フォームスタイル ────────────────────────────────────────
const lbl = { fontSize:12, fontWeight:600, color:C.textSub, marginBottom:5, display:"flex", alignItems:"center", gap:4 } as const;
const inp = { width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:15, marginBottom:12, background:"#fafcfa", color:C.text, boxSizing:"border-box" } as const;
const sel = { width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:15, marginBottom:12, background:"#fafcfa", color:C.text } as const;
const btnPrimary = { background:C.primary, color:"#fff", border:"none", borderRadius:10, padding:"13px 0", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 } as const;

// ── テーブルセルの共通ボーダースタイル ──────────────────────
const cellBorder = { borderBottom:`1px solid ${C.border}`, borderRight:`1px solid ${C.border}` };

export default function GanttChart({
  projects, crops, fields, currentOrg, currentUserId, isAdmin,
  onAdd, onUpdate, onDelete,
}: Props) {

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 表示期間: 当月を起点に3ヶ月
  const [viewStart, setViewStart] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0)
  );
  const viewEnd   = endOfMonth(viewStart.getFullYear(), viewStart.getMonth() + 2);
  const totalDays = diffDays(viewStart, viewEnd) + 1;

  // ── 日リスト・月グループを1パスで生成 ─────────────────────
  const dayList:    { day: number; isToday: boolean; isWeekend: boolean }[] = [];
  const monthGroups:{ label: string; count: number }[] = [];
  {
    let cur = new Date(viewStart);
    for (let i = 0; i < totalDays; i++) {
      const dow = cur.getDay();
      dayList.push({
        day:       cur.getDate(),
        isToday:   cur.getTime() === today.getTime(),
        isWeekend: dow === 0 || dow === 6,
      });
      const mLabel = `${cur.getFullYear()}年${cur.getMonth() + 1}月`;
      const lastM  = monthGroups[monthGroups.length - 1];
      if (!lastM || lastM.label !== mLabel) monthGroups.push({ label: mLabel, count: 1 });
      else lastM.count++;
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 0, 0, 0, 0);
    }
  }

  const getCropName = (id?: number) => crops.find(c => c.id === id)?.name ?? "";

  // ── 各プロジェクトのバー情報を取得 ─────────────────────────
  const getBar = (p: Project, di: number) => {
    if (!p.start_date || !p.end_date) return null;
    const startIdx = diffDays(viewStart, parseISO(p.start_date));
    const endIdx   = diffDays(viewStart, parseISO(p.end_date));
    if (endIdx < 0 || startIdx >= totalDays) return null;
    const visStart   = Math.max(startIdx, 0);
    const visEnd     = Math.min(endIdx, totalDays - 1);
    if (di < visStart || di > visEnd) return null;
    const color      = p.color ?? DEFAULT_BAR_COLOR;
    const barWidthPx = (visEnd - visStart + 1) * COL_W;
    return {
      color,
      barWidthPx,
      isFirst: di === visStart,
      isLast:  di === visEnd,
    };
  };

  // ── モーダル状態 ─────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const emptyForm = { name:"", crop_id:0, field:"", start_date:"", end_date:"", color: DEFAULT_BAR_COLOR };
  const [form,       setForm]       = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [errMsg,     setErrMsg]     = useState("");

  const openEdit = (p: Project) => {
    setErrMsg("");
    setForm({ name:p.name, crop_id:p.crop_id??0, field:p.field??"", start_date:p.start_date??"", end_date:p.end_date??"", color: p.color ?? DEFAULT_BAR_COLOR });
    setEditTarget(p); setShowAdd(false);
  };
  const openAdd = () => {
    setErrMsg("");
    setForm({ ...emptyForm, start_date:toISO(today) });
    setEditTarget(null); setShowAdd(true);
  };
  const closeModal = () => { setEditTarget(null); setShowAdd(false); setErrMsg(""); };

  // ── Supabase 操作（既存ロジックを維持） ─────────────────────
  const handleSave = async () => {
    if (!editTarget || !form.name.trim()) { setErrMsg("計画名を入力してください"); return; }
    setSubmitting(true); setErrMsg("");
    const { data, error } = await supabase.from("projects")
      .update({ name:form.name.trim(), crop_id:form.crop_id||null, field:form.field||null, start_date:form.start_date||null, end_date:form.end_date||null, color:form.color })
      .eq("id", editTarget.id).select().single();
    setSubmitting(false);
    if (error) { setErrMsg(error.message); return; }
    onUpdate(data as Project); closeModal();
  };

  const handleAdd = async () => {
    if (!form.name.trim()) { setErrMsg("計画名を入力してください"); return; }
    setSubmitting(true); setErrMsg("");
    const { data, error } = await supabase.from("projects")
      .insert([{ name:form.name.trim(), crop_id:form.crop_id||null, field:form.field||null, start_date:form.start_date||null, end_date:form.end_date||null, status:"active", org:currentOrg, created_by:currentUserId, color:form.color }])
      .select().single();
    setSubmitting(false);
    if (error) { setErrMsg(error.message); return; }
    onAdd(data as Project); closeModal();
  };

  const handleDelete = async () => {
    if (!editTarget || !confirm("この計画を削除しますか？")) return;
    await supabase.from("projects").delete().eq("id", editTarget.id);
    onDelete(editTarget.id); closeModal();
  };

  const modalOpen = !!editTarget || showAdd;
  const tableW    = LABEL_W + totalDays * COL_W;

  // ── レンダリング ─────────────────────────────────────────────
  return (
    <div style={{ padding:"12px 16px 16px" }}>

      {/* ツールバー */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button
            onClick={() => setViewStart(d => addMonths(d, -1))}
            style={{ background:C.primary3, border:"none", borderRadius:8, padding:"6px 10px", cursor:"pointer", color:C.primary, display:"flex" }}
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <span style={{ fontSize:13, fontWeight:600, color:C.textSub, minWidth:190, textAlign:"center" as const }}>
            {monthGroups[0]?.label} 〜 {monthGroups[monthGroups.length - 1]?.label}
          </span>
          <button
            onClick={() => setViewStart(d => addMonths(d, 1))}
            style={{ background:C.primary3, border:"none", borderRadius:8, padding:"6px 10px", cursor:"pointer", color:C.primary, display:"flex" }}
          >
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
        {isAdmin && (
          <button
            onClick={openAdd}
            style={{ display:"flex", alignItems:"center", gap:5, background:C.primary, color:"#fff", border:"none", borderRadius:9, padding:"7px 13px", fontSize:13, fontWeight:700, cursor:"pointer" }}
          >
            <Plus size={14} strokeWidth={2.5} />計画を追加
          </button>
        )}
      </div>


      {/* ── ガントチャート本体 ─────────────────────────────────── */}
      <div style={{ overflowX:"auto" as const, border:`1px solid ${C.border}`, borderRadius:12, background:C.card, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
        <table style={{ tableLayout:"fixed" as const, borderCollapse:"collapse" as const, width:tableW, minWidth:tableW }}>
          <colgroup>
            <col style={{ width:LABEL_W }} />
            {dayList.map((_, i) => <col key={i} style={{ width:COL_W }} />)}
          </colgroup>

          <thead>
            {/* 1行目: 月名 */}
            <tr style={{ height:MONTH_H }}>
              <th style={{
                ...cellBorder,
                position:"sticky" as const, left:0, zIndex:3,
                background:C.bg, fontSize:11, fontWeight:700, color:C.textSub,
                textAlign:"center" as const, padding:0,
              }}>
                計画
              </th>
              {monthGroups.map((mg, i) => (
                <th
                  key={i}
                  colSpan={mg.count}
                  style={{
                    ...cellBorder,
                    background:  C.bg,
                    fontSize:    12,
                    fontWeight:  700,
                    color:       C.text,
                    textAlign:   "left" as const,
                    paddingLeft: 6,
                    whiteSpace:  "nowrap" as const,
                    overflow:    "hidden",
                    verticalAlign:"middle" as const,
                  }}
                >
                  {mg.label}
                </th>
              ))}
            </tr>

            {/* 2行目: 日付（1・2・3…） */}
            <tr style={{ height:DAY_H }}>
              <th style={{
                ...cellBorder,
                position:"sticky" as const, left:0, zIndex:3,
                background:C.bg, padding:0,
              }} />
              {dayList.map((d, i) => (
                <th
                  key={i}
                  style={{
                    ...cellBorder,
                    background:   d.isToday ? C.primary3 : "transparent",
                    fontSize:     10,
                    fontWeight:   d.isToday ? 700 : 400,
                    color:        d.isToday ? C.primary : d.isWeekend ? C.danger : C.textSub,
                    textAlign:    "center" as const,
                    padding:      0,
                    verticalAlign:"middle" as const,
                  }}
                >
                  {d.day}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td
                  colSpan={totalDays + 1}
                  style={{ padding:"32px 16px", textAlign:"center" as const, color:C.textMuted, fontSize:13 }}
                >
                  <div style={{ marginBottom:8 }}><ClipboardList size={28} color={C.textMuted} strokeWidth={1.5} /></div>
                  <div style={{ fontWeight:700, color:C.text, marginBottom:4 }}>計画がありません</div>
                  {isAdmin && <div style={{ fontSize:12 }}>右上の「計画を追加」から登録できます</div>}
                </td>
              </tr>
            ) : (
              projects.map((p, pi) => {
                const rowBg = pi % 2 === 0 ? C.card : C.bg;
                return (
                  <tr key={p.id} style={{ height:ROW_H }}>

                    {/* 左固定列: 計画名 */}
                    <td
                      onClick={() => openEdit(p)}
                      style={{
                        ...cellBorder,
                        position:   "sticky" as const,
                        left:       0,
                        zIndex:     2,
                        background: rowBg,
                        padding:    "4px 8px",
                        cursor:     "pointer",
                        verticalAlign:"middle" as const,
                      }}
                    >
                      <div style={{ fontWeight:700, fontSize:12, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize:10, color:C.textMuted, display:"flex", gap:4, marginTop:2, flexWrap:"nowrap" as const }}>
                        {p.crop_id && (
                          <span style={{ display:"flex", alignItems:"center", gap:2 }}>
                            <Leaf size={9} strokeWidth={2} color={p.color ?? DEFAULT_BAR_COLOR} />
                            {getCropName(p.crop_id)}
                          </span>
                        )}
                        {p.field && (
                          <span style={{ display:"flex", alignItems:"center", gap:2 }}>
                            <MapPin size={9} strokeWidth={2} />
                            {p.field}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 日付セル */}
                    {dayList.map((d, di) => {
                      const bar   = getBar(p, di);
                      const cellBg = d.isToday ? C.primary3 : rowBg;

                      // バーなし
                      if (!bar) {
                        return (
                          <td
                            key={di}
                            onClick={() => openEdit(p)}
                            style={{ ...cellBorder, background: cellBg, padding: 0, cursor: "pointer" }}
                          />
                        );
                      }

                      // バーあり: td は透明、内側 div がバー背景
                      const barRadius =
                        bar.isFirst && bar.isLast ? 4 :
                        bar.isFirst               ? "4px 0 0 4px" :
                        bar.isLast                ? "0 4px 4px 0" : 0;

                      return (
                        <td
                          key={di}
                          onClick={() => openEdit(p)}
                          style={{
                            ...cellBorder,
                            background:   "transparent",
                            padding:      "4px 0",   // 上下余白でバーを細く見せる
                            cursor:       "pointer",
                            verticalAlign:"middle" as const,
                            // 先頭セルのみ position:relative（テキストオーバーレイの基点）
                            position:     bar.isFirst ? "relative" as const : undefined,
                            overflow:     "visible",
                          }}
                        >
                          {/* バー本体 div — height:"100%" はtd内で0pxになるため明示 */}
                          <div style={{
                            height:       ROW_H - 8,
                            background:   bar.color,
                            borderRadius: barRadius,
                          }} />

                          {/* テキストオーバーレイ（先頭セルのみ・バー全体にまたがる） */}
                          {bar.isFirst && (
                            <span style={{
                              position:     "absolute",
                              left:         0,
                              top:          4,          // paddingTop に合わせる
                              bottom:       4,          // paddingBottom に合わせる
                              width:        bar.barWidthPx,
                              overflow:     "hidden",
                              whiteSpace:   "nowrap" as const,
                              display:      "flex",
                              alignItems:   "center",
                              paddingLeft:  6,
                              fontSize:     12,
                              fontWeight:   700,
                              color:        "#fff",
                              pointerEvents:"none" as const,
                              zIndex:       1,
                            }}>
                              {p.name}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── 編集 / 追加 モーダル ──────────────────────────────── */}
      {modalOpen && (
        <div
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"flex-end" }}
          onClick={closeModal}
        >
          <div
            style={{ background:C.card, borderRadius:"20px 20px 0 0", width:"100%", maxHeight:"88vh", overflowY:"auto", paddingBottom:32 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width:36, height:4, background:C.border, borderRadius:4, margin:"12px auto 0" }} />
            <div style={{ padding:"16px 16px 0" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
                <div style={{ fontWeight:700, fontSize:16, color:C.text, display:"flex", alignItems:"center", gap:7 }}>
                  <CalendarDays size={17} color={C.primary} strokeWidth={2} />
                  {showAdd ? "新しい計画を登録" : "計画を編集"}
                </div>
                <button onClick={closeModal} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 10px", cursor:"pointer", color:C.textSub, display:"flex" }}>
                  <X size={16} strokeWidth={2} />
                </button>
              </div>

              <div style={lbl}><ClipboardList size={13} strokeWidth={2} />計画名 *</div>
              <input style={inp} placeholder="例: 2026年 ぶどう栽培" value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} />

              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={lbl}><Leaf size={13} strokeWidth={2} />作物（任意）</div>
                  <select style={sel} value={form.crop_id} onChange={e => setForm(f => ({ ...f, crop_id:Number(e.target.value) }))}>
                    <option value={0}>未指定</option>
                    {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={lbl}><MapPin size={13} strokeWidth={2} />圃場（任意）</div>
                  <select style={sel} value={form.field} onChange={e => setForm(f => ({ ...f, field:e.target.value }))}>
                    <option value="">未指定</option>
                    {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={lbl}><CalendarDays size={13} strokeWidth={2} />開始日</div>
                  <input type="date" style={{ ...inp, maxWidth:"100%" }} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date:e.target.value }))} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={lbl}><CalendarDays size={13} strokeWidth={2} />終了予定日</div>
                  <input type="date" style={{ ...inp, maxWidth:"100%" }} value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date:e.target.value }))} />
                </div>
              </div>

              <div style={lbl}>バーの色</div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm(f => ({ ...f, color:e.target.value }))}
                  style={{ width:44, height:40, padding:3, borderRadius:8, border:`1.5px solid ${C.border}`, cursor:"pointer", background:"#fafcfa" }}
                />
                <div style={{ flex:1, height:40, borderRadius:8, background:form.color, border:`1.5px solid ${C.border}` }} />
                <span style={{ fontSize:12, color:C.textMuted, fontFamily:"monospace", minWidth:64 }}>{form.color}</span>
              </div>

              {errMsg && (
                <div style={{ background:C.dangerBg, color:C.danger, borderRadius:8, padding:"8px 12px", fontSize:13, marginBottom:12 }}>{errMsg}</div>
              )}

              <div style={{ display:"flex", gap:8 }}>
                <button
                  style={{ ...btnPrimary, flex:1, width:"auto", opacity:submitting ? 0.7 : 1 }}
                  onClick={showAdd ? handleAdd : handleSave}
                  disabled={submitting}
                >
                  {submitting
                    ? <><RefreshCw size={16} strokeWidth={2} />保存中...</>
                    : <><Save size={16} strokeWidth={2} />{showAdd ? "追加する" : "保存する"}</>}
                </button>
                {!showAdd && isAdmin && (
                  <button
                    onClick={handleDelete}
                    style={{ flex:1, width:"auto", padding:"13px 0", borderRadius:10, border:`1.5px solid ${C.danger}44`, background:C.dangerBg, color:C.danger, fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
                  >
                    <Trash2 size={15} strokeWidth={2} />削除
                  </button>
                )}
                <button
                  onClick={closeModal}
                  style={{ flex:1, width:"auto", padding:"13px 0", borderRadius:10, border:`1.5px solid ${C.border}`, background:C.bg, color:C.textSub, fontSize:14, fontWeight:600, cursor:"pointer" }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
