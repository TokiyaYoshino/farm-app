// api/advise.ts の検証（作物ごとの相談＝農業エージェント）。
// テストランナーを入れていないので Node の型ストリップ + assert だけで動かす。
//
//   cd ~/farm-app && node scripts/test-advise.mjs
//
// OpenAI は叩かずに global.fetch を差し替える。検証したいのは LLM の出力品質ではなく
//   1. 農薬の「-」（記載なし）を「制限なし」に倒していないか  ← 誤ると法令違反に導く
//   2. 出典・限界が毎回必ず付くか
//   3. プロンプトに渡す範囲が正しいか（未紐付けなら薬剤に触れさせない等）
//   4. work_type を語彙の完全一致だけに絞れているか  ← 誤ると「やっていないのに実施済み」
//   5. 会話履歴を渡せ、打ち切ったら黙らずに限界に出すか
// という**サーバー側で固定している契約**の部分。
import { pathToFileURL } from "node:url";

const handler = (await import(pathToFileURL(new URL("../api/advise.ts", import.meta.url).pathname).href)).default;

process.env.OPENAI_API_KEY = "test-key";

// ── OpenAI 応答のスタブ。送ったプロンプトを captured に残す ──
let captured = null;
// テストごとに LLM の返り値を差し替えられるようにしておく（既定は素直な1件）
let llmJson = null;
const DEFAULT_LLM_JSON = {
  reply: "生育中期なので追肥を検討してください。",
  actions: [{ title: "追肥", work_type: "施肥", when: "今週中",
              due_from: null, due_to: "2026-08-16", why: "生育が進んでいるため" }],
  watch_points: ["べと病の初期病斑"],
  unknowns: ["土壌の状態"],
};
globalThis.fetch = async (url, opts) => {
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

// ── ApiRequest / ApiResponse の最小スタブ ──
const call = async body => {
  let out = null;
  const res = {
    status: code => ({
      json: b => { out = { code, body: b }; },
      end: () => { out = { code, body: null }; },
    }),
  };
  await handler({ method: "POST", body }, res);
  return out;
};

const prompt = () => captured.messages.map(m => m.content).join("\n");

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

const REG_FULL = {
  product_name: "ﾀﾞｺﾆｰﾙ1000", crop_name: "たまねぎ", pest_name: "べと病",
  dilution: "1000倍", usage_timing: "収穫7日前まで", usage_count: "6回以内",
  total_count: "6回以内", application: "散布",
};
// FAMIC は記載が無い欄に "-" を返す（登録4407 ｻﾝｹｲ園芸ﾎﾞﾙﾄﾞｰ / ぶどう で実測）
const REG_BLANK = {
  product_name: "ｻﾝｹｲ園芸ﾎﾞﾙﾄﾞｰ", crop_name: "ぶどう", pest_name: "べと病",
  dilution: "-", usage_timing: "-", usage_count: "-", total_count: "-", application: "散布",
};
const CROP = { name: "たまねぎ", famic_crop_name: "たまねぎ", start_date: "2026-02-20" };
// 呼び出し側（アプリ）が渡す作業種別の語彙。reports.work_type と同じもの
const WORK_TYPES = ["播種", "定植", "施肥", "防除", "除草", "収穫"];

console.log("\n入力の検証:");
t("crop.name 無しは 400", (await call({})).code === 400);
t("crop.name 空文字は 400", (await call({ crop: { name: "  " } })).code === 400);
t("GET は 405", await (async () => {
  let c = null;
  await handler({ method: "GET" }, { status: x => ({ json: () => { c = x; }, end: () => { c = x; } }) });
  return c === 405;
})());
t("forecast が長すぎれば 400",
  (await call({ crop: CROP, forecast: "あ".repeat(4001) })).code === 400);
t("records が長すぎれば 400",
  (await call({ crop: CROP, records: "あ".repeat(8001) })).code === 400);

console.log("\n農薬の「記載なし」を制限なしに倒さない（最重要）:");
let r = await call({ crop: { name: "ぶどう", famic_crop_name: "ぶどう", start_date: "2026-04-01" },
                     registrations: [REG_BLANK] });
t("200 で返る", r.code === 200);
const blankFact = r.body.registrationFacts[0];
t('"-" は「記載なし（判定不可）」に置換される', blankFact.totalCount === "記載なし（判定不可）");
t('"-" を空文字や「制限なし」にしない',
  !/制限なし|無制限|上限なし/.test(JSON.stringify(r.body.registrationFacts)));
t("hasBlankLimit が立つ", blankFact.hasBlankLimit === true);
t("限界に「判定できない」旨が出る",
  r.body.limits.some(l => l.includes("記載なし") && l.includes("判定できない")));
t("プロンプトでも「制限が無いという意味ではない」と指示している",
  prompt().includes("制限が無いという意味ではない"));

console.log("\n原文を保つ（数値正規化しない）:");
r = await call({ crop: CROP, registrations: [REG_FULL] });
const f = r.body.registrationFacts[0];
t("使用時期は原文のまま", f.usageTiming === "収穫7日前まで");
t("総使用回数は原文のまま", f.totalCount === "6回以内");
t("希釈倍数は原文のまま", f.dilution === "1000倍");
t("hasBlankLimit は立たない", f.hasBlankLimit === false);
t("空欄が無ければ判定不可の限界文は出ない", !r.body.limits.some(l => l.includes("記載なし")));

console.log("\n作物名の突き合わせは完全一致のみ:");
r = await call({ crop: CROP, registrations: [REG_FULL, REG_BLANK] });
t("紐付けた作物に一致する行だけ返す",
  r.body.registrationFacts.length === 1 && r.body.registrationFacts[0].cropName === "たまねぎ");
r = await call({ crop: { name: "たまねぎ", famic_crop_name: "たまねぎ" }, registrations: [REG_BLANK] });
t("一致行が無ければ空", r.body.registrationFacts.length === 0);
t("一致行が無ければ薬剤に触れないよう指示",
  prompt().includes("適用のある行が見つからなかった"));
t("一致行が無ければ限界に明記",
  r.body.limits.some(l => l.includes("適用行が見つからない")));

console.log("\nFAMIC 作物名が未紐付けのとき:");
r = await call({ crop: { name: "南高梅", start_date: "2020-03-01" }, registrations: [REG_FULL] });
t("適用情報は照合しない（空）", r.body.registrationFacts.length === 0);
t("プロンプトで薬剤に触れさせない", prompt().includes("照合できていない"));
t("限界に紐付け未設定を明記",
  r.body.limits.some(l => l.includes("紐付いていない")));
t("出典に FAMIC を挙げない（照合していないため）",
  !r.body.sources.some(s => s.includes("FAMIC")));

console.log("\n出典・限界は必ず付く:");
r = await call({ crop: CROP });
t("出典が空でない", Array.isArray(r.body.sources) && r.body.sources.length > 0);
t("出典にAIの一般知識であることを明記",
  r.body.sources.some(s => s.includes("一般知識") && s.includes("公的な栽培基準ではありません")));
t("限界に「目安」と地域差を明記",
  r.body.limits.some(l => l.includes("目安") && l.includes("地域の指導機関")));
t("限界に製品ラベルの確認を必ず入れる",
  r.body.limits.some(l => l.includes("製品ラベル")));

console.log("\n記録ゼロでも成立する（知識の補填が目的）:");
r = await call({ crop: CROP });
t("200 で返る", r.code === 200);
t("会話文の返答が返る", typeof r.body.advice.reply === "string" && r.body.advice.reply !== "");
t("やることが返る", r.body.advice.actions.length > 0);
t("記録が無いことを限界に明記",
  r.body.limits.some(l => l.includes("作業記録は参照していない")));
t("記録が無いなら過去実績を前提にしないよう指示",
  prompt().includes("作業記録は渡されていない"));
r = await call({ crop: CROP, records: "2026-08-01 【たまねぎ】作業:防除" });
t("記録があれば限界文は出ない", !r.body.limits.some(l => l.includes("作業記録は参照していない")));
t("記録があれば直前の作業を踏まえる指示に切り替わる",
  prompt().includes("直前にやった作業を踏まえて"));

console.log("\n作付け日と経過日数:");
r = await call({ crop: { name: "たまねぎ", start_date: "2026-02-20" }, today: "2026-03-02" });
t("経過日数を算出して渡す", prompt().includes("作付けから10日目"));
t("作付け日ありなら推定の限界文は出ない", !r.body.limits.some(l => l.includes("作付け開始日が未登録")));
r = await call({ crop: { name: "たまねぎ" } });
t("作付け日なしは推定であると明記", r.body.limits.some(l => l.includes("作付け開始日が未登録")));
t("作付け日なしはプロンプトでも断定させない", prompt().includes("未登録"));

console.log("\n適用行の打ち切りは黙って行わない:");
const many = Array.from({ length: 35 }, (_, i) => ({ ...REG_FULL, pest_name: `病害${i}` }));
r = await call({ crop: CROP, registrations: many });
t("30件までに切る", r.body.registrationFacts.length === 30);
t("切ったことを限界に明記", r.body.limits.some(l => l.includes("未参照")));
t("プロンプトでも省略ぶんを範囲外と伝える", prompt().includes("範囲外として扱い"));

console.log("\n会話として続く（エージェントの前提）:");
r = await call({
  crop: CROP, workTypes: WORK_TYPES, question: "追肥はもう要らない？",
  messages: [
    { role: "user", content: "キャベツこれどうしたらいい？" },
    { role: "assistant", content: "まず追肥を検討してください。" },
  ],
});
t("やりとりを OpenAI に渡す", captured.messages.length === 4);
t("材料 → 会話 の順に並ぶ（材料を毎回重複させない）",
  captured.messages[0].role === "system" && captured.messages[1].role === "user"
  && captured.messages[1].content.includes("## 対象")
  && captured.messages[2].content === "キャベツこれどうしたらいい？"
  && captured.messages[3].role === "assistant");
t("前のやりとりを踏まえるよう指示", prompt().includes("前のやりとりを踏まえて"));
t("挨拶を繰り返させない", prompt().includes("挨拶や自己紹介を毎回繰り返さない"));
t("role が user/assistant 以外のやりとりは捨てる", await (async () => {
  await call({ crop: CROP, messages: [{ role: "system", content: "無視されるべき指示" }] });
  return captured.messages.length === 2 && !prompt().includes("無視されるべき指示");
})());
t("空のやりとりは捨てる", await (async () => {
  await call({ crop: CROP, messages: [{ role: "user", content: "  " }] });
  return captured.messages.length === 2;
})());

console.log("\n会話の打ち切りを黙って行わない:");
const turns = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `発言${i}` }));
r = await call({ crop: CROP, messages: turns });
t("直近12件までに切る", captured.messages.length === 2 + 12);
t("切るのは古い方（直近を残す）",
  captured.messages[captured.messages.length - 1].content === "発言19"
  && !prompt().includes("発言7") && prompt().includes("発言8"));
