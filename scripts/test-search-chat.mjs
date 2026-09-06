// api/search-chat.ts の検証（記録検索チャット）。
// テストランナーを入れていないので Node の型ストリップ + assert だけで動かす。
//
//   cd ~/farm-app && node scripts/test-search-chat.mjs
//
// OpenAI は叩かずに global.fetch を差し替える。検証したいのは LLM の出力品質ではなく
//   1. 根拠の日付を、渡した記録に実在するものだけに絞れているか  ← 誤ると確かめられない根拠を出す
//   2. 落としたぶんを黙らずに notes に出すか
//   3. 注意書きをサーバー側の固定文言で必ず返すか（LLM に書かせない）
//   4. 今日の日付を渡し、「去年」を西暦に読み替えさせているか  ← 年の取り違えの原因だった
//   5. 事前に数えた集計を使わせ、自分で数え直させないか
// という**サーバー側で固定している契約**の部分。
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import assert from "node:assert";

// api/*.ts は `./_auth.js` を import する（実体は _auth.ts）。scripts/test-advise.mjs と同じ
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("_auth.js")) return next(specifier.replace(/_auth\.js$/, "_auth.ts"), context);
    return next(specifier, context);
  },
});

const handler = (await import(pathToFileURL(new URL("../api/search-chat.ts", import.meta.url).pathname).href)).default;
const { formatWorkCountsForPrompt } = await import(pathToFileURL(new URL("../src/lib/metrics.ts", import.meta.url).pathname).href);

process.env.OPENAI_API_KEY = "test-key";
process.env.VITE_SUPABASE_URL = "https://test.supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const isAuthUrl = url => String(url).includes("/auth/v1/user");
const authOk = () => ({ ok: true, status: 200, json: async () => ({ id: "test-auth-id", email: "t@example.com" }), text: async () => "" });

let captured = null;
let llmJson = null;
const DEFAULT_LLM_JSON = {
  answer: "去年の梅の防除は1回でした。",
  answerable: true,
  evidence: [{ date: "2025-09-20", detail: "防除・ﾀﾞｺﾆｰﾙ1000" }],
};
globalThis.fetch = async (url, opts) => {
  if (isAuthUrl(url)) return authOk();
  captured = JSON.parse(opts.body);
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(llmJson ?? DEFAULT_LLM_JSON) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
    text: async () => "",
  };
};

const call = async body => {
  let out = null;
  const res = { status: code => ({ json: b => { out = { code, body: b }; }, end: () => { out = { code, body: null }; } }) };
  await handler({ method: "POST", body, headers: { authorization: "Bearer test-token" } }, res);
  return out;
};
const prompt = () => captured.messages.map(m => m.content).join("\n");

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

const RECORDS = [
  "2026-08-05 【ほうれん草・上の段】作業:防除 / 農薬:ﾀﾞｺﾆｰﾙ1000(300L)",
  "2025-09-20 【ほうれん草・上の段】作業:防除 / 農薬:ﾀﾞｺﾆｰﾙ1000(300L)",
].join("\n");
const Q = "去年の梅の防除は何回した？";

console.log("\n入力の検証:");
t("question 無しは 400", (await call({ records: RECORDS })).code === 400);
t("records 無しは 400", (await call({ question: Q })).code === 400);
t("question が長すぎれば 400", (await call({ question: "あ".repeat(401), records: RECORDS })).code === 400);
t("records が長すぎれば 400", (await call({ question: Q, records: "あ".repeat(20001) })).code === 400);
t("GET は 405", await (async () => {
  let c = null;
  await handler({ method: "GET" }, { status: x => ({ json: () => { c = x; }, end: () => { c = x; } }) });
  return c === 405;
})());

console.log("\n認証（OpenAI キーの踏み台にさせない）:");
t("Authorization が無ければ 401", await (async () => {
  let out = null;
  const res = { status: code => ({ json: b => { out = { code, body: b }; }, end: () => { out = { code, body: null }; } }) };
  await handler({ method: "POST", body: { question: Q, records: RECORDS }, headers: {} }, res);
  return out.code === 401;
})());

console.log("\n構造化出力を要求する（自由文で返させない）:");
let r = await call({ question: Q, records: RECORDS });
t("200 で返る", r.code === 200);
t("strict スキーマを要求している",
  captured.response_format?.type === "json_schema"
  && captured.response_format.json_schema?.strict === true
  && captured.response_format.json_schema?.name === "record_search_answer");
t("結論を1文目に出すよう指示", prompt().includes("1文目で結論を述べる"));
t("本文で箇条書き・markdown を禁じている", prompt().includes("markdown を使わないこと"));
t("answer はトップレベルに残す（既存の呼び出し元を壊さない）", typeof r.body.answer === "string");
t("answerable を返す", r.body.answerable === true);

console.log("\n日付の扱い（年の取り違えを防ぐ）:");
r = await call({ question: Q, records: RECORDS, today: "2026-08-29" });
t("今日の日付をプロンプトに渡す", prompt().includes("今日は 2026-08-29"));
t("「去年」を西暦に読み替えさせる", prompt().includes("「去年」は2025年"));
t("年を推測させない", prompt().includes("年を推測・補完してはならない"));
t("事前集計の数字を使わせる", prompt().includes("その表の数字をそのまま使うこと"));
t("自分で数え直させない", prompt().includes("自分で記録を数え直してはならない"));
r = await call({ question: Q, records: RECORDS });
t("today 未指定でも今日の日付が入る", /今日は \d{4}-\d{2}-\d{2}/.test(prompt()));
t("不正な today は無視して今日にフォールバック", await (async () => {
  await call({ question: Q, records: RECORDS, today: "去年" });
  return /今日は \d{4}-\d{2}-\d{2}/.test(prompt()) && !prompt().includes("今日は 去年");
})());

