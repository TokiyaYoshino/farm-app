// 最小 Service Worker
// 目的：PWA としてのインストール可能性を担保する。
// キャッシュは行わず、リクエストはネットワークに直結（pass-through）。
// これにより「古いJSが残る」ステイル問題を避ける。オフライン対応は今後の課題。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* pass-through: respondWith を呼ばない */ });
