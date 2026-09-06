// src/lib/adviceMatch.ts の検証（助言 × 作業記録の照合）。Web版。
// テストランナーを入れていないので Node の型ストリップ + assert だけで動かす。
//
//   cd ~/Projects/farm-app && node scripts/test-advice-match.mjs
//
// 検証の主眼は3つ。
//   1. 「未実施」と「照合できない」を混ぜていないこと。混ぜると「やったのに未実施と
//      言われる」か「できていないのに見逃す」のどちらかが起きる
//   2. `crop_id` が null の助言（畑全体の相談から出たもの）を作物で絞らないこと。
//      null を作物IDと比較すると永遠に一致せず、やったのに「まだ」のまま残る
//   3. 期限が無い助言を期限切れにしないこと
//
// Expo版（expo-prototype/scripts/test-advice-match.mjs）と対になるが、**表示文言が
// 両者で異なる**ため期待値は共有できない（Web: 「まだ」「記録から分かりません」）。
import { pathToFileURL } from "node:url";

const {
  matchAction, matchActions, countMatches, statusLabel, matchDetail, formatAdviceHistoryForPrompt,
} = await import(pathToFileURL(process.cwd() + "/src/lib/adviceMatch.ts").href);

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

const action = (o = {}) => ({
  id: "a1", crop_id: 5, message_id: "m1", title: "追肥する", work_type: "施肥",
  due_from: null, due_to: null, when_text: "今週中", why: "生育中期のため",
  sort_order: 0, dismissed_at: null, created_at: "2026-08-01T09:00:00Z", ...o,
});
const report = (o = {}) => ({
  id: 1, crop_id: 5, date: "2026-08-03", work_type: "施肥", note: "", ...o,
});

console.log("\n実施済みの判定:");
let m = matchAction(action(), [report()], "2026-08-05");
t("期間内に同じ作業の記録があれば done", m.status === "done");
t("根拠の記録を返す", m.matchedReports.length === 1 && m.matchedReports[0].date === "2026-08-03");
t("照合期間の開始を返す（画面に併記するため）", m.windowStart === "2026-08-01");
m = matchAction(action(), [report({ date: "2026-07-20" })], "2026-08-05");
t("助言より前の作業は数えない（言われる前にやった分）", m.status === "pending");
m = matchAction(action(), [report({ work_type: "防除" })], "2026-08-05");
t("作業種別が違えば done にしない", m.status === "pending");
m = matchAction(action(), [report({ work_type: "施肥準備" })], "2026-08-05");
t("部分一致では done にしない（施肥 ≠ 施肥準備）", m.status === "pending");
m = matchAction(action(), [report({ crop_id: 9 })], "2026-08-05");
t("別の作付けの記録は数えない", m.status === "pending");

// ここが今回（2026-09-06）足した分岐。畑全体の相談から出た「やること」は
// どの作付けの記録とも照合する（docs/decisions/20260906-general-advice-entry.md）
console.log("\n畑全体の相談（crop_id が null）:");
m = matchAction(action({ crop_id: null }), [report({ crop_id: 9 })], "2026-08-05");
t("作物を絞らず、別の作付けの記録でも done になる", m.status === "done");
m = matchAction(action({ crop_id: null }), [report({ crop_id: 5 })], "2026-08-05");
t("どの作付けの記録でも拾う", m.status === "done");
m = matchAction(action({ crop_id: null }), [report({ crop_id: 9, work_type: "防除" })], "2026-08-05");
t("作物を絞らなくても作業種別の条件は効く", m.status === "pending");
m = matchAction(action({ crop_id: null }), [report({ crop_id: 9, date: "2026-07-20" })], "2026-08-05");
t("作物を絞らなくても期間の条件は効く", m.status === "pending");
m = matchAction(action({ crop_id: null, work_type: null }), [report({ crop_id: 9 })], "2026-08-05");
t("work_type が null なら作物を問わず unmatchable", m.status === "unmatchable");
m = matchAction(action({ crop_id: 5 }), [report({ crop_id: 9 })], "2026-08-05");
t("作物を指定した助言は従来どおり絞る（回帰）", m.status === "pending");

