// 記録検索チャットAPI（Vercel Serverless Function / Node.js）
// 自然言語の質問と、クライアント側で整形済みの作業記録テキストを受け取り、
// OpenAIに記録内容だけを根拠として回答させる。
// 環境変数: OPENAI_API_KEY（Vercelダッシュボードで設定。リポジトリに書かない）
//
// クライアント側で整形済みのテキストを受け取る疎結合設計にしているため、
// reportsテーブルのスキーマ変更の影響を受けない（generate-report.tsと同じ設計）。

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  const { question, records, recordCount } = req.body ?? {};
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

  const system = [
    "あなたは農場の作業記録を検索して質問に答えるアシスタントです。",
    "渡された作業記録のみを根拠に、日本語で簡潔に回答してください。",
    "記録に書かれていない情報については、推測せず「記録からは分かりません」と答えてください。",
    "数値や農薬名などは記録どおり正確に扱うこと。",
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
      max_tokens: 500,
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    console.error("OpenAI API error:", r.status, body);
    return res.status(502).json({ error: "検索に失敗しました。時間をおいて再度お試しください。" });
  }

  const data = await r.json();
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) return res.status(502).json({ error: "回答が空でした。" });

  // 概算コスト算出（gpt-4o-mini: input $0.15 / output $0.60 per 1M tokens）
  const usage = data.usage ?? {};
  const costUsd = ((usage.prompt_tokens ?? 0) * 0.15 + (usage.completion_tokens ?? 0) * 0.60) / 1_000_000;

  return res.status(200).json({ answer, usage, costUsd });
}
