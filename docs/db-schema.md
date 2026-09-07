# Supabase テーブル定義

| テーブル | 主なカラム |
|---------|-----------|
| organizations | id(uuid), org_key(unique, 既存`org`文字列と対応), name, plan, status, line_channel_token, line_group_id, created_at |
| users | id, name, role, org, organization_id(FK, not null), login_id(org横断で一意), auth_id, email |
| crops | id, name, org, organization_id(FK, not null), start_date, last_work_date, target_yield, famic_crop_name(FAMIC登録適用部の作物名との手動紐付け・nullable) |
| fields | id, name, org, organization_id(FK, not null), lat, lng |
| reports | id, user_id, crop_id, field, date, work_type, quantity, work_time, note, image_url, weather, temp, humidity, rain, pesticide_id, pesticide_amount, pesticides_used(jsonb), soil_ph, org, organization_id(FK, not null) |
| schedules | id, user_id, assigned_user_id, work_type, title, date, note, crop, organization_id(FK, not null) |
| pesticides | id, name, type, dilution_rate, notes, org, organization_id(FK, not null), created_at, registration_no(農薬登録番号) |
| comments | id, target_type('report'/'schedule'), target_id, user_id, message, organization_id(FK, not null), created_at |
| sessions | id, user_id, field_id, started_at, ended_at, duration_minutes, voice_memo |
| settings | id, org, organization_id(FK, not null), location_name, lat, lng |
| projects | id(uuid), org, organization_id(FK, not null), name, crop_id, field, start_date, end_date, status, created_by, created_at |
| tickets | id(uuid), project_id(→projects), org, organization_id(FK, not null), title, work_type, assigned_user_id, due_date, status('open'/'done'), report_id, note, created_at |
| ai_outputs | id(uuid), organization_id(FK, not null), kind('diagnosis'/'pest_advice'/'daily_report'/'voice_structure'), report_id(→reports), target_date, field, crop_id(→crops), input_summary, output_json(jsonb), output_text, model, usage(jsonb), cost_usd, created_by(→users), created_at |
| daily_weather | organization_id(FK, not null), date, temp_max, temp_min, rain_sum, wind_max, gdd(有効積算温度・基準10℃), fetched_at ／ PK(organization_id, date) |
| pesticide_registrations | id(uuid), organization_id(FK, not null), pesticide_id(→pesticides), registration_no, product_name, crop_name, pest_name, dilution, usage_timing, usage_count, total_count, application, raw(jsonb), fetched_at |
| crop_advice_messages | id(uuid), organization_id(FK, not null), crop_id(→crops, nullable), role('user'/'assistant'), content, sources(jsonb), limits(jsonb), watch_points(jsonb), unknowns(jsonb), registration_facts(jsonb), model, usage(jsonb), cost_usd, created_by(→users), created_at |
| crop_advice_actions | id(uuid), organization_id(FK, not null), crop_id(→crops, nullable), message_id(→crop_advice_messages), title, work_type, due_from, due_to, when_text, why, sort_order, dismissed_at, created_by(→users), created_at |

- RLS は全テーブルで有効。**実ポリシー適用済み**（2026-09-06 に本番で確認）。`allow_all` は全テーブルから消えており、`<table>_all_own_org`（`organization_id = jwt_organization_id()`）が入っている。**anon キーでは1行も読めない**ので、CLI から本番を読むスクリプトは `SUPABASE_DB_PASSWORD` 経由で直接続する（`scripts/backup-db.sh` / `scripts/check-crop-links.mjs`）。テーブル変更時は RLS ポリシーも確認すること
- マルチテナント化ステップ1〜2（`organizations`テーブル作成・`users.login_id`一意制約・各テーブルへの`organization_id`列追加とクライアントクエリ対応）は完了。SQLは`scripts/migrations/`参照。RLS実ポリシー化は未着手（`docs/adr-001-multitenancy-and-ai.md`参照）
- `tickets`はクライアントからのinsert経路が現状ないため、新規作成時に`organization_id`を設定するコードは未実装（列自体は追加・バックフィル済み）
- `ai_outputs` / `daily_weather` / `pesticide_registrations` はレガシーの`org`文字列カラムを持たず`organization_id`のみ。SQLは`scripts/migrations/2026-07-31-ai-outputs.sql`
- `pesticide_registrations`の希釈倍数・使用時期・使用回数は、FAMIC原文に範囲や自然文（「1000～1600倍」「収穫前日まで」「14回以内(土壌灌注は2回以内…)」）が含まれるため**数値に正規化せずtextのまま**保持する。誤った正規化は使用基準の誤判定に直結する（最終的に正しいのは製品ラベルの表示）
- `crops.famic_crop_name`は上記`crop_name`との突き合わせ用の紐付け（「ほうれん草」→「ほうれんそう」）。文字列の自動マッチングは誤判定を生むため実装しない。未設定は「判定不可」として扱い、判定を出さずに設定を促す。集計・判定ロジックは`src/lib/pesticideUsage.ts`に集約（SQLは`scripts/migrations/2026-08-05-crops-famic-crop-name.sql`、方針は`docs/decisions/20260805-pesticide-precheck.md`）
- `crop_advice_messages` / `crop_advice_actions` は作物ごとの相談スレッド（農業エージェント）。`ai_outputs` が AI 出力の監査ログ（kind ごとに1行）なのに対し、こちらは会話の順序と作付けへの紐付けを持つ。SQLは`scripts/migrations/2026-08-10-crop-advisor.sql`、仕様は`docs/spec-crop-advice-agent.md`
- `crop_advice_messages` の `sources` / `limits` / `watch_points` / `unknowns` / `registration_facts` は assistant 発言のみ。いずれも**生成時のものをそのまま残す**（あとで文言を変えても過去の発言は当時のまま）。`watch_points` / `unknowns` は`scripts/migrations/2026-08-29-crop-advice-watch-unknowns.sql`で追加したため既存行は null。画面は null 安全に描くこと
- `crop_advice_messages` / `crop_advice_actions` の `crop_id` は **null 可**。null は「作物を指定しない畑全体の相談」を意味する（`scripts/migrations/2026-09-06-crop-advice-general-thread.sql`、方針は`docs/decisions/20260906-general-advice-entry.md`）。作物ごとのスレッドは `.eq("crop_id", id)`、畑全体は `.is("crop_id", null)` で引く。`crop_id` が null の「やること」は作物を絞らず全記録と照合する（`src/lib/adviceMatch.ts`）。RLS の実ポリシーは `organization_id = jwt_organization_id()` で作物を見ていないため、**`crop_id` が null の行も問題なく読み書きできる**（2026-09-06 に本番のポリシー定義で確認済み）
- `crop_advice_messages.record_search_query` は「この返答に添える記録検索の検索語」。null は「記録を調べる必要なし」。`scripts/migrations/2026-09-08-crop-advice-record-search.sql` で追加したため既存行は null。相談が見ている記録は直近60件だけなので、その窓の外を数える質問を記録検索（`api/search-chat.ts`）へ渡すための導線（`docs/decisions/20260908-advice-handoff.md`）
- `crop_advice_actions` に実施済みフラグは**置かない**。作業記録は後から追加・修正されるため、保存すると実態とずれる。照合は毎回`src/lib/adviceMatch.ts`で計算する
