# 引き継ぎ: App Store 申請（2026-09-13 時点）

このドキュメント1枚で再開できるようにしてある。判断の根拠は
`docs/decisions/20260912-release-line.md`（リリースの線・配置の基準・既知課題）。

---

## 1. いまどこにいるか

リリース条件は3つだけと決めた。**②③が残り。機能開発はゼロ。**

| | 条件 | 状態 |
|---|---|---|
| ① | セキュリティ（匿名から本番データが読めないこと） | ✅ **完了**（2026-09-13） |
| ② | Apple Developer 登録 / privacy の運営者情報 / 本番 `OPENAI_API_KEY` | ❌ 未着手（すべてオーナーの手番） |
| ③ | worker が1人以上いて、admin 以外の入力が1件以上ある | ❌ 未着手 |

**`main` は 2026-09-13 に45コミット分をデプロイ済み**（`6ba6710`）。本番Webは最新。

---

## 2. 判断の基準（これを守れば迷わない）

配置・デザインを直したくなったら、実装前にこの3問に当てる。

> 1. 直さないと**審査で落ちる**か
> 2. 直さないと**必達3タスクが説明ゼロで完了しない**か
> 3. 直さないと**法令記録が欠ける／画面とAIの数字が食い違う**か

**どれでもなければ直さない。** `20260912-release-line.md` の「既知課題」表に1行積んで次へ。

- 必達3タスク（`20260824-no-manual-test.md`）は**役割で割る**：①畑を1つ登録＝**管理者**（worker には権限が無い）／②作業を1件記録・③農薬を撒いたことを記録＝**worker**
- **UI配置の変更は `ai_outputs.entry_point` が n≧30 になるまで凍結。** 3回作り直して3回とも「効果は未検証」で終わっている
- **Web で調整 → 固まったら Expo に反映。ただし申請は待たない**

---

## 3. 2026-09-13 に消した「出してはいけない理由」6件

| | 内容 | 直し方 |
|---|---|---|
| 1 | `advice_threads` が匿名で4行読めた | `2026-09-12-rls-anon-leaks.sql` |
| 2 | `work_categories` が匿名で6行読めた。**RLS 自体が無効**でポリシーが無視されていた | 同上（`enable row level security` 込み） |
| 3 | 作業写真が匿名で**全件列挙**できた（16件） | `2026-09-13-storage-anon-list.sql` |
| 4 | `notify-line` が `organization_id` を body から受け、他組織のLINEに送れた | `requireAppUser` を新設し認証情報から取る |
| 5 | `diagnose-image` が任意URLを取りに行っていた（SSRF） | 自分のStorageの公開／署名付きURLに限定 |
| 6 | **expo-font 未リンクで実機ビルドが起動直後に落ちていた** | `npx expo install expo-font`（~14.0.12） |

4・5 は契約テスト `scripts/test-api-auth-boundaries.mjs`（15件）で固定済み。`npm test` に入っている（全410件）。

**6 は Expo Go では表面化しない。** ネイティブビルドで初めて出るので、EAS の本番ビルドでも落ちていたはず。

---

## 4. 次にやること

### オーナーの手番

| # | 内容 | 所要 | 備考 |
|---|---|---|---|
| 1 | **worker アカウントを1人作って現場に渡す** | 数分 | Web → 右上のユーザーアイコン → 「管理画面」。**Expo版には作成UIが無い**ので Web からのみ |
| 2 | **審査用デモアカウント**を作る | 数分 | 同じ画面。Guideline 2.1 で必須 |
| 3 | Apple Developer 登録（$99/年・**年額のみ**） | 個人名義で即日〜数日 | 一番待つ。**TestFlight にも必要** |
| 4 | 運営者名・連絡先メール → `public/privacy.html` 9章と `public/support.html`（サポートURL）の**2か所** | — | 値をセッションに渡せば記入は AI 側でできる。審査用の連絡先（氏名・電話）も同時に |
| 5 | 本番 `OPENAI_API_KEY` の確認（Vercel） | 数分 | 未設定ならAI機能が全滅 |
| 6 | 移行SQL 1本（任意） | 1分 | `alter table crop_advice_messages add column if not exists record_search_query text;` 無くても縮退動作する |

### AI 側（2026-09-15 に済ませたもの）

- ✅ **App Store Connect の入力項目ドラフト** → `docs/app-store-submission.md` 6章（そのまま貼れる形。【オーナー記入】だけ残る）
- ✅ **サポートURL用ページ** `public/support.html`（`/support`）— App Store Connect の必須項目なのに存在しなかった
- ✅ **Expo の `entryPoint`** — `saveAiOutput` で必須にした。型チェックで**7箇所目**（管理タブの作物行 `ManageScreen.tsx`）が見つかった。
  値の割り当ては `expo-prototype/lib/ai.ts` の `AiEntryPoint` のコメントが正（相談タブ＝`thread`、その中の道具＝`thread_tool`、ホーム・記録から開いたものはその画面の値）
  - **未検証**: 実機／シミュレータで AI を1回使い、`ai_outputs.entry_point` に値が入ることをまだ見ていない（ログインは人間）

### 申請時に気をつけること（2026-09-15 に判明）

