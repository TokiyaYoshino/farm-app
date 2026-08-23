// 病害虫画像診断API（Vercel Serverless Function / Node.js）
// 既存の作業記録に添付済みの写真（Supabase Storageの公開URL）を受け取り、
// OpenAIのvision機能で病害虫・生育不良の兆候を診断する。
// 環境変数: OPENAI_API_KEY（Vercelダッシュボードで設定。リポジトリに書かない）
//
// 画像本体はサーバーを経由させず公開URLをそのままOpenAIに渡す疎結合設計
// （generate-report.ts / search-chat.ts / pest-control-advice.tsと同じ方針）。

import type { ApiRequest, ApiResponse } from "./types";
import { requireUser, denied } from "./_auth.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // 無認証だと OpenAI キーの踏み台にされるため、ログイン済みユーザーに限定する（api/_auth.ts）
  const auth = await requireUser(req);
  if (!auth.ok) return denied(res, auth);

  const { imageUrl, cropName } = (req.body ?? {}) as { imageUrl?: string; cropName?: string };
  if (!imageUrl || typeof imageUrl !== "string" || !/^https?:\/\//.test(imageUrl)) {
    return res.status(400).json({ error: "imageUrl required" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "missing env: OPENAI_API_KEY" });

  const system = [
    "あなたは農作物の病害虫・生理障害を写真から鑑別診断するアシスタントです。",
    "",
    "観察の手順:",
    "1. 症状の部位を特定する（新葉/古葉のどちらから出ているか、株全体か部分的か、葉脈間か葉全体かの黄化・変色パターン）",
    "2. 病斑の見た目を確認する（輪郭が明瞭な病斑・輪紋の有無、すす状の付着物や虫・卵・食痕の有無、モザイク状の濃淡や葉の変形・巻き・縮れの有無）",
    "3. 上記の観察に基づき、次の4カテゴリで原因を鑑別する:",
    "   - 病害（糸状菌・細菌等。輪郭の明瞭な病斑や急速な広がりが手がかり）",
    "   - 虫害（食害・吸汁害。虫本体や食痕、すす病の随伴が手がかり）",
    "   - 生理障害（肥料欠乏・水はけ不良・日照/温度ストレス等。進行が緩慢で、葉脈間黄化か葉全体の均一な黄化かが手がかり）",
    "   - ウイルス病（モザイク状の濃淡、葉の変形・巻き・縮れが手がかり）",
    "",
    "厳守事項:",
    "- possibilitiesの各nameには「黄化」「変色」など写真に写っている症状をそのまま言い換えたものではなく、具体的な病名・虫名・生理障害名（例:「疫病」「アブラムシ」「窒素欠乏」「根腐れ病」）を入れること。",
    "- 症状が似ていて紛らわしい候補（例：下位葉からの黄化は窒素欠乏でも根腐れ病でも起こりうる）は、reasonで両者を見分ける決め手（萎れの有無、土壌の過湿の兆候など）に触れること。",
    "- confidenceは0〜100の整数で、写真から読み取れる根拠の強さに応じて具体的に見積もること。10刻みなどの大雑把な丸めは避け、65のような細かい値も使うこと。",
    "- 可能性が高いものから最大4件、重複や言い換えを避けて列挙すること。",
    "- 写真だけでは判断できない場合は inconclusive を true にすること。",
    "- 注意書き（JA・専門家への相談、農薬登録の確認）は画面側で固定表示するため、生成しないこと。",
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
      temperature: 0.2,
      max_tokens: 700,
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
                maxItems: 4,
                items: {
                  type: "object",
                  properties: {
                    name:       { type: "string" },
                    category:   { type: "string", enum: ["病害", "虫害", "生理障害", "ウイルス病"] },
                    confidence: { type: "integer", minimum: 0, maximum: 100 },
                    reason:     { type: "string" },
                  },
                  required: ["name", "category", "confidence", "reason"],
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