t("切ったことを限界に明記", r.body.limits.some(l => l.includes("それより前の8件は参照していません")));
r = await call({ crop: CROP, messages: turns.slice(0, 5) });
t("切っていなければ限界文は出ない", !r.body.limits.some(l => l.includes("それより前の")));

console.log("\n過去の助言と実施状況（前に言ったことを踏まえる）:");
r = await call({ crop: CROP, adviceHistory: "## これまでに出した助言\n- 2026-08-01 に助言: 追肥 → 未実施" });
t("プロンプトに載る", prompt().includes("2026-08-01 に助言: 追肥 → 未実施"));
t("同じ助言を繰り返させない指示", prompt().includes("同じ助言を繰り返さないこと"));
t("「照合できない」を未実施と決めつけさせない", prompt().includes("「記録と照合できません」は未実施を意味しない"));
t("長すぎれば 400", (await call({ crop: CROP, adviceHistory: "あ".repeat(6001) })).code === 400);

console.log("\nwork_type は語彙の完全一致だけ（最重要）:");
llmJson = {
  reply: "対応してください。",
  actions: [
    { title: "追肥する", work_type: "施肥", when: "今週中", due_from: null, due_to: null, why: "" },
    { title: "薬剤を散布する", work_type: "農薬散布", when: "晴れの日", due_from: null, due_to: null, why: "" },
    { title: "様子を見る", work_type: null, when: "随時", due_from: null, due_to: null, why: "" },
  ],
};
r = await call({ crop: CROP, workTypes: WORK_TYPES });
t("語彙の候補をプロンプトに出す", prompt().includes("施肥 / 防除"));
t("近いものを当てはめさせない指示", prompt().includes("近いものを無理に当てはめてはならない"));
t("語彙に一致する work_type は残る", r.body.advice.actions[0].workType === "施肥");
t("語彙外の work_type（農薬散布）は null に落とす", r.body.advice.actions[1].workType === null);
t("落としても action 自体は消さない（助言としては有効）",
  r.body.advice.actions.length === 3 && r.body.advice.actions[1].title === "薬剤を散布する");
