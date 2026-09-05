// .env 系ファイルと環境変数から Supabase の接続情報を拾う。
// 依存を増やさないための最小実装（dotenv は入れない）。
// scripts/rls-verify.mjs と scripts/seed-demo-reports.mjs が共用する。

import { readFileSync, existsSync } from "node:fs";

const fromFiles = {};
for (const f of [".env.local", ".env", "expo-prototype/.env.local", "expo-prototype/.env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) fromFiles[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}

/** 環境変数を優先し、無ければ .env 系ファイルから拾う */
export const pickEnv = (...names) =>
  names.map(n => process.env[n] ?? fromFiles[n]).find(Boolean);

/** Supabase の URL と anon キー。見つからなければ理由を出して終了する */
export function supabaseConfig() {
  const url  = pickEnv("SUPABASE_URL", "VITE_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL");
  const anon = pickEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anon) {
    console.error(
      "Supabase の接続情報が見つかりません。\n" +
      "  .env.local に VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を置くか、\n" +
      "  SUPABASE_URL= / SUPABASE_ANON_KEY= を環境変数で渡してください。"
    );
    process.exit(1);
  }
  return { url, anon };
}
