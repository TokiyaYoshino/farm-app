// 記録検索チャットAPI（Vercel Serverless Function / Node.js）
// 自然言語の質問と、クライアント側で整形済みの作業記録テキストを受け取り、
// OpenAIに記録内容だけを根拠として回答させる。
// 環境変数: OPENAI_API_KEY（Vercelダッシュボードで設定。リポジトリに書かない）
//
// クライアント側で整形済みのテキストを受け取る疎結合設計にしているため、
// reportsテーブルのスキーマ変更の影響を受けない（generate-report.tsと同じ設計）。
//
// ── なぜ構造化するか（2026-08-29）────────────────────────────
//
// 元は自由文をそのまま返していた。実測（本番の記録19件・gpt-4o-mini）で2つ出た:
//
//   1. **年を取り違えた**。2026年の防除3件を「2025年に行われました」と答えた。
//      今日の日付を渡していないため「去年」を西暦に読み替えられていなかった
//   2. markdown の箇条書き（"- 09/20: …"）を返し、画面が pre-wrap で
//      ハイフンごと生表示していた
//
// そこで today を受け取り、結論と根拠をスキーマで分ける。根拠の日付は
// **渡した記録に実在するものだけ**を通す（advise.ts が work_type を語彙の
// 完全一致だけ通すのと同じ、「スキーマが形・コードが意味」の分担）。
//
// 注意書きも LLM に書かせない。毎回本文に混ざって長くなるうえ、書かれたり
// 書かれなかったりする。サーバー側の固定文言 notes として分けて返す
// （advise.ts の sources / limits と同じ方式）。

