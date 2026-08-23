import type { ApiRequest, ApiResponse } from "./types";
import { requireUser, denied } from "./_auth";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // 無認証だと OpenAI キーの踏み台にされるため、ログイン済みユーザーに限定する（api/_auth.ts）
  const auth = await requireUser(req);
  if (!auth.ok) return denied(res, auth);

  const { transcript, fields, workCategories, pesticides } = (req.body ?? {}) as {
    transcript?: string; fields?: string[]; workCategories?: string[]; pesticides?: string[];
  };
  if (!transcript) return res.status(400).json({ error: "transcript required" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "missing env" });

  const prompt =
    `以下は農作業中に音声入力されたメモです。内容を作業報告フォームの項目に振り分けてください。\n` +
    `圃場の候補: ${(fields ?? []).join("、") || "なし"}\n` +
    `作業種類の候補: ${(workCategories ?? []).join("、") || "なし"}\n` +
    `農薬の候補: ${(pesticides ?? []).join("、") || "なし"}\n\n` +
    `メモ: ${transcript}\n\n` +
    `候補にない値は無理に当てはめず null にしてください。noteには元のメモを簡潔に整えた文章を入れてください。`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name:   "structured_report",
          strict: true,
          schema: {
            type: "object",
            properties: {
              field:           { type: ["string", "null"] },
              work_category:   { type: ["string", "null"] },
              pesticide_names: { type: "array", items: { type: "string" } },
              quantity_value:  { type: ["number", "null"] },
              quantity_unit:   { type: ["string", "null"] },
              soil_ph:         { type: ["number", "null"] },
              note:            { type: "string" },
            },
            required: ["field", "work_category", "pesticide_names", "quantity_value", "quantity_unit", "soil_ph", "note"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    console.error("OpenAI API error:", body);
    return res.status(500).json({ error: body });
  }

  const data = await r.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return res.status(500).json({ error: "empty response" });

  try {
    return res.status(200).json(JSON.parse(content));
  } catch {
    return res.status(500).json({ error: "invalid JSON from model" });
  }
}
