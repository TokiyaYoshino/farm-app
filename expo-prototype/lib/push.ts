// ─── プッシュ通知（Expo Push）────────────────────────────────────────
// 端末トークンを device_tokens テーブルに登録し、通知タップで対象を開くための
// ハンドラを提供する。送信側は Supabase Edge Function（supabase/functions/push-comment）が
// comments の INSERT Webhook を受けて Expo Push API を叩く。
//
// 制約: Expo Go（SDK 53+）はリモートプッシュ非対応。開発ビルド / TestFlight で動作する。
// そのためトークン取得の失敗は常に「無効」として扱い、アプリの起動を妨げない。
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// フォアグラウンド受信時もバナーを出す（通知ベルは別途 refetch で更新される）
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 通知に載せるデータ（Edge Function 側と同一の形）
export interface PushPayload {
  target_type?: "report" | "schedule";
  target_id?: string;
  comment_id?: string;
}

/** Expo Push トークンを取得する。権限拒否・Expo Go・シミュレータでは null */
async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  let { granted } = await Notifications.getPermissionsAsync();
  if (!granted) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return null;

  // EAS プロジェクトID。app.json の extra.eas.projectId が入る（EAS Build で必須）
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) return null;

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (e) {
    // Expo Go（SDK53+）はここで throw する。開発を止めないため握りつぶす
    console.warn("Expo push token を取得できませんでした:", e);
    return null;
  }
}

/**
 * トークンを取得して device_tokens に upsert する。
 * 同じ端末で別ユーザーがログインした場合は user_id を上書きする（token が一意キー）。
 */
export async function registerPushToken(
  userId: number,
  organizationId: string | null,
): Promise<string | null> {
  const token = await getExpoPushToken();
  if (!token) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "通知",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#2E7D32",
    });
  }

  const { error } = await supabase.from("device_tokens").upsert(
    {
      token,
      user_id: userId,
      organization_id: organizationId,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );
  if (error) console.error("device_tokens upsert failed:", error);
  return token;
}

/** ログアウト時に自分のトークン行を消す（他人の端末に通知が飛ばないように） */
export async function unregisterPushToken(token: string): Promise<void> {
  const { error } = await supabase.from("device_tokens").delete().eq("token", token);
  if (error) console.error("device_tokens delete failed:", error);
}

/**
 * 通知タップ・フォアグラウンド受信のリスナーを張る。戻り値で解除する。
 * onOpen は「通知をタップして開いた」時のみ呼ぶ（アプリ起動中の受信では呼ばない）。
 */
export function addPushListeners(handlers: {
  onOpen: (payload: PushPayload) => void;
  onReceive?: () => void;
}): () => void {
  const receivedSub = Notifications.addNotificationReceivedListener(() => {
    handlers.onReceive?.();
  });
  const responseSub = Notifications.addNotificationResponseReceivedListener(res => {
    handlers.onOpen((res.notification.request.content.data ?? {}) as PushPayload);
  });
  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}

/** 通知をタップしてコールドスタートした場合の初回ペイロード */
export async function getInitialPushPayload(): Promise<PushPayload | null> {
  const res = await Notifications.getLastNotificationResponseAsync();
  if (!res) return null;
  return (res.notification.request.content.data ?? {}) as PushPayload;
}
