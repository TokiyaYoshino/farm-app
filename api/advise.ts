// 作物ごとの相談（農業エージェント）API（Vercel Serverless Function / Node.js）
//
// 「キャベツこれどうしたらいい？」と聞くと答えが返り、それが**作物ごとに溜まり**、
// 助言した作業は**作業記録と照合できる**。この3点が揃って初めてエージェントになる。
//
// api/search-chat.ts とは目的が違うので別建てにしている。あちらは「渡された作業記録のみを
// 根拠に、書かれていないことは推測しない」検索専用で、記録が18件しかない農場では
// 「記録からは分かりません」しか返せない。ここで必要なのは記録の検索ではなく
// **知識の補填**（作物と時期から、次にやる作業の一般的な段取りを出す）。
//
// 会話として続けるため、呼び出し側は messages（これまでのやりとり）と
// adviceHistory（過去に出した助言＋実施状況）を渡す。後者があるので
// 「前に言ったことをやったか」を踏まえて答えられる。同じ助言の繰り返しも避けられる。
//
// 溜める先は crop_advice_messages / crop_advice_actions
// （scripts/migrations/2026-08-10-crop-advisor.sql）。保存は呼び出し側で行う
// —— このAPIは OPENAI_API_KEY だけを持ち、Supabase に触らない疎結合を保つ。
//
// 情報源を3つに分け、どこから来た情報かを必ず区別する:
//
//   1. 作物名・作付日からの日数・月・天気 …… 呼び出し側が渡す事実
//   2. 農薬の希釈倍数・使用時期・使用回数 …… 農薬登録情報（FAMIC 登録適用部）の**原文**。
//      LLM に生成させない。プロンプトには原文を渡し、引用のみ許す。
//      レスポンスでも registrationFacts として別に返し、画面はそちらを表示する
//      （LLM の文章に混ざった数字を信じさせない）。
//   3. 作業の段取り・時期の一般論 …… LLM の一般知識。産地・品種・栽培方式で変わるため
//      「目安」であることを sources / limits に必ず明記する。
//
// 環境変数: OPENAI_API_KEY（Vercelダッシュボードで設定。リポジトリに書かない）

import type { ApiRequest, ApiResponse } from "./types";
import { requireUser, denied } from "./_auth.js";

interface RegistrationInfo {
  product_name?: string;
  crop_name?: string;
  pest_name?: string;
  dilution?: string;
  usage_timing?: string;
  usage_count?: string;
  total_count?: string;
  application?: string;
}

interface CropInfo {
  name?: string;
  /** FAMIC 登録適用部の作物名（手動紐付け）。未設定なら農薬の突き合わせはできない */
  famic_crop_name?: string | null;
  /** 作付け開始日（YYYY-MM-DD） */
  start_date?: string | null;
}

/** FAMIC は記載が無い欄に "-" を入れてくる。空文字・全角ハイフン類も同じ扱いにする。
 *  「制限なし」ではなく「判定不可」。ここを取り違えると使用者を法令違反に導く
 *  （lib/pesticideUsage.ts の設計方針と同じ非対称性）。 */
function isBlankField(v: string | undefined | null): boolean {
  if (v == null) return true;
  const s = v.normalize("NFKC").trim();
  return s === "" || /^[-‐‑‒–—―ー]+$/.test(s);
}

/** 表示・プロンプト共通の整形。原文は保ったまま、空欄だけ「記載なし」と言い換える。 */
function fieldLabel(v: string | undefined | null): { text: string; blank: boolean } {
  return isBlankField(v) ? { text: "記載なし（判定不可）", blank: true } : { text: v!.trim(), blank: false };
}

interface RegistrationFact {
  productName: string;
  cropName: string;
  pestName: string;
  dilution: string;
  usageTiming: string;
  usageCount: string;
  totalCount: string;
  application: string;
  /** 使用時期・使用回数・総使用回数のいずれかが空欄で、期限や回数を判断できない行 */
  hasBlankLimit: boolean;
}

