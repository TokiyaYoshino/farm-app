# Expo版を正にし、Web版を凍結して Vercel から抜ける（2026-10-25）

- 状態: 決定（オーナー 2026-10-25）
- 関連: `20261001-account-model-self-signup.md`（アプリ内の登録・利用者追加）、`20261003-adr-signup-billing-deletion.md`（課金・削除の作り方）、`20261010-feature-inventory.md`（Web版のみの機能）、`docs/app-store-submission.md`（サポート／プライバシーURL）

## 決めたこと
1. **機能の最新版は Expo版**とする。今後の開発は Expo版だけで行う
2. **Web版は凍結**する。すぐには閉じないが、更新もしない（不具合修正も含めて手を入れない）。身内での利用に限る。コードはリポジトリに残す（CLAUDE.md「機能は削除しない」）
3. **Vercel をやめる**。サーバー側の処理（`api/*.ts`）は Supabase Edge Functions へ、サポート／プライバシーの2ページは自分のドメイン配下（Cloudflare Pages。`kishufarm.com` の Cloudflare 移管と合わせる）へ移す
4. Web版にだけある機能のうち、必要なものを Expo版へ移す（下表）。移し終えたら Web版を閉じる

## なぜ
- **Vercel の無料（Hobby）プランは商用利用不可。** 有料プランを売ると、収益化の前でも商用扱いになる。Vercel Pro（約$20/月）に上げる案もあるが、アプリの API のためだけに払うには割高
- **Supabase には DB・認証・写真・通知（`supabase/functions/push-comment`）が既にある。** API も同じ所に置けば契約先が Supabase と Cloudflare の2つに減り、DB・処理・定期実行が1か所にまとまる
- **Web版を保守し続ける利点が無い。** 利用者はアプリから使う。Web版と Expo版で同じ機能を二重に直すのをやめる
- Expo版からの呼び出しは `supabase.functions.invoke` にすれば認証ヘッダが自動で付き、API 用に新しいドメインを持つ必要もない

## 比較した案
| 案 | 月額目安 | 採否 |
|---|---|---|
| A. Vercel Pro に上げる | 約$20 | 不採用。コード変更ゼロだが、固定費が増え、契約先も2つのまま |
| **B. API を Supabase Edge Functions、2ページを Cloudflare Pages** | 当面$0 | **採用** |
| C. API を Cloudflare Workers | $0〜$5 | 不採用。無料枠の計算時間が短く、FAMIC の CSV 解析が収まらない |
| D. EAS Hosting（Expo Router の API routes） | 要確認 | 不採用。アプリの画面の作り（Expo Router 化）から変える必要がある |

## Expo版へ移す機能（Web版にだけあるもの）
2026-10-25 にコードで確認した。

| # | 機能 | Web版の場所 | 扱い | 規模 | 時期 |
|---|---|---|---|---|---|
| 1 | ユーザー管理（アカウント作成・ログインID/パスワード設定・削除） | `src/App.tsx` `inviteUser` / `saveUserAuth` / `deleteUser`、`api/set-user-auth.ts` | **移す**。サーバー側は Edge Function に | 中 | 0.1.0（`20261001-account-model-self-signup.md` で既に 0.1.0 の範囲） |
| 2 | 農薬使用履歴の帳票出力（GAP監査向け CSV／PDF） | `src/App.tsx`「農薬使用履歴 帳票出力」 | **移す**。スマホでファイルを作って共有する形にする | 中 | リリース後 |
| 3 | 予定と実績の突き合わせ（担当者の進捗・未報告） | `src/App.tsx` `matchReportToSchedule` | **移す**。Expo版の分析にある「担当者ごと」（非表示）との関係を移植時に確認する | 小〜中 | リリース後 |
| 4 | 農場の場所設定（`settings`） | ユーザー管理タブ | **移す**（オーナー 2026-10-25）。Expo版は圃場ごとの GPS で天気を取っているので、圃場の位置が無いときの代わりとしての役割を移植時に整理する | 小 | リリース後 |
| 5 | 計画（ガント）の追加・編集 | Web版の計画 | **移さない**（オーナー 2026-10-25）。Expo版の見るだけの `GanttScreen` もそのまま残す | — | — |
| 6 | LINE通知 | `src/App.tsx`、`api/notify-line.ts` | **移さない**（オーナー 2026-10-25）。Expo版はプッシュ通知があり、役割が重なる | — | — |

5・6 は機能の削除ではなく「Expo版へ持っていかない」判断。Web版のコードは残る。

