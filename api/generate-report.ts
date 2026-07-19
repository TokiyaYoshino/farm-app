// AI日報生成API（Vercel Serverless Function / Node.js）
// その日の作業記録テキストを受け取り、OpenAIで農場の日報に要約する。
// 環境変数: OPENAI_API_KEY（Vercelダッシュボードで設定。リポジトリに書かない）
//
// クライアント側で整形済みのテキストを受け取る疎結合設計にしているため、
// reportsテーブルのスキーマ変更の影響を受けない。

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  const { records, date, farmName } = req.body ?? {};
  if (!records || typeof records !== "string" || !records.trim()) {
    return res.status(400).json({ error: "records required" });
  }
  if (records.length > 8000) {
    return res.status(400).json({ error: "records too long" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "missing env: OPENAI_API_KEY" });

  const system = [
    "あなたは農場の作業日報を作成するアシスタントです。",
    "渡された作業記録をもとに、簡潔で読みやすい日本語の日報を作成してください。",
    "形式: 冒頭に1〜2文の総括、続けて「・」で主な作業を箇条書き。最後に翌日への申し送りがあれば1行。",
    "事実にない情報は追加しないこと。数値や農薬名は記録どおり正確に扱うこと。",
    "全体で250字程度に収めること。",
  ].join("\n");

  const user = [
    farmName ? `農場名: ${farmName}` : "",
    date ? `日付: ${date}` : "",
    "",
    "作業記録:",
    records.trim(),
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
      temperature: 0.4,
      max_tokens: 500,
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    console.error("OpenAI API error:", r.status, body);
    return res.status(502).json({ error: "生成に失敗しました。時間をおいて再度お試しください。" });
  }

  const data = await r.json();
  const report = data.choices?.[0]?.message?.content?.trim();
  if (!report) return res.status(502).json({ error: "生成結果が空でした。" });

  // 概算コスト算出（gpt-4o-mini: input $0.15 / output $0.60 per 1M tokens）
  const usage = data.usage ?? {};
  const costUsd = ((usage.prompt_tokens ?? 0) * 0.15 + (usage.completion_tokens ?? 0) * 0.60) / 1_000_000;

  return res.status(200).json({ report, usage, costUsd });
}
