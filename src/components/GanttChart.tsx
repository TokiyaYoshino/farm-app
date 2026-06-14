import { useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ChevronLeft, ChevronRight, Plus, X, Save, RefreshCw,
  Trash2, Leaf, MapPin, CalendarDays, ClipboardList,
} from "lucide-react";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

// ─── カラーパレット（App.tsx と同じ値） ─────────────────
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

// 作物ごとのバー色（8色）
const CROP_COLORS = [
  "#4caf50", "#1976d2", "#f57c00", "#7b1fa2",
  "#c62828", "#00838f", "#558b2f", "#4527a0",
];

// ─── 型定義 ─────────────────────────────────────────────
interface Crop  { id: number; name: string; }
interface Field { id: number; name: string; }
interface Project {
  id: string; org?: string; name: string;
  crop_id?: number; field?: string;
  start_date?: string; end_date?: string;
  status: "active" | "completed" | "archived";
  created_by?: number; created_at: string;
}

interface Props {
  projects:     Project[];
  crops:        Crop[];
  fields:       Field[];
  currentOrg:   string;
  currentUserId?: number;
  isAdmin:      boolean;
  onAdd:    (p: Project) => void;
  onUpdate: (p: Project) => void;
  onDelete: (id: string) => void;
}

// ─── 定数 ────────────────────────────────────────────────
const DAY_W   = 14;   // px / 日
const ROW_H   = 50;   // px / 行
const HEAD_H  = 34;   // px / 月ヘッダー
const LABEL_W = 140;  // px / ラベル列幅