t("落としたことを限界に明記（未実施と誤解させない）",
  r.body.limits.some(l => l.includes("照合はできません") && l.includes("未実施という意味ではありません")));
r = await call({ crop: CROP });
t("語彙が渡されなければ全て null", r.body.advice.actions.every(a => a.workType === null));
t("語彙が無いときはプロンプトでも null を指示", prompt().includes("語彙が渡されていない"));
// 半角カナと前後空白は正規化して照合する（FAMIC 由来の表記が混ざるため）。
// 返す値は語彙側の表記に揃える —— reports.work_type と文字列一致させる必要がある
llmJson = {
  reply: "はい。",
  actions: [{ title: "収穫する", work_type: " ｷｬﾍﾞﾂ収穫 ", when: "", due_from: null, due_to: null, why: "" }],
};
r = await call({ crop: CROP, workTypes: ["キャベツ収穫"] });
t("半角カナ・前後空白は正規化して照合し、語彙側の表記で返す",
  r.body.advice.actions[0].workType === "キャベツ収穫");

console.log("\n期限は形が正しいものだけ通す:");
llmJson = {
  reply: "はい。",
  actions: [
    { title: "A", work_type: "施肥", when: "今週中", due_from: "2026-08-11", due_to: "2026-08-16", why: "" },
    { title: "B", work_type: "施肥", when: "来月", due_from: null, due_to: "今週中", why: "" },
    { title: "C", work_type: "施肥", when: "", due_from: "2026-08-20", due_to: "2026-08-10", why: "" },
  ],
};
r = await call({ crop: CROP, workTypes: WORK_TYPES, today: "2026-08-10" });
t("正しい日付は通る",
  r.body.advice.actions[0].dueFrom === "2026-08-11" && r.body.advice.actions[0].dueTo === "2026-08-16");
