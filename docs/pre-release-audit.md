# 公開前リスク監査（セキュリティ・審査ポリシー）

作成: 2026-09-05 / 対象: `main` @ `31ed127`
関連: `docs/app-store-submission.md`（提出手順）, `docs/rls-rollout.md`（RLS適用手順・別途進行中）

App Store 公開までに潰すべき問題を、コードとインフラ設定を実際に確認して洗い出したもの。
「あとで効いてくる」順ではなく **公開を止める順** に並べている。

判定の意味:
- **必須** — これがあると公開できない、または公開した時点で実害が出る
- **推奨** — 公開はできるが、放置すると運用か次の審査で詰まる
- **将来** — 今は問題ないが、ある機能を足した瞬間に問題化する。設計を先に決めておく対象

---

## サマリ

| # | 問題 | 判定 | 分類 |
|---|---|---|---|
| 1 | RLS が `allow_all`（別セッションで対応中） | 必須 | セキュリティ |
| 2 | プライバシーポリシーURLに審査担当が到達できない | 必須 | 審査 2.1 / 5.1.1 |
| 3 | 作業写真が実質公開。RLS を適用しても塞がらない | 必須 | セキュリティ |
| 4 | アプリ内にアカウント削除の導線が無い | 必須 | 審査 5.1.1(v) |
| 5 | プライバシーポリシーの記述が実装と一致していない | 必須 | 審査 5.1.1 / 表示 |
| 6 | パスワード再設定が失敗する（500） | 必須 | 審査 2.1 / 運用 |
| 7 | ユーザー削除が Auth ユーザーを残す | 推奨 | セキュリティ / 5.1.1(v) |
| 8 | 運営者名・連絡先が未記入 | 必須 | 審査 5.1.1（既知） |
| 9 | Production の `OPENAI_API_KEY` 未設定の疑い | 必須 | 審査 2.1（既知） |
| 10 | ログインエラーでアカウントの存在が判別できる | 推奨 | セキュリティ |
| 11 | 掲載文で「法定義務」と書くと不正確 | 推奨 | 審査 2.3 |
| 12 | 課金を入れる時の IAP 要件 | 将来 | 審査 3.1 |
| 13 | データ販売構想を実行する時の再申告 | 将来 | 審査 5.1.2 |
| 14 | アプリの API 呼び先が SSO 保護下。AI機能が本番で全滅 | 必須 | 審査 2.1 |
| 15 | RLS 移行SQLの欠落。適用1時間後に全員がデータを見失う | 必須 | セキュリティ/可用性 |

**進捗（2026-09-05）**: 2 は方針決定・実行は RLS 待ち / **6・7・4 は対応済み** /
14・15 を追記（14 は 2 の調査中、15 は RLS 準備中に判明）/
1 の実行準備（修正SQL2本・検証スクリプト）は完了。

**良好だった点**（確認済み・対応不要）は末尾にまとめた。既に手当てされているものを再点検して時間を使わないため。

---

## 1. RLS が `allow_all`（対応中）

`docs/rls-rollout.md` の通り。本監査では新しい指摘は無い。**ただし下の 3 は RLS 移行SQLを流しても残る**ため、進行中の作業に追加してほしい。

---

## 2. プライバシーポリシーURLに審査担当が到達できない — **必須**

`docs/app-store-submission.md:82` は提出するプライバシーポリシーURLを
`https://kishu-farm.vercel.app/privacy` としている。一方 Vercel プロジェクト `farm-app` の
デプロイ保護設定は現在こうなっている（Vercel API で確認）:

```
ssoProtection:      { enabled: true, deploymentType: "all_except_custom_domains" }
passwordProtection: { enabled: false }
domains: ["kishu-farm.vercel.app",
          "farm-app-tokiyayoshinos-projects.vercel.app",
          "farm-app-git-main-tokiyayoshinos-projects.vercel.app"]
```

`all_except_custom_domains`（Vercel の Standard Protection）は、**独自ドメイン以外の全デプロイを
Vercel ログインの背後に置く**設定。このプロジェクトに独自ドメインは1つも接続されていないため、
`kishu-farm.vercel.app/privacy` は **Vercel アカウントを持つ人しか開けない**。