/** 渡された適用行のうち、この作付けに適用のある行だけを画面表示用に整える。
 *
 *  作物名の一致は完全一致のみ（部分一致は「うめ」が「うめ以外の…」に当たる等の誤判定を生む）。
 *  famic_crop_name が未設定なら**1件も返さない**。紐付けが無い状態で全行を渡すと、
 *  他作物の適用情報をこの作付けのものとして提示してしまう（lib/pesticideUsage.ts の
 *  no_famic_crop_name → 判定不可 と同じ扱いに揃える）。 */
function toFacts(regs: RegistrationInfo[], famicCropName: string | null): RegistrationFact[] {
  if (!famicCropName) return [];
  const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();
  const target = norm(famicCropName);
  const rows = regs.filter(r => norm(r.crop_name ?? "") === target);
  return rows.map(r => {
    const timing = fieldLabel(r.usage_timing);
    const count = fieldLabel(r.usage_count);
    const total = fieldLabel(r.total_count);
    return {
      productName: fieldLabel(r.product_name).text,
      cropName: fieldLabel(r.crop_name).text,
      pestName: fieldLabel(r.pest_name).text,
      dilution: fieldLabel(r.dilution).text,
      usageTiming: timing.text,
      usageCount: count.text,
      totalCount: total.text,
      application: fieldLabel(r.application).text,
      hasBlankLimit: timing.blank || count.blank || total.blank,
    };
  });
}

