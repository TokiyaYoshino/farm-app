import { useState, useEffect } from "react";
import { MessageSquare, Send, RefreshCw, Pencil, Check, X } from "lucide-react";
import { C } from "./tokens";

// ─── コメントスレッド（吹き出し＋入力欄）──────────────────────
// 記録・予定の詳細シートに埋め込む。読み込み・投稿・自分のコメント編集。
export type ThreadComment = {
  id: string;
  target_type: string;
  target_id: string;
  user_id: number;
  message: string;
  created_at: string;
};

interface Props {
  targetType: "report" | "schedule";
  targetId: string;
  currentUserId: number;
  userName: (id: number) => string;
  users?: { id: number; name: string }[];  // @メンション候補（省略時はメンション補完なし）
  onLoad: (targetType: string, targetId: string) => Promise<ThreadComment[]>;
  onAdd: (targetType: string, targetId: string, message: string) => Promise<boolean>;
  onEdit: (id: string, message: string) => Promise<boolean>;
}

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function CommentThread({ targetType, targetId, currentUserId, userName, users = [], onLoad, onAdd, onEdit }: Props) {
  const [comments, setComments] = useState<ThreadComment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState("");
  const [sending, setSending]   = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    onLoad(targetType, targetId).then(list => { if (alive) { setComments(list); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onAdd(targetType, targetId, text.trim());
    if (ok) {
      setComments(await onLoad(targetType, targetId));
      setText("");
    }
    setSending(false);
  };

  const saveEdit = async () => {
    if (!editingId || !editingText.trim()) return;
    const ok = await onEdit(editingId, editingText.trim());
    if (ok) {
      setComments(prev => prev.map(cm => cm.id === editingId ? { ...cm, message: editingText.trim() } : cm));
      setEditingId(null); setEditingText("");
    }
  };

  // ── @メンション（入力補完＋吹き出し内ハイライト）──
  const userNameSet = new Set(users.map(u => u.name));
  const mentionMatch = text.match(/@([^\s@]*)$/);
  const mentionCandidates = mentionMatch
    ? users.filter(u => u.id !== currentUserId && (mentionMatch[1] === "" || u.name.includes(mentionMatch[1]))).slice(0, 4)
    : [];
  const insertMention = (name: string) => setText(t => t.replace(/@[^\s@]*$/, `@${name} `));

  const renderMessage = (msg: string, mine: boolean) => {
    const parts = msg.split(/(@[^\s@]+)/g);
    return parts.map((p, i) =>
      p.startsWith("@") && userNameSet.has(p.slice(1))
        ? <span key={i} style={{ fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2, color: mine ? "#fff" : C.ink }}>{p}</span>
        : p
    );
  };

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textSub, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
        <MessageSquare size={13} strokeWidth={2} />コメント{comments.length > 0 ? ` ${comments.length}件` : ""}
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: C.textMuted, padding: "8px 0 12px" }}>読み込み中...</div>
      ) : comments.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, padding: "4px 0 12px" }}>まだコメントはありません</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {comments.map(cm => {
            const isMe = cm.user_id === currentUserId;
            return (
              <div key={cm.id} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", gap: 8 }}>
                <div style={{ maxWidth: "78%" }}>
                  <div style={{ fontSize: 10, color: C.textMuted, margin: isMe ? "0 4px 3px 0" : "0 0 3px 4px", textAlign: isMe ? "right" : "left" }}>
                    {userName(cm.user_id)} · {fmtTime(cm.created_at)}
                  </div>
                  {editingId === cm.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <textarea
                        autoFocus value={editingText} onChange={e => setEditingText(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: `1px solid ${C.hairline}`, fontSize: 13, lineHeight: 1.5, resize: "none", background: C.card, color: C.text, minHeight: 56, boxSizing: "border-box" }}
                      />
                      <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                        <button onClick={() => { setEditingId(null); setEditingText(""); }}
                          style={{ padding: "5px 12px", borderRadius: 999, border: "none", background: C.well, color: C.textSub, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                          <X size={11} strokeWidth={2} />キャンセル
                        </button>
                        <button onClick={saveEdit} disabled={!editingText.trim()}
                          style={{ padding: "5px 12px", borderRadius: 999, border: "none", background: editingText.trim() ? C.ink : C.well, color: editingText.trim() ? "#fff" : C.textMuted, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                          <Check size={11} strokeWidth={2.5} />保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                      <div style={{
                        fontSize: 13, padding: "8px 11px",
                        borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                        background: isMe ? C.ink : C.well,
                        color: isMe ? "#fff" : C.text,
                        lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {renderMessage(cm.message, isMe)}
                      </div>
                      {isMe && (
                        <button onClick={() => { setEditingId(cm.id); setEditingText(cm.message); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: 2, display: "flex", flexShrink: 0 }}>
                          <Pencil size={12} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* メンション候補 */}
      {mentionCandidates.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {mentionCandidates.map(u => (
            <button key={u.id} onClick={() => insertMention(u.name)}
              style={{ border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600, background: C.inkSoft, color: C.ink, cursor: "pointer" }}>
              @{u.name}
            </button>
          ))}
        </div>
      )}

      {/* 入力欄 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          style={{ flex: 1, padding: "11px 16px", borderRadius: 999, border: "none", fontSize: 14, background: C.well, color: C.text, boxSizing: "border-box", outline: "none" }}
          placeholder="コメントを入力..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && submit()}
        />
        <button
          onClick={submit}
          disabled={!text.trim() || sending}
          style={{ width: 42, height: 42, borderRadius: 999, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: text.trim() ? C.ink : C.well, color: text.trim() ? "#fff" : C.textMuted, flexShrink: 0 }}
        >
          {sending ? <RefreshCw size={15} strokeWidth={2} /> : <Send size={15} strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}