審査担当はプライバシーポリシーを必ず開く。開けなければリジェクトは確実。

さらに副次的な問題として、**同じ理由で現場の作業者も Web 版に到達できないはず**である。
CLAUDE.md は本番を「kishu-farm.vercel.app（kishufarm.com）」と書いているが、
kishufarm.com は現在このプロジェクトに接続されていない。Web 版の実運用が今どうなっているか、
一度確認したほうがいい（別プロジェクト・別ホストで動いている可能性がある）。

**確認方法（5秒）**: ブラウザのシークレットウィンドウで `https://kishu-farm.vercel.app/privacy`
を開く。Vercel のログイン画面が出たらこの指摘の通り。

**対応**: kishufarm.com を farm-app に接続する。検討の経緯と手順は
`docs/decisions/20260905-privacy-policy-url-domain.md`（2026-09-05 決定）。

**ただし実行は RLS 完了後。** 独自ドメインを接続すると `/privacy` だけでなく
**Web 版アプリ本体も公開される**（それが保護対象外になるということ）。Vite は
`VITE_SUPABASE_ANON_KEY` をビルド時にバンドルへ埋め込むため、公開＝anon キーの一般配布。
RLS が `allow_all` のまま接続すると、1 で塞ごうとしている穴をその場で開けることになる。
**順序は RLS → ドメイン接続 → 申請で固定。**

追加で判明したこと: 同アカウントの `kishufarm-site` プロジェクトも同じ保護設定・独自ドメイン
未接続で、**このアカウントで公開されているサイトは1つも無い**（Hobby プランの既定値のまま）。
`kishufarm.com` は登録済みだが Vercel のどのプロジェクトにも接続されていない。

---

## 3. 作業写真が実質公開。RLS を適用しても塞がらない — **必須**

**進行中の RLS 作業に追加が必要な項目。** `scripts/migrations/2026-08-02-rls-policies.sql:174-183`
の Storage ブロックは、移行後もこうなる:

```sql
create policy report_images_insert_authed on storage.objects for insert
  to authenticated                       -- 書き込みは認証ユーザーのみ（OK）
  with check (bucket_id = 'report-images');
create policy report_images_select_public on storage.objects for select
  using (bucket_id = 'report-images');   -- ← 読み取りに TO 句が無い
```

Postgres のポリシーは `TO` を省略すると `PUBLIC`（= anon を含む全ロール）が対象になる。
つまり **anon キーだけで `storage.objects` の行を SELECT できる = バケット内の全ファイル名を列挙できる。**

SQL のコメントは「画像URLは推測困難なランダムパスで」と書いているが、
`${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`（`src/App.tsx:809`,
`expo-prototype/lib/store.tsx:313`）というランダム性は**一覧が取れる相手には意味がない**。
しかも全ファイルがバケット直下に置かれ、組織ごとのプレフィックスも無い。

結果として、RLS を全テーブルに適用し終えた後でも
**「他組織の作業写真・病害虫写真を、ファイル名を列挙して全部ダウンロードできる」状態が残る。**
記録テキストは守られるのに写真だけ素通り、という中途半端な状態になるので、
RLS 作業と同じタイミングで直すのが合理的。

**対応（SQL は用意済み。RLS 適用と同時に流す）**

`scripts/migrations/2026-09-05-rls-storage-fix.sql` を作成した。
**本体の 3) ブロックの代わりにこれを実行する。**

当初は「select を `to authenticated` に変える」案だったが、調査の結果もっと単純に
**select ポリシーを1つも作らない**のが正しいと分かった。理由:

- アプリは Storage API のうち `upload()` と `getPublicUrl()` しか使っていない。
  `list()` / `remove()` / `download()` の呼び出しはリポジトリ全体で**ゼロ**
- `getPublicUrl()` はURL文字列を組み立てるだけのクライアント処理で通信しない。
  画像の実配信は public バケットの `/storage/v1/object/public/...` で行われ、
  **ここは RLS を通らない**
- つまり **select ポリシーはアプリの動作に一切使われていない**。落としても表示は
  変わらず、anon も他組織の認証ユーザーも列挙できなくなる

コード変更ゼロ・既存画像の破壊ゼロで、列挙経路だけが消える。

