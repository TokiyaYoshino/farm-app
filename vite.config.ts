import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // ローカルで AI 機能を通しで確認するための開発専用プロキシ。
    //
    // `npm run dev` は vite だけなので /api/* が 404 になり、AI 機能はどれも
    // ローカルで動かせなかった（確認は毎回 Vercel の Preview 頼み）。
    // かといって `vercel dev` 単体でも動かない —— vercel.json の
    // catch-all rewrite（"/(.*)" → /index.html）が vite のモジュール要求まで
    // index.html に飛ばしてしまい、アプリが真っ白になる。
    //
    // そこで画面は vite（5173）、API は別ターミナルの `vercel dev`（3000）に分け、
    // ここで /api だけ後者に流す。vercel dev を立てていなければ 502 になるだけで、
    // 画面の開発には影響しない。ビルド成果物にも影響しない（server 設定は dev 専用）。
    //
    //   端末A: npx vercel dev --listen 3000
    //   端末B: npm run dev
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
