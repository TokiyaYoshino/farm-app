// api/advise.ts の検証（作物ごとの相談＝農業エージェント）。
// テストランナーを入れていないので Node の型ストリップ + assert だけで動かす。
//
//   cd ~/Projects/farm-app && node scripts/test-advise.mjs
//
// OpenAI は叩かずに global.fetch を差し替える。検証したいのは LLM の出力品質ではなく
//   1. 農薬の「-」（記載なし）を「制限なし」に倒していないか  ← 誤ると法令違反に導く
//   2. 出典・限界が毎回必ず付くか
//   3. プロンプトに渡す範囲が正しいか（未紐付けなら薬剤に触れさせない等）
//   4. work_type を語彙の完全一致だけに絞れているか  ← 誤ると「やっていないのに実施済み」
//   5. 会話履歴を渡せ、打ち切ったら黙らずに限界に出すか
// という**サーバー側で固定している契約**の部分。
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

// api/*.ts は `./_auth.js` を import する（NodeNext 規約。実体は _auth.ts）。
// Vercel のビルドは解決するが素の Node は解決できず ERR_MODULE_NOT_FOUND になるので、
// 解決だけここで差し替える。api 側のソースは触らない。
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("_auth.js")) return next(specifier.replace(/_auth\.js$/, "_auth.ts"), context);
    return next(specifier, context);
  },
});

const handler = (await import(pathToFileURL(new URL("../api/advise.ts", import.meta.url).pathname).href)).default;

process.env.OPENAI_API_KEY = "test-key";
// api/_auth.ts が要求する env。実際には下の fetch スタブが /auth/v1/user を横取りするので
// 値そのものは使われないが、未設定だと 500（サーバー設定不足）で弾かれる
process.env.VITE_SUPABASE_URL = "https://test.supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

// ── 認証のスタブ。requireUser は Supabase の /auth/v1/user に問い合わせるので、
//    そこだけ横取りして通す（検証したいのは認証機構ではなく助言の契約） ──
const isAuthUrl = url => String(url).includes("/auth/v1/user");
const authOk = () => ({ ok: true, status: 200, json: async () => ({ id: "test-auth-id", email: "test@example.com" }), text: async () => "" });

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