/** 作付けからの経過日数。start_date が無ければ null */
function daysSince(startDate: string | null | undefined, today: string): number | null {
  if (!startDate) return null;
  const s = Date.parse(`${startDate}T00:00:00+09:00`);
  const t = Date.parse(`${today}T00:00:00+09:00`);
  if (!Number.isFinite(s) || !Number.isFinite(t)) return null;
  return Math.round((t - s) / 86400000);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // 無認証だと OpenAI キーの踏み台にされるため、ログイン済みユーザーに限定する（api/_auth.ts）
  const auth = await requireUser(req);
  if (!auth.ok) return denied(res, auth);

  const { crop, today, forecast, registrations, records, aggregates, question, region, messages, adviceHistory, workTypes } =
    (req.body ?? {}) as {
      crop?: CropInfo;
      today?: string;
      forecast?: string;
      registrations?: RegistrationInfo[];
      records?: string;
      /** 呼び出し側が事前に数えた値（散布履歴・作業回数）。LLM に数え直させない */
      aggregates?: string;
      question?: string;
      region?: string;
      /** これまでのやりとり（古い順）。会話として続けるために渡す */
      messages?: { role?: string; content?: string }[];
      /** 過去に出した助言と作業記録との照合結果（lib/adviceMatch.ts が整形した文字列） */
      adviceHistory?: string;
      /** 照合に使える作業種別の語彙。これに載らない作業は work_type を null にさせる */
      workTypes?: string[];
    };

  // crop を渡さない呼び出しは「作物を指定しない畑全体の相談」。作物が定まらないと
  // FAMIC の適用情報を照合できないため、薬剤の具体値には触れさせない（以下 isGeneral 分岐）
  const isGeneral = crop == null;
  const cropName = typeof crop?.name === "string" ? crop.name.trim() : "";
  if (!isGeneral) {
    if (!cropName) return res.status(400).json({ error: "crop.name required" });
    if (cropName.length > 60) return res.status(400).json({ error: "crop.name too long" });
  }

  const day = typeof today === "string" && ISO_DATE.test(today)
    ? today
    : new Date().toISOString().slice(0, 10);

  if (typeof forecast === "string" && forecast.length > 4000) {
    return res.status(400).json({ error: "forecast too long" });
  }
  if (typeof records === "string" && records.length > 8000) {
    return res.status(400).json({ error: "records too long" });
  }
  if (typeof aggregates === "string" && aggregates.length > 4000) {
    return res.status(400).json({ error: "aggregates too long" });
  }
  if (typeof question === "string" && question.length > 500) {
    return res.status(400).json({ error: "question too long" });
  }
  if (typeof adviceHistory === "string" && adviceHistory.length > 6000) {
    return res.status(400).json({ error: "adviceHistory too long" });
  }

  // 会話履歴。古い順で渡され、直近 MAX_TURNS 件だけを使う（プロンプト膨張を防ぐ）。
  // 打ち切ったことは limits に出す（黙って忘れると「前に言ったのに」が起きる）
  const MAX_TURNS = 12;
  const allTurns = (Array.isArray(messages) ? messages : [])
    .filter(m => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim() !== "")
    .map(m => ({ role: m.role as "user" | "assistant", content: m.content!.trim().slice(0, 4000) }));
  const turns = allTurns.slice(-MAX_TURNS);
  const droppedTurns = allTurns.length - turns.length;

  // 作業種別の語彙。助言を作業記録と照合するためのキーになる
  const vocab = (Array.isArray(workTypes) ? workTypes : [])
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map(s => s.trim()).slice(0, 40);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "missing env: OPENAI_API_KEY" });

  // 畑全体の相談では作物が定まらないので、適用情報の照合材料をすべて空に倒す
  // （クライアントも空で送るが、ここでも落として二重に防ぐ）
  const famicCropName = !isGeneral && typeof crop?.famic_crop_name === "string" && crop.famic_crop_name.trim()
    ? crop.famic_crop_name.trim()
    : null;
  const elapsed = isGeneral ? null : daysSince(crop?.start_date ?? null, day);
  // 適用行は上限を切る。1商品75作物×複数病害虫で200行を超えることがあり、
  // 全部渡すとプロンプトが膨らむ。切ったことは limits に明記する（黙って削ると
  // 「載っていない＝適用が無い」と誤読される）
  const MAX_ROWS = 30;
  const allFacts = !isGeneral && Array.isArray(registrations) ? toFacts(registrations, famicCropName) : [];
  const facts = allFacts.slice(0, MAX_ROWS);
  const droppedRows = allFacts.length - facts.length;
  const hasRecords = typeof records === "string" && records.trim() !== "";
  const hasAggregates = typeof aggregates === "string" && aggregates.trim() !== "";
  /** 今回の質問。会話の最後の user メッセージとして置く */
  const askNow = typeof question === "string" ? question.trim() : "";

  const system = [
    isGeneral
      ? "あなたは日本の農業の作業計画を助言するアシスタントです。農家の相談相手として継続的に対話します。今回は特定の作付けに絞らない、農場全体についての相談です。"
      : "あなたは日本の農業の作業計画を助言するアシスタントです。特定の作付けについて、農家の相談相手として継続的に対話します。",
    "利用者は「次に何をすればいいか分からない」状態で相談しています。作業の順序と時期の目安を、日本語で具体的に示してください。",
    "会話の続きである場合は、前のやりとりを踏まえて答えること。挨拶や自己紹介を毎回繰り返さないこと。",
    "**会話の最後にある利用者のメッセージが今回の質問**。前の回答を繰り返さず、その質問そのものに答えること。",
    "",
    "情報の扱い（厳守）:",
    "- 作業の段取り・生育段階・時期の目安は、あなたの一般知識で答えてよい。ただし産地・品種・栽培方式で変わるため、必ず「目安」として述べること。",
    "- 農薬の希釈倍数・使用時期・使用回数・使用方法は、**渡された農薬登録情報に書かれている値だけ**を引用すること。渡されていない値を推測・補完・概算してはならない。",
    "- 渡された農薬登録情報に無い農薬・作物・病害虫について、使用の可否を述べてはならない。",
    "- 「記載なし（判定不可）」と書かれた欄は、制限が無いという意味ではない。判断できないと述べること。",
    "- 特定の農薬名を新たに推薦してはならない（登録の有無を確認できないため）。防除が必要な場面では「登録のある薬剤を確認する」と述べる。",
    "- 肥料の施用量・農薬の使用量を具体的な数値で断定してはならない。土壌診断・製品の表示・地域の指導機関に依ると述べること。",
    isGeneral
      ? "- 対象の作物が指定されていない。時期・薬剤・生育段階は作物によって変わるため、特定の作物を前提にした具体値を述べず、作物によって変わる旨を示すこと。作物を絞った方が答えられる質問では、その作物を選んで相談し直すよう促すこと。"
      : null,
    hasRecords
      ? "- 作業記録が渡された場合は、直前にやった作業を踏まえて次を提案すること。記録に無い作業を「やった」と決めつけないこと。"
      : "- 作業記録は渡されていない。過去の作業実績を知っている前提で書かないこと（「前回の防除から」等と書かない）。",
    // 数えるのはコード、言い換えるのが LLM（docs/decisions/20260829-ai-output-structure.md）。
    // 記録から自分で数え直させると、年の取り違えや回数の誤りがそのまま助言に乗る
    hasAggregates
      ? [
          "- 「自農場の集計」の数値はコードが数えた確定値。**その数字をそのまま使い、記録から数え直さないこと**。集計と違う回数・日数を述べてはならない。",
          // 渡すだけでは使わない（実測：前回の散布9日前・同一商品3回連用を渡しても触れなかった）
          "  散布の時期・間隔・回数に関わる質問では、集計の「前回の散布からの日数」「同じ商品を繰り返し使っている組み合わせ」「昨年の同時期」を**必ず答えに反映する**こと。一般論だけで答えないこと。",
          // 実測で「3回使っているため次も散布を」と逆向きに読んだ。連用は注意する材料
          "  ただし同じ商品を繰り返し使っている事実は、**同じ薬剤を続けてよい根拠にしないこと**。連用は薬剤耐性の観点で注意する材料であり、登録のある別の薬剤を検討するよう促す側に使う（有効成分・系統のデータは無いため、同一系統かどうかの判定はしないこと）。",
        ].join("\n")
      : null,
    "- 過去に出した助言と照合結果が渡された場合、同じ助言を繰り返さないこと。未実施のものは事情を尋ねるか代替を示すこと。",
    "  「記録と照合できません」は未実施を意味しない。実施していないと決めつけないこと。",
    "- 情報が足りないところを推測で埋めないこと（不足は下の reply の指示にしたがって尋ねる）。",
    "",
    // 形はスキーマ（response_format）が保証するので、ここでは各項目の中身だけを指示する
    "各項目の中身:",
    // 前置きから書き始めると結論が埋もれる。利用者は答えを知りたくて聞いている
    // 文数を固定で縛ると、一言で済む質問にも3文書き、手順を聞かれても3文で打ち切る。
    // 結論を先に出す原則（docs/decisions/20260829-ai-output-structure.md）はそのままに、
    // 量だけ質問側に合わせさせる
    "- reply: 利用者への返答（会話文）。**1文目で結論を述べ**、理由は2文目以降。前置き・状況説明から始めない。長さは質問に合わせる —— 一言で済むことは一言で答え、手順や選び方を聞かれたら必要なだけ書く。",
    // 実測では、聞くべきこと（「具体的な病害虫の情報が不足」）を unknowns に流していた。
    // プロンプトで押しても直らないので、専用の枠を作って役割を分けている
    "- follow_up_question: 症状・場所・時期・作業の状況など、答えを絞るのに要る情報が質問に無いときに、確認したいこと1つ。40字以内の疑問文。足りているときは null。",
    "  **unknowns は判断の限界**（渡された情報では分からないこと）で、**follow_up_question は利用者に尋ねること**。同じ内容を両方に書かないこと。",
    "  reply は分かる範囲の答えで完結させること。質問だけを返してはならない（聞き返しは follow_up_question に置く）。",
    "- actions[].title: 作業名 / when: いつ（例: 今週中 / 開花後10日ごろ） / why: 理由（1〜2文）",
    "- watch_points: 今の時期に見ておくべき点（病害虫の兆候・気象リスクなど）",
    "- unknowns: 渡された情報では判断できないこと・確認が必要なこと",
    "",
    "actions（やることの切り出し）について:",
    "- reply の中で提案した作業を、実行できる単位で切り出すこと。提案が無い返答（質問への説明だけ等）では空配列にする。",
    "- 0〜5件。優先度の高い順。",
    vocab.length > 0
      ? [
          `- work_type は次の語彙から**完全一致で**選ぶこと: ${vocab.join(" / ")}`,
          "- どれにも当てはまらない作業は work_type を null にすること。**近いものを無理に当てはめてはならない**",
          "  （作業記録との照合に使うキーなので、誤った値を入れると「やっていないのに実施済み」になる）。",
        ].join("\n")
      : "- work_type は null にすること（照合に使える作業種別の語彙が渡されていない）。",
    `- due_from / due_to は「いつ」を日付にしたもの。今日は ${day}。曖昧で日付にできなければ null にし、when に言い回しを残すこと。`,
    "- 期限を勝手に厳しくしないこと。「今週中」なら due_to はその週末。時期が不明なら null。",
    "",
    // 総量ではなく配分の問題なので、字数の一律上限は置かない（ADR 20260829）。
    // 重複だけを禁じる
    "watch_points と unknowns は各0〜3件、1件30字以内。actions と watch_points に出したことは、reply で同じ内容を書き直さないこと（画面では別枠に並べて出る）。",
  ].filter(Boolean).join("\n");

  const userParts: string[] = [
    "## 対象",
    ...(isGeneral
      ? ["対象: 農場全体（特定の作付けに絞っていない相談）"]
      : [`作物: ${cropName}`, ...(famicCropName ? [`農薬登録上の作物名: ${famicCropName}`] : [])]),
    `今日の日付: ${day}`,
    ...(isGeneral
      ? []
      : crop?.start_date && elapsed != null
        ? [`作付け開始: ${crop.start_date}（作付けから${elapsed}日目）`]
        : ["作付け開始日: 未登録（生育段階は日付と一般的な作型から推定すること。断定しない）"]),
    ...(region ? [`地域: ${region}`] : ["地域: 不明（地域差が大きい点に触れること）"]),
  ];

  if (typeof forecast === "string" && forecast.trim()) {
    userParts.push("", "## 天気（実績7日＋予報7日 / Open-Meteo）", forecast.trim());
  } else {
    userParts.push("", "## 天気", "取得できていない。天気を根拠にした断定はしないこと。");
  }

  if (facts.length > 0) {
    userParts.push(
      "",
      "## 登録のある農薬の適用情報（農薬登録情報の原文・この範囲外は述べないこと）",
      ...facts.map(f => [
        `農薬:${f.productName}`,
        `作物:${f.cropName}`,
        `適用病害虫:${f.pestName}`,
        `希釈倍数:${f.dilution}`,
        `使用時期:${f.usageTiming}`,
        `本剤の使用回数:${f.usageCount}`,
        `総使用回数:${f.totalCount}`,
        `使用方法:${f.application}`,
      ].join(" / ")),
    );
    if (droppedRows > 0) {
      userParts.push(`（ほか${droppedRows}件の適用行は省略。省略ぶんは範囲外として扱い、無いものとして述べないこと）`);
    }
  } else if (isGeneral) {
    userParts.push("", "## 登録のある農薬の適用情報",
      "作物を指定していない相談のため、農薬登録情報を照合していない。具体的な薬剤・希釈倍数・回数には触れず、農薬が必要な場面では対象の作物を選んで相談するよう伝えること。");
  } else if (famicCropName) {
    userParts.push("", "## 登録のある農薬の適用情報",
      `登録済みの農薬に「${famicCropName}」に適用のある行が見つからなかった。具体的な薬剤・希釈倍数・回数には触れないこと。`);
  } else {
    userParts.push("", "## 登録のある農薬の適用情報",
      "この作物に農薬登録上の作物名が紐付いていないため、適用情報を照合できていない。具体的な薬剤・希釈倍数・回数には触れないこと。");
  }

  if (hasAggregates) {
    userParts.push("", "## 自農場の集計（コードが数えた確定値・数え直さないこと）", aggregates!.trim());
  }
  if (hasRecords) {
    userParts.push("", "## 最近の作業記録", records!.trim());
  }
  // 過去の助言と実施状況。これがあると「前に言ったことをやったか」を踏まえて答えられる
  if (typeof adviceHistory === "string" && adviceHistory.trim()) {
    userParts.push("", adviceHistory.trim());
  }
  // 今回の質問は材料ブロックに入れない。会話の**最後**の user メッセージとして置く（下）。
  // 材料に混ぜて末尾が前回の assistant のままだと、モデルは「続きを書け」と言われている形になり、
  // 実測（2026-09-07・本番）では追加質問に対して前の回答をほぼそのまま返していた

  // 材料（作物・天気・農薬・記録・過去の助言）は system の直後に1度だけ置き、
  // そのあとに会話履歴を並べる。材料を各ターンに重複させないことでトークンを節約する
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userParts.join("\n") },
        // 呼び出し側が送信中の質問を履歴に含めていても二重にしない
        ...(askNow && turns.at(-1)?.role === "user" && turns.at(-1)?.content.trim() === askNow
          ? turns.slice(0, -1)
          : turns),
        ...(askNow ? [{ role: "user" as const, content: askNow }] : []),
      ],
      temperature: 0.3,
      // 返答の長さを質問に合わせさせたぶん、上限が近いと strict スキーマの JSON が
      // 途中で切れて全体が壊れる（パース失敗＝502）。余白を持たせる
      max_tokens: 1800,
      // json_object は「JSONであること」しか保証しない。形はスキーマで縛る。
      // ただし**中身の妥当性までは保証されない**ので、下の防御的パースは残す:
      //   - work_type が作業記録の語彙に完全一致するか（誤ると「やっていないのに実施済み」）
      //   - due_from / due_to が実在する日付か（「今週中」が入ってくる）
      // スキーマが守るのは形、コードが守るのは意味、という分担。
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "crop_advice",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reply: { type: "string" },
              actions: {
                type: "array",
                maxItems: 5,
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    // 語彙に無い作業は null。近いものを当てさせない
                    work_type: { type: ["string", "null"] },
                    when: { type: "string" },
                    due_from: { type: ["string", "null"] },
                    due_to: { type: ["string", "null"] },
                    why: { type: "string" },
                  },
                  required: ["title", "work_type", "when", "due_from", "due_to", "why"],
                  additionalProperties: false,
                },
              },
              watch_points: { type: "array", maxItems: 4, items: { type: "string" } },
              unknowns: { type: "array", maxItems: 4, items: { type: "string" } },
              // 聞き返しは無いことのほうが多いので null を許す。strict なので required には入れる
              follow_up_question: { type: ["string", "null"] },
            },
            required: ["reply", "actions", "watch_points", "unknowns", "follow_up_question"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    console.error("OpenAI API error:", r.status, body);
    return res.status(502).json({ error: "助言の生成に失敗しました。時間をおいて再度お試しください。" });
  }

  const data = await r.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return res.status(502).json({ error: "助言結果が空でした。" });

  let parsed: {
    reply?: string;
    actions?: { title?: string; work_type?: string | null; when?: string;
                due_from?: string | null; due_to?: string | null; why?: string }[];
    watch_points?: string[];
    unknowns?: string[];
    follow_up_question?: string | null;
  };
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("advise: JSON parse failed:", content.slice(0, 500));
    return res.status(502).json({ error: "助言結果を読み取れませんでした。もう一度お試しください。" });
  }

  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "").slice(0, 6) : [];

  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  if (!reply) return res.status(502).json({ error: "助言結果が空でした。もう一度お試しください。" });

  // work_type は語彙に**完全一致**するものだけ通す。一致しなければ null に落とす。
  // ここを緩めると「近い作業種別」で照合が走り、やっていない作業が「実施済み」になる。
  // 正規化して照合し、返す値は語彙側の表記に揃える（reports.work_type と一致させるため）。
  const normVocab = new Map(vocab.map(v => [v.normalize("NFKC").trim().toLowerCase(), v]));
  const coerceWorkType = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.normalize("NFKC").trim();
    if (s === "" || s === "null") return null;
    return normVocab.get(s.toLowerCase()) ?? null;
  };
  // 日付は形が正しいものだけ通す。「今週中」等の自然文が入ってきたら null に落とす
  const coerceDate = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!ISO_DATE.test(s)) return null;
    return Number.isFinite(Date.parse(`${s}T00:00:00+09:00`)) ? s : null;
  };

  let coercedWorkTypes = 0;
  const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
    .filter(a => a && typeof a.title === "string" && a.title.trim() !== "")
    .slice(0, 6)
    .map((a, i) => {
      const workType = coerceWorkType(a.work_type);
      // LLM が語彙外の値を出したことを数える（limits に出して黙って落とさない）
      if (a.work_type != null && String(a.work_type).trim() !== "" && String(a.work_type).trim() !== "null" && !workType) {
        coercedWorkTypes++;
      }
      const dueFrom = coerceDate(a.due_from);
      let dueTo = coerceDate(a.due_to);
      // 逆順の期間は信用できないので期限を捨てる（誤って期限超過を出すより出さない方が安全）
      if (dueFrom && dueTo && dueTo < dueFrom) dueTo = null;
      return {
        title: a.title!.trim(),
        workType,
        when: typeof a.when === "string" ? a.when.trim() : "",
        dueFrom,
        dueTo,
        why: typeof a.why === "string" ? a.why.trim() : "",
        sortOrder: i,
      };
    });

  // 「聞き返さない」を "null" や空文字で表してくることがあるので、どちらも null に倒す
  const followUp = typeof parsed.follow_up_question === "string" ? parsed.follow_up_question.trim() : "";
  const advice = {
    reply,
    actions,
    watchPoints: asStrings(parsed.watch_points),
    unknowns: asStrings(parsed.unknowns),
    followUpQuestion: followUp === "" || followUp === "null" ? null : followUp.slice(0, 120),
  };

  // ── 出典と限界は必ず返す（LLM に書かせない）────────────────────────
  // 「どこまでが公的な情報で、どこからがAIの一般知識か」を利用者が区別できないと、
  // 目安を規制値のように受け取ってしまう。文言はサーバー側で固定する。
  const sources: string[] = [
    "作業の段取り・時期の目安: AI（gpt-4o-mini）の一般知識。公的な栽培基準ではありません",
  ];
  if (facts.length > 0) {
    sources.push("農薬の希釈倍数・使用時期・使用回数: 農薬登録情報（独立行政法人 農林水産消費安全技術センター FAMIC 登録適用部）の原文");
  }
  if (typeof forecast === "string" && forecast.trim()) {
    sources.push("天気の実績・予報: Open-Meteo");
  }
  if (hasRecords) sources.push("直近の作業実績: この農場の作業記録");

  const limits: string[] = [
    "作業の時期・順序は目安です。産地・品種・栽培方式・その年の天候で変わります。地域の指導機関（JA・普及指導センター）の栽培暦を優先してください。",
    "農薬を使用するときは、最終的に製品ラベルの表示を確認してください。ラベルの表示が正です。",
  ];
  if (facts.length === 0) {
    limits.push(
      isGeneral
        ? "作物を指定していない相談のため、薬剤の使用可否は判断していません。農薬について具体的に知りたいときは、対象の作物を選んで相談してください。"
        : famicCropName
          ? `登録済みの農薬に「${famicCropName}」の適用行が見つからないため、薬剤の使用可否は判断していません。`
          : "この作物に農薬登録上の作物名が紐付いていないため、薬剤の使用可否は判断していません（管理タブの作物から設定できます）。");
  }
  if (facts.some(f => f.hasBlankLimit)) {
    limits.push("適用情報に「記載なし」の欄があります。制限が無いという意味ではなく、判定できないという意味です。製品ラベルを確認してください。");
  }
  if (droppedRows > 0) {
    limits.push(`適用情報は${MAX_ROWS}件までを参照しました（ほか${droppedRows}件は未参照）。`);
  }
  if (!hasRecords) {
    limits.push("この農場の作業記録は参照していないため、すでに済んだ作業が含まれることがあります。");
  }
  if (!isGeneral && !crop?.start_date) {
    limits.push("作付け開始日が未登録のため、生育段階は日付からの推定です。");
  }
  // 会話を打ち切ったことを黙っていると「前に言ったのに覚えていない」に見える
  if (droppedTurns > 0) {
    limits.push(`直近${MAX_TURNS}件のやりとりだけを踏まえています（それより前の${droppedTurns}件は参照していません）。`);
  }
  // 語彙外の作業種別を null に落としたぶんは照合できない。黙って落とすと未実施に見える
  if (coercedWorkTypes > 0) {
    limits.push(`やることのうち${coercedWorkTypes}件は作業記録の作業種別に対応づけられなかったため、実施したかどうかの照合はできません（未実施という意味ではありません）。`);
  }

  // 概算コスト算出（gpt-4o-mini: input $0.15 / output $0.60 per 1M tokens）
  const usage = data.usage ?? {};
  const costUsd = ((usage.prompt_tokens ?? 0) * 0.15 + (usage.completion_tokens ?? 0) * 0.60) / 1_000_000;

  return res.status(200).json({
    advice,
    // 農薬の値は LLM の文章ではなくこの配列を画面に出す（原文のまま）
    registrationFacts: facts,
    sources,
    limits,
    usage,
    costUsd,
  });
}
