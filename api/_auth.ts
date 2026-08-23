// /api/* の呼び出し元認証（Vercel Serverless Function 共通）
//
// ファイル名の先頭が "_" のものは Vercel のファイルシステムルーティングの対象外なので、
// これ自体はエンドポイントにならない（/api/_auth は 404）。
//
// ── なぜ必要か ───────────────────────────────────────────────
//
// 2026-08-23 時点で /api/* はすべて無認証だった。実害は2つある。
//
//   1. **OpenAI キーの踏み台**: AI系6本は誰でも叩けた。curl だけで本番の
//      OpenAI エンドポイントが呼べ、料金はこちらに乗る。Free枠の日次上限は
//      docs/roadmap.md に設計があるだけで未実装なので、支出の歯止めが無い
//   2. **アカウントの乗っ取り経路**: set-user-auth.ts は service_role で
//      Auth ユーザーと users 行を作る。無認証だったため、organization_id さえ
//      分かれば誰でも任意の組織に admin を作れた。RLS が allow_all のままで
//      anon キーから organizations を読めるので、その値も入手できてしまう
//
// ── 検証方式 ─────────────────────────────────────────────────
//
// Supabase の /auth/v1/user にトークンを渡して検証する。JWT の署名を自前で
// 検証しない理由は、Supabase が対称鍵(HS256)から非対称鍵(JWKS)へ移行中で、
// プロジェクトごとに署名方式が違いうるため。/auth/v1/user なら方式に依らず
// 正しく検証でき、失効済みトークンも弾ける。往復1回ぶん遅くなるが、
// 後段が数秒かかる LLM 呼び出しなので影響は小さい。
//
// 環境変数: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（既存のものを流用）

import type { ApiRequest, ApiResponse } from "./types";

export interface AuthedUser {
  /** Supabase Auth のユーザーID（JWT の sub） */
  authId: string;
  email: string | null;
}

/** users テーブル側の情報。admin 判定と組織の固定に使う */
export interface AppUser extends AuthedUser {
  userId: number;
  role: string;
  organizationId: string | null;
  name: string | null;
}

type Fail = { ok: false; status: number; error: string };

function bearerOf(req: ApiRequest): string | null {
  const raw = req.headers?.authorization ?? req.headers?.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const m = /^Bearer\s+(.+)$/i.exec(value.trim());
  return m ? m[1].trim() : null;
}

/**
 * ログイン済みユーザーであることだけを確認する。AI系エンドポイントはこれで足りる。
 *
 * service_role キーそのものを Bearer に入れられても通さない。/auth/v1/user が
 * ユーザーを返さない（id が無い）ので下で弾かれる。
 */
export async function requireUser(req: ApiRequest): Promise<{ ok: true; user: AuthedUser } | Fail> {
  const token = bearerOf(req);
  if (!token) return { ok: false, status: 401, error: "認証が必要です。ログインし直してください。" };

  const PROJECT_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!PROJECT_URL || !SERVICE_ROLE) {
    console.error("_auth: missing env VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return { ok: false, status: 500, error: "サーバー設定が不足しています。" };
  }

  try {
    const r = await fetch(`${PROJECT_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { ok: false, status: 401, error: "認証が無効です。ログインし直してください。" };
    const u = await r.json();
    // service_role や anon のキーを渡された場合ここに来る（ユーザーではないので id が無い）
    if (!u?.id || typeof u.id !== "string") {
      return { ok: false, status: 401, error: "認証が無効です。ログインし直してください。" };
    }
    return { ok: true, user: { authId: u.id, email: typeof u.email === "string" ? u.email : null } };
  } catch {
    // 検証できないときは通さない。落ちたら開ける、にすると認証が意味を失う
    return { ok: false, status: 503, error: "認証を確認できませんでした。時間をおいてお試しください。" };
  }
}

/**
 * 管理者であることまで確認し、users 行（所属組織を含む）を返す。
 * ユーザーを作る set-user-auth のように、権限と所属が結果を左右する操作で使う。
 *
 * users 行の解決は auth_id を主にし、取れないときは email で拾う。
 * set-user-auth は両方を書いているが、過去に作られた行で auth_id が
 * 埋まっていない可能性があるため（未確認）、片方だけに依存しない。
 */
export async function requireAdmin(req: ApiRequest): Promise<{ ok: true; user: AppUser } | Fail> {
  const base = await requireUser(req);
  if (!base.ok) return base;

  const PROJECT_URL = process.env.VITE_SUPABASE_URL!;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE };
  const select = "select=id,role,organization_id,name";

  const lookup = async (query: string) => {
    const r = await fetch(`${PROJECT_URL}/rest/v1/users?${query}&${select}`, { headers });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  };

  try {
    let row = await lookup(`auth_id=eq.${encodeURIComponent(base.user.authId)}`);
    if (!row && base.user.email) {
      row = await lookup(`email=eq.${encodeURIComponent(base.user.email)}`);
    }
    if (!row) {
      return { ok: false, status: 403, error: "このアカウントに対応する利用者情報が見つかりません。" };
    }
    if (row.role !== "admin") {
      return { ok: false, status: 403, error: "この操作は管理者のみ実行できます。" };
    }
    return {
      ok: true,
      user: {
        ...base.user,
        userId: row.id,
        role: row.role,
        organizationId: row.organization_id ?? null,
        name: row.name ?? null,
      },
    };
  } catch {
    return { ok: false, status: 503, error: "権限を確認できませんでした。時間をおいてお試しください。" };
  }
}

/** 失敗をそのままレスポンスに変換する。各ハンドラの定型文を減らすため */
export function denied(res: ApiResponse, f: Fail): void {
  res.status(f.status).json({ error: f.error });
}