// ── ApiRequest / ApiResponse の最小スタブ ──
const call = async body => {
  let out = null;
  const res = {
    status: code => ({
      json: b => { out = { code, body: b }; },
      end: () => { out = { code, body: null }; },
    }),
  };
  await handler({ method: "POST", body, headers: { authorization: "Bearer test-token" } }, res);
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
// crop を渡さない呼び出しは「作物を指定しない畑全体の相談」として通す。作物を1件も
// 登録していない利用者の入口なので弾かない（docs/decisions/20260906-general-advice-entry.md）
t("crop 無しは畑全体の相談として通る", (await call({})).code === 200);
t("crop はあるが name 無しは 400", (await call({ crop: {} })).code === 400);
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

console.log("\n認証（OpenAI キーの踏み台にさせない）:");
const callRaw = async req => {
  let out = null;
  const res = { status: code => ({ json: b => { out = { code, body: b }; }, end: () => { out = { code, body: null }; } }) };
  await handler(req, res);
  return out;
};
t("Authorization が無ければ 401",
  (await callRaw({ method: "POST", body: { crop: CROP }, headers: {} })).code === 401);
t("Bearer 形式でなければ 401",
  (await callRaw({ method: "POST", body: { crop: CROP }, headers: { authorization: "test-token" } })).code === 401);
t("ユーザーとして解決できないトークンは 401（service_role キー等）", await (async () => {
  const saved = globalThis.fetch;
  // /auth/v1/user がユーザーを返さない＝id が無い場合
  globalThis.fetch = async url => isAuthUrl(url)
    ? { ok: true, status: 200, json: async () => ({}), text: async () => "" }
    : saved(url);
  const out = await call({ crop: CROP });
  globalThis.fetch = saved;
  return out.code === 401;
})());
t("認証は本文の検証より先に走る（未認証で 400 を返さない）",
  (await callRaw({ method: "POST", body: {}, headers: {} })).code === 401);

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
r = await call({ crop: { name: "ほうれん草", start_date: "2026-08-20" }, registrations: [REG_FULL] });
t("適用情報は照合しない（空）", r.body.registrationFacts.length === 0);
t("プロンプトで薬剤に触れさせない", prompt().includes("照合できていない"));
t("限界に紐付け未設定を明記",
  r.body.limits.some(l => l.includes("紐付いていない")));
t("出典に FAMIC を挙げない（照合していないため）",
  !r.body.sources.some(s => s.includes("FAMIC")));

// 作物が定まらない＝適用情報を照合できない、という点は未紐付けのときと同じ。
// 入口が目立つぶん踏み込んだ農薬の質問が来るので、ここが緩むと実害に直結する
console.log("\n畑全体の相談（作物を指定しない）:");
r = await call({ registrations: [REG_FULL], workTypes: WORK_TYPES });
t("農場全体の相談として扱う", prompt().includes("農場全体"));
t("適用情報を渡されても薬剤の原文をプロンプトに載せない", !prompt().includes("ﾀﾞｺﾆｰﾙ1000"));
t("プロンプトで薬剤に触れさせない", prompt().includes("農薬登録情報を照合していない"));
t("適用情報は照合しない（空）", r.body.registrationFacts.length === 0);
t("限界に作物未指定を明記し作物を選ぶよう促す",
  r.body.limits.some(l => l.includes("作物を指定していない") && l.includes("作物を選んで相談")));
t("出典に FAMIC を挙げない（照合していないため）",
  !r.body.sources.some(s => s.includes("FAMIC")));
t("作付け開始日の限界は出さない（作付けを対象にしていないため）",
  !r.body.limits.some(l => l.includes("作付け開始日が未登録")));

// 普段使いのAI（ChatGPT等）と同じ会話の質感にするための契約。
// 「結論を先に出す」（docs/decisions/20260829-ai-output-structure.md）は保ったまま、
// 文数の固定縛りだけを外す。長さは質問側に合わせさせる
console.log("\n返答の質感（会話として自然に答える）:");
r = await call({ crop: CROP, workTypes: WORK_TYPES });
t("文数を固定で縛らない", !prompt().includes("2〜3文"));
t("長さは質問に合わせると指示する", prompt().includes("長さは質問に合わせる"));
t("結論を先に述べる原則は維持（ADR 20260829）", prompt().includes("1文目で結論"));
// 許可形（「聞き返してよい」）だと実測で一度も聞き返さなかったため、
// 条件と置き場所を指定した指示にする（docs/decisions/20260906-advice-reply-tone.md）
t("聞き返す条件を具体的に指示する", prompt().includes("答えを絞るのに要る情報が質問に無いとき"));
t("聞き返しは reply ではなく専用枠に置く", prompt().includes("聞き返しは follow_up_question に置く"));
t("reply は分かる範囲で完結させる（質問だけを返さない）",
  prompt().includes("質問だけを返してはならない"));
t("全体の字数上限で注意書きを圧迫しない", !prompt().includes("全体で500字程度"));
t("やること・見ておくことの内容を本文で書き直させない",
  prompt().includes("reply で同じ内容を書き直さない"));
// 返答が伸びたぶん、構造化出力が途中で切れると JSON 全体が壊れて 502 になる
t("返答が伸びても切れない出力上限を確保する", captured.max_tokens >= 1600);

// 聞き返しはプロンプトの指示では実現しなかった。実測すると、聞くべきこと
// （「具体的な病害虫の情報が不足」）を unknowns に流していた —— スキーマに置き場が
// あるほうへ行く。ならば置き場を作る、が正解（docs/decisions/20260906-advice-reply-tone.md）
console.log("\n聞き返し（follow_up_question）:");
const schema = () => captured.response_format.json_schema.schema;
r = await call({ crop: CROP, workTypes: WORK_TYPES });
t("スキーマに follow_up_question がある", "follow_up_question" in schema().properties);
t("聞き返さない返答もあるので null を許す",
  schema().properties.follow_up_question?.type?.includes("null") === true);
t("strict スキーマなので required に入れる",
  schema().required.includes("follow_up_question"));
t("unknowns との役割の違いを指示する", prompt().includes("unknowns は判断の限界"));

llmJson = { ...DEFAULT_LLM_JSON, follow_up_question: "葉と実のどちらに症状が出ていますか？" };
r = await call({ crop: CROP });
t("聞き返しを返す", r.body.advice.followUpQuestion === "葉と実のどちらに症状が出ていますか？");

llmJson = { ...DEFAULT_LLM_JSON, follow_up_question: "   " };
r = await call({ crop: CROP });
t("空の聞き返しは null に落とす", r.body.advice.followUpQuestion === null);

llmJson = { ...DEFAULT_LLM_JSON, follow_up_question: "null" };
r = await call({ crop: CROP });
t("文字列の null も null に落とす", r.body.advice.followUpQuestion === null);

llmJson = null;
r = await call({ crop: CROP });
t("フィールドが無い応答でも壊れない", r.body.advice.followUpQuestion === null);

// 実測で、モデルが改行のつもりで **リテラルの \n**（バックスラッシュ + n）を
// 本文に混ぜることがあった。画面は pre-wrap で描くので、そのまま「\n」の文字が出る
console.log("\n改行のつもりのリテラル \\n を直す:");
llmJson = { ...DEFAULT_LLM_JSON, reply: "今週は防除を控えてください。\\n- 雨が続くため\\n- 薬剤が流れるため",
  watch_points: ["べと病\\n初期病斑"] };
r = await call({ crop: CROP });
t("本文のリテラル \\n を改行にする", r.body.advice.reply.includes("\n") && !r.body.advice.reply.includes("\\n"));
t("本文の中身は消さない", r.body.advice.reply.includes("雨が続くため"));
t("見ておくことにも同じ処理をする", !r.body.advice.watchPoints[0].includes("\\n"));
llmJson = null;

// 情報源の3層目（作業の段取り・病害虫の一般知識）だけが参照元を持たず推論のままだった。
// 国の防除マニュアルは公共データ利用規約で取り込めるので、原文を渡して出典を示す
// （docs/decisions/20260906-regional-calendar-gate.md / 20260907-national-references.md）
console.log("\n公的な防除マニュアルを渡す:");
const REF = [{
  title: "総合防除実践マニュアル キャベツ編",
  source: "https://www.maff.go.jp/j/syouan/syokubo/gaicyu/g_ipm/attach/pdf/index-47.pdf",
  text: "菌核病 黒腐病 根こぶ病 密植を避ける 発病株の除去・処分 結球開始時の薬剤散布",
}];
r = await call({ crop: CROP, references: REF, workTypes: WORK_TYPES });
t("原文をプロンプトに載せる", prompt().includes("発病株の除去・処分"));
t("出典をプロンプトに載せる", prompt().includes("index-47.pdf"));
t("資料名を見出しにする", prompt().includes("総合防除実践マニュアル キャベツ編"));
t("出典を sources に出す（画面で辿れるように）",
  r.body.sources.some(s => s.includes("総合防除実践マニュアル キャベツ編") && s.includes("index-47.pdf")));
// マニュアル自身が「栽培暦は一般化したものではなく特定産地を想定」と断っている
t("資料の時期をそのまま当てはめさせない", prompt().includes("特定の産地を想定した例"));
t("資料に無いことを資料由来として述べさせない", prompt().includes("資料に書かれていないことを"));
t("農薬の可否は資料ではなく登録情報で判断させる（回帰）",
  prompt().includes("渡された農薬登録情報に書かれている値だけ"));
r = await call({ crop: CROP, workTypes: WORK_TYPES });
t("渡さなければブロックごと出さない", !prompt().includes("## 公的な防除マニュアル"));
t("出典にも混ぜない", !r.body.sources.some(s => s.includes("総合防除実践マニュアル")));
t("長すぎる資料は 400 で弾く",
  (await call({ crop: CROP, references: [{ title: "x", source: "y", text: "あ".repeat(12001) }] })).code === 400);

console.log("\n出典・限界は必ず付く:");
r = await call({ crop: CROP });
t("出典が空でない", Array.isArray(r.body.sources) && r.body.sources.length > 0);
t("出典にAIの一般知識であることを明記",
  r.body.sources.some(s => s.includes("一般知識") && s.includes("公的な栽培基準ではありません")));
t("限界に「目安」と地域差を明記",
  r.body.limits.some(l => l.includes("目安") && l.includes("地域の指導機関")));
t("限界に製品ラベルの確認を必ず入れる",
  r.body.limits.some(l => l.includes("製品ラベル")));

// 数えるのはコード、言い換えるのが LLM（docs/decisions/20260829-ai-output-structure.md）。
// 防除助言と記録検索は既に集計済みの値を受け取っているが、相談だけが受け取っていなかった
console.log("\nコードが数えた集計を渡す:");
const FACTS = "### 前回の散布\n2026-08-28（9日前） たまねぎ・上の段: ダコニール\n\n2026年: 防除3回 / 施肥2回";
r = await call({ crop: CROP, aggregates: FACTS, records: "2026-08-28 防除", workTypes: WORK_TYPES });
t("集計をそのままプロンプトに載せる", prompt().includes("前回の散布") && prompt().includes("防除3回"));
t("集計であることが分かる見出しを付ける", prompt().includes("## 自農場の集計"));
t("数え直しを禁じる", prompt().includes("数え直さないこと"));
// 渡すだけでは使わない（実測：前回の散布9日前・同一商品3回連用を渡しても触れなかった）
t("関係する質問では集計を答えに反映させる", prompt().includes("必ず答えに反映する"));
// 実測：同じ商品の3回連用を「だから次も撒こう」の根拠に読み替えた。連用は注意する材料であって
// 推奨の根拠ではない（系統の判定は RAC データが無くできない / 20260823-pest-advice-history.md）
t("同じ商品の繰り返しを散布の根拠に読み替えさせない",
  prompt().includes("同じ薬剤を続けてよい根拠にしないこと"));
t("集計が無いときはブロックごと出さない",
  (await call({ crop: CROP, records: "2026-08-28 防除" })) && !prompt().includes("## 自農場の集計"));
t("長すぎる集計は 400 で弾く",
  (await call({ crop: CROP, aggregates: "あ".repeat(4001) })).code === 400);

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
t("やりとりを OpenAI に渡す", captured.messages.length === 5);
t("材料 → 会話 → 今回の質問 の順に並ぶ（材料を毎回重複させない）",
  captured.messages[0].role === "system" && captured.messages[1].role === "user"
  && captured.messages[1].content.includes("## 対象")
  && captured.messages[2].content === "キャベツこれどうしたらいい？"
  && captured.messages[3].role === "assistant"
  && captured.messages[4]?.role === "user" && captured.messages[4]?.content === "追肥はもう要らない？");
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

// 実測（2026-09-07・本番）: 追加質問に対して前の回答をほぼそのまま返していた。
// 原因は、送るメッセージの末尾が「前回のAIの回答」で、今回の質問が材料ブロックに
// 埋もれていたこと。会話の続きを書けと言われている形になっていた
console.log("\n今回の質問を会話の最後に置く:");
r = await call({ crop: CROP, question: "水はけはどう直す？", messages: [
  { role: "user", content: "今の時期は？" },
  { role: "assistant", content: "病害虫に注意です。" },
] });
const lastMsg = captured.messages[captured.messages.length - 1];
t("最後のメッセージが今回の質問", lastMsg.role === "user" && lastMsg.content === "水はけはどう直す？");
t("質問を材料ブロックに二重で入れない",
  captured.messages.filter(m => m.content.includes("水はけはどう直す？")).length === 1);
t("前の回答の続きを書かせない指示がある", prompt().includes("前の回答を繰り返さず"));
t("履歴の末尾が同じ質問でも二重にしない", await (async () => {
  await call({ crop: CROP, question: "同じ質問", messages: [{ role: "user", content: "同じ質問" }] });
  return captured.messages.filter(m => m.content.trim() === "同じ質問").length === 1;
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
t("構造化出力（strict スキーマ）を要求している",
  captured.response_format?.type === "json_schema"
  && captured.response_format.json_schema?.strict === true
  && captured.response_format.json_schema?.name === "crop_advice");
r = await call({ crop: CROP });
t("costUsd を算出する", typeof r.body.costUsd === "number" && r.body.costUsd > 0);
const savedFetch = globalThis.fetch;
globalThis.fetch = async url => isAuthUrl(url) ? authOk()
  : ({ ok: true, json: async () => ({ choices: [{ message: { content: "これはJSONではない" } }] }), text: async () => "" });
t("JSON でない応答は 502（壊れた表示を出さない）", (await call({ crop: CROP })).code === 502);
globalThis.fetch = async url => isAuthUrl(url) ? authOk()
  : ({ ok: false, status: 429, text: async () => "rate limit", json: async () => ({}) });
t("OpenAI エラーは 502", (await call({ crop: CROP })).code === 502);
globalThis.fetch = savedFetch;
llmJson = { reply: "   ", actions: [{ title: "追肥", work_type: "施肥" }] };
t("返答が空なら 502（やることだけ保存されるのを防ぐ）", (await call({ crop: CROP })).code === 502);
llmJson = null;

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