**残る制約（承知のうえで launch する）**: public バケットのままなので
**URLを知っていればログインなしで読める**。URLは `reports.image_url` にあり、その表は
組織スコープになるので通常は他組織に渡らないが、公開URLは期限が無く失効させられない。

完全に塞ぐには private バケット + 署名URL + 組織プレフィックスのパス
（`${organization_id}/${uuid}.jpg`）への移行が要る。既存ファイルの移行と
クライアント3箇所（`src/App.tsx:812` / `expo-prototype/lib/store.tsx:350` /
`expo-prototype/screens/AiSheets.tsx:709`）の改修を伴うので今回は分ける。
**2組織目を迎える前に実施すること**（現状は実質1組織なので緊急度は低い）。

---

## 4. アプリ内にアカウント削除の導線が無い — **必須** ✅ 対応済み（2026-09-05）

Guideline **5.1.1(v)** は「アカウント作成をサポートするアプリは、**アプリ内で**アカウント削除も
できなければならない」と定めている。2022年以降、審査で機械的に確認される項目。

現状:
- Expo 版にユーザー管理画面が無い（`ManageScreen.tsx` は作物・圃場・農薬のみ）
- 削除に触れているのは `public/privacy.html:151` の
  「アカウント削除の申し出があった場合、…削除します」という**問い合わせ導線のみ**。
  Apple は問い合わせ窓口だけの構成を原則として認めない
- `docs/app-store-submission.md:129` は 5.1.1(v) を「ログイン必須の正当性」と書いているが、
  同項の削除要件が抜けている

**補足（重要）**: 本アプリは自由登録が無く、農場管理者がアカウントを発行する方式。
Apple には「組織が構成員のアカウントを作成・管理するアプリ」に対する例外の余地があり、
主張は可能。ただし**審査担当が例外と認めるかは運任せ**で、リジェクトされてから議論すると
1往復（数日）を失う。

**対応済み**（`docs/decisions/20260905-account-deletion.md`）:
`POST /api/delete-account` を新設し、本人削除と管理者による同組織ユーザー削除を兼ねさせた。
Expo 側はユーザーシート（ログアウトの下）に「アカウントを削除」を追加し、
2段階の確認と「作業記録は農場の記録として残る」旨の明示を入れてある。
最後の管理者は削除できないガード付き。以下は当初の設計メモ。
- 一般利用者: 設定に「アカウントを削除」→ 確認 → 自分の `users` 行と Auth ユーザーと
  `device_tokens` を削除（削除は service_role が要るので `api/delete-account.ts` を新設し、
  `requireUser` で本人確認のうえ本人の行のみ消す）
- 管理者: 自分が最後の管理者の場合は削除させない（組織が管理不能になるため）ガードを1つ
- 作業記録そのものは組織の資産なので消さない。その旨を削除確認画面に明記すると
  審査でも運用でも説明がつく

---

## 5. プライバシーポリシーの記述が実装と一致していない — **必須**

`public/privacy.html` は全体としてよく書けているが、事実と食い違う箇所が2つある。
プライバシーポリシーは審査担当が読み、App Privacy（栄養表示）との一致も見られる。

**(a) 「データの分離」の記述が現時点では虚偽**

> 4. データの分離
> 本アプリは組織単位でデータを分離しており、利用者は自身が所属する組織のデータのみ
> 参照・編集できます。…データベース側でも組織単位のアクセス制御を適用しています。

RLS が `allow_all` の現在、この文は**成立していない**。RLS 適用が完了すれば真になるので、
**「RLS の適用完了」がこの記述の前提条件**という依存関係を意識しておく。
順序としては RLS → 申請、を絶対に逆にしないこと。
（上の 3 が残っていると、写真については適用後もこの文が正確でなくなる点にも注意）

**(b) LINE への第三者提供が未記載**

`api/notify-line.ts` は作業報告の内容を LINE の Messaging API に送信している
（呼び出し元は `src/App.tsx:899`。現状 Web 版のみ）。しかしポリシーの
「3. データの保管と第三者提供」に挙がっているのは Supabase / Vercel / OpenAI /
Open-Meteo / Expo の5社で、**LINE が無い**。