// ─── ユーティリティ ──────────────────────────────────────
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function lastDayOf(y: number, m: number) {
  return new Date(y, m + 1, 0);
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function parseDate(s: string) {
  const [y, mo, d] = s.split("-").map(Number);
  return new Date(y, mo - 1, d);
}
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ─── 共通スタイルヘルパー ─────────────────────────────────
const lbl  = { fontSize:12, fontWeight:600, color:C.textSub, marginBottom:5, display:"flex", alignItems:"center", gap:4 } as const;
const inp  = { width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:15, marginBottom:12, background:"#fafcfa", color:C.text, boxSizing:"border-box" } as const;
const sel  = { width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:15, marginBottom:12, background:"#fafcfa", color:C.text } as const;
const btn  = { background:`linear-gradient(135deg,${C.primary},${C.primary2})`, color:"#fff", border:"none", borderRadius:10, padding:"13px 0", width:"100%", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 } as const;

// ─── メインコンポーネント ─────────────────────────────────
export default function GanttChart({ projects, crops, fields, currentOrg, currentUserId, isAdmin, onAdd, onUpdate, onDelete }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 表示期間: 先月〜翌月（3ヶ月）
  const [viewStart, setViewStart] = useState(() => new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const viewEnd   = lastDayOf(viewStart.getFullYear(), viewStart.getMonth() + 2);
  const totalDays = daysBetween(viewStart, viewEnd) + 1;

  // モーダル
  const [editTarget, setEditTarget]     = useState<Project | null>(null);
  const [showAdd,    setShowAdd]        = useState(false);
  const emptyForm = { name:"", crop_id:0, field:"", start_date:"", end_date:"" };
  const [form, setForm]                 = useState(emptyForm);
  const [submitting, setSubmitting]     = useState(false);
  const [errMsg,     setErrMsg]         = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  // 月ヘッダー生成
  const months: { label: string; dayCount: number; offsetDays: number }[] = [];
  {
    let cur = new Date(viewStart);
    while (cur <= viewEnd) {
      const y = cur.getFullYear(), m = cur.getMonth();
      const first = new Date(y, m, 1);
      const last  = lastDayOf(y, m);
      const off   = Math.max(0, daysBetween(viewStart, first));
      const end   = Math.min(totalDays - 1, daysBetween(viewStart, last));
      months.push({ label:`${y}年${m+1}月`, dayCount: end - off + 1, offsetDays: off });
      cur = new Date(y, m + 1, 1);
    }
  }

  // 今日の位置
  const todayOff  = daysBetween(viewStart, today);
  const showToday = todayOff >= 0 && todayOff < totalDays;

  // 作物→色マップ（登録順でインデックス付与）
  const cropColorMap: Record<number, string> = {};
  crops.forEach((c, i) => { cropColorMap[c.id] = CROP_COLORS[i % CROP_COLORS.length]; });
  const cropName = (id?: number) => crops.find(c => c.id === id)?.name ?? "";

  // ナビ
  const goPrev = () => setViewStart(d => addMonths(d, -1));
  const goNext = () => setViewStart(d => addMonths(d,  1));
  const rangeLabel = `${months[0]?.label.replace("年","年")} 〜 ${months[months.length - 1]?.label}`;

  // モーダルを開く
  const openEdit = (p: Project) => {
    setErrMsg("");
    setForm({ name: p.name, crop_id: p.crop_id ?? 0, field: p.field ?? "", start_date: p.start_date ?? "", end_date: p.end_date ?? "" });
    setEditTarget(p);
    setShowAdd(false);
  };
  const openAdd = () => {
    setErrMsg("");
    setForm({ ...emptyForm, start_date: toISO(today) });
    setEditTarget(null);
    setShowAdd(true);
  };
  const closeModal = () => { setEditTarget(null); setShowAdd(false); setErrMsg(""); };

  // 保存（更新）
  const handleSave = async () => {
    if (!editTarget) return;
    if (!form.name.trim()) { setErrMsg("計画名を入力してください"); return; }
    setSubmitting(true); setErrMsg("");
    const { data, error } = await supabase
      .from("projects")
      .update({ name: form.name.trim(), crop_id: form.crop_id || null, field: form.field || null, start_date: form.start_date || null, end_date: form.end_date || null })
      .eq("id", editTarget.id)
      .select().single();
    setSubmitting(false);
    if (error) { setErrMsg(error.message); return; }
    onUpdate(data as Project);
    closeModal();
  };

  // 追加（insert）
  const handleAdd = async () => {
    if (!form.name.trim()) { setErrMsg("計画名を入力してください"); return; }
    setSubmitting(true); setErrMsg("");
    const { data, error } = await supabase
      .from("projects")
      .insert([{ name: form.name.trim(), crop_id: form.crop_id || null, field: form.field || null, start_date: form.start_date || null, end_date: form.end_date || null, status:"active", org: currentOrg, created_by: currentUserId }])
      .select().single();
    setSubmitting(false);
    if (error) { setErrMsg(error.message); return; }
    onAdd(data as Project);
    closeModal();
  };

  // 削除
  const handleDelete = async () => {
    if (!editTarget) return;
    if (!confirm("この計画を削除しますか？")) return;
    await supabase.from("projects").delete().eq("id", editTarget.id);
    onDelete(editTarget.id);
    closeModal();
  };

  const modalOpen = !!editTarget || showAdd;

  // ─── バー計算 ─────────────────────────────────────────
  const barProps = (p: Project) => {
    if (!p.start_date || !p.end_date) return null;
    const s = parseDate(p.start_date);
    const e = parseDate(p.end_date);
    const leftDays  = daysBetween(viewStart, s);
    const rightDays = daysBetween(viewStart, e) + 1;
    const left  = leftDays  * DAY_W;
    const right = Math.min(rightDays * DAY_W, totalDays * DAY_W);
    const width = right - Math.max(left, 0);
    if (width <= 0) return null;
    return { left: Math.max(left, 0), width, color: p.crop_id ? (cropColorMap[p.crop_id] ?? C.primary) : C.primary };
  };

  // ─── レンダリング ─────────────────────────────────────
  return (
    <div style={{ padding:"12px 16px 0" }}>

      {/* ツールバー */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button onClick={goPrev} style={{ background:C.primary3, border:"none", borderRadius:8, padding:"6px 10px", cursor:"pointer", color:C.primary, display:"flex" }}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <span style={{ fontSize:13, fontWeight:600, color:C.textSub, minWidth:180, textAlign:"center" }}>{rangeLabel}</span>
          <button onClick={goNext} style={{ background:C.primary3, border:"none", borderRadius:8, padding:"6px 10px", cursor:"pointer", color:C.primary, display:"flex" }}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
        {isAdmin && (
          <button onClick={openAdd} style={{ display:"flex", alignItems:"center", gap:5, background:`linear-gradient(135deg,${C.primary},${C.primary2})`, color:"#fff", border:"none", borderRadius:9, padding:"7px 13px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            <Plus size={14} strokeWidth={2.5} />計画を追加
          </button>
        )}
      </div>

      {/* 凡例 */}
      {crops.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
          {crops.map((c, i) => (
            <span key={c.id} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:C.textSub, fontWeight:600 }}>
              <span style={{ width:10, height:10, borderRadius:3, background:CROP_COLORS[i % CROP_COLORS.length], display:"inline-block" }} />
              {c.name}
            </span>
          ))}
        </div>
      )}

      {/* ガントチャート本体 */}
      {projects.length === 0 ? (
        <div style={{ textAlign:"center", padding:"40px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}` }}>
          <ClipboardList size={32} color={C.primary} strokeWidth={1.5} style={{ marginBottom:10 }} />
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>計画がありません</div>
          {isAdmin && <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>右上の「計画を追加」から登録できます</div>}
        </div>
      ) : (
        <div style={{ display:"flex", border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", background:C.card, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>

          {/* 左: ラベル列（固定） */}
          <div style={{ width:LABEL_W, flexShrink:0, borderRight:`1px solid ${C.border}` }}>
            {/* 月ヘッダー（空） */}
            <div style={{ height:HEAD_H, background:C.bg, borderBottom:`1px solid ${C.border}` }} />
            {/* プロジェクト行 */}
            {projects.map((p, i) => (
              <div
                key={p.id}
                onClick={() => openEdit(p)}
                style={{ height:ROW_H, display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 10px", borderBottom: i < projects.length - 1 ? `1px solid ${C.border}` : "none", cursor:"pointer", background: i % 2 === 0 ? C.card : C.bg }}
              >
                <div style={{ fontWeight:700, fontSize:12, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</div>
                <div style={{ fontSize:10, color:C.textMuted, display:"flex", gap:4, marginTop:2, overflow:"hidden" }}>
                  {p.crop_id && <span style={{ display:"flex", alignItems:"center", gap:2 }}><Leaf size={9} strokeWidth={2} color={cropColorMap[p.crop_id] ?? C.primary} />{cropName(p.crop_id)}</span>}
                  {p.field && <span style={{ display:"flex", alignItems:"center", gap:2 }}><MapPin size={9} strokeWidth={2} />{p.field}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* 右: スクロールエリア */}
          <div ref={scrollRef} style={{ flex:1, overflowX:"auto" }}>
            <div style={{ width: totalDays * DAY_W, position:"relative", minWidth:"100%" }}>

              {/* 月ヘッダー */}
              <div style={{ display:"flex", height:HEAD_H, borderBottom:`1px solid ${C.border}`, background:C.bg }}>
                {months.map(m => (
                  <div key={m.label} style={{ width: m.dayCount * DAY_W, flexShrink:0, borderRight:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:C.textSub }}>
                    {m.label}
                  </div>
                ))}
              </div>

              {/* バー行 */}
              {projects.map((p, i) => {
                const bar = barProps(p);
                return (
                  <div key={p.id} style={{ height:ROW_H, position:"relative", borderBottom: i < projects.length - 1 ? `1px solid ${C.border}` : "none", background: i % 2 === 0 ? C.card : C.bg }}>
                    {bar ? (
                      <button
                        onClick={() => openEdit(p)}
                        style={{ position:"absolute", left: bar.left, top: 13, width: Math.max(bar.width, 6), height:24, background: bar.color, borderRadius:6, border:"none", cursor:"pointer", opacity:0.88, display:"flex", alignItems:"center", paddingLeft:6, paddingRight:6, overflow:"hidden", whiteSpace:"nowrap" as const, color:"#fff", fontSize:11, fontWeight:700, boxShadow:"0 1px 4px rgba(0,0,0,0.18)" }}
                      >
                        {bar.width > 50 ? p.name : ""}
                      </button>
                    ) : (
                      <button onClick={() => openEdit(p)} style={{ position:"absolute", left:4, top:15, background:"transparent", border:`1px dashed ${C.border}`, borderRadius:6, padding:"3px 8px", fontSize:10, color:C.textMuted, cursor:"pointer" }}>
                        日程未設定
                      </button>
                    )}
                  </div>
                );
              })}

              {/* 今日の縦線 */}
              {showToday && (
                <div style={{ position:"absolute", top:0, bottom:0, left: todayOff * DAY_W + DAY_W / 2, width:0, borderLeft:"2px dashed #e53935", zIndex:10, pointerEvents:"none" }} />
              )}
            </div>
          </div>

        </div>
      )}

      {/* ─── 編集 / 追加 モーダル ─── */}
      {modalOpen && (
        <div
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"flex-end" }}
          onClick={closeModal}
        >
          <div
            style={{ background:C.card, borderRadius:"20px 20px 0 0", width:"100%", maxHeight:"88vh", overflowY:"auto", paddingBottom:28 }}
            onClick={e => e.stopPropagation()}
          >
            {/* ドラッグハンドル */}
            <div style={{ width:36, height:4, background:C.border, borderRadius:4, margin:"12px auto 0" }} />

            <div style={{ padding:"16px 16px 0" }}>
              {/* モーダルヘッダー */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
                <div style={{ fontWeight:700, fontSize:16, color:C.text, display:"flex", alignItems:"center", gap:7 }}>
                  <CalendarDays size={17} color={C.primary} strokeWidth={2} />
                  {showAdd ? "新しい計画を登録" : "計画を編集"}
                </div>
                <button onClick={closeModal} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 10px", cursor:"pointer", color:C.textSub, display:"flex" }}>
                  <X size={16} strokeWidth={2} />
                </button>
              </div>

              {/* フォーム */}
              <div style={{ ...lbl }}><ClipboardList size={13} strokeWidth={2} />計画名 *</div>
              <input
                style={inp}
                placeholder="例: 2025年 ぶどう栽培"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />

              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={lbl}><Leaf size={13} strokeWidth={2} />作物（任意）</div>
                  <select style={sel} value={form.crop_id} onChange={e => setForm(f => ({ ...f, crop_id: Number(e.target.value) }))}>
                    <option value={0}>未指定</option>
                    {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={lbl}><MapPin size={13} strokeWidth={2} />圃場（任意）</div>
                  <select style={sel} value={form.field} onChange={e => setForm(f => ({ ...f, field: e.target.value }))}>
                    <option value="">未指定</option>
                    {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={lbl}><CalendarDays size={13} strokeWidth={2} />開始日</div>
                  <input type="date" style={{ ...inp, maxWidth:"100%" }} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={lbl}><CalendarDays size={13} strokeWidth={2} />終了予定日</div>
                  <input type="date" style={{ ...inp, maxWidth:"100%" }} value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>

              {errMsg && (
                <div style={{ background:C.dangerBg, color:C.danger, borderRadius:8, padding:"8px 12px", fontSize:13, marginBottom:12 }}>{errMsg}</div>
              )}

              {/* ボタン */}
              <div style={{ display:"flex", gap:8 }}>
                <button
                  style={{ ...btn, flex:1, width:"auto", opacity: submitting ? 0.7 : 1 }}
                  onClick={showAdd ? handleAdd : handleSave}
                  disabled={submitting}
                >
                  {submitting ? <><RefreshCw size={16} strokeWidth={2} />保存中...</> : <><Save size={16} strokeWidth={2} />{showAdd ? "追加する" : "保存する"}</>}
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
