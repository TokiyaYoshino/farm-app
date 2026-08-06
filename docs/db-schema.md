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

- RLS は全テーブルで有効（allow_all ポリシー、未変更）。テーブル変更時は RLS ポリシーも確認すること
- マルチテナント化ステップ1〜2（`organizations`テーブル作成・`users.login_id`一意制約・各テーブルへの`organization_id`列追加とクライアントクエリ対応）は完了。SQLは`scripts/migrations/`参照。RLS実ポリシー化は未着手（`docs/adr-001-multitenancy-and-ai.md`参照）
- `tickets`はクライアントからのinsert経路が現状ないため、新規作成時に`organization_id`を設定するコードは未実装（列自体は追加・バックフィル済み）
- `ai_outputs` / `daily_weather` / `pesticide_registrations` はレガシーの`org`文字列カラムを持たず`organization_id`のみ。SQLは`scripts/migrations/2026-07-31-ai-outputs.sql`
- `pesticide_registrations`の希釈倍数・使用時期・使用回数は、FAMIC原文に範囲や自然文（「1000～1600倍」「収穫前日まで」「14回以内(土壌灌注は2回以内…)」）が含まれるため**数値に正規化せずtextのまま**保持する。誤った正規化は使用基準の誤判定に直結する（最終的に正しいのは製品ラベルの表示）
- `crops.famic_crop_name`は上記`crop_name`との突き合わせ用の手動紐付け（「南高梅」→「うめ」）。文字列の自動マッチングは誤判定を生むため実装しない。未設定は「判定不可」として扱い、判定を出さずに設定を促す。集計・判定ロジックは`src/lib/pesticideUsage.ts`に集約（SQLは`scripts/migrations/2026-08-05-crops-famic-crop-name.sql`、方針は`docs/decisions/20260805-pesticide-precheck.md`）
