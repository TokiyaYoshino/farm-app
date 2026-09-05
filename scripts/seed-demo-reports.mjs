// App Store 申請用のスクリーンショットと審査用アカウントに、それらしい作業記録を投入する。
//
//   node scripts/seed-demo-reports.mjs <ユーザーID> <パスワード>
//   node scripts/seed-demo-reports.mjs <ユーザーID> <パスワード> --delete
//
// オプション:
//   --count=60   投入する件数（既定 60）
//   --days=430   何日前まで遡って散らすか（既定 430）。分析画面の「前年同時期比」を
//                出すために既定で1年以上遡る
//   --delete     このスクリプトが入れた記録だけを消す（note が [demo] で始まるもの）
//   --dry-run    DBに触らず、生成される記録の中身だけを出す（ログインも不要）
//
// 前提と範囲:
//   - ログインは Web/アプリと同じ経路（ユーザーID → メール解決 → パスワード）。
//     したがって RLS 適用後もそのまま動く（自組織の記録しか作らない）。
//   - **作物と圃場は作らない。** 先にアプリか Web で登録しておくこと。マスタまで作ると
//     --delete で消し残る。作物が0件なら、その旨を出して何もせず終了する。
//   - 農薬・写真は付けない（農薬は FK、写真は Storage を汚すため）。
//   - 同じ引数なら毎回同じデータになる（乱数は固定シード）。撮り直しても画面が変わらない。

import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./_env.mjs";