ポリシー冒頭が「iOS/Android アプリおよびウェブ版 kishu-farm を含みます」と宣言している以上、
Web 版限定の機能でも記載が要る。

**対応**: 「LINE ヤフー株式会社 — 作業報告の内容を、農場が設定した LINE グループへ
通知するために送信します（この機能を有効にしている場合に限る）」を追記。
アプリ版で使わないなら「ウェブ版のみ」と明記する。

---

## 6. パスワード再設定が失敗する（500） — **必須** ✅ 対応済み（2026-09-05）

`api/set-user-auth.ts:44-50` は、**既存ユーザーの更新（`user_id` あり）でも必ず
`POST /auth/v1/admin/users` で Auth ユーザーを新規作成する**。email は
`${login_id}@kishu-farm.system` と login_id から決まるため:

- **ログインIDを変えずにパスワードだけ変更** → 同じ email の Auth ユーザーが既に存在 →
  作成が失敗 → `500` → 画面には「設定に失敗しました」（`src/App.tsx:788`）。
  **つまりパスワードの再設定ができない**
- **ログインIDを変えて再設定** → 成功するが、**古い Auth ユーザーが削除されずに残る**。
  `users` 行の `auth_id` は新しい方を指すのでアプリ上は正常に見えるが、旧アカウントは
  Supabase Auth 側で生き続け、旧 email/パスワードを知っていれば有効なJWTを取得できる。
  そのJWTは `api/_auth.ts` の `requireUser` を通過するため、AI系エンドポイント
  （＝OpenAI キーを使う経路）を叩ける

パスワードを忘れた作業者を救済する手段が他に無い（ログイン画面にリセット導線が無い）ため、
これは審査以前に運用が詰まる。審査観点でも Guideline 2.1（機能不全）に該当しうる。

**対応済み**: `users` 行が `auth_id` を持つ場合は
`PUT /auth/v1/admin/users/{auth_id}` で更新するようにし、email も同時に書き換えて
孤児を作らないようにした。`auth_id` を持たない古い行に対して同じ email の Auth ユーザーが
既にある場合（過去の不具合が作った孤児）は、原因の分かる 409 を返す。

**要確認**: 過去に作られた孤児 Auth ユーザーが本番に残っている可能性がある。
Supabase ダッシュボード > Authentication で、`users` テーブルに対応する行が無い
`@kishu-farm.system` のアカウントが無いか一度見ておくこと。あれば削除する
（残っていると、そのパスワードを知る人が AI 系エンドポイントを叩ける）。

---

## 7. ユーザー削除が Auth ユーザーを残す — **推奨** ✅ 対応済み（2026-09-05）

`src/App.tsx` の管理者によるユーザー削除は `users` 行を消すだけで、
**Supabase Auth のユーザーが残っていた**。削除したはずの人が有効なJWTを取得でき、
`api/_auth.ts` の `requireUser` を通って AI 系エンドポイント（＝OpenAI キーを使う経路）を
叩けてしまう状態。

**訂正**: 初版で「`device_tokens` の行も残る」と書いたが誤り。`device_tokens.user_id` は
`users(id) on delete cascade` なので、`users` 行の削除で一緒に消える
（`scripts/migrations/2026-08-04-device-tokens.sql`）。残っていたのは Auth ユーザーのみ。

**対応済み**: 管理者削除も 4 の `POST /api/delete-account` 経由に変更し、
Auth ユーザーを先に消してから `users` 行を消すようにした（逆順だと、users 行が無いのに
認証だけ通る一番危ない状態が残るため）。

---

## 8. 運営者名・連絡先が未記入 — **必須**（既知）

`public/privacy.html:173-179` の TODO。`docs/app-store-submission.md:13` に既出。
審査では連絡先の実在性が見られる。屋号でよいので正式名称と、届くメールアドレスを記入する。

---

## 9. Production の `OPENAI_API_KEY` 未設定の疑い — **必須**（既知）

`docs/app-store-submission.md:15` に既出。アプリは本番APIを叩くため、未設定だと
AI機能が全滅し、Guideline 2.1（機能不全）に直結する。
スクリーンショットにAI機能を載せる予定（同 `:93`）なら、掲載文と実挙動の不一致
（2.3）にもなる。**申請前に本番環境で実機から1回は動かして確認すること。**

