// ─── Supabase クライアント（RN版）──────────────────────────────────
// Web版 src/App.tsx の createClient に相当。RN では
// - URL ポリフィルが必要（Hermes に URL 実装が無い）
// - セッション永続化先を AsyncStorage に指定する
// 環境変数は EXPO_PUBLIC_ プレフィックス（.env に置く。値は Web 版と同じ
// Supabase プロジェクトの URL / anon key。リポジトリには含めない）
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

export const hasSupabaseConfig = !!(supabaseUrl && supabaseAnonKey);

// サーバー処理（AI・農薬登録情報）の土台URL。Supabase Edge Function `api`
// （supabase/functions/api/index.ts）に載っていて、`${API_BASE}/api/generate-report` のように呼ぶ。
// 2026-10-25 まで Vercel（kishu-farm.vercel.app）だった（docs/decisions/20261025-expo-primary-web-freeze-vercel-exit.md）。
// EXPO_PUBLIC_API_BASE はローカルの `supabase functions serve` を向けるときだけ使う
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? `${supabaseUrl}/functions/v1`;

export const supabase = createClient(
  supabaseUrl ?? "http://localhost",
  supabaseAnonKey ?? "anon",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // RN にはリダイレクトURLが無いため必須
      detectSessionInUrl: false,
    },
  },
);
