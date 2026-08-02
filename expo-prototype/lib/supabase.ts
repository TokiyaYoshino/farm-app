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
