# リポジトリの置き場所とブランチの扱い

- 作成: 2026-09-16
- きっかけ: 「farm-app と `~/Projects/farm-app` がバラバラになっているのが気になる」

## 1. リポジトリは1つしかない

分かれているのは**置き場所**であって、中身ではない。

| 場所 | 実体 | 寿命 |
|---|---|---|
| `github.com/TokiyaYoshino/farm-app` | **正本** | — |
| `~/Projects/farm-app`（Mac） | 正本の clone | 常設 |
| `/home/user/farm-app`（クラウドセッション） | 正本の clone。セッション開始時に毎回新しく clone される | **コンテナ回収で消える** |

クラウド側は使い捨てなので、**push していないものは残らない**。

なお `github.com/TokiyaYoshino/kishufarm`（Webサイト）は**別のリポジトリ**。これは分かれていて正常。

## 2. 噛み合っていない点（これが「バラバラ」の正体）

**Mac は `main` で直接作業し、クラウドセッションは `claude/*` ブランチで作業する。**
このため、クラウドでやった仕事は Mac で `git pull` しても入ってこない。

### Mac 側でクラウドの成果を取り込む

```
cd ~/Projects/farm-app
git fetch origin
git log --oneline origin/main..origin/claude/<ブランチ名>   # 何が入るか先に見る
git merge origin/claude/<ブランチ名>
```

### クラウド側で Mac の成果を取り込む

セッション開始時に clone されるので基本は不要。セッション中に Mac が push したら `git fetch origin && git merge origin/main`。

### 落とし穴

- **Mac がオフラインの間、Mac のローカル変更は誰からも見えない。** 実際に 09-05 の
  実施記録が未コミットのまま残り、別セッションから見えず記録と実態が食い違った
  （`docs/decisions/20260912-release-line.md`）。**その日の作業はその日にコミットして push する**
- クラウドのセッションが切れると、push していない作業は消える

## 3. ブランチ在庫（2026-09-16 時点）

`origin` に26本。`main` と作業中の1本を除く**24本が放置**。

### 3-1. main に完全に取り込み済み（消しても何も失われない）

`git merge-base --is-ancestor` で確認済み。commit は main 側に残り続けるので、
消しても下の SHA からいつでも復元できる。

| ブランチ | SHA | 最終 |
|---|---|---|
| `claude/ai-feature-placement-ux-r3b4pc` | `0508d500caa5d0d3fb6d44d1d4de3b89230cb3fc` | 2026-09-10 |
| `claude/feature-list-final-tuning-45vi5r` | `d5623cf3430ed5ab9b3fc6ab60ebd58460db1521` | 2026-08-05 |
| `feat/crop-advisor` | `d44667748f9a8d8e06d8d2ad000886487e8d049c` | 2026-08-10 |

復元: `git push origin <SHA>:refs/heads/<ブランチ名>`

### 3-2. main に無い変更を持つ（消す前に中身を見ること）

| ブランチ | SHA | 最終 | 備考 |
|---|---|---|---|
| `claude/farm-ai-agent-resolution-s9qw2j` | `83dcbdf` | 2026-09-10 | |
| `claude/ai-assistant-layout-review-8btiid` | `1555cf8` | 2026-09-08 | **セッションが未完了（指示待ちで停止）。消さない** |
| `claude/side-income-contract-calculation-9i0ioa` | `0c18c89` | 2026-09-06 | |
| `claude/rls-explanation-81lalo` | `2d1cc12` | 2026-09-05 | |
| `claude/remaining-tasks-check-jb492f` | `5b21fae` | 2026-09-05 | |
| `claude/kishufarm-web-market-research-qce50i` | `6297c53` | 2026-09-02 | |
| `claude/agriculture-app-market-size-d94ndv` | `bdc717e` | 2026-08-09 | |
| `claude/nourecord-app-store-pages-uym53n` | `41a142f` | 2026-08-09 | |

### 3-3. main と共通祖先が無い（履歴が断絶している。特に慎重に）

**13本は `main` と共通の祖先を持たない。** どこかで main の履歴が差し替わったため、
これらは別系統の履歴として孤立している。`git merge` は
`refusing to merge unrelated histories` になり、`main...branch` の3点比較も意味を持たない
（この性質のせいで、最初に出した分類が歪んだ）。**ここにしか無い作業が眠っている可能性がある。**

`claude/multitenancy-rls` `49bb75b` / `claude/expo-design-changes-9acvvh` `2604284` /
`claude/fix-it-qp9k7b` `309c854` / `claude/multitenancy-step2-done` `8eba99b` /
`claude/multitenancy-step2` `5a733de` / `claude/agriculture-platforms-research-lghls5` `974ce59` /
`claude/multitenancy-step1-done` `a7fc2d4` / `claude/multitenancy-step1` `44f2902` /
`claude/app-store-submission-path-jkrpyq` `f5467a8` / `backup/main-ai-features-20260728` `655a0a2` /
`claude/app-chatgpt-api-integration-pq1rgo` `53a81ff` / `claude/pm-skills-plan-9v6rp3` `59875a1` /
`TokiyaYoshino/patch-56579` `490c233`（2026-03-23）

いずれも 2026-07〜08 以前。マルチテナント化の途中経過が多く、
`docs/multitenancy-progress.md` の記録と突き合わせれば判断できる見込み。

## 4. 運用の約束

1. **クラウドセッションの成果は必ず push する。** ブランチ名はセッションが指定したものを使う
2. **Mac は取り込むとき `git fetch` してからマージする。** `git pull` だけでは `claude/*` は入らない
3. **実施記録はその日のうちにコミットする**（`20260912-release-line.md` の教訓）
4. **ブランチを消すのは 3-1 の分類が付いたものだけ。** 3-3 は履歴が孤立しているので、
   消す前に中身を見る
