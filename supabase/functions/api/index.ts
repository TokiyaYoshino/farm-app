// アプリ（Expo版）から呼ぶサーバー処理の入口（Supabase Edge Function / Deno）
//
// Vercel の api/*.ts を移したもの（docs/decisions/20261025-expo-primary-web-freeze-vercel-exit.md）。
// 1つの関数にまとめ、URL の末尾で振り分ける。関数名が api なので URL は
//   https://<プロジェクトref>.supabase.co/functions/v1/api/generate-report
// になり、アプリ側のパス（/api/generate-report）を変えずに土台 URL だけ差し替えられる。
//
// 各ハンドラは Vercel と同じ (req, res) の形のまま _shared/ に置き、ここで Deno の
// Request / Response と変換する。認証は各ハンドラの requireUser（_shared/auth.ts）が行うので、
// デプロイは --no-verify-jwt（手順は docs/supabase-ops.md）。
//
// デプロイ: supabase functions deploy api --no-verify-jwt

import type { ApiRequest, ApiResponse } from "../_shared/types.ts";
import advise from "../_shared/advise.ts";
import diagnoseImage from "../_shared/diagnose-image.ts";
import generateReport from "../_shared/generate-report.ts";
import pestControlAdvice from "../_shared/pest-control-advice.ts";
import pesticideRegistration from "../_shared/pesticide-registration.ts";
import searchChat from "../_shared/search-chat.ts";
import structureVoice from "../_shared/structure-voice.ts";

type Handler = (req: ApiRequest, res: ApiResponse) => Promise<unknown> | unknown;

export const routes: Record<string, Handler> = {
  "advise": advise,
  "diagnose-image": diagnoseImage,
  "generate-report": generateReport,
  "pest-control-advice": pestControlAdvice,
  "pesticide-registration": pesticideRegistration,
  "search-chat": searchChat,
  "structure-voice": structureVoice,
};

/** Request を (req, res) 形式のハンドラに渡し、書かれた結果を Response にして返す */
export async function handle(request: Request): Promise<Response> {
  const name = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const handler = Object.hasOwn(routes, name) ? routes[name] : undefined;
  if (!handler) return Response.json({ error: "not found" }, { status: 404 });

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  let body: Record<string, unknown> | undefined;
  if (request.method === "POST") {
    try {
      const parsed = await request.json();
      body = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
    } catch {
      return Response.json({ error: "invalid json" }, { status: 400 });
    }
  }

  let out: Response | null = null;
  const res: ApiResponse = {
    status(code: number) {
      return {
        json(payload: unknown) { out = Response.json(payload, { status: code }); },
        end() { out = new Response(null, { status: code }); },
      };
    },
  };

  try {
    await handler({ method: request.method, body, headers }, res);
  } catch (e) {
    console.error(`api/${name} failed:`, e);
    return Response.json({ error: "サーバーでエラーが発生しました。" }, { status: 500 });
  }
  return out ?? Response.json({ error: "empty response" }, { status: 500 });
}

// テスト（Node）から import したときはサーバーを立てない
const runtime = globalThis as { Deno?: { serve(h: (r: Request) => Promise<Response>): unknown } };
if (runtime.Deno) runtime.Deno.serve(handle);
