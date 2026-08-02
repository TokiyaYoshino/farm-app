import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C } from "../ui/tokens";
import Btn from "../ui/Btn";
import { useStore } from "../lib/store";

// ─── ログイン（src/App.tsx の Auth ゲート内ログインフォームの移植）───────
// ユーザーID(login_id) + パスワード。下線入力・primary ピルボタン。
export default function LoginScreen() {
  const { login } = useStore();
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    if (!loginId.trim() || !loginPass.trim()) return;
    setBusy(true);
    setError("");
    const err = await login(loginId, loginPass);
    if (err) setError(err);
    setBusy(false);
  };

  const underline = (hasError: boolean) => ({
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: hasError ? C.danger : C.border,
    fontSize: 15,
    color: C.text,
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <View style={{ width: "100%", maxWidth: 360 }}>
        <View style={{ marginBottom: 40 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: C.text, marginBottom: 6 }}>農作業レポート</Text>
          <Text style={{ fontSize: 14, color: C.textMuted }}>ログイン</Text>
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: C.textMuted, marginBottom: 8 }}>ユーザーID</Text>
          <TextInput
            style={underline(!!error)}
            placeholder="例: kishu-001"
            placeholderTextColor={C.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            value={loginId}
            onChangeText={v => { setLoginId(v); setError(""); }}
          />
        </View>

        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: C.textMuted, marginBottom: 8 }}>パスワード</Text>
          <View style={{ position: "relative" }}>
            <TextInput
              secureTextEntry={!showPass}
              style={[underline(!!error), { paddingRight: 40 }]}
              placeholder="パスワード"
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
              value={loginPass}
              onChangeText={v => { setLoginPass(v); setError(""); }}
              onSubmitEditing={handleLogin}
            />
            <Pressable
              onPress={() => setShowPass(p => !p)}
              style={{ position: "absolute", right: 0, top: 0, bottom: 0, justifyContent: "center" }}
            >
              <Feather name={showPass ? "eye-off" : "eye"} size={18} color={C.textMuted} />
            </Pressable>
          </View>
        </View>

        {!!error && <Text style={{ color: C.danger, fontSize: 13, marginBottom: 16 }}>{error}</Text>}

        <Btn variant="primary" size="lg" onPress={handleLogin}>
          {busy ? "ログイン中..." : "ログイン"}
        </Btn>
      </View>
    </KeyboardAvoidingView>
  );
}
