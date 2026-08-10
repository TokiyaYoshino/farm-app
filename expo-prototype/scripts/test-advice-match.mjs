// lib/adviceMatch.ts の検証（助言 × 作業記録の照合）。
// テストランナーを入れていないので Node の型ストリップ + assert だけで動かす。
//
//   cd ~/farm-app/expo-prototype && node scripts/test-advice-match.mjs
//
// 検証の主眼は「未実施」と「照合できない」を混ぜていないこと。混ぜると
// 「やったのに未実施と言われる」か「できていないのに見逃す」のどちらかが起きる。
import { pathToFileURL } from "node:url";

const {
  matchAction, matchActions, countMatches, statusLabel, matchDetail, formatAdviceHistoryForPrompt,
} = await import(pathToFileURL(new URL("../lib/adviceMatch.ts", import.meta.url).pathname).href);

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

const action = (o = {}) => ({
  id: "a1", crop_id: 5, message_id: "m1", title: "追肥する", work_type: "施肥",
  due_from: null, due_to: null, when_text: "今週中", why: "生育中期のため",
  sort_order: 0, dismissed_at: null, created_at: "2026-08-01T09:00:00Z", ...o,
});
const report = (o = {}) => ({
  id: 1, user_id: 1, crop_id: 5, field: "A", date: "2026-08-03", work_type: "施肥",
  quantity: "", work_time: "", note: "", image_url: "", weather: "", weather_icon: "",
  temp: "", humidity: "", rain: "", ...o,
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
m = matchAction(action(), [report({ crop_id: 9 })], "2026-08-05");
t("別の作付けの記録は数えない", m.status === "pending");
m = matchAction(action(), [report({ work_type: "施肥準備" })], "2026-08-05");
t("部分一致では done にしない（施肥 ≠ 施肥準備）", m.status === "pending");
m = matchAction(action(), [report({ field: "Z圃場" })], "2026-08-05");
t("圃場が違っても done（助言は作付け単位で圃場を指定していない）", m.status === "done");

console.log("\n「未実施」と「照合できない」を混ぜない（最重要）:");
m = matchAction(action({ work_type: null }), [], "2026-08-05");
t("work_type が null は unmatchable", m.status === "unmatchable");
t("unmatchable は pending ではない", m.status !== "pending");
t("unmatchable の説明で未実施と断定しない",
  matchDetail(m).includes("記録から判断できません") && !matchDetail(m).includes("未実施"));
t("表示文言も「未実施」ではない", statusLabel("unmatchable") === "記録と照合できません");
t("プロンプトでも未実施と決めつけないよう指示",
  formatAdviceHistoryForPrompt([m]).includes("未実施を意味しない"));

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
t("実施済みは日付つきで載る", txt.includes("実施済み") && txt.includes("2026-08-03"));
t("未実施も載る", txt.includes("未実施"));
t("空なら空文字（プロンプトを汚さない）", formatAdviceHistoryForPrompt([]) === "");
const many = Array.from({ length: 25 }, (_, i) =>
  matchAction(action({ id: `x${i}`, work_type: null }), [], "2026-08-05"));
t("件数上限を超えたら省略を明記", formatAdviceHistoryForPrompt(many, 20).includes("ほか5件は省略"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