console.log("\n「未実施」と「照合できない」を混ぜない（最重要）:");
m = matchAction(action({ work_type: null }), [], "2026-08-05");
t("work_type が null は unmatchable", m.status === "unmatchable");
t("unmatchable は pending ではない", m.status !== "pending");
t("unmatchable の説明で未実施と断定しない",
  matchDetail(m).includes("分かりません") && !matchDetail(m).includes("未実施"));
t("表示文言も「未実施」ではない", statusLabel("unmatchable") === "記録から分かりません");
t("プロンプトでも未実施と決めつけないよう指示",
  formatAdviceHistoryForPrompt([m]).includes("「やっていない」という意味ではない"));

console.log("\n期限の扱い:");
m = matchAction(action({ due_to: "2026-08-03" }), [], "2026-08-05");
t("期限を過ぎて記録が無ければ overdue", m.status === "overdue");
m = matchAction(action({ due_to: "2026-08-10" }), [], "2026-08-05");
t("期限内なら pending", m.status === "pending");
m = matchAction(action({ due_to: null }), [], "2026-12-31");
t("期限が無ければ何日経っても overdue にしない", m.status === "pending");
m = matchAction(action({ due_to: "2026-08-03" }), [report({ date: "2026-08-09" })], "2026-08-20");
t("期限後にやった記録も done として拾う", m.status === "done");

console.log("\ndue_from（先の作業を指定された場合）:");
m = matchAction(action({ due_from: "2026-08-10" }), [report({ date: "2026-08-05" })], "2026-08-20");
t("due_from より前の記録は数えない", m.status === "pending" && m.windowStart === "2026-08-10");
m = matchAction(action({ due_from: "2026-07-01" }), [report({ date: "2026-07-15" })], "2026-08-05");
t("due_from が助言日より前でも助言日より遡らない", m.windowStart === "2026-08-01" && m.status === "pending");

console.log("\nやらないと判断したもの:");
m = matchAction(action({ dismissed_at: "2026-08-02T00:00:00Z" }), [report()], "2026-08-05");
t("dismissed は記録があっても dismissed のまま", m.status === "dismissed");
t("dismissed は消さずに残す（判断の履歴）", m.action.dismissed_at !== null);

console.log("\n一覧と集計:");
const list = matchActions([
  action({ id: "a1", created_at: "2026-08-01T09:00:00Z" }),
  action({ id: "a2", work_type: "防除", created_at: "2026-08-04T09:00:00Z" }),
  action({ id: "a3", work_type: null, created_at: "2026-08-03T09:00:00Z" }),
], [report()], "2026-08-05");
t("新しい助言が先に並ぶ", list[0].action.id === "a2");
const c = countMatches(list);
t("集計が状態ごとに出る", c.done === 1 && c.pending === 1 && c.unmatchable === 1);
t("集計の合計が件数と一致", Object.values(c).reduce((a, b) => a + b, 0) === 3);

console.log("\nプロンプト整形（エージェントの要点）:");
const txt = formatAdviceHistoryForPrompt(list);
t("同じ助言を繰り返さないよう指示", txt.includes("同じ助言を繰り返さず"));
t("実施済みは日付つきで載る", txt.includes("やった") && txt.includes("2026-08-03"));
t("未実施も「まだ」として載る", txt.includes("まだ"));
t("空なら空文字（プロンプトを汚さない）", formatAdviceHistoryForPrompt([]) === "");
const many = Array.from({ length: 25 }, (_, i) =>
  matchAction(action({ id: `x${i}`, work_type: null }), [], "2026-08-05"));
t("件数上限を超えたら省略を明記", formatAdviceHistoryForPrompt(many, 20).includes("ほか5件は省略"));
// 見出しは相談の対象で変える（畑全体の相談で「この作付け」と書くと嘘になる）
t("既定は作付け向けの見出し", txt.includes("この作付けへ出した助言"));
t("畑全体は見出しを変える",
  formatAdviceHistoryForPrompt(list, 20, "farm").includes("畑全体の相談で出した助言"));
t("畑全体でも「この作付け」とは書かない",
  !formatAdviceHistoryForPrompt(list, 20, "farm").includes("この作付け"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
