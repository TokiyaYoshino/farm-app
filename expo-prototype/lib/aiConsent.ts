import { Alert, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── 外部のAIに送る前の同意（App Store 審査ガイドライン 5.1.2(i)・2025-11 追加）─────
// 個人データを外部のAIに送るときは、アプリの中で知らせて、送る前に同意をもらう必要がある。
// プライバシーポリシーに書くだけでは足りない。インストール後の最初の画面（screens/AiConsentScreen.tsx・
// 紹介より前）で1回聞く。断った人には、AIの機能を押したときに callApi（lib/ai.ts）でもう一度聞く。
// 同意は利用者ごとに端末へ残す（2026-10-17）。
// 注意書きなので「AI」の語を出してよい（CLAUDE.md「AI機能の見せ方」）。

const key = (userId: string) => `aiConsent_${userId}`;
const askedKey = (userId: string) => `aiConsentAsked_${userId}`;
let pending: Promise<boolean> | null = null;

export const PRIVACY_URL = "https://kishu-farm.vercel.app/privacy.html";

export async function hasAiConsent(userId: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(key(userId))) === "1"; } catch { return false; }
}

/** 最初の画面で一度でも答えたか（同意・不同意どちらでも） */
export async function wasAiConsentAsked(userId: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(askedKey(userId))) === "1"; } catch { return false; }
}

export async function setAiConsent(userId: string, agreed: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(askedKey(userId), "1");
    if (agreed) await AsyncStorage.setItem(key(userId), "1");
    else await AsyncStorage.removeItem(key(userId));
  } catch { /* 保存に失敗しても、使うときにもう一度聞く */ }
}

export async function revokeAiConsent(userId: string): Promise<void> {
  try { await AsyncStorage.removeItem(key(userId)); } catch { /* 端末の保存に失敗しても次回また聞くだけ */ }
}

/** 同意済みなら true。未同意なら確認を出し、選んだ結果を返す。同時に呼ばれても確認は1つだけ出す */
export async function ensureAiConsent(userId: string): Promise<boolean> {
  if (await hasAiConsent(userId)) return true;
  if (pending) return pending;
  pending = new Promise<boolean>(resolve => {
    Alert.alert(
      "外部のAIに送ります",
      "記録を OpenAI に送って答えを作ります。\n学習には使われません。",
      [
        { text: "プライバシーポリシー", onPress: () => { void Linking.openURL(PRIVACY_URL); resolve(false); } },
        { text: "送らない", style: "cancel", onPress: () => resolve(false) },
        {
          text: "同意して使う",
          onPress: () => {
            void setAiConsent(userId, true);
            resolve(true);
          },
        },
      ],
      { cancelable: false },
    );
  }).finally(() => { pending = null; });
  return pending;
}