import type { ApiRequest, ApiResponse, ExternalJson } from "./types.js";
import { requireAppUser, denied, checkAndRecordCallLimit } from "./_auth.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // 無認証だと OpenAI キーの踏み台にされるため、ログイン済みユーザーに限定する（api/_auth.ts）
  const auth = await requireAppUser(req);
  if (!auth.ok) return denied(res, auth);

  // 他のAI系エンドポイントと違い ai_outputs に保存しないため checkDailyLimit の対象外
  // だったが、それは「回数の上限が無い」ことを意味していた（セキュリティ監査で確認）。
  // 単価は最も低いが、上限ゼロと単価の低さは別の話なので専用の日次上限を設ける。
  const over = await checkAndRecordCallLimit(auth.user.userId, auth.user.organizationId, "search_chat");
  if (over) return denied(res, over);

  const { question, records, recordCount, today } = (req.body ?? {}) as {
    question?: string; records?: string; recordCount?: number; today?: string;
  };
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question required" });
  }
  if (question.length > 400) {
    return res.status(400).json({ error: "question too long" });
  }
  if (!records || typeof records !== "string" || !records.trim()) {
    return res.status(400).json({ error: "records required" });
  }
  if (records.length > 20000) {
    return res.status(400).json({ error: "records too long" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "missing env: OPENAI_API_KEY" });

  // 「去年」「先月」を西暦・月に読み替えるための基準。渡されなければサーバーの今日
  const day = typeof today === "string" && ISO_DATE.test(today)
    ? today
    : new Date().toISOString().slice(0, 10);
  const thisYear = Number(day.slice(0, 4));

  const system = [
    "あなたは農場の作業記録を検索して質問に答えるアシスタントです。",
    "渡された作業記録のみを根拠に、日本語で答えてください。",
    "記録に書かれていない情報については、推測せず記録からは分からないと答えてください。",
    "数値や農薬名などは記録どおり正確に扱うこと。",
    "",
    "日付の扱い（誤りが多いので厳守）:",
    `- 今日は ${day}。「去年」は${thisYear - 1}年、「今年」は${thisYear}年を指す。`,
    "- 各記録の年は、記録行に書かれている年をそのまま使うこと。**年を推測・補完してはならない。**",
    "- 期間を絞って数えるときは、その期間に入る記録だけを数えること。範囲外の記録を混ぜないこと。",
    "- 「## 作業の集計」が渡されている場合、回数は**その表の数字をそのまま使うこと**。",
    "  自分で記録を数え直してはならない（数え直すと年をまたいで取り違える）。",
    "",
    "各項目の中身:",
    // 前置きから書き始めると結論が埋もれる。利用者は答えを知りたくて聞いている
    "- answer: 質問への答え。**1文目で結論を述べる**。前置き・状況説明から始めない。1〜2文。",
    "  箇条書き・記号・markdown を使わないこと（根拠は evidence に分けて返すため、本文に列挙しない）。",
    "- answerable: 渡された記録から答えが出せたなら true、記録に無くて答えられないなら false。",
    "- evidence: 答えの根拠にした記録。date は記録行の日付をそのまま（YYYY-MM-DD）、detail は30字以内。",
    "  0〜6件。answer で数を答えたなら、その数と件数が食い違わないようにすること。",
    "",
    // 注意書きはサーバーが固定文言で返す。ここで書かせると本文が毎回長くなる
    "注意書き・免責（製品ラベルの確認など）は画面側で固定表示するため、生成しないこと。",
  ].join("\n");

  const user = [
    typeof recordCount === "number" ? `対象記録件数: ${recordCount}件` : "",
    "",
    "作業記録:",
    records.trim(),
    "",
    "質問:",
    question.trim(),
  ].filter(Boolean).join("\n");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 400,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "record_search_answer",
          strict: true,
          schema: {
            type: "object",
            properties: {
              answer: { type: "string" },
              answerable: { type: "boolean" },
              evidence: {
                type: "array",
                maxItems: 6,
                items: {
                  type: "object",
                  properties: {
                    date: { type: "string" },
                    detail: { type: "string" },
                  },
                  required: ["date", "detail"],
                  additionalProperties: false,
                },
              },
            },
            required: ["answer", "answerable", "evidence"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    console.error("OpenAI API error:", r.status, body);
    return res.status(502).json({ error: "検索に失敗しました。時間をおいて再度お試しください。" });
  }

  const data: ExternalJson = await r.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return res.status(502).json({ error: "回答が空でした。" });

  let parsed: { answer?: string; answerable?: boolean; evidence?: { date?: string; detail?: string }[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("search-chat: JSON parse failed:", content.slice(0, 500));
    return res.status(502).json({ error: "回答を読み取れませんでした。もう一度お試しください。" });
  }

  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  if (!answer) return res.status(502).json({ error: "回答が空でした。" });
  const answerable = parsed.answerable !== false;

  // 根拠の日付は**渡した記録に実在するものだけ**を通す。
  // 実在しない日付を根拠として画面に出すと、記録を確かめたつもりで確かめられない
  // （年の取り違えはここで落ちる）。落としたぶんは黙らずに notes に出す。
  let droppedEvidence = 0;
  const evidence = (Array.isArray(parsed.evidence) ? parsed.evidence : [])
    .map(e => ({ date: (e?.date ?? "").trim(), detail: (e?.detail ?? "").trim() }))
    .filter(e => {
      if (!ISO_DATE.test(e.date) || !e.detail) { if (e.date || e.detail) droppedEvidence++; return false; }
      if (!records.includes(e.date)) { droppedEvidence++; return false; }
      return true;
    })
    .slice(0, 6);

  // ── 注意書きは必ずサーバーが返す（LLM に書かせない）────────────────
  // 文言をここで固定しておくと、書かれたり書かれなかったりしなくなる。
  // 画面はこれを畳んで置く（結論の隣に常時出すと結論が埋もれる）
  const notes: string[] = [
    "記録に書かれていることだけを根拠にしています。記録し忘れた作業は含まれません。",
  ];
  // 農薬に触れる質問・記録のときだけ、農薬固有の注意を足す
  if (/農薬|総使用回数|希釈|散布|防除/.test(records) || /農薬|散布|防除|希釈|回数/.test(question)) {
    notes.push("農薬の総使用回数は、登録情報の原文に条件が含まれることがあります（例「14回以内(土壌灌注は2回以内)」）。最終確認は製品ラベルで行ってください。");
    notes.push("混合剤は有効成分ごとに回数を数える必要がありますが、成分別の情報は渡していません。成分別の判断は製品ラベルで確認してください。");
  }
  if (droppedEvidence > 0) {
    notes.push(`根拠として挙げられた記録のうち${droppedEvidence}件は、渡した記録の中に見つからなかったため除いています。`);
  }

  // 概算コスト算出（gpt-4o-mini: input $0.15 / output $0.60 per 1M tokens）
  const usage = data.usage ?? {};
  const costUsd = ((usage.prompt_tokens ?? 0) * 0.15 + (usage.completion_tokens ?? 0) * 0.60) / 1_000_000;

  // answer はトップレベルに残す（Expo 版・既存の呼び出し元を壊さない）
  return res.status(200).json({ answer, answerable, evidence, notes, usage, costUsd });
}