// 位置引数（ID・パスワード）とフラグを、順番に依存せず分ける。
// `--dry-run` を先頭に置いてもユーザーIDとして食われないようにするため。
const argv = process.argv.slice(2);
const flags = argv.filter(a => a.startsWith("--"));
const [loginId, password] = argv.filter(a => !a.startsWith("--"));
const flag = (name, def) => {
  const hit = flags.find(f => f.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : def;
};
const DELETE = flags.includes("--delete");
const DRY    = flags.includes("--dry-run");
const COUNT  = flag("count", 60);
const DAYS   = flag("days", 430);
const TAG    = "[demo]";

if (!DRY && (!loginId || !password)) {
  console.error("使い方: node scripts/seed-demo-reports.mjs <ユーザーID> <パスワード> [--count=60] [--days=430] [--delete]");
  process.exit(1);
}

/** DBに触るときだけ接続情報を要求する（--dry-run では呼ばない） */
const connect = () => {
  const { url, anon } = supabaseConfig();
  return createClient(url, anon, { auth: { persistSession: false } });
};

// ─── 固定シードの疑似乱数（撮り直しても同じ画面になるように）────────────
let seed = 20260905;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ─── 紀州の梅・柑橘の年間作業に寄せた月別の重み ──────────────────────
// 12〜1月に剪定、3〜5月に防除、6月に収穫、収穫後にお礼肥、夏は草刈り。
// 実在しない時期の作業が並ぶと、農家が見た瞬間に嘘だと分かるため月で分ける。
const WORK_BY_MONTH = {
  1:  ["剪定", "剪定", "施肥"],
  2:  ["剪定", "施肥", "その他"],
  3:  ["防除", "防除", "草刈り"],
  4:  ["防除", "防除", "草刈り", "その他"],
  5:  ["防除", "草刈り", "灌水"],
  6:  ["収穫", "収穫", "収穫", "防除"],
  7:  ["収穫", "施肥", "草刈り"],
  8:  ["草刈り", "灌水", "その他"],
  9:  ["草刈り", "施肥", "その他"],
  10: ["草刈り", "その他", "灌水"],
  11: ["施肥", "その他", "剪定"],
  12: ["剪定", "剪定", "その他"],
};

// 和歌山の月別の日中気温のめやす。天気で±し、さらに±2度ゆらす。
// 「7月の雨で14℃」のような、その土地の人が見た瞬間に嘘と分かる値を出さないため。
const MONTH_TEMP = { 1:10, 2:11, 3:14, 4:19, 5:24, 6:27, 7:31, 8:32, 9:28, 10:23, 11:17, 12:12 };
const WEATHER = [
  { weather: "晴れ",   offset:  2, humidity: [40, 65], rainy: false },
  { weather: "くもり", offset:  0, humidity: [55, 80], rainy: false },
  { weather: "雨",     offset: -3, humidity: [75, 95], rainy: true  },
];

const NOTES = {
  収穫:   ["南側の畝から。実の付きは先週より良い", "青梅の傷み少なめ。選別は明日", "午前中で切り上げ。午後は雨予報"],
  防除:   ["展着剤を規定量で。風が弱いうちに散布", "黒星病の発生を確認したため前倒し", "散布後2時間で降雨。要観察"],
  施肥:   ["収穫後のお礼肥。樹冠下に均一に", "有機配合を樹冠下へ。雨の前に済ませた"],
  剪定:   ["徒長枝を中心に。日当たりを優先", "混み合った枝を抜いた。切り口に癒合剤"],
  草刈り: ["畦畔まで。刈払機の刃を交換", "梅雨前に一巡"],
  灌水:   ["若木を中心に。土壌水分が低い", "定植後の活着まで継続"],
  その他: ["防風ネットの補修", "資材の在庫確認と発注", "選果場の片付け"],
};

const iso = (d) => d.toISOString().slice(0, 10);

/** 6/1〜7/20（南高梅の収穫期）の日付を返す。期間外しか引けなければ null */
function harvestSeasonDate(today, earliest) {
  const years = [];
  for (let y = earliest.getFullYear(); y <= today.getFullYear(); y++) years.push(y);
  for (let i = 0; i < 8; i++) {
    const d = new Date(years[Math.floor(rnd() * years.length)], 5, 1 + between(0, 49));
    if (d >= earliest && d <= today) return d;
  }
  return null;
}
const hhmm = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

async function main() {
  const supabase = connect();

  // 1) ログイン（アプリと同じ経路）
  const { data: u, error: ue } = await supabase
    .from("users").select("email").eq("login_id", loginId).maybeSingle();
  if (ue || !u?.email) { console.error(`ユーザーID "${loginId}" が見つかりません`); process.exit(1); }

  const { error: ae } = await supabase.auth.signInWithPassword({ email: u.email, password });
  if (ae) { console.error("ログインに失敗しました:", ae.message); process.exit(1); }

  const { data: session } = await supabase.auth.getSession();
  const authId = session?.session?.user?.id;
  const { data: me } = await supabase.from("users").select("*").eq("auth_id", authId).maybeSingle();
  if (!me) { console.error("ログインはできましたが、users に自分の行が見つかりません"); process.exit(1); }
  const org = me.org, orgId = me.organization_id;
  console.log(`ログイン: ${me.name}（${org}）`);

  // 2) --delete: 自分が入れたデモ記録だけ消す
  if (DELETE) {
    const { data: doomed } = await supabase
      .from("reports").select("id").eq("org", org).like("note", `${TAG}%`);
    if (!doomed?.length) { console.log("消すデモ記録はありません"); return; }
    const { error } = await supabase.from("reports").delete().in("id", doomed.map(r => r.id));
    if (error) { console.error("削除に失敗:", error.message); process.exit(1); }
    console.log(`デモ記録を ${doomed.length} 件消しました`);
    return;
  }

  // 3) 作物と圃場を読む（作らない）
  const [{ data: crops }, { data: fields }] = await Promise.all([
    supabase.from("crops").select("id,name").eq("org", org).order("id"),
    supabase.from("fields").select("name").eq("org", org).order("id"),
  ]);
  if (!crops?.length) {
    console.error("作物が0件です。先にアプリか Web で作物を登録してください（このスクリプトはマスタを作りません）");
    process.exit(1);
  }
  const fieldNames = fields?.length ? fields.map(f => f.name) : [""];
  console.log(`作物 ${crops.length} 件 / 圃場 ${fields?.length ?? 0} 件を使います`);

  const rows = buildRows({ org, orgId, userId: me.id, crops, fieldNames });

  // 5) 投入（50件ずつ）
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await supabase.from("reports").insert(chunk);
    if (error) { console.error("投入に失敗:", error.message); process.exit(1); }
    inserted += chunk.length;
  }
  summarize(rows, inserted);
}

