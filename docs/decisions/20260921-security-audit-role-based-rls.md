# セキュリティ監査で見つかったRLSの権限昇格を塞ぐ

- 日付: 2026-09-21
- 状態: 採用
- 種別: セキュリティ修正（RLS・DBスキーマ）
- 関連: `scripts/migrations/2026-09-21-fix-role-based-authorization.sql`

## 課題（Why）

App Store申請前に `cloudflare/security-audit-skill` でセキュリティ監査を実施した結果、
`<table>_all_own_org` パターン（`organization_id = jwt_organization_id()` のみを見るRLS）が
**roleを一切見ていない**ことに起因する権限昇格が複数見つかった。

| # | 内容 | 重大度 |
|---|---|---|
| 1 | worker が自分自身の `users.role` を `admin` に書き換えて完全昇格できる | CRITICAL |
| 2 | worker が `crops`/`fields`/`pesticides`/`settings` を直接削除・改変できる | HIGH |
| 3 | worker が他ユーザー（admin含む）のアカウントを削除できる | HIGH |

いずれも「isAdminはUIのボタン表示/非表示だけで、DB側の防御になっていなかった」ことが原因。
`api/_auth.ts` の `requireAdmin` は毎回 `users` テーブルを直接参照するため、#1はUI上の
見た目だけでなくサーバーAPIの認可判定まで突破する、実質的な完全な権限昇格だった。

## 決めたこと

1. **role列の変更をBEFORE UPDATEトリガーで防ぐ**（RLSのWITH CHECK句だけでは
   OLD/NEWの比較が信頼できないため）。`api/set-user-auth.ts` が使う
   `SUPABASE_SERVICE_ROLE_KEY` 経由のリクエストだけは `auth.role() = 'service_role'`
   で判定して通す
2. **crops/fields/pesticides/settingsの変更系（insert/update/delete）をadminロール限定にする**。
   selectは従来通り組織内なら誰でも可能なまま維持する（読み取りの制限は必達3タスクや
   通常業務フローを壊すため対象外）
3. **usersのDELETEをadminロール限定にする**

## 影響範囲

- DB: `crops`/`fields`/`pesticides`/`settings` の `*_all_own_org` ポリシーを
  select用とwrite用に分割。`users_delete_own_org` を `users_delete_admin_only` に置き換え。
  新規関数 `jwt_is_admin()`（`jwt_organization_id()` と同じSECURITY DEFINER設計）と
  トリガー `trg_prevent_role_self_change` を追加
- 既存機能: 削除なし。admin操作は従来通り動作する想定（適用後のスモークテストで確認要）。
  workerが直接devtoolsから行っていた操作（UIに存在しない）のみを塞ぐため、
  通常のUI経由の操作フローへの影響は無いはず
- 審査: 新規実装なし。既存の権限モデルの意図（CLAUDE.md規約・UI設計）とDB側の実装を一致させるのみ

## 今回やらないと明言するもの（Won't this time）

- `users` のUPDATE全般への制限（自分以外の行への書き込み）は対象外。
  監査で確認されたのは「DELETE」と「role列」のみで、他フィールドのUPDATEについては
  現時点で確認された悪用経路が無いため、既存の自己プロフィール編集機能を壊すリスクを
  避けて対象外とした。将来、他ユーザーの任意フィールドを書き換えられる経路が見つかれば
  別途対応する
- `report-images`ストレージバケットの非公開化・EXIF除去、push-comment Edge Functionの
  組織スコープ修正、printPesticideReportのXSS対策などは、本ログとは別のコミットで対応する
  （監査レポート `docs/../`(セッション外で送付済み)の他項目を参照）

## プレモータム

1. **admin操作が動かなくなる。** → `jwt_is_admin()`は`users.role='admin'`を見るだけで、
   既存のadmin判定ロジック（`isAdmin = currentUser?.role === "admin"`）と同じ条件式のため、
   admin自身の操作は影響を受けないはず。適用後に実機で確認する
2. **既存のworkerアカウントが今まで通っていた正規の操作まで止まる。** →
   crops/fields/pesticides/settingsの直接変更はUI上そもそもadmin専用として設計されており、
   workerがUI経由でこれらを変更する正規フローは存在しない（コード上確認済み）ため、
   正規フローへの影響は無いと判断
3. **トリガーがpublic.usersへの他の正当な更新（プロフィール編集等）まで壊す。** →
   トリガーはrole列が変化する場合のみ発火する（`new.role is distinct from old.role`）ため、
   role以外のフィールド更新には影響しない

## 過去の判断との関係

- `docs/rls-rollout.md`・`scripts/migrations/2026-08-02-rls-policies.sql`が定めた
  `<table>_all_own_org`パターンを、crops/fields/pesticides/settings/usersに限り
  「読み取りは組織スコープのみ・書き込みはadmin限定」に変更するもの。他のテーブル
  （reports/schedules/comments等）は今回変更していない
