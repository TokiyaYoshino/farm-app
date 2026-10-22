import { useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, useWindowDimensions, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { C, RADIUS, SHADOW } from "../ui/tokens";
import Btn from "../ui/Btn";
import { WorkTiles } from "../ui/WorkTiles";
import { useStore } from "../lib/store";
import { todayStr } from "../lib/date";

// ─── はじめの紹介（2枚）＋ 最初の畑（必要なときだけ）────────────────
// 紹介は「何ができるか」だけを見せ、操作手順は教えない（docs/decisions/20260824-no-manual-test.md）。
// 3枚目は畑・作物が未登録の管理者にだけ出す（必達タスク①「畑を1つ登録」をここで済ませる）。
// モック: https://claude.ai/artifact/KsqnDxu2UoqihShf8rfdJ1（2-1〜2-3）

const CROP_CHOICES = ["トマト", "きゅうり", "なす", "ピーマン", "ほうれん草", "たまねぎ"];

interface Props {
  onDone: () => void;
  /** 開発中の見た目確認用。最初の畑の画面を必ず出し、登録はしない */
  preview?: boolean;
}

export default function TutorialScreen({ onDone, preview = false }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { crops, fields, isAdmin, addCrop, addField } = useStore();
  const needsSetup = preview || (isAdmin && (crops.length === 0 || fields.length === 0));
  const pageCount = needsSetup ? 3 : 2;

  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [crop, setCrop] = useState("トマト");
  const [otherCrop, setOtherCrop] = useState("");
  const [fieldName, setFieldName] = useState("第1圃場");
  const [saving, setSaving] = useState(false);

  const goTo = (p: number) => {
    scrollRef.current?.scrollTo({ x: p * width, animated: true });
    setPage(p);
  };
  const next = () => (page + 1 < pageCount ? goTo(page + 1) : onDone());
  const skip = () => (needsSetup ? goTo(2) : onDone());

  const finishSetup = async () => {
    if (preview) { onDone(); return; }
    const cropName = (crop === "その他" ? otherCrop : crop).trim();
    if (!cropName || !fieldName.trim()) {
      Alert.alert("入力してください", "作物と畑の呼び名を入れてください");
      return;
    }
    setSaving(true);
    const errs = [
      crops.length === 0 ? await addCrop(cropName, todayStr(), "") : null,
      fields.length === 0 ? await addField(fieldName) : null,
    ].filter(Boolean);
    setSaving(false);
    if (errs.length > 0) { Alert.alert("登録できませんでした", String(errs[0])); return; }
    onDone();
  };

  const dots = (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }} accessibilityLabel={`${pageCount}枚中${page + 1}枚目`}>
      {Array.from({ length: pageCount }, (_, i) => (
        <View key={i} style={{ width: i === page ? 20 : 6, height: 6, borderRadius: 999, backgroundColor: i === page ? C.text : "#D5D6D9" }} />
      ))}
    </View>
  );

  const stage = { marginHorizontal: 20, height: 360, borderRadius: 28, backgroundColor: C.bg, justifyContent: "center" as const, paddingHorizontal: 18 };
  const title = { marginTop: 32, fontSize: 26, lineHeight: 37, fontWeight: "700" as const, color: C.text };
  const body = { marginTop: 10, fontSize: 15, lineHeight: 26, color: "#4A4D52" };

  return (
    <View style={{ flex: 1, backgroundColor: C.card, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }}>
      <View style={{ height: 48, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingHorizontal: 12 }}>
        {page < 2 && (
          <Pressable onPress={skip} style={{ padding: 12 }} accessibilityRole="button">
            <Text style={{ fontSize: 15, fontWeight: "600", color: C.textSub }}>スキップ</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={page < 2}
        onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. 記録する */}
        <View style={{ width }}>
          <View style={[stage, { gap: 14 }]}>
            <View pointerEvents="none"><WorkTiles mode="record" onPick={() => {}} /></View>
            <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, ...SHADOW.card }}>
              <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: C.pesticide }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>防除 · トマト</Text>
                <Text style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>第1圃場 · 晴れ 24℃ · 天気は自動</Text>
              </View>
              <Feather name="check" size={20} color={C.ink} />
            </View>
          </View>
          <View style={{ paddingHorizontal: 28 }}>
            {/* 作業を選んで「記録する」を押す、が実際の動き。「押せばそれで記録になる」だと、作業を押しただけで
                記録したつもりになる（2026-10-17 新人の初日をなぞる確認） */}
            <Text style={title}>記録は、{"\n"}選んで押すだけ</Text>
            <Text style={body}>日付と天気は自動で入ります。手が汚れていても、声で残せます。</Text>
          </View>
        </View>

        {/* 2. 記録が答える */}
        <View style={{ width }}>
          <View style={[stage, { gap: 12 }]}>
            <View style={{ alignSelf: "flex-end", maxWidth: 300, backgroundColor: C.ink, borderRadius: 20, borderBottomRightRadius: 6, paddingVertical: 12, paddingHorizontal: 16 }}>
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600", lineHeight: 24 }}>トマトの前の防除、いつだった？</Text>
            </View>
            <View style={{ alignSelf: "stretch", backgroundColor: C.card, borderRadius: 20, borderBottomLeftRadius: 6, padding: 14, ...SHADOW.card }}>
              <Text style={{ fontSize: 15, lineHeight: 25, color: C.text }}>9月22日、第1圃場。記入者は田中さん。</Text>
              <View style={{ marginTop: 10, backgroundColor: C.well, borderRadius: RADIUS.row, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
                <Text style={{ fontSize: 12, color: C.textSub, fontWeight: "600" }}>この農薬の使用 </Text>
                <Text style={{ fontSize: 22, fontWeight: "700", color: C.text }}>2</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>回目</Text>
                <Text style={{ fontSize: 12, color: C.textSub }}>（ラベルの上限 3回）</Text>
              </View>
              <Text style={{ marginTop: 8, fontSize: 11, color: C.textSub }}>記録とラベルの登録情報から</Text>
            </View>
          </View>
          <View style={{ paddingHorizontal: 28 }}>
            <Text style={title}>聞けば、{"\n"}畑の記録が答える</Text>
            <Text style={body}>誰が聞いても同じ答え。ベテランの記憶違いも、新人の「分からない」も。</Text>
          </View>
        </View>

        {/* 3. 最初の畑（必要なときだけ） */}
        {needsSetup && (
          <View style={{ width, paddingHorizontal: 20 }}>
            <Text style={[title, { marginTop: 12, marginHorizontal: 8 }]}>まず、畑をひとつ</Text>
            <Text style={[body, { marginHorizontal: 8 }]}>ほかの畑と作物は、あとから足せます。</Text>
            <Text style={{ marginTop: 26, marginBottom: 10, marginHorizontal: 8, fontSize: 13, fontWeight: "600", color: C.textSub }}>作っているもの</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[...CROP_CHOICES, "その他"].map(n => {
                const on = crop === n;
                return (
                  <Pressable key={n} onPress={() => setCrop(n)} accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={{ height: 44, paddingHorizontal: 18, borderRadius: 999, justifyContent: "center", backgroundColor: on ? C.ink : C.card, ...(on ? {} : SHADOW.pill) }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: on ? "#fff" : C.text }}>{n}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ marginTop: 22, backgroundColor: C.well, borderRadius: RADIUS.well, padding: 6, gap: 6 }}>
              {crop === "その他" && (
                <View style={{ backgroundColor: C.card, borderRadius: RADIUS.row, paddingVertical: 12, paddingHorizontal: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSub }}>作物の名前</Text>
                  <TextInput value={otherCrop} onChangeText={setOtherCrop} placeholder="例: キャベツ" placeholderTextColor={C.textMuted}
                    style={{ paddingTop: 4, fontSize: 17, fontWeight: "600", color: C.text }} />
                </View>
              )}
              <View style={{ backgroundColor: C.card, borderRadius: RADIUS.row, paddingVertical: 12, paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSub }}>畑の呼び名</Text>
                <TextInput value={fieldName} onChangeText={setFieldName} placeholder="例: 第1圃場" placeholderTextColor={C.textMuted}
                  style={{ paddingTop: 4, fontSize: 17, fontWeight: "600", color: C.text }} />
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, gap: 18 }}>
        {dots}
        {page < 2 ? (
          <Btn variant="primary" size="lg" onPress={next}>{page + 1 < pageCount ? "次へ" : "はじめる"}</Btn>
        ) : (
          <View>
            <Btn variant="primary" size="lg" onPress={finishSetup}>{saving ? "登録中..." : "はじめる"}</Btn>
            <Pressable onPress={onDone} style={{ alignItems: "center", paddingVertical: 12, marginTop: 4 }} accessibilityRole="button">
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.textSub }}>あとで登録する</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
