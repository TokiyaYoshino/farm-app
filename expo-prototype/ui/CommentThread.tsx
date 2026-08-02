import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C } from "./tokens";
import { useStore } from "../lib/store";
import type { Comment } from "../lib/types";

// ─── コメントスレッド（src/ui/CommentThread.tsx の移植・実データ）────────
// 吹き出し（自分=緑塗り右寄せ・他人=灰左寄せ）、@メンション候補、入力ピル。
// 読み込み・投稿・自分のコメント編集は Supabase 経由（store の CRUD を使用）。
interface Props {
  targetType: "report" | "schedule";
  targetId: string;
}

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function CommentThread({ targetType, targetId }: Props) {
  const { currentUser, users, userName, loadComments, addComment, editComment } = useStore();
  const currentUserId = currentUser?.id ?? 0;

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadComments(targetType, targetId).then(list => {
      if (alive) { setComments(list); setLoading(false); }
    });
    return () => { alive = false; };
  }, [targetType, targetId]);

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await addComment(targetType, targetId, text.trim());
    if (ok) {
      setComments(await loadComments(targetType, targetId));
      setText("");
    }
    setSending(false);
  };

  const saveEdit = async () => {
    if (!editingId || !editingText.trim()) return;
    const ok = await editComment(editingId, editingText.trim());
    if (ok) {
      setComments(prev => prev.map(cm => cm.id === editingId ? { ...cm, message: editingText.trim() } : cm));
      setEditingId(null);
      setEditingText("");
    }
  };

  // ── @メンション（入力補完＋吹き出し内ハイライト）──
  const mentionUsers = users.filter(u => u.role !== "viewer");
  const userNameSet = new Set(mentionUsers.map(u => u.name));
  const mentionMatch = text.match(/@([^\s@]*)$/);
  const mentionCandidates = mentionMatch
    ? mentionUsers.filter(u => u.id !== currentUserId && (mentionMatch[1] === "" || u.name.includes(mentionMatch[1]))).slice(0, 4)
    : [];
  const insertMention = (name: string) => setText(t => t.replace(/@[^\s@]*$/, `@${name} `));

  const renderMessage = (msg: string, mine: boolean) => {
    const parts = msg.split(/(@[^\s@]+)/g);
    return parts.map((p, i) =>
      p.startsWith("@") && userNameSet.has(p.slice(1))
        ? <Text key={i} style={{ fontWeight: "700", textDecorationLine: "underline", color: mine ? "#fff" : C.ink }}>{p}</Text>
        : <Text key={i}>{p}</Text>
    );
  };

  return (
    <View style={{ marginTop: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 }}>
        <Feather name="message-square" size={13} color={C.textSub} />
        <Text style={{ fontSize: 12, fontWeight: "700", color: C.textSub }}>
          コメント{comments.length > 0 ? ` ${comments.length}件` : ""}
        </Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 8, alignItems: "flex-start" }}>
          <ActivityIndicator size="small" color={C.textMuted} />
        </View>
      ) : comments.length === 0 ? (
        <Text style={{ fontSize: 12, color: C.textMuted, paddingTop: 4, paddingBottom: 12 }}>まだコメントはありません</Text>
      ) : (
        <View style={{ gap: 8, marginBottom: 12 }}>
          {comments.map(cm => {
            const isMe = cm.user_id === currentUserId;
            return (
              <View key={cm.id} style={{ flexDirection: isMe ? "row-reverse" : "row", gap: 8 }}>
                <View style={{ maxWidth: "78%" }}>
                  <Text style={{
                    fontSize: 10, color: C.textMuted, marginBottom: 3,
                    textAlign: isMe ? "right" : "left",
                    marginRight: isMe ? 4 : 0, marginLeft: isMe ? 0 : 4,
                  }}>
                    {userName(cm.user_id)} · {fmtTime(cm.created_at)}
                  </Text>
                  {editingId === cm.id ? (
                    <View style={{ gap: 5 }}>
                      <TextInput
                        autoFocus multiline value={editingText} onChangeText={setEditingText}
                        style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: C.hairline, fontSize: 13, lineHeight: 19, backgroundColor: C.card, color: C.text, minHeight: 56, textAlignVertical: "top" }}
                      />
                      <View style={{ flexDirection: "row", gap: 5, justifyContent: "flex-end" }}>
                        <Pressable onPress={() => { setEditingId(null); setEditingText(""); }}
                          style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.well, flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Feather name="x" size={11} color={C.textSub} />
                          <Text style={{ color: C.textSub, fontSize: 12, fontWeight: "600" }}>キャンセル</Text>
                        </Pressable>
                        <Pressable onPress={saveEdit}
                          style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: editingText.trim() ? C.ink : C.well, flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Feather name="check" size={11} color={editingText.trim() ? "#fff" : C.textMuted} />
                          <Text style={{ color: editingText.trim() ? "#fff" : C.textMuted, fontSize: 12, fontWeight: "700" }}>保存</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 4 }}>
                      <View style={{
                        paddingVertical: 8, paddingHorizontal: 11,
                        borderTopLeftRadius: 12, borderTopRightRadius: 12,
                        borderBottomLeftRadius: isMe ? 12 : 2, borderBottomRightRadius: isMe ? 2 : 12,
                        backgroundColor: isMe ? C.ink : C.well,
                      }}>
                        <Text style={{ fontSize: 13, lineHeight: 19, color: isMe ? "#fff" : C.text }}>
                          {renderMessage(cm.message, isMe)}
                        </Text>
                      </View>
                      {isMe && (
                        <Pressable onPress={() => { setEditingId(cm.id); setEditingText(cm.message); }} style={{ padding: 2 }}>
                          <Feather name="edit-2" size={12} color={C.textMuted} />
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* メンション候補 */}
      {mentionCandidates.length > 0 && (
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {mentionCandidates.map(u => (
            <Pressable key={u.id} onPress={() => insertMention(u.name)}
              style={{ borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: C.inkSoft }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.ink }}>@{u.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* 入力欄 */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999, fontSize: 14, backgroundColor: C.well, color: C.text }}
          placeholder="コメントを入力..."
          placeholderTextColor={C.textMuted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
        />
        <Pressable
          onPress={submit}
          style={{ width: 42, height: 42, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: text.trim() ? C.ink : C.well }}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Feather name="send" size={15} color={text.trim() ? "#fff" : C.textMuted} />}
        </Pressable>
      </View>
    </View>
  );
}
