# ユーザー削除時にSupabase Authのセッションも失効させる

- 日付: 2026-09-21
- 状態: 採用
- 種別: セキュリティ修正
- 関連: `docs/decisions/20260921-security-audit-role-based-rls.md`

## 課題（Why）

セキュリティ監査で、`deleteUser()`（`src/App.tsx`）が`users`テーブルの行を
削除するだけで、Supabase Auth側のセッション（アクセストークン・リフレッシュトークン）
を一切無効化していないことが分かった。`organization_id`はJWT発行時にクレームとして
埋め込まれ、直接のSupabaseクライアント呼び出しはこのクレームを信頼するため、
削除・降格されたユーザーの既発行トークンは有効期限（既定約1時間）まで
組織データへの読み書きを継続できていた。

## 決めたこと

`api/set-user-auth.ts`にDELETEメソッドを追加し、次の2つを同時に行う：
1. `users`テーブルの行を削除する（従来通り）
2. Supabase AuthのAuthアカウント自体を削除する（`DELETE /auth/v1/admin/users/{auth_id}`）。
   アカウントごと消すことで、既発行のトークンは`requireUser`の`/auth/v1/user`検証で
   即座に無効になる（アカウントが存在しないため）

`src/App.tsx`の`deleteUser()`を、直接のテーブル削除からこの新エンドポイント呼び出しに変更した。
既存の他組織チェック（`api/set-user-auth.ts`のPOST側にあった仕組みと同型）をDELETE側にも実装し、
`scripts/test-api-auth-boundaries.mjs`に回帰テストを追加した。

## 影響範囲

- DB変更なし（既存の`users`/Auth操作の組み合わせ方を変えるのみ）
- 既存機能: 削除なし。ユーザー削除のUIフローは変わらない（内部の実装のみ変更）
- Auth側の削除に失敗した場合はログに残すのみで処理は継続する（usersの行は既に削除済みで
  RLSにより業務データへのアクセスは塞がるため、Auth側の削除失敗は致命的ではない）

## プレモータム

1. **Authアカウント削除がSupabase側の一時的な障害で失敗し、孤児のAuthアカウントが残る。** →
   usersの行は消えているため、そのAuthアカウントでログインしても`requireAppUser`が
   「対応する利用者情報が見つかりません」で弾く。実害は無く、次回同じlogin_idで
   ユーザーを作り直そうとした際に衝突する可能性がある程度（低頻度・低影響）

## 過去の判断との関係

- `docs/decisions/20260921-security-audit-role-based-rls.md`と同じ監査結果への対応の続き