## サーバー側（`api/`）の移し先
| 今 | 移し先 | 規模 |
|---|---|---|
| AI 6本（`generate-report` `search-chat` `pest-control-advice` `advise` `diagnose-image` `structure-voice`）＋ `_auth.ts` `_quota.ts` | Edge Functions。`api/types.ts` が @vercel/node に依存しない最小定義なので、受け口の変換を1つ作れば中身は流用できる | 中 |
| `pesticide-registration`（FAMIC の ZIP→CSV 18MB をその場で解析） | Edge Functions の計算時間の上限に収まらない恐れ。**既存の `pesticides_master` と FAMIC 同期の表から検索する方式に変える** | 中 |
| `set-user-auth` `delete-account` | Edge Functions（上表 #1 と、アプリ内削除の必須化に合わせる） | 小〜中 |
| `purge-deleted`（`vercel.json` の cron） | Supabase の定期実行（pg_cron） | 小 |
| `notify-line` | 移さない（上表 #6） | — |

秘密の値（`OPENAI_API_KEY` など）は Supabase の Secrets に登録する。アプリ側に置かない。

## 順番とリリースまでのルールとの関係
CLAUDE.md「リリースまでは新機能を追加しない」に合わせる。API の置き場所の変更とアプリ内 URL の差し替えは機能追加ではなく、審査に関わる対応として**リリース前に行う**。

1. **リリース前**：API を Edge Functions へ移し、Expo版の呼び先を切り替える（`lib/ai.ts` の `callApi`、`lib/store.tsx` の農薬登録の2か所。重複している `API_BASE` は無くす）
   - **2026-10-25 デプロイ済み**：Edge Function `api` 1本にまとめ、7本を URL の末尾で振り分ける（`supabase/functions/api/index.ts`）。土台 URL は `expo-prototype/lib/supabase.ts` の `API_BASE`。手順は `docs/supabase-ops.md`
   - 農薬登録情報は今の作り（毎回 FAMIC の CSV を解析）のまま移した。手元の実測で初回 CPU 0.6 秒・2回目以降 8ms。本番ログの `FAMIC load` が上限（約2秒）に近ければ、DB に適用部の表を作る方式へ切り替える
   - **2026-10-25 シミュレーターで確認済み**：ログインした状態で、次の散布時期・相談・写真で調べる・記録に聞く・日報・農薬の適用情報が Edge Function 経由で答えを返した。音声メモの整理（structure-voice）はマイクが要るので未確認（実機の iPhone で見る）
   - 確認中に見つかった前からの不具合2件（シートからシートへ切り替えると開かない／記録に聞くの入力欄がキーボードに隠れる）も直した
   - 残り：新しいビルドを TestFlight で配る。それまで配布中のアプリは Vercel の API を使い続ける
2. **リリース前**：サポート／プライバシーの2ページを自分のドメインへ移し、アプリ内の直書き2か所（`lib/aiConsent.ts` の `PRIVACY_URL`、`App.tsx` のサポートURL）と App Store Connect の URL を差し替える。`privacy.html` の委託先から Vercel を外す
3. **0.1.0**：ユーザー管理（#1）。既存の決定どおり
4. **リリース後**：#2〜#4 を移す（#5 ガント・#6 LINE通知は移さない）
5. 移し終えたら Web版と Vercel を閉じる

## 凍結中の Web版で起きること（受け入れる）
- 手順1で API を移すと、Web版の AI 機能と農薬登録情報は動かなくなる（Web版は Vercel の `/api` を呼び続け、凍結中なので書き換えない）。記録・閲覧・ユーザー管理は動く
- 手順2のあと、Web版の `public/privacy.html` `public/support.html` は古いまま残る。App Store からは参照しない

## 未決（その時点で決める）
- **Web版と Vercel を閉じる期限。** 有料プランの販売開始で Vercel Hobby の規約にかかるため、販売開始より前が期限。そこまでに #2〜#4 が移し終わっていない場合、帳票出力などが一時的に使えない期間を受け入れるか、販売開始を待つかを決める
- `kishufarm.com` の Cloudflare 移管時、`info@kishufarm.com`（サポートの連絡先）のメール設定を引き継ぐこと
- 有料顧客を載せる時点で Supabase Pro（約$25/月）に切り替えるか。無料プランは1週間アクセスが無いと休止し、自動バックアップも無い

## 戻す条件
- Supabase Edge Functions の制約（計算時間・料金）で AI 機能が安定して動かないと分かったとき → 案A（Vercel Pro）を再検討する
