-- 非AI出力系エンドポイント（notify-line・search-chat等）の呼び出し回数を数えるための
-- 汎用ログ（セキュリティ監査対応）。
--
-- ── なぜ要るか ───────────────────────────────────────────────
--
-- 既存の checkDailyLimit（api/_auth.ts）は ai_outputs テーブルへの記録件数を数える
-- 前提だが、ai_outputs は「AI機能の出力監査ログ」という別目的の表であり、
-- 次の2エンドポイントはそこに記録していないため事実上レート制限が無かった：
--
--   1. api/notify-line.ts … AI機能ではない（OpenAIを呼ばない）ため、そもそも対象外
--   2. api/search-chat.ts … 「保存実装が無いので数に入らない」と意図的に除外されていた
--
-- ai_outputs にこれらの回数を混ぜて記録すると、AI出力の監査ログという意味が
-- 汚染される（分析タブの「AI出力履歴」等に無関係な行が混ざる）。そのため
-- 汎用の api_call_log を新設し、kind列で用途を区別して数える。
--
-- （2026-09-21: 当初 notify-line 専用の notification_send_log として作ったが、
--  同日中に search-chat にも同じ仕組みが要ることが分かったため、対象を汎用化した
--  上でこちらに統合した。notification_send_log は本番未適用のため置き換えでよい）
--
-- ── 設計 ─────────────────────────────────────────────────────
--
-- 通常のクライアント（anon/authenticated）からはこの表を直接読み書きする必要が
-- 無い（各APIハンドラがservice_roleキーで数える・記録するだけ）。ポリシーを
-- 1本も作らないことで、authenticated/anonからは常に0件・書き込み不可にする
-- （RLSはデフォルトdeny。service_roleキーはRLSをバイパスするので影響を受けない）。
--
-- Supabase SQL Editor で実行する。

create table if not exists public.api_call_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  created_by      bigint references public.users(id),
  kind            text not null, -- 'notify_line' | 'search_chat' など
  created_at      timestamptz not null default now()
);

create index if not exists api_call_log_created_by_kind_created_idx
  on public.api_call_log (created_by, kind, created_at desc);

alter table public.api_call_log enable row level security;
-- 意図的にポリシーを1本も作らない（= authenticated/anonからは常に空・書き込み不可）。

-- ── 適用後の確認 ─────────────────────────────────────────────
--
--   select relrowsecurity from pg_class where relname = 'api_call_log';
--   -- 期待: true
--
--   select count(*) from pg_policies where tablename = 'api_call_log';
--   -- 期待: 0（ポリシーが無いことを確認。0本でもRLS有効ならauthenticated/anonは常に0件）