---

## 10. ログインエラーでアカウントの存在が判別できる — **推奨**

`expo-prototype/lib/store.tsx:274-276` は「ユーザーIDが見つかりません」と
「パスワードが正しくありません」を出し分けている。総当たりの前段としてIDの存在確認ができる。
業務アプリなので優先度は低いが、直すのは1行。両方を
「ユーザーIDまたはパスワードが正しくありません」に統一する。

**あわせて検討したい設計上の改善**: 同関数はログイン前に `users` テーブルを
**匿名で** SELECT して login_id → email を解決している。これが `docs/rls-rollout.md` の
手順6（`users` を最後に回し、列制限grantを入れる）を必要にしている当の原因であり、
RLS 作業で最も壊れやすい箇所でもある。

email は `${login_id}@kishu-farm.system` と決定的に生成されている（`api/set-user-auth.ts:27`）
ので、**クライアント側で組み立てて直接 `signInWithPassword` を呼べば、この匿名SELECT自体が
不要になる**。手順6のリスクが消え、ユーザー列挙の経路も閉じる。

ただし **この規則より前に作られた行が実メールアドレスを持っている可能性**があるため、
`select login_id, email from users where email not like '%@kishu-farm.system'` で
例外が無いことを確認してから採用すること。例外があるなら現行方式のまま列制限grantで進める。
RLS 作業中の別セッションに伝える価値がある。

---

## 11. 掲載文で「法定義務」と書くと不正確 — **推奨**

App Store の説明文・スクリーンショットの文言に関する注意（Guideline 2.3 メタデータの正確性）。

農薬の**使用基準の遵守**（適用作物・希釈倍数・使用時期・総使用回数）は農薬取締法上の
**義務**だが、**帳簿への記載は努力義務**（農薬使用者が遵守すべき基準を定める省令 第9条、罰則なし）。

したがって掲載文に「法律で義務付けられた防除記録を管理できます」と書くのは**不正確**。
実務上は出荷先やGAP認証で記録の提出を求められるので、
「出荷先やGAP認証で求められる防除記録を、法令が定める記載項目（使用年月日・場所・作物・
農薬名・希釈倍数）に沿って残せます」といった書き方にする。訴求力を落とさずに正確。

なお、農薬情報の表示については実装側で既に適切な手当てがされている（末尾「良好だった点」参照）。

---

## 12. 課金を入れる時の IAP 要件 — **将来**

`src/ui/aiFeatures.ts` に「マルチテナント化＋Stripe連携が完了したら課金プランを見て判定する」
とある。現在フラグは全て `true` で、アプリ内に価格表示も購入導線も無い。**今は問題ない。**

将来 Stripe を入れる際、**アプリ内でプラン購入・アップグレードができる形にすると
Guideline 3.1.1 により In-App Purchase が必須**になり、Apple の手数料が乗る。
一方 3.1.3(e)（Enterprise Services）は、**個人消費者ではなく組織向けに販売されるサービス**を
IAP の対象外としている。farm-app は農場（事業者）との契約なので、こちらに乗るのが自然。

**設計上の含意（今のうちに決めておくこと）**:
- 契約・支払いは **Web 側で完結**させ、アプリはログインして使うだけにする
- アプリ内に価格・プラン名・「アップグレード」ボタン・決済サイトへのリンクを**置かない**
  （リンクだけでも 3.1.1 に触れる）
- 未契約組織には「この機能は利用できません。管理者にお問い合わせください」とだけ出す

この方針を先に決めておかないと、UI を作ってから作り直すことになる。
実際に着手する時点で `docs/decisions/` にADRを残すこと。

---

## 13. データ販売構想を実行する時の再申告 — **将来**

`docs/roadmap.md` 長期の「データ価値化」を実行する場合、プライバシーポリシーの全面改訂と
App Privacy の再申告、および利用者からの同意取得が必要になる。
現在のポリシーは「利用者情報を販売することはありません」と明記しているため、
方針転換時はこの一文の撤回が前提になる。データ活用系の仕様検討時は必ず影響範囲に入れる。

---

