// 天気×防除タイミング助言API（Vercel Serverless Function / Node.js）
// クライアント側でOpen-Meteo（無料API）から取得・整形した実績7日＋予報7日のテキストを受け取り、
// OpenAIで防除（農薬散布）に適したタイミングの助言文を生成する。
// 環境変数: OPENAI_API_KEY（Vercelダッシュボードで設定。リポジトリに書かない）
//
// 天気取得自体はクライアント側の無料APIで完結する（generate-report.ts / search-chat.tsと同じ疎結合設計）。
// ただし気象庁の警報だけはサーバー側で取得する: 地域コードの解決に使う国土地理院の逆ジオコーダに
// CORSヘッダが無く、ブラウザから直接叩けないため。
//
// 農薬の適用情報（registrations）を渡された場合は、使用基準の範囲内かどうかの観点も助言に含める。
// ただし最終的に正しいのは製品ラベルの表示であり、この助言を根拠に散布判断をさせてはならない。

import type { ApiRequest, ApiResponse } from "./types";

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

// 緯度経度 → 気象庁の府県予報区コード。
// 国土地理院の逆ジオコーダが返す muniCd（市区町村コード）の上2桁がJIS都道府県コードで、
// 気象庁の府県予報区コードは原則 `{JIS2桁}0000`。
// 北海道(01)だけは複数の予報区に分かれており単純変換できないため、警報の取得自体を見送る
// （誤った地域の警報を出すよりは出さない方が安全）。
async function resolveJmaAreaCode(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await fetch(
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!r.ok) return null;
    const d = await r.json();
    const muniCd: string | undefined = d?.results?.muniCd;
    if (!muniCd || muniCd.length < 2) return null;
    const pref = muniCd.padStart(5, "0").slice(0, 2);
    if (pref === "01") return null; // 北海道は予報区が細分されるため対象外
    return `${pref}0000`;
  } catch {
    return null;
  }
}

// 気象庁の防災情報JSON（CORS許可あり・公式ドキュメントは無い非公式エンドポイント）。
// 取得できなければ黙って諦める（助言本体を止めない）。
async function fetchJmaWarnings(areaCode: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://www.jma.go.jp/bosai/warning/data/warning/${areaCode}.json`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!r.ok) return null;
    const d = await r.json();
    const names = new Set<string>();
    for (const at of d?.areaTypes ?? []) {
      for (const area of at?.areas ?? []) {
        for (const w of area?.warnings ?? []) {
          // status が「発表警報・注意報はなし」「解除」等のものは発表中ではない
          if (w?.code && w?.status && !/なし|解除/.test(w.status)) {
            names.add(`${w.status}`);
          }
        }
      }
    }
    if (names.size === 0) return "発表中の警報・注意報はありません。";
    return `発表中: ${Array.from(names).join("、")}（${d?.publishingOffice ?? "気象庁"}）`;
  } catch {
    return null;
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { forecast, lat, lng, registrations } = (req.body ?? {}) as {
    forecast?: string;
    lat?: number;
    lng?: number;
    registrations?: RegistrationInfo[];
  };
  if (!forecast || typeof forecast !== "string" || !forecast.trim()) {
    return res.status(400).json({ error: "forecast required" });
  }
  // 実績7日＋予報7日で従来の3日予報より長くなるため上限を引き上げている
  if (forecast.length > 4000) {
    return res.status(400).json({ error: "forecast too long" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "missing env: OPENAI_API_KEY" });

  // 警報の取得は任意情報。失敗しても助言は生成する
  let warnings: string | null = null;
  if (typeof lat === "number" && typeof lng === "number") {
    const areaCode = await resolveJmaAreaCode(lat, lng);
    if (areaCode) warnings = await fetchJmaWarnings(areaCode);
  }

  const hasRegistrations = Array.isArray(registrations) && registrations.length > 0;

  const system = [
    "あなたは農場の防除（農薬散布）作業のタイミングを助言するアシスタントです。",
    "渡された情報のみを根拠に、農薬散布に適した日・時間帯とその理由を日本語で簡潔に助言してください。",
    "一般的な知識として、降水確率が高い日や散布直後に雨が予想される日は薬効が流れるため避けるべきであること、",
    "強風の日はドリフト（飛散）のリスクがあるため避けるべきであることを踏まえて判断してください。",
    "直近の実績降水が多い場合は、葉が濡れた状態だと薬液の付着が悪くなる点にも触れてください。",
    "予報・実績にない情報（実際の風向きや周辺への影響など）は推測せず言及しないこと。",
    hasRegistrations
      ? [
          "農薬の適用情報（登録内容）が渡された場合は、対象作物・希釈倍数・使用時期・使用回数の観点も助言に含めてください。",
          "ただし渡された適用情報の範囲外は推測しないこと。登録内容に無い作物・病害虫について使用可否を述べないこと。",
          "助言の最後に、必ず製品ラベルの表示を確認するよう一文添えること（ラベルの表示が最終的な正であり、",
          "この助言を根拠に散布を判断してはいけないため）。",
        ].join("\n")
      : "",
    "全体で300字程度に収めること。",
  ].filter(Boolean).join("\n");

  const userParts = ["天気（実績と予報）:", forecast.trim()];
  if (warnings) userParts.push("", "気象庁の警報・注意報:", warnings);
  if (hasRegistrations) {
    userParts.push("", "使用予定の農薬の適用情報（農薬登録情報より）:");
    for (const r of registrations!.slice(0, 20)) {
      userParts.push(
        [
          r.product_name && `農薬:${r.product_name}`,
          r.crop_name && `作物:${r.crop_name}`,
          r.pest_name && `適用病害虫:${r.pest_name}`,
          r.dilution && `希釈倍数:${r.dilution}`,
          r.usage_timing && `使用時期:${r.usage_timing}`,
          r.usage_count && `本剤の使用回数:${r.usage_count}`,
          r.total_count && `総使用回数:${r.total_count}`,
          r.application && `使用方法:${r.application}`,
        ].filter(Boolean).join(" / "),
      );
    }
  }
  const user = userParts.join("\n");

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
      max_tokens: 600,
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

  return res.status(200).json({ advice, warnings, usage, costUsd });
}
