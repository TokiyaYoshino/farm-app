# farm-app

農場作業記録アプリ。React + TypeScript + Vite + Supabase。

本番: https://kishu-farm.vercel.app（kishufarm.com）

## セットアップ

```bash
npm install
cp .env.example .env.local  # Supabase URL/ANON_KEYを設定
npm run dev
```

## コマンド

- `npm run dev` — 開発サーバー
- `npm run build` — 型チェック＋本番ビルド
- `npm run lint` — ESLint
- `npm run preview` — ビルド後のプレビュー

## ドキュメント

- 開発規約・構成: [CLAUDE.md](./CLAUDE.md)
- DBスキーマ: [docs/db-schema.md](./docs/db-schema.md)
- Supabase運用手順: [docs/supabase-ops.md](./docs/supabase-ops.md)
- ロードマップ: [docs/roadmap.md](./docs/roadmap.md)
