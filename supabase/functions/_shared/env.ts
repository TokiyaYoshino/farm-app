// 環境変数の読み出し（Supabase Edge Function = Deno と、テスト = Node の両方で動かす）
//
// 本番は Deno.env。SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は Edge Functions の実行環境に
// 最初から入っている。OPENAI_API_KEY はダッシュボードの Edge Functions > Secrets で登録する。
// scripts/test-*.mjs は Node で動くので process.env から読む。

type Runtime = {
  Deno?: { env: { get(name: string): string | undefined } };
  process?: { env: Record<string, string | undefined> };
};

export function env(name: string): string | undefined {
  const g = globalThis as Runtime;
  if (g.Deno) return g.Deno.env.get(name);
  return g.process?.env[name];
}
