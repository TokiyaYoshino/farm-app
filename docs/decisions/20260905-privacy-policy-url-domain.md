# プライバシーポリシーURLの公開方法として kishufarm.com を farm-app に接続する

日付: 2026-09-05
状態: 決定（実行は RLS 完了待ち）
関連: `docs/pre-release-audit.md` の 2, `docs/rls-rollout.md`

## 背景

App Store 申請にはプライバシーポリシーURLが必須で、審査担当が必ず開く。
提出予定だった `https://kishu-farm.vercel.app/privacy` は開けない状態にある。

Vercel プロジェクト `farm-app` のデプロイ保護（2026-09-05 実測）:

```
ssoProtection:      { enabled: true, deploymentType: "all_except_custom_domains" }
passwordProtection: { enabled: false }
domains: ["kishu-farm.vercel.app", "farm-app-tokiyayoshinos-projects.vercel.app",
          "farm-app-git-main-tokiyayoshinos-projects.vercel.app"]
```

`all_except_custom_domains`（Vercel の Standard Protection）は独自ドメイン以外の全デプロイを
Vercel ログインの背後に置く。このプロジェクトに独自ドメインは接続されていないため、
**全URLが Vercel アカウント保有者限定**になっている。

あわせて判明したこと:

- 同一アカウントの `kishufarm-site` プロジェクトも同じ保護設定で、独自ドメイン未接続。
  **このアカウントで公開されているサイトは1つも無い**（Hobby プランの既定値のまま）
- `kishufarm.com` は登録済み（購入不可＝誰かが保有）。ただし Vercel 側のどのプロジェクトにも
  接続されていない。レジストラとDNSの管理場所は未確認

副次的に、この設定のため**現場の作業者も Web 版に到達できないはず**である。
CLAUDE.md が本番を「kishu-farm.vercel.app（kishufarm.com）」としている実態との
食い違いは要確認（別ホストで運用している可能性）。

## 検討した選択肢

| 案 | 内容 | 判断 |
|---|---|---|
| A | kishufarm.com を farm-app に接続する | **採用** |
| B | farm-app の Vercel Authentication を Disabled にする | 不採用 |
| C | kishufarm-site 側にポリシーだけ置く | 不採用 |

- **B**: DNS作業が要らず最速だが、`kishu-farm.vercel.app` という仮のURLを App Store に
  登録することになる。ポリシーURLは公開後の変更に申請更新が伴うため、最初から正式ドメインで
  出したい。またドメインを繋ぐ手間は結局あとで発生する
- **C**: アプリの anon キーを露出させずに済むため RLS の完了を待たずに実行できる唯一の案。
  だがポリシー本文が2箇所に分かれ、更新の二重管理になる。ポリシーと実装の不一致は
  審査でも法務でも事故になりやすいので、単一の出所を保つほうを優先した
- **A**: 独自ドメインは Standard Protection の対象外なので、接続するだけで `/privacy` が
  公開される（`vercel.json` の rewrite により `/privacy` → `/privacy.html`）。
  ポリシー本文の「ウェブ版 kishu-farm」という記述とも整合し、現場の作業者が Web 版を
  使えるようになる副次効果もある

## 決定に伴う制約（重要）

**A は RLS の実ポリシー化が完了するまで実行してはならない。**

独自ドメインを接続すると `/privacy` だけでなく **Web 版アプリ本体も公開される**。
Vite は `VITE_SUPABASE_ANON_KEY` をビルド時に JS バンドルへ埋め込むため
（`src/App.tsx:54`）、公開＝anon キーの一般配布を意味する。
RLS が `allow_all` の状態でこれを行うと、`docs/rls-rollout.md` が塞ごうとしている
穴をその場で開けることになる。

現在 RLS は未着手（2026-09-05 時点）。順序は **RLS → ドメイン接続 → 申請** で固定する。

## 実行手順（RLS 完了後に実施）

1. `kishufarm.com` のレジストラとDNS管理場所を確認する
2. Vercel ダッシュボード > farm-app > Settings > Domains で `kishufarm.com` を追加
   （`www.kishufarm.com` も追加してリダイレクトを設定するかは任意）
3. Vercel が表示するDNSレコード（apex の A レコード、または Vercel ネームサーバへの委任）を
   レジストラ側に設定する。**必要な値は追加時に Vercel が画面に出すものを正とする**
4. 反映後、**シークレットウィンドウで** `https://kishufarm.com/privacy` を開き、
   Vercel のログイン画面を経由せず本文が表示されることを確認する
5. **`EXPO_PUBLIC_API_BASE` を `https://kishufarm.com` に切り替える**（監査 14）。
   アプリの API 呼び先も既定で `kishu-farm.vercel.app` を向いており、保護は
   サーバーレス関数にも等しくかかるため、現状ではアプリの AI 機能が1つも動かない。
   EAS の development / preview / production すべてに登録し、
   `expo-prototype/lib/ai.ts` と `expo-prototype/lib/store.tsx` の既定値も同じ値にする
   （登録し忘れたビルドが黙って壊れるのを防ぐため）。**この手順は 2〜4 と不可分**
6. `docs/app-store-submission.md:82` のプライバシーポリシーURLを
   `https://kishufarm.com/privacy` に更新する
7. CLAUDE.md の本番URLの記述を実態に合わせて整理する

## 未解決

- `kishufarm.com` の保有者・レジストラが未確認。吉野さんの保有でない場合はこの決定を見直す
- Web 版が現在どのURLで運用されているのか（保護設定と実運用の食い違い）