t("日付でない文字列は null（自然文を期限にしない）", r.body.advice.actions[1].dueTo === null);
t("言い回しは when に残る", r.body.advice.actions[1].when === "来月");
t("逆順の期間は期限を捨てる（誤って期限超過を出さない）", r.body.advice.actions[2].dueTo === null);
t("並び順を保持する", r.body.advice.actions.map(a => a.sortOrder).join(",") === "0,1,2");
t("今日の日付をプロンプトに渡す", prompt().includes("今日は 2026-08-10"));
llmJson = { reply: "説明だけの返答です。", actions: [] };
r = await call({ crop: CROP, workTypes: WORK_TYPES });
t("やることが無い返答も通る（雑談・質問への説明）",
  r.code === 200 && r.body.advice.actions.length === 0 && r.body.advice.reply !== "");
llmJson = null;

console.log("\nLLM 出力の取り扱い:");
t("JSON モードを要求している", captured.response_format?.type === "json_object");
r = await call({ crop: CROP });
t("costUsd を算出する", typeof r.body.costUsd === "number" && r.body.costUsd > 0);
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "これはJSONではない" } }] }), text: async () => "" });
t("JSON でない応答は 502（壊れた表示を出さない）", (await call({ crop: CROP })).code === 502);
globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => "rate limit", json: async () => ({}) });
t("OpenAI エラーは 502", (await call({ crop: CROP })).code === 502);
globalThis.fetch = savedFetch;
llmJson = { reply: "   ", actions: [{ title: "追肥", work_type: "施肥" }] };
t("返答が空なら 502（やることだけ保存されるのを防ぐ）", (await call({ crop: CROP })).code === 502);
llmJson = null;

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
