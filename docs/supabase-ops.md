# Supabase 運用手順

## 管理者アカウント追加
Supabaseダッシュボード → Table Editor → users → Insert row → name, role: admin, org: kishu を入力

## ストレージ
- 画像は Storage の `report-images` バケット

## セキュリティ
- RLS は全テーブルで有効（allow_all ポリシー）
- API キー・URL は `.env` / `.env.local` のみに置く。設定ファイルやドキュメントに平文で書かない

---

## リリース手順（2026-09-09 の相談スレッド機能）

判断の経緯は [`docs/decisions/20260909-web-release-and-rollback.md`](decisions/20260909-web-release-and-rollback.md)。

### 順番

1. **Supabase SQL Editor で、この順に実行する**
   1. `scripts/migrations/2026-09-09-advice-threads.sql`
   2. `scripts/migrations/2026-09-09-ai-outputs-entry-point.sql`
   - 確認: `select count(*) from advice_threads;` が通る／`select count(*) from crop_advice_messages where thread_id is null;` が **0**
2. **Vercel の Production 環境変数に `OPENAI_API_KEY` があるか確認する。** Development にしか無いとAI機能が全滅する
3. main にマージ → Vercel が自動デプロイ
4. 本番で確認
   - **相談タブが出ていること**（出ていなければ手順1が効いていない）
   - 記録が保存できる／AIが応答する
   - **日次上限**: 意図的に上限を超えて 429（「本日の利用回数の上限に達しました」）が返ること
5. 作業者を招待（管理者でログイン → ユーザー管理 → 名前・role・ログインID・パスワード）
   - **メールは飛ばない**（`{login_id}@kishu-farm.system` という実在しないドメインを使うため）。IDとパスワードは口頭かチャットで直接渡す
   - 招待した人は**必ず同じ組織**に入る（`api/set-user-auth.ts` が呼び出した管理者の組織に固定する）

**手順1を飛ばしてデプロイしても事故にはならない**（相談タブが出ないだけで、以前と同じ画面になる）。ただし正しい順序でやれば1回で済む。

### 切り戻し

**Vercel のダッシュボードで、前のデプロイを Promote する。** 数十秒で戻る。

- **DBは戻さなくてよい。** 追加した列はすべて nullable で、古いコードは無視する
- **副作用**: 新コードが書いた `crop_id = null` の行（作付けに紐づかないスレッドの会話・**道具の結果メッセージ全部**）が、古い画面から**見えなくなる**。データは残っており、再デプロイすれば戻る
- **往復すると両方向に穴が空く。** 切り戻し中に古いコードで書かれた会話は `thread_id = null` になり、再前進したときスレッド一覧から消える（移行SQLは一度きりの実行）

### まだ塞いでいないもの

**RLS は `allow_all` のまま。** これは今回のデプロイが作る穴ではなく従来からの状態だが、相談スレッドが入ることで **anon キー経由で読める情報に会話全文が加わる**。**別の農家に配る前には `docs/rls-rollout.md` の適用が必須**で、そのとき `advice_threads` のポリシーも忘れないこと（新規テーブルなので `allow_all` で作られる）。
