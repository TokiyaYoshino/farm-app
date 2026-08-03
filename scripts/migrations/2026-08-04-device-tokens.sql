-- プッシュ通知用の端末トークン表（Expo Push）
-- 送信は Supabase Edge Function（supabase/functions/push-comment）が service_role で行うため、
-- クライアントに必要なのは「自分の行を登録・削除する」権限のみ。
-- 適用手順: Supabase ダッシュボード > SQL Editor で全体を実行。
-- 関連: docs/push-notifications.md, scripts/migrations/2026-08-02-rls-policies.sql

create table if not exists public.device_tokens (
  token           text primary key,
  user_id         bigint not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists device_tokens_user_id_idx on public.device_tokens (user_id);
create index if not exists device_tokens_organization_id_idx on public.device_tokens (organization_id);

alter table public.device_tokens enable row level security;

-- 自組織かつ自分のトークンのみ操作できる。
-- jwt_organization_id() は 2026-08-02-rls-policies.sql の 1) で作成済み。
-- そのマイグレーションを未適用の場合は、先に 0) 〜 1) を実行すること。
drop policy if exists device_tokens_own on public.device_tokens;
create policy device_tokens_own on public.device_tokens for all
  using (
    organization_id = public.jwt_organization_id()
    and user_id in (select id from public.users where auth_id = auth.uid())
  )
  with check (
    organization_id = public.jwt_organization_id()
    and user_id in (select id from public.users where auth_id = auth.uid())
  );

-- Expo から "DeviceNotRegistered" が返った端末は Edge Function 側が service_role で削除する
-- （RLS を bypass するためポリシー追加は不要）。
