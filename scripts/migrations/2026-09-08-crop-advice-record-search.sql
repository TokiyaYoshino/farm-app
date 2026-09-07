-- 相談の返答に「記録を調べる」の導線を持たせる。
--
-- 相談は直近60件・7500字の作業記録しか見ていないため、「去年の秋は何回防除した？」の
-- ように窓の外を数える質問には答えられない。答えられないまま終わらせず、記録検索
-- （api/search-chat.ts）へ検索語を添えて渡す（docs/decisions/20260908-advice-handoff.md）。
--
-- 検索語は返答ごとに決まるので、メッセージ行に持たせる。列が無いとスレッドを開き直した
-- ときにボタンだけが消え、同じ返答なのに導線の有無が変わってしまう。
--
-- nullable にするので、この列を知らない書き込み（expo-prototype/lib/store.tsx の
-- saveCropAdviceTurn）はそのまま通る。RLS は organization_id = jwt_organization_id() で
-- 列を見ていないため変更不要（2026-08-23-rls-crop-advice.sql）。
--
-- 元テーブル定義: scripts/migrations/2026-08-10-crop-advisor.sql
-- Supabase SQL Editor で実行する。

alter table crop_advice_messages add column if not exists record_search_query text;

comment on column crop_advice_messages.record_search_query is
  'この返答に添える記録検索の検索語。null は「記録を調べる必要なし」（2026-09-08 追加）';