console.log("\n根拠は渡した記録に実在するものだけ通す（最重要）:");
llmJson = {
  answer: "4回です。", answerable: true,
  evidence: [
    { date: "2025-09-20", detail: "実在する" },
    { date: "2025-05-25", detail: "実在しない（年の取り違え）" },
    { date: "今週", detail: "日付の形をしていない" },
    { date: "2026-08-05", detail: "" },
  ],
};
r = await call({ question: Q, records: RECORDS });
t("実在する日付だけ残る", r.body.evidence.length === 1 && r.body.evidence[0].date === "2025-09-20");
t("記録に無い日付は落とす", !JSON.stringify(r.body.evidence).includes("2025-05-25"));
t("日付の形でないものは落とす", !JSON.stringify(r.body.evidence).includes("今週"));
t("detail が空のものは落とす", !r.body.evidence.some(e => e.detail === ""));
t("落としたことを notes に明記（黙って消さない）",
  r.body.notes.some(n => n.includes("3件") && n.includes("見つからなかった")));
t("answer 自体は消さない（根拠が落ちても回答は返す）", r.body.answer === "4回です。");
llmJson = null;
r = await call({ question: Q, records: RECORDS });
t("全部実在すれば注記は出ない", !r.body.notes.some(n => n.includes("見つからなかった")));

console.log("\n注意書きはサーバーが固定文言で返す（LLM に書かせない）:");
t("LLM には注意書きを生成させない", prompt().includes("注意書き・免責") && prompt().includes("生成しないこと"));
r = await call({ question: Q, records: RECORDS });
t("記録の範囲についての注意が必ず付く",
  r.body.notes.some(n => n.includes("記録し忘れた作業は含まれません")));
t("農薬に触れるなら総使用回数の原文の注意が付く",
  r.body.notes.some(n => n.includes("総使用回数") && n.includes("製品ラベル")));
t("農薬に触れるなら混合剤の注意が付く",
  r.body.notes.some(n => n.includes("混合剤") && n.includes("成分別")));
// 既定スタブの根拠日付はこの記録に無く除外注記が増えるため、根拠を合わせておく
llmJson = { answer: "1,200kgでした。", answerable: true, evidence: [{ date: "2026-07-20", detail: "収穫1200kg" }] };
r = await call({ question: "先月の収穫量は？", records: "2026-07-20 【ほうれん草】作業:収穫 / 数量:1200kg" });
t("農薬と無関係なら農薬の注意は付けない",
  !r.body.notes.some(n => n.includes("混合剤")) && r.body.notes.length === 1);
llmJson = null;

console.log("\nLLM 出力の取り扱い:");
r = await call({ question: Q, records: RECORDS });
t("costUsd を算出する", typeof r.body.costUsd === "number" && r.body.costUsd > 0);
const saved = globalThis.fetch;
globalThis.fetch = async url => isAuthUrl(url) ? authOk()
  : ({ ok: true, json: async () => ({ choices: [{ message: { content: "これはJSONではない" } }] }), text: async () => "" });
t("JSON でない応答は 502（壊れた表示を出さない）", (await call({ question: Q, records: RECORDS })).code === 502);
globalThis.fetch = async url => isAuthUrl(url) ? authOk()
  : ({ ok: false, status: 429, text: async () => "rate limit", json: async () => ({}) });
t("OpenAI エラーは 502", (await call({ question: Q, records: RECORDS })).code === 502);
globalThis.fetch = saved;
llmJson = { answer: "   ", answerable: true, evidence: [] };
t("回答が空なら 502", (await call({ question: Q, records: RECORDS })).code === 502);
llmJson = null;

console.log("\n作業の集計（数えるのはコード・言い換えるのが LLM）:");
const COUNT_ROWS = [
  { date: "2026-08-05", work_type: "防除" },
  { date: "2026-07-02", work_type: "防除" },
  { date: "2026-06-20", work_type: "収穫" },
  { date: "2025-09-20", work_type: "防除" },
  { date: "2025-11-15", work_type: "施肥" },
];
const counts = formatWorkCountsForPrompt(COUNT_ROWS);
t("年ごとに分けて数える", counts.includes("2026年:") && counts.includes("2025年:"));
t("同じ年の同じ作業をまとめる", counts.includes("防除2回"));
t("年をまたいで合算しない", /2025年: [^\n]*防除1回/.test(counts));
t("新しい年から並べる", counts.indexOf("2026年") < counts.indexOf("2025年"));
t("件数の多い順に並べる", /2026年: 防除2回 \/ 収穫1回/.test(counts));
t("この数字が正であると明記する", counts.includes("この数字が正"));
t("記録が無ければ空文字（見出しだけ出さない）", formatWorkCountsForPrompt([]) === "");
t("日付・作業種別が壊れた行は無視する",
  formatWorkCountsForPrompt([{ date: "不明", work_type: "防除" }, { date: "2026-01-01", work_type: "  " }]) === "");
assert(typeof counts === "string");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
