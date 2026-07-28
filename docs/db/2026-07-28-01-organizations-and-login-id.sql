-- マルチテナント化 移行ステップ1（docs/adr-001-multitenancy-and-ai.md 移行順序 1.）
-- organizations テーブル作成 + 既存データ(org="kishu")の組織登録 + login_id の一意制約化
--
-- 実行方法: Supabase ダッシュボード → SQL Editor に貼り付けて実行する（このリポジトリからは実行しない）
-- 冪等性: すべて IF NOT EXISTS / ON CONFLICT DO NOTHING で書いているため、
--         過去に一部だけ実行済みの環境で再実行しても安全（重複エラーにならない）。
--
-- ⚠️ 実行前に確認: 過去に origin/claude/multitenancy-step1-done ブランチで
-- 「organizations作成・login_id一意化のSQL実行完了」と記録された履歴があるが、
-- そのブランチは main にマージされておらず、この事実の裏付け（本番DBの実際の状態）は
-- 今回未確認。本SQLは「未実行」を前提に書いているが、IF NOT EXISTS / ON CONFLICT により
-- 実行済みでも無害なので、状態不明のままそのまま流してよい。

-- 1) organizations テーブル作成
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  org_key text unique not null,        -- 既存テーブルの `org` 文字列カラムと対応させるキー（例: 'kishu'）
  name text not null,
  plan text not null default 'free',
  status text not null default 'active',
  line_channel_token text,
  line_group_id text,
  created_at timestamptz not null default now()
);

-- 2) 既存データ（霧珠ファーム、org="kishu"）を1組織として登録
insert into organizations (org_key, name)
values ('kishu', '霧珠ファーム')
on conflict (org_key) do nothing;

-- 3) login_id の一意性確認（0件であることを確認してから次のALTERを実行する）
--    ※ 現状は1組織のみのため基本的に重複は無いはずだが、必ず目視確認すること
select login_id, count(*)
from users
group by login_id
having count(*) > 1;

-- 4) 上記が0件の場合のみ実行する（login_id を全org横断で一意にする設計判断。
--    docs/decision-log.md および ADR-001「新たに見つかった論点」参照）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_login_id_unique'
  ) then
    alter table users add constraint users_login_id_unique unique (login_id);
  end if;
end $$;
