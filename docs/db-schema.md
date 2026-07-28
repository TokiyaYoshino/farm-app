# Supabase テーブル定義

| テーブル | 主なカラム |
|---------|-----------|
| organizations | id(uuid), org_key(unique, 既存`org`文字列と対応), name, plan, status, line_channel_token, line_group_id, created_at（**未実施**: `docs/db/2026-07-28-01-*.sql`参照） |
| users | id, name, role, org, organization_id(FK, 移行中), login_id(org横断で一意にする方針・制約は未適用), auth_id, email |
| crops | id, name, org, organization_id(FK, 移行中), start_date, last_work_date, target_yield |
| fields | id, name, org, organization_id(FK, 移行中), lat, lng |
| reports | id, user_id, crop_id, field, date, work_type, quantity, work_time, note, image_url, weather, temp, humidity, rain, pesticide_id, pesticide_amount, pesticides_used(jsonb), soil_ph, org, organization_id(FK, 移行中) |
| schedules | id, user_id, assigned_user_id, work_type, title, date, note, crop, organization_id(FK, 移行中。現状org関連カラムなし) |
| pesticides | id, name, type, dilution_rate, notes, org, organization_id(FK, 移行中), created_at, master_id, active_ingredient, pre_harvest_interval, usage_method |
| comments | id, target_type('report'/'schedule'), target_id, user_id, message, organization_id(FK, 移行中。現状org関連カラムなし), created_at |
| sessions | id, user_id, field_id, started_at, ended_at, duration_minutes, voice_memo |
| settings | id, org, organization_id(FK, 移行中), location_name, lat, lng |
| projects | id(uuid), org, organization_id(FK, 移行中), name, crop_id, field, start_date, end_date, status, created_by, created_at |
| tickets | id(uuid), project_id(→projects), org, organization_id(FK, 移行中), title, work_type, assigned_user_id, due_date, status('open'/'done'), report_id, note, created_at |

- RLS は全テーブルで有効（allow_all ポリシー、未変更）。テーブル変更時は RLS ポリシーも確認すること
- マルチテナント化（`organizations`テーブル作成・各テーブルへの`organization_id`列追加・`login_id`一意制約）のマイグレーションSQLは`docs/db/`参照。**2026-07-28時点でどれも未実行**（レビュー用に起草のみ、適用はユーザーが手動で行う）。クライアントコード（`src/App.tsx`等）は列の有無どちらでも動くフォールバック実装済み。詳細は`docs/adr-001-multitenancy-and-ai.md`・`docs/multitenancy-progress.md`参照
