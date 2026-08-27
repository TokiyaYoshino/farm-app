// AI日報生成API（Vercel Serverless Function / Node.js）
// その日の作業記録テキストを受け取り、OpenAIで農場の日報に要約する。
// 環境変数: OPENAI_API_KEY（Vercelダッシュボードで設定。リポジトリに書かない）
//
// クライアント側で整形済みのテキストを受け取る疎結合設計にしているため、
// reportsテーブルのスキーマ変更の影響を受けない。

import type { ApiRequest, ApiResponse } from "./types";
import { requireUser, denied } from "./_auth.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // 無認証だと OpenAI キーの踏み台にされるため、ログイン済みユーザーに限定する（api/_auth.ts）
  const auth = await requireUser(req);
  if (!auth.ok) return denied(res, auth);

  const { records, date, farmName } = (req.body ?? {}) as { records?: string; date?: string; farmName?: string };
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
    // 形式はプロンプトで頼まず、スキーマで分ける（頼むだけだと1つの塊で返ることがある）
    "summary に1〜2文の総括、items に主な作業（箇条書きの1項目ずつ）、handover に翌日への申し送りを入れる。",
    "申し送りが無ければ handover は空文字にする。items に総括を繰り返さない。",
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
      // 総括・箇条書き・申し送りを分けて受け取る。プロンプトで形式を頼むだけだと
      // 1つの塊で返ることがあり、そのまま画面に出すと読みづらい
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "daily_report",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              items: { type: "array", maxItems: 12, items: { type: "string" } },
              handover: { type: "string" },
            },
            required: ["summary", "items", "handover"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    console.error("OpenAI API error:", r.status, body);
    return res.status(502).json({ error: "生成に失敗しました。時間をおいて再度お試しください。" });
  }

  const data = await r.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return res.status(502).json({ error: "生成結果が空でした。" });

  let parsed: { summary?: string; items?: string[]; handover?: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    return res.status(502).json({ error: "生成結果の解析に失敗しました。もう一度お試しください。" });
  }
  const summary = (parsed.summary ?? "").trim();
  const items = (parsed.items ?? []).map(i => String(i).trim()).filter(Boolean);
  const handover = (parsed.handover ?? "").trim();
  if (!summary && items.length === 0) return res.status(502).json({ error: "生成結果が空でした。" });

  // report は従来どおり1本の文字列。ai_outputs への保存と、コピーして他所に
  // 貼る用途（日報はそのまま送ることがある）のために組み立てて残す
  const report = [
    summary,
    ...items.map(i => `・${i}`),
    handover ? `\n申し送り: ${handover}` : "",
  ].filter(Boolean).join("\n");

  // 概算コスト算出（gpt-4o-mini: input $0.15 / output $0.60 per 1M tokens）
  const usage = data.usage ?? {};
  const costUsd = ((usage.prompt_tokens ?? 0) * 0.15 + (usage.completion_tokens ?? 0) * 0.60) / 1_000_000;

  return res.status(200).json({ report, summary, items, handover, usage, costUsd });
}
