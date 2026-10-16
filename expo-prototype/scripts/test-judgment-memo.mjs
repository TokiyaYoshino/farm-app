// lib/judgmentMemo.ts の検証（相談のやりとり → 記録に添える判断メモ）。
//
//   cd ~/Projects/farm-app/expo-prototype && node scripts/test-judgment-memo.mjs
//
// 検証の主眼は「相談で実際に出た文だけでメモを作る」こと。エージェントに理由を作文させると、
// 本人が考えていない理由が日記に残り、翌年の自分が誤った根拠で判断する
// （docs/decisions/20261012-solo-learning-loop.md）。
import { pathToFileURL } from "node:url";

const { buildJudgmentMemo, firstSentence } = await import(
  pathToFileURL(new URL("../lib/judgmentMemo.ts", import.meta.url).pathname).href
);

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

console.log("\n結論の一文:");
t("最初の「。」までを返す", firstSentence("10月18日ごろが目安です。最低気温が下がるためです。") === "10月18日ごろが目安です。");
t("改行でも区切る", firstSentence("追肥は今週中に\n下葉の色を見て") === "追肥は今週中に");
t("前後の空白を落とす", firstSentence("  様子見で大丈夫です。 ") === "様子見で大丈夫です。");
t("長すぎる文は切って…を付ける", firstSentence("あ".repeat(120)).length <= 81 && firstSentence("あ".repeat(120)).endsWith("…"));

console.log("\n判断メモ:");
const memo = buildJudgmentMemo({
  question: "たまねぎの定植はいつがいい？",
  reply: "10月18日ごろが目安です。去年の記録でも10/18に定植しています。",
  watchPoints: ["最低気温が10℃を下回る日", "苗の太さ"],
  date: "2026-10-12",
});
t("相談した日が入る", memo.includes("10/12"));
t("聞いたことがそのまま入る", memo.includes("たまねぎの定植はいつがいい？"));
t("答えは結論の一文だけ", memo.includes("10月18日ごろが目安です。") && !memo.includes("去年の記録でも"));
t("見ておくことは2件まで入る", memo.includes("最低気温が10℃を下回る日") && memo.includes("苗の太さ"));

const noWatch = buildJudgmentMemo({ question: "追肥は？", reply: "今週中が目安です。", watchPoints: [], date: "2026-10-12" });
t("見ておくことが無ければ行を出さない", !noWatch.includes("見ておくこと"));

const many = buildJudgmentMemo({ question: "q", reply: "a。", watchPoints: ["1", "2", "3", "4"], date: "2026-10-12" });
t("見ておくことは3件目以降を落とす", !many.includes("・3"));

t("質問が空ならメモを作らない", buildJudgmentMemo({ question: "  ", reply: "a。", watchPoints: [], date: "2026-10-12" }) === "");
t("答えが空ならメモを作らない", buildJudgmentMemo({ question: "q", reply: "", watchPoints: [], date: "2026-10-12" }) === "");

console.log(`\n${pass} 通過 / ${fail} 失敗`);
if (fail > 0) process.exit(1);