/** 記録の中身を組み立てる。DBには触らない（--dry-run から直接呼べるように分けてある） */
function buildRows({ org, orgId, userId, crops, fieldNames }) {
  const today = new Date();
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() - DAYS);
  const rows = [];
  for (let i = 0; i < COUNT; i++) {
    // 実際の記録は収穫期に集中する。均等に散らすと分析画面の収穫量が痩せて見える
    let d = null;
    if (rnd() < 0.4) d = harvestSeasonDate(today, earliest);
    if (!d) { d = new Date(today); d.setDate(d.getDate() - between(0, DAYS)); }
    const month = d.getMonth() + 1;
    const workType = pick(WORK_BY_MONTH[month]);
    const crop  = pick(crops);
    const wx    = pick(WEATHER);
    const startH = between(6, 9);
    const hours  = between(2, 5);
    const start = hhmm(startH, pick([0, 15, 30]));
    const end   = hhmm(startH + hours, pick([0, 30]));
    const isHarvest = workType === "収穫";
    const qty = isHarvest ? String(between(8, 140)) : "";

    rows.push({
      org, organization_id: orgId, user_id: userId,
      crop_id: crop.id,
      field: pick(fieldNames),
      date: iso(d),
      work_type: workType,
      work_category_id: null,
      quantity: qty,
      quantity_value: isHarvest ? Number(qty) : null,
      // 分析画面の収穫量は work_type='収穫' かつ kg 系の単位のみ合算する（src/lib/metrics.ts）
      quantity_unit: isHarvest ? "kg" : null,
      work_time: "",
      work_start: start,
      work_end: end,
      work_minutes: hours * 60,
      note: `${TAG} ${pick(NOTES[workType] ?? NOTES.その他)}`,
      weather: wx.weather,
      weather_icon: "",
      temp: String(MONTH_TEMP[month] + wx.offset + between(-2, 2)),
      humidity: String(between(wx.humidity[0], wx.humidity[1])),
      rain: String(wx.rainy ? between(1, 18) : 0),
      image_url: null,
      pesticide_id: null,
      pesticide_amount: null,
      pesticides_used: null,
      soil_ph: null,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

function summarize(rows, inserted) {
  const harvest = rows.filter(r => r.work_type === "収穫");
  const kg = harvest.reduce((s, r) => s + Number(r.quantity), 0);
  const byType = {};
  for (const r of rows) byType[r.work_type] = (byType[r.work_type] ?? 0) + 1;
  console.log(
    `${inserted} 件${inserted === rows.length ? "" : `/${rows.length} 件`}（${rows[0].date} 〜 ${rows[rows.length - 1].date}）\n` +
    `  内訳: ${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(" / ")}\n` +
    `  収穫 ${harvest.length} 件・計 ${kg}kg\n` +
    `  撤収するときは同じ引数に --delete を付けて実行してください`
  );
}

/** --dry-run: DBに触らず、生成結果だけを確認する */
function dryRun() {
  const rows = buildRows({
    org: "kishu", orgId: "00000000-0000-0000-0000-000000000000", userId: 1,
    crops: [{ id: 1, name: "南高梅" }, { id: 2, name: "temari" }],
    fieldNames: ["第1圃場", "第2圃場"],
  });
  console.log("--dry-run: DBには何も書いていません。先頭3件:\n");
  for (const r of rows.slice(0, 3)) {
    console.log(`  ${r.date}  ${r.work_type.padEnd(4)} ${r.field}  ${r.quantity ? r.quantity + r.quantity_unit : "—"}  ` +
                `${r.work_start}〜${r.work_end}  ${r.weather} ${r.temp}°C`);
    console.log(`    ${r.note}`);
  }
  console.log("");
  summarize(rows, rows.length);
}

if (DRY) dryRun();
else main().catch(e => { console.error(e); process.exit(1); });