## 14. アプリの API 呼び先が SSO 保護下。AI機能が本番で全滅 — **必須**

**2 の調査中に判明。2 と原因は同じだが、影響が別物なので分けて記録する。**

Expo 版が Vercel の API を叩く際のベースURLは、両方とも既定でこうなっている:

```ts
// expo-prototype/lib/ai.ts:9, expo-prototype/lib/store.tsx:20
const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "https://kishu-farm.vercel.app";
```

この `kishu-farm.vercel.app` が 2 のとおり Vercel Authentication の背後にある。
**デプロイ保護はサーバーレス関数にも等しくかかる**ため、アプリからの
`/api/generate-report`・`/api/diagnose-image`・`/api/search-chat`・`/api/advise`・
`/api/structure-voice`・`/api/pest-control-advice`・`/api/pesticide-registration` は
すべて Vercel のログインHTMLを受け取り、**AI機能が1つも動かない**。

審査担当はスクリーンショットに載せた機能を触る（`docs/app-store-submission.md:93` は
AI機能をスクショに含める想定）。動かなければ Guideline 2.1 で確実にリジェクトされる。
9（Production の `OPENAI_API_KEY` 未設定の疑い）とは別の原因なので、**両方直す必要がある**。

**確認方法**: EAS に `EXPO_PUBLIC_API_BASE` を別の値で登録していれば話は変わる。
`npx eas-cli env:list` で production 環境の値を確認すること。未登録なら上記の既定値が使われる。

**対応**: 2 で kishufarm.com を接続したあと、`EXPO_PUBLIC_API_BASE` を
`https://kishufarm.com` に設定して EAS の全環境（development / preview / production）に
登録する。既定値も同じ値に変えておくと、登録し忘れたビルドが黙って壊れることを防げる。
**この修正は 2 と不可分なので、同じタイミングで行う。**

---

## 15. RLS 移行SQLの欠落。適用1時間後に全員がデータを見失う — **必須**

**1（RLS）の実行準備中に判明。SQLを流す前に手当て済み。**

本体 `scripts/migrations/2026-08-02-rls-policies.sql` の 0) は、JWT に組織IDを埋める
Hook 関数が `users` を読めるように **grant だけ**を与えている:

```sql
grant select on table public.users to supabase_auth_admin;
```

しかし **grant はテーブル権限であって、RLS を通過させるものではない**。
`custom_access_token_hook` は `SECURITY DEFINER` ではないため呼び出し元の
`supabase_auth_admin` として実行され、`users` に RLS が効いた瞬間からポリシーの
評価対象になる。本体が `users` に作るポリシー（`users_select_own_org` /
`users_select_login_lookup`）はどちらも `supabase_auth_admin` を対象にしていない。

結果、**Hook の select が0件を返し、以後発行されるJWTから `organization_id` クレームが
消える**。全テーブルのポリシーが `organization_id = jwt_organization_id()` で組まれている
ため、**全ユーザーが全データを見失う**。

**時間差で壊れるのが厄介**: 手順6を適用した直後は既存トークンが生きているので画面は
正常に見える。アクセストークンが自動更新される1時間ほど後に落ちる。手順書の切り戻し表の
「データが全部消えて見える」を、手順2（ログインし直し）を済ませているのに踏むことになり、
原因にたどり着きにくい。

**対応済み**: `scripts/migrations/2026-09-05-rls-auth-hook-policy.sql` を追加した。
`supabase_auth_admin` 向けの select ポリシーを1本作るだけ。Supabase 公式の
Custom Access Token Hook のドキュメントも grant に加えてこのポリシーを作る手順を載せている。
`docs/rls-rollout.md` の手順6に実行を組み込み済み。

---

## 良好だった点（確認済み・対応不要）

再点検で時間を使わないための記録。

- **API エンドポイントの認証** — `api/*.ts` 全10本が `requireUser` / `requireAdmin` を
  通している（`api/_auth.ts`）。service_role キーを Bearer に入れても
  `/auth/v1/user` がユーザーを返さないので弾かれる。検証失敗時に通す fail-open ではなく
  fail-closed になっている点も正しい
- **set-user-auth の権限昇格対策** — `organization_id` を body から受け取らず呼び出し元の
  所属に固定、既存ユーザー更新時は対象の所属を事前確認。2026-08-23 に手当て済み
