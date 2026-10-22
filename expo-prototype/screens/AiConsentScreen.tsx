import { View, Text, Pressable, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, RADIUS } from "../ui/tokens";
import Btn from "../ui/Btn";
import { PRIVACY_URL } from "../lib/aiConsent";

// ─── 外部のAIへの送信の同意（インストール後の最初の1回・紹介より前）──────────────
// 審査ガイドライン 5.1.2(i)。送る前に、アプリの中で知らせて同意をもらう（lib/aiConsent.ts）。
// 長い説明は置かない。何を・どこへ・学習に使われるか、の3点だけ（オーナー 2026-10-17）。
// 断っても記録などはそのまま使え、AIの機能を押したときにもう一度聞く。

interface Props { onAnswer: (agreed: boolean) => void }

function Row({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: RADIUS.row, paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Feather name={icon} size={18} color={C.textSub} />
      <Text style={{ width: 72, fontSize: 13, fontWeight: "600", color: C.textSub }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: C.text }}>{value}</Text>
    </View>
  );
}

export default function AiConsentScreen({ onAnswer }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.card, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 12, paddingHorizontal: 28 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 26, lineHeight: 37, fontWeight: "700", color: C.text }}>相談や調べものには、{"\n"}外部のAIを使います</Text>
        <View style={{ marginTop: 28, backgroundColor: C.well, borderRadius: RADIUS.well, padding: 6, gap: 6 }}>
          <Row icon="file-text" label="送るもの" value="作業・農薬・メモ・写真" />
          <Row icon="send" label="送り先" value="OpenAI" />
          <Row icon="lock" label="学習" value="使われません" />
        </View>
        <Pressable onPress={() => { void Linking.openURL(PRIVACY_URL); }} accessibilityRole="link" style={{ marginTop: 16, alignSelf: "flex-start", paddingVertical: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.ink }}>プライバシーポリシー</Text>
        </Pressable>
      </View>
      {/* 「同意して始める」だとボタンで同意を迫る形になる。内容を見せたうえで「始める」を押すと同意になる、
          と一言添える形にする（オーナー 2026-10-17）。断る道は下に残す（5.1.2(i) の明示的な許可） */}
      <Text style={{ fontSize: 13, color: C.textSub, textAlign: "center", marginBottom: 12 }}>「始める」を押すと、この内容に同意したことになります</Text>
      <Btn variant="primary" size="lg" onPress={() => onAnswer(true)}>始める</Btn>
      <Pressable onPress={() => onAnswer(false)} accessibilityRole="button" style={{ alignItems: "center", paddingVertical: 14, marginTop: 4 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: C.textSub }}>外部のAIを使わずに始める</Text>
      </Pressable>
    </View>
  );
}
