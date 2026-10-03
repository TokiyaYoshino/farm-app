// api/_quota.ts の契約テスト（農場ごとの回数の枠）。
//
//   cd ~/Projects/farm-app && node scripts/test-org-quota.mjs
//
// 料金の決定（docs/decisions/20261001-pricing-freemium.md）と
// 作り方の ADR（docs/decisions/20261003-adr-signup-billing-deletion.md 6節）を固定する。
//   - 数えるのは**人ではなく農場**（organization_id）
//   - 無料: 相談 週3件・写真で調べる 週1回 ／ 有料: 相談 1日8件・写真で調べる 1日3回
//   - 「記録に聞く」（search_chat）は相談に含める
//   - 週は日本時間の月曜0時、日は日本時間の0時で切る
//   - 数えられなかったときは通す（fail-open）
//   - 枠の対象外の種類（日報など）はここでは止めない（暴走止めは checkDailyLimit が担当）
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("types.js")) return next(specifier.replace(/types\.js$/, "types.ts"), context);
    return next(specifier, context);
  },
});

process.env.VITE_SUPABASE_URL = "https://test.supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const ORG = "11111111-1111-1111-1111-111111111111";
const q = await import(pathToFileURL(new URL("../api/_quota.ts", import.meta.url).pathname).href);

let pass = 0, fail = 0;
const t = (name, cond, note = "") => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name, note)); };

// fetch を差し替え、ai_outputs の件数を返す。最後に叩かれた URL を控える
let lastUrl = null;
const mockCount = (n, ok = true) => {
  globalThis.fetch = async (u) => {
    lastUrl = String(u);
    return {
      ok,
      status: ok ? 200 : 500,
      headers: { get: (h) => (h.toLowerCase() === "content-range" ? `0-0/${n}` : null) },
      json: async () => [],
    };
  };
};

// ── 1. 枠の中身（料金の決定どおりか） ─────────────────────────
console.log("\n1. 枠の中身:");
t("無料の相談は週3件", q.QUOTA.consult.free.limit === 3 && q.QUOTA.consult.free.period === "week");
t("無料の写真は週1回", q.QUOTA.photo.free.limit === 1 && q.QUOTA.photo.free.period === "week");
t("有料の相談は1日8件", q.QUOTA.consult.paid.limit === 8 && q.QUOTA.consult.paid.period === "day");
t("有料の写真は1日3回", q.QUOTA.photo.paid.limit === 3 && q.QUOTA.photo.paid.period === "day");

// ── 2. 種類 → 枠 ─────────────────────────────────────────────
console.log("\n2. どの種類をどの枠で数えるか:");
t("advice は相談", q.groupOfKind("advice") === "consult");
t("search_chat（記録に聞く）も相談", q.groupOfKind("search_chat") === "consult");
t("diagnosis は写真", q.groupOfKind("diagnosis") === "photo");
for (const k of ["daily_report", "pest_advice", "voice_structure", "unknown_kind"]) {
  t(`${k} は枠の対象外`, q.groupOfKind(k) === null);
}

// ── 3. 区切り（日本時間） ─────────────────────────────────────
console.log("\n3. 区切りは日本時間:");
// 2026-10-04（日）10:00 JST = 01:00Z → 週の始まりは 2026-09-28（月）00:00 JST = 09-27T15:00Z
const sunday = new Date("2026-10-04T01:00:00Z");
t("日曜の週の始まりは前の月曜0時", q.windowStart("week", sunday).toISOString() === "2026-09-27T15:00:00.000Z",
  q.windowStart("week", sunday).toISOString());
// 2026-10-05（月）08:30 JST = 10-04T23:30Z → 月曜当日の0時 = 10-04T15:00Z（UTCではまだ日曜）
const mondayMorning = new Date("2026-10-04T23:30:00Z");
t("月曜の朝は当日0時から（UTCの日付に引きずられない）",
  q.windowStart("week", mondayMorning).toISOString() === "2026-10-04T15:00:00.000Z",
  q.windowStart("week", mondayMorning).toISOString());
// 2026-10-04 08:00 JST = 10-03T23:00Z → 日の始まりは 10-04 00:00 JST = 10-03T15:00Z
t("日の始まりは日本時間の0時",
  q.windowStart("day", new Date("2026-10-03T23:00:00Z")).toISOString() === "2026-10-03T15:00:00.000Z");

// ── 4. 数え方と止め方 ─────────────────────────────────────────
console.log("\n4. 数え方と止め方:");
mockCount(2);
let r = await q.checkOrgQuota(ORG, "advice", "free", sunday);
t("無料・相談2件目までは通す", r === null);
t("数える先は organization_id（人ではなく農場）", lastUrl.includes(`organization_id=eq.${ORG}`) && !lastUrl.includes("created_by"));
t("相談は advice と search_chat を合わせて数える",
  decodeURIComponent(lastUrl).includes("kind=in.(advice,search_chat)"), decodeURIComponent(lastUrl));
t("週の始まり以降だけ数える", decodeURIComponent(lastUrl).includes("created_at=gte.2026-09-27T15:00:00.000Z"));

mockCount(3);
r = await q.checkOrgQuota(ORG, "search_chat", "free", sunday);
t("無料・相談3件に達したら止める（429）", r?.ok === false && r.status === 429);
t("止めるときの文言に「月曜」がある（いつ戻るか分かる）", /月曜/.test(r?.error ?? ""), r?.error);
t("文言に「AI」を出さない（CLAUDE.md）", !/AI/.test(r?.error ?? ""));

mockCount(3);
r = await q.checkOrgQuota(ORG, "advice", "paid", sunday);
t("有料なら3件では止めない", r === null);
mockCount(8);
r = await q.checkOrgQuota(ORG, "advice", "paid", sunday);
t("有料・相談8件で止める", r?.ok === false && r.status === 429);
t("有料の文言は「明日」", /明日/.test(r?.error ?? ""), r?.error);

mockCount(1);
r = await q.checkOrgQuota(ORG, "diagnosis", "free", sunday);
t("無料・写真は1回で止める", r?.ok === false);

mockCount(999);
r = await q.checkOrgQuota(ORG, "daily_report", "free", sunday);
t("枠の対象外は件数に関係なく通す", r === null);

// ── 5. 数えられないとき ───────────────────────────────────────
console.log("\n5. 数えられないときは通す（fail-open）:");
mockCount(0, false);
r = await q.checkOrgQuota(ORG, "advice", "free", sunday);
t("件数の取得に失敗したら通す", r === null);
globalThis.fetch = async () => { throw new Error("network"); };
r = await q.checkOrgQuota(ORG, "advice", "free", sunday);
t("通信が落ちても通す", r === null);
r = await q.checkOrgQuota(null, "advice", "free", sunday);
t("組織が分からないときは通す（数える先が無い）", r === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