- **5.1.1(v) アカウント削除**: アプリ内作成が無いので対象外と読んでいるが確証なし。指摘されたら設定画面に「アカウントの削除」行を足す（`app-store-submission.md` 7章）
- **App のプライバシーで「使用状況データ › 製品の操作」を申告する**（`entry_point` は利用者に紐付く操作ログ）

---

## 5. スクリーンショット

**5枚撮影済み**（1320×2868・iPhone 17 Pro Max・相談タブ入り・個人名なし）。
**`docs/appstore/screenshots/` に退避済み**（2026-09-15。一時領域から消える前に移した。**未コミット**）。撮り直す場合の手順は7章。
**⚠ 03（作業を記録）と05（ホーム）に実在の住所（天気の地点名）が写っている。** 規約の「地名を出さない」に触れ、
ストアに出すと農場の所在地が公開される。提出前に、地点名を隠すか撮り直すかをオーナーが決める。
提出順は `app-store-submission.md` 6章。

| # | 画面 |
|---|---|
| 01 | 相談（一覧） |
| 02 | 相談（会話） |
| 03 | 作業を記録 |
| 04 | 分析 |
| 05 | ホーム |

**撮らなかったもの と その理由**（再検討しないため）:

- **農薬の使用回数** … 5作物中3つが「見張れません」（`famic_crop_name` 未紐付け）。壊れてはおらず安全側に縮退しているが、差別化として売る絵にならない
- **ガント（計画）** … 3件中2件が「テスト」でバーが出ない
- **写真診断・記録に聞く・日報** … AI機能を並べるのは逆効果。`20260823-ai-wording-outcome-based.md` で「AIが使えること自体に課金価値は無い」と決めている。ストアで ChatGPT と比較されて負ける

→ **どちらも実装ではなく実績データが無いことが原因。** worker が使い始めれば自然に撮れるようになるので、0.2.0 で差し替える。

**スクショは Expo の実機／シミュレータで撮る**（Web と見た目が違うので、Web の画面を出すと Guideline 2.3.3 に触れる）。

---

## 6. 既知課題（3問に当たらないので直さない）

`20260912-release-line.md` の「既知課題」表が正。2026-09-13 時点で:

- 相談の回答に、質問と無関係な農薬の登録情報が常に2件付く（`src/App.tsx` の `facts.slice(0, 2)` が無条件）
- 同じ製品が適用病害ごとに重複して並ぶ
- Expo のタブが「管理」のまま（Web は 2026-09-09 に「メニュー」へ変更済み）
- Web は主題ごとのスレッド、**Expo は作付け単位**。相談タブは見た目だけ揃えてある

---

## 7. シミュレータで画面を出す手順（再開用）

`expo-prototype/ios/` は `.gitignore` 対象（prebuild の生成物・8,298ファイル）。**初回だけ**生成が要る。

```bash
cd ~/Projects/farm-app/expo-prototype

# 初回のみ。ios/ が無いとき
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # 無いと CocoaPods が Encoding::CompatibilityError で落ちる
npx expo prebuild --platform ios --clean
cd ios && pod install && cd ..

# 毎回
npx expo run:ios --device "iPhone 17 Pro Max" --no-install   # --no-install が無いと pod install --repo-update で落ちる
npx expo start                                               # Metro。Debug ビルドは JS をここから読む
```

**`expo-prototype/.env` が要る**（gitignore 対象）。ルートの `.env` の値を
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` として書く。

**Metro が落ちているとアプリは赤画面になる。** Release ビルド（`--configuration Release`）なら JS が同梱され Metro 不要。

**ログインは人間がやる。** AI は認証情報を入力しない。

シミュレータ操作（タップ・撮影）には Claude のデバイスアクセス許可が要る。シミュレータパネルからデバイスをアタッチし「Let Claude use it」を押してもらう。`xcode-select` が Xcode を指していないときは
`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`（**要パスワード・人間が実行**）。

---

## 8. 今日の通しテーマ（次も必ず効く）

**「表示」ではなく「結果」を見る。** 2026-09-13 に4回、表示と実態が食い違った。

| 表示 | 実態 |
|---|---|
| SQL Editor が「Success」 | ポリシーが作られていなかった（2026-09-05） |
| `pg_policies` に正しいポリシーがある | **RLS 自体が無効**でポリシーが無視されていた |
| バックグラウンド処理が exit 0 | 中の `pod install` が失敗していた |
| 本番のバンドルが古く見えた | 実際は新しかった（判定用の grep が壊れていた） |

**RLS の確認は3点セット**：①`pg_policies` でポリシーの実在 ②RLS有効フラグ（下記）③**外から匿名キーで叩く**。3つ目だけが実際に塞がっている証拠になる。

```sql
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false order by relname;
```

```bash
curl -s -D - -o /dev/null '<SUPABASE_URL>/rest/v1/<table>?select=*&limit=0' \
  -H 'apikey: <anon>' -H 'Prefer: count=exact' | grep -i content-range
```

**実施記録は作業当日にコミットする。** 2026-09-05 の RLS 実施記録が未コミットだったせいで、別セッションが「RLS は未適用」という誤った前提で ADR を書いた。それが今回の出発点になった。
