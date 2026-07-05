# Supabase テーブル定義

| テーブル | 主なカラム |
|---------|-----------|
| users | id, name, role, org, login_id, auth_id, email |
| crops | id, name, org, start_date, last_work_date, target_yield |
| fields | id, name, org, lat, lng |
| reports | id, user_id, crop_id, field, date, work_type, quantity, work_time, note, image_url, weather, temp, humidity, rain, pesticide_id, pesticide_amount, pesticides_used(jsonb), soil_ph, org |
| schedules | id, user_id, assigned_user_id, work_type, title, date, note, crop |
| pesticides | id, name, type, dilution_rate, notes, org, created_at |
| comments | id, target_type('report'/'schedule'), target_id, user_id, message, created_at |
| sessions | id, user_id, field_id, started_at, ended_at, duration_minutes, voice_memo |
| settings | id, org, location_name, lat, lng |
| projects | id(uuid), org, name, crop_id, field, start_date, end_date, status, created_by, created_at |
| tickets | id(uuid), project_id(→projects), org, title, work_type, assigned_user_id, due_date, status('open'/'done'), report_id, note, created_at |

- RLS は全テーブルで有効（allow_all ポリシー）。テーブル変更時は RLS ポリシーも確認すること
