-- LINE通知のレート制限のための送信ログ（セキュリティ監査対応）。
--
-- ── なぜ要るか ───────────────────────────────────────────────
--
-- api/notify-line.ts は requireAppUser（admin限定ではない）のみで認可され、
-- checkDailyLimit（api/_auth.ts）の呼び出しもmessage長制限も無かった。
-- 組織内の任意の認証済みユーザー（worker含む）が無制限に、かつ任意の長さの
-- メッセージで、組織の実際のLINEグループへスパムを送りつけられる状態だった。
--
-- 既存の checkDailyLimit は ai_outputs テーブルへの記録を前提にしており、
-- ai_outputs は「AI機能の出力監査ログ」という別の目的を持つテーブルなので、
-- LINE通知（AI機能ではない）の回数をそこに書き込むのは意味的に汚染になる。
-- そのため専用の送信ログテーブルを新設する。
--
-- ── 設計 ─────────────────────────────────────────────────────
--
-- 通常のクライアント（anon/authenticated）からはこのテーブルを直接読み書きする
-- 必要が無い（api/notify-line.ts が service_role キーで数える・記録するだけ）。
-- ポリシーを1本も作らないことで、authenticated/anon からは常に0件・書き込み不可に
-- なる（RLSはデフォルトdeny。service_roleキーはRLSをバイパスするので影響を受けない）。
--
-- Supabase SQL Editor で実行する。

create table if not exists public.notification_send_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  created_by      bigint references public.users(id),
  kind            text not null, -- 'line' 等。将来他の通知種別が増えても同じ表で数えられるようにしておく
  created_at      timestamptz not null default now()
);

create index if not exists notification_send_log_created_by_kind_created_idx
  on public.notification_send_log (created_by, kind, created_at desc);

alter table public.notification_send_log enable row level security;
-- 意図的にポリシーを1本も作らない（= authenticated/anonからは常に空・書き込み不可）。

-- ── 適用後の確認 ─────────────────────────────────────────────
--
--   select relrowsecurity from pg_class where relname = 'notification_send_log';
--   -- 期待: true
--
--   select count(*) from pg_policies where tablename = 'notification_send_log';
--   -- 期待: 0（ポリシーが無いことを確認。0本でもRLS有効ならauthenticated/anonは常に0件）
