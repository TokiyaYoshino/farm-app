// 天気×防除タイミング助言API（Vercel Serverless Function / Node.js）
// クライアント側でOpen-Meteo（無料API）から取得・整形した3日分の天気予報テキストを受け取り、
// OpenAIで防除（農薬散布）に適したタイミングの助言文を生成する。
// 環境変数: OPENAI_API_KEY（Vercelダッシュボードで設定。リポジトリに書かない）
//
// 天気取得自体はクライアント側の無料APIで完結し、このAPIは助言文生成のみを担う
// （generate-report.ts / search-chat.tsと同じ疎結合設計）。

import type { ApiRequest, ApiResponse } from "./types";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { forecast } = (req.body ?? {}) as { forecast?: string };
  if (!forecast || typeof forecast !== "string" || !forecast.trim()) {
    return res.status(400).json({ error: "forecast required" });
  }
  if (forecast.length > 2000) {
    return res.status(400).json({ error: "forecast too long" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "missing env: OPENAI_API_KEY" });

  const system = [
    "あなたは農場の防除（農薬散布）作業のタイミングを助言するアシスタントです。",
    "渡された天気予報のみを根拠に、農薬散布に適した日・時間帯とその理由を日本語で簡潔に助言してください。",
    "一般的な知識として、降水確率が高い日や散布直後に雨が予想される日は薬効が流れるため避けるべきであること、",
    "強風の日はドリフト（飛散）のリスクがあるため避けるべきであることを踏まえて判断してください。",
    "予報にない情報（実際の風向きや周辺への影響など）は推測せず言及しないこと。",
    "全体で200字程度に収めること。",
  ].join("\n");

  const user = ["天気予報:", forecast.trim()].join("\n");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 400,
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    console.error("OpenAI API error:", r.status, body);
    return res.status(502).json({ error: "助言生成に失敗しました。時間をおいて再度お試しください。" });
  }

  const data = await r.json();
  const advice = data.choices?.[0]?.message?.content?.trim();
  if (!advice) return res.status(502).json({ error: "助言結果が空でした。" });

  // 概算コスト算出（gpt-4o-mini: input $0.15 / output $0.60 per 1M tokens）
  const usage = data.usage ?? {};
  const costUsd = ((usage.prompt_tokens ?? 0) * 0.15 + (usage.completion_tokens ?? 0) * 0.60) / 1_000_000;

  return res.status(200).json({ advice, usage, costUsd });
}
