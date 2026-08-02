// アプリアイコン・スプラッシュ画像の生成（依存なし・Node内蔵zlibでPNGエンコード）
// デザイントークン準拠: ブランド緑 ink #2E7D32 の面に白い葉（vesica piscis）。
// iOS側で角丸マスクがかかるため正方形ベタで出力する。
// 実行: node scripts/generate-assets.mjs → assets/icon.png(1024) / assets/splash-icon.png(512)
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "assets");
mkdirSync(outDir, { recursive: true });

// ── PNG エンコーダ（truecolor 8bit RGBA） ──
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── 描画（2x2スーパーサンプリングでアンチエイリアス） ──
const INK = [0x2e, 0x7d, 0x32];      // C.ink
const INK_DARK = [0x25, 0x66, 0x28]; // C.inkPress（葉脈用）
const WHITE = [255, 255, 255];

// 葉: 2円の交差（vesica piscis）を45°回転して縦長のリーフに。中心に葉脈。
function leafCoverage(nx, ny) {
  // nx,ny: -1..1 正規化座標（キャンバス中心原点）
  // 45°回転
  const rx = (nx + ny) / Math.SQRT2;
  const ry = (ny - nx) / Math.SQRT2;
  const r = 0.62;          // 円半径
  const d = 0.36;          // 円の中心距離の半分
  const inA = Math.hypot(rx, ry - d) < r;
  const inB = Math.hypot(rx, ry + d) < r;
  if (!(inA && inB)) return null;
  // 葉脈（回転後の縦中心線に沿う細線）
  if (Math.abs(rx) < 0.028 && Math.abs(ry) < r - d - 0.05) return "vein";
  return "leaf";
}

function draw(size, { bg, leafColor, veinColor, scale = 1 }) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 2; // supersample
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let leafHits = 0, veinHits = 0, total = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) / size * 2 - 1;
          const py = (y + (sy + 0.5) / SS) / size * 2 - 1;
          const hit = leafCoverage(px / scale, py / scale);
          if (hit === "leaf") leafHits++;
          else if (hit === "vein") veinHits++;
          total++;
        }
      }
      const leafA = leafHits / total;
      const veinA = veinHits / total;
      const bgA = 1 - leafA - veinA;
      const i = (y * size + x) * 4;
      if (bg) {
        rgba[i]     = Math.round(bg[0] * bgA + leafColor[0] * leafA + veinColor[0] * veinA);
        rgba[i + 1] = Math.round(bg[1] * bgA + leafColor[1] * leafA + veinColor[1] * veinA);
        rgba[i + 2] = Math.round(bg[2] * bgA + leafColor[2] * leafA + veinColor[2] * veinA);
        rgba[i + 3] = 255;
      } else {
        // 透過背景（スプラッシュ用）
        const a = leafA + veinA;
        if (a === 0) { rgba[i + 3] = 0; continue; }
        rgba[i]     = Math.round((leafColor[0] * leafA + veinColor[0] * veinA) / a);
        rgba[i + 1] = Math.round((leafColor[1] * leafA + veinColor[1] * veinA) / a);
        rgba[i + 2] = Math.round((leafColor[2] * leafA + veinColor[2] * veinA) / a);
        rgba[i + 3] = Math.round(a * 255);
      }
    }
  }
  return encodePng(size, size, rgba);
}

// アイコン: 緑地に白葉（葉脈は緑の濃色…ではなく地色を透かす=INKで描く）
writeFileSync(join(outDir, "icon.png"), draw(1024, { bg: INK, leafColor: WHITE, veinColor: INK, scale: 0.72 }));
// スプラッシュ: 透過背景に緑の葉（app.json の splash.backgroundColor #F5F5F6 に載る）
writeFileSync(join(outDir, "splash-icon.png"), draw(512, { bg: null, leafColor: INK, veinColor: INK_DARK, scale: 0.8 }));
// Android アダプティブアイコン前景: 透過に白葉（背景色は app.json 側で ink 指定）
writeFileSync(join(outDir, "adaptive-icon.png"), draw(1024, { bg: null, leafColor: WHITE, veinColor: WHITE, scale: 0.5 }));

console.log("assets/icon.png (1024) / splash-icon.png (512) / adaptive-icon.png (1024) を生成しました");