- **リポジトリへの秘密情報の混入なし** — 全71コミットを走査して JWT・OpenAI キーの
  痕跡は無い。`expo-prototype/.env.example` はプレースホルダのみ
- **マイク権限を要求していないのが正しい** — 音声メモは iOS キーボードの標準音声入力を
  使う設計（`expo-prototype/screens/QuickReportSheet.tsx:125`）。アプリが録音しないので
  `NSMicrophoneUsageDescription` は不要。宣言していれば逆に 5.1.1 で問われた
- **権限の利用目的文字列** — カメラ・写真・位置情報とも日本語で具体的（`app.json`）。
  位置情報は WhenInUse のみでバックグラウンド取得なし
- **輸出コンプライアンス** — `ITSAppUsesNonExemptEncryption: false` 設定済み
- **トラッキングSDKなし** — Firebase / Sentry / 広告SDK いずれも不使用。
  App Privacy の「トラッキング」を全て「いいえ」で申告できる
- **オフライン時の挙動** — 通信断で白画面にならず「電波の届く場所で再試行してください」＋
  再試行ボタンを出す（`expo-prototype/App.tsx:149`）。機内モードで起動される
  Guideline 2.1 の定番チェックに耐える
- **ネイティブ機能の実装** — カメラ・位置情報・地図・プッシュ通知を実装済みで
  WebView ラッパーではない。Guideline 4.2 のリスクは低い
- **農薬情報の免責表示** — 「実際の使用時は必ず製品ラベルの表示を確認してください」
  （`ManageScreen.tsx:605`）、「最終判断は現地の状況と製品ラベルに従ってください」
  （`AiSheets.tsx:268`）。判定できない場合にバッジを出さない設計
  （`src/components/PesticideUsageSummary.tsx:47`）も含め、
  AI助言が使用基準違反を誘発するリスクへの手当てとして妥当
- **審査用デモアカウントとデモデータ** — 手順とシードスクリプトが
  `docs/app-store-submission.md:95-101` に用意済み

---

## 推奨する着手順

**2026-09-05 追記**: RLS が未着手であることが判明したため順序を見直した。
2（ドメイン接続）と 3（Storage の private 化）はどちらも **RLS 完了が前提**になる。
先に手を付けられるのは 6・7・4 のコード側。

0. **1（RLS）** — 他の多くがこれを前提にしている。最優先
1. **2 + 14（ドメイン接続と `EXPO_PUBLIC_API_BASE`）** — 決定済み（kishufarm.com 接続）。
   **RLS 完了後に実行**。手順は `docs/decisions/20260905-privacy-policy-url-domain.md`。
   14 は 2 と不可分なので必ず同時に
2. **3（Storage）** — RLS 作業と同じタイミングでやるのが最も安い
3. ~~**6 + 7 + 4（アカウント周り）**~~ — **2026-09-05 完了**
4. **5 + 8（プライバシーポリシー本文）** — RLS 完了を待って (a) を確定させ、
   (b) と運営者情報を同時に記入
5. **9（本番の OPENAI_API_KEY）** — 実機で1回叩いて確認
6. **10, 11** — 申請直前の仕上げ
7. **12** — 課金に着手する時点で ADR

## 実施記録

- **2026-09-05** 監査を実施。13件を記録
- **2026-09-05** 2 の対応方針を決定（kishufarm.com 接続）。実行は RLS 完了後。
  `docs/decisions/20260905-privacy-policy-url-domain.md`
- **2026-09-05** 14 を追記（2 の調査中に判明。アプリの API 呼び先も保護下にある）
- **2026-09-05** 6 を修正（`set-user-auth` を PUT 更新に）
- **2026-09-05** 4・7 を対応（`api/delete-account.ts` 新設、Expo にアカウント削除導線、
  Web の管理者削除を API 経由に変更）。`docs/decisions/20260905-account-deletion.md`
- **2026-09-05** 1（RLS）の実行準備。15 を発見して修正SQLを追加、3 の修正SQLを作成、
  検証スクリプト `scripts/verify-rls.sh` を用意。`docs/rls-rollout.md` を更新
