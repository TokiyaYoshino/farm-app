import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW, RADIUS } from "../ui/tokens";
import Btn from "../ui/Btn";
import { useStore } from "../lib/store";

// ─── 起動直後の案内と農場の新規登録（Web版 src/components/Onboarding.tsx の移植）───
//
// ストアからDLした人には「何のアプリか」も「アカウントの作り方」も見えていなかった。
// 経緯と範囲は docs/decisions/20260922-onboarding-and-signup.md
//
// **紹介は操作手順を教えない。** どこを押すかを書き始めると
// docs/decisions/20260824-no-manual-test.md が最後の手段に置いた「説明書」になる。
//
// Web版にある「デモを見る」はここには無い。審査員には申請時の備考で
// デモアカウントを渡す（docs/app-store-submission.md 手順6）ので、
// 端末側に偽データを同梱する必要がない。

export type OnboardingStep = "welcome" | "tour" | "signup";

interface Props {
  step: OnboardingStep;
  onStep: (s: OnboardingStep) => void;
  onLogin: () => void;
}

const TOUR = [
  {
    icon: "clipboard" as const,
    title: "その日の作業記録",
    body: "作業の内容・写真・使った農薬を、その場で残せます。あとから日付をさかのぼって直すこともできます。",
  },
  {
    icon: "shield" as const,
    title: "農薬の使いすぎ防止",
    body: "農薬の登録情報と自分の記録を照らし合わせて、総使用回数を超えている疑いがあるときに知らせます。",
  },
  {
    icon: "message-circle" as const,
    title: "畑のことの相談",
    body: "前回の散布からの日数や、今年の作業の回数をふまえた答えが返ります。天気と国の防除資料も見ています。",
  },
];

export default function OnboardingScreen({ step, onStep, onLogin }: Props) {
  const { signup } = useStore();
  const [slide, setSlide] = useState(0);
  const [farmName, setFarmName] = useState("");
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const underline = {
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: C.hairline,
    fontSize: 15,
    color: C.text,
  };
  const lbl = { fontSize: 12, fontWeight: "600" as const, color: C.textMuted, marginBottom: 8 };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const msg = await signup({ farm_name: farmName, name, login_id: loginId, password });
    if (msg) setError(msg);
    setBusy(false);
  };

  // ── ようこそ ───────────────────────────────────────────────
  if (step === "welcome") return (
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", padding: 24 }}>
      <View style={{ width: "100%", maxWidth: 360, alignSelf: "center" }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: C.text, marginBottom: 10 }}>農作業レポート</Text>
        <Text style={{ fontSize: 15, color: C.textSub, lineHeight: 27, marginBottom: 40 }}>
          その日の作業を残す。{"\n"}農薬の使いすぎを防ぐ。{"\n"}畑のことを相談する。
        </Text>

        <Btn onPress={() => { setSlide(0); onStep("tour"); }} style={{ marginBottom: 12 }}>はじめる</Btn>
        <Btn variant="secondary" onPress={onLogin} style={{ marginBottom: 12 }}>ログイン</Btn>
      </View>
    </View>
  );

  // ── 紹介（3枚）─────────────────────────────────────────────
  if (step === "tour") {
    const { icon, title, body } = TOUR[slide];
    const last = slide === TOUR.length - 1;
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", padding: 24 }}>
        <View style={{ width: "100%", maxWidth: 360, alignSelf: "center" }}>
          <View style={[{
            backgroundColor: C.card, borderRadius: RADIUS.card,
            paddingVertical: 36, paddingHorizontal: 24, marginBottom: 24, alignItems: "center",
          }, SHADOW.card]}>
            <View style={{
              width: 64, height: 64, borderRadius: 999, backgroundColor: C.inkSoft,
              alignItems: "center", justifyContent: "center", marginBottom: 20,
            }}>
              <Feather name={icon} size={28} color={C.ink} />
            </View>
            <Text style={{ fontSize: 19, fontWeight: "700", color: C.text, marginBottom: 12, textAlign: "center" }}>{title}</Text>
            <Text style={{ fontSize: 14, color: C.textSub, lineHeight: 25, textAlign: "center" }}>{body}</Text>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 24 }}>
            {TOUR.map((_, i) => (
              <View key={i} style={{
                width: i === slide ? 18 : 6, height: 6, borderRadius: 999,
                backgroundColor: i === slide ? C.ink : C.hairline,
              }} />
            ))}
          </View>

          <Btn
            onPress={() => (last ? onStep("signup") : setSlide(s => s + 1))}
            style={{ marginBottom: 12 }}
          >
            {last ? "農場を登録する" : "次へ"}
          </Btn>
          <Btn variant="tertiary" size="md" onPress={() => onStep("signup")}>とばす</Btn>
        </View>
      </View>
    );
  }

  // ── 農場の新規登録 ─────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: C.bg }}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: "100%", maxWidth: 360, alignSelf: "center" }}>
          <View style={{ marginBottom: 32 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: C.text, marginBottom: 6 }}>農場の登録</Text>
            <Text style={{ fontSize: 13, color: C.textMuted, lineHeight: 22 }}>
              最初に登録した方が管理者になります。作業者はあとからメニューで追加できます。
            </Text>
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={lbl}>農場の名前</Text>
            <TextInput
              style={underline} placeholder="例: みどり農園" placeholderTextColor={C.textMuted}
              value={farmName} onChangeText={v => { setFarmName(v); setError(""); }}
            />
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={lbl}>お名前</Text>
            <TextInput
              style={underline} placeholder="例: 山田 太郎" placeholderTextColor={C.textMuted}
              value={name} onChangeText={v => { setName(v); setError(""); }}
            />
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={lbl}>ユーザーID</Text>
            <TextInput
              style={underline} placeholder="英小文字・数字で3文字以上" placeholderTextColor={C.textMuted}
              autoCapitalize="none" autoCorrect={false}
              value={loginId} onChangeText={v => { setLoginId(v); setError(""); }}
            />
            <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>次回からこのIDでログインします</Text>
          </View>

          <View style={{ marginBottom: 28 }}>
            <Text style={lbl}>パスワード</Text>
            <View style={{ position: "relative" }}>
              <TextInput
                style={[underline, { paddingRight: 40 }]} placeholder="8文字以上" placeholderTextColor={C.textMuted}
                secureTextEntry={!showPass} autoCapitalize="none" autoCorrect={false}
                value={password} onChangeText={v => { setPassword(v); setError(""); }}
              />
              <Pressable
                onPress={() => setShowPass(p => !p)}
                style={{ position: "absolute", right: 0, top: 8, padding: 6 }}
                hitSlop={8}
              >
                <Feather name={showPass ? "eye-off" : "eye"} size={18} color={C.textMuted} />
              </Pressable>
            </View>
          </View>

          {!!error && <Text style={{ color: C.danger, fontSize: 13, marginBottom: 16, lineHeight: 21 }}>{error}</Text>}

          <Btn onPress={submit} style={{ marginBottom: 12, opacity: busy ? 0.7 : 1 }}>
            {busy ? "登録中..." : "登録する"}
          </Btn>
          <Btn variant="tertiary" size="md" onPress={onLogin}>アカウントをお持ちの方はこちら</Btn>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
