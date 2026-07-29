// 病害虫画像診断API（Vercel Serverless Function / Node.js）
// 既存の作業記録に添付済みの写真（Supabase Storageの公開URL）を受け取り、
// OpenAIのvision機能で病害虫・生育不良の兆候を診断する。
// 環境変数: OPENAI_API_KEY（Vercelダッシュボードで設定。リポジトリに書かない）
//
// 画像本体はサーバーを経由させず公開URLをそのままOpenAIに渡す疎結合設計
// （generate-report.ts / search-chat.ts / pest-control-advice.tsと同じ方針）。

import type { ApiRequest, ApiResponse } from "./types";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { imageUrl, cropName } = (req.body ?? {}) as { imageUrl?: string; cropName?: string };
  if (!imageUrl || typeof imageUrl !== "string" || !/^https?:\/\//.test(imageUrl)) {
    return res.status(400).json({ error: "imageUrl required" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "missing env: OPENAI_API_KEY" });

  const system = [
    "あなたは農作物の病害虫を写真から診断するアシスタントです。",
    "写真に写っている葉・茎・果実などの状態を観察し、考えられる病害虫や生育不良の可能性を判定してください。",
    "断定はせず、可能性が高いものから最大2〜3件挙げること。各項目は症状の要点のみを簡潔に。",
    "写真だけでは判断できない場合は inconclusive を true にすること。",
    "注意書き（JA・専門家への相談、農薬登録の確認）は画面側で固定表示するため、生成しないこと。",
  ].join("\n");

  const userText = cropName
    ? `この写真は「${cropName}」の作業記録に添付されたものです。病害虫の兆候がないか診断してください。`
    : "この写真の作物に病害虫の兆候がないか診断してください。";

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: {
        type: "json_schema",
        json_schema: {
          name:   "pest_diagnosis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              inconclusive: { type: "boolean" },
              possibilities: {
                type: "array",
                maxItems: 3,
                items: {
                  type: "object",
                  properties: {
                    name:       { type: "string" },
                    confidence: { type: "string", enum: ["高", "中", "低"] },
                    reason:     { type: "string" },
                  },
                  required: ["name", "confidence", "reason"],
                  additionalProperties: false,
                },
              },
              note: { type: "string" },
            },
            required: ["inconclusive", "possibilities", "note"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    console.error("OpenAI API error:", r.status, body);
    return res.status(502).json({ error: "診断に失敗しました。時間をおいて再度お試しください。" });
  }

  const data = await r.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return res.status(502).json({ error: "診断結果が空でした。" });

  let diagnosis: unknown;
  try {
    diagnosis = JSON.parse(content);
  } catch {
    return res.status(502).json({ error: "診断結果の解析に失敗しました。" });
  }

  // 概算コスト算出（gpt-4o-mini: input $0.15 / output $0.60 per 1M tokens。画像分のトークンも含む）
  const usage = data.usage ?? {};
  const costUsd = ((usage.prompt_tokens ?? 0) * 0.15 + (usage.completion_tokens ?? 0) * 0.60) / 1_000_000;

  return res.status(200).json({ diagnosis, usage, costUsd });
}
