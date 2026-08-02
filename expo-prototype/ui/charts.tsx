import { useState } from "react";
import { View, Text, LayoutChangeEvent } from "react-native";
import Svg, { Rect, Line as SvgLine, Circle, Polyline, Text as SvgText } from "react-native-svg";
import { C } from "./tokens";

// ─── 軽量チャート（recharts の代替）─────────────────────────────────
// Web版 AnalyticsView の ComposedChart / BarChart(vertical) / LineChart /
// ScatterChart を、必要な見た目だけ react-native-svg で再現する。
// 目盛り・グリッド破線・凡例の色使いは Web 版に合わせる。

export const CHART_COLORS = [C.ink, "#1976d2", "#e07020", "#9c27b0", "#00838f", "#c62828", "#558b2f", "#4527a0"];

const AXIS_FONT = 10;
const PAD_LEFT = 34;
const PAD_BOTTOM = 20;
const PAD_TOP = 8;
const PAD_RIGHT = 8;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * exp;
}

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, e => setW(e.nativeEvent.layout.width)];
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean; dashed?: boolean }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 6 }}>
      {items.map(it => (
        <View key={it.label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {it.line ? (
            <View style={{ width: 14, height: 2, backgroundColor: it.color, borderRadius: 1, ...(it.dashed ? { opacity: 0.6 } : {}) }} />
          ) : (
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: it.color }} />
          )}
          <Text style={{ fontSize: 11, color: C.textSub }}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** 縦棒(今年) + 折れ線(前年) + 破線(目標)。Web版の収穫量 ComposedChart 相当 */
export function ComboChart({ labels, bars, line, dashed, height = 200, unit = "" }: {
  labels: string[];
  bars: number[];
  line?: number[];
  dashed?: number[];
  height?: number;
  unit?: string;
}) {
  const [w, onLayout] = useWidth();
  const maxV = niceMax(Math.max(...bars, ...(line ?? [0]), ...(dashed ?? [0]), 1));
  const plotW = Math.max(0, w - PAD_LEFT - PAD_RIGHT);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const n = labels.length;
  const slot = n > 0 ? plotW / n : 0;
  const barW = Math.min(slot * 0.5, 18);
  const x = (i: number) => PAD_LEFT + slot * i + slot / 2;
  const y = (v: number) => PAD_TOP + plotH * (1 - v / maxV);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => maxV * t);

  return (
    <View onLayout={onLayout} style={{ width: "100%" }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {ticks.map(t => (
            <SvgLine key={t} x1={PAD_LEFT} x2={w - PAD_RIGHT} y1={y(t)} y2={y(t)} stroke={C.hairline} strokeWidth={1} strokeDasharray="3 3" />
          ))}
          {ticks.map(t => (
            <SvgText key={`l${t}`} x={PAD_LEFT - 4} y={y(t) + 3} fontSize={AXIS_FONT} fill={C.textMuted} textAnchor="end">
              {Math.round(t)}
            </SvgText>
          ))}
          {labels.map((lb, i) => (
            (n <= 12 || i % 2 === 0) && (
              <SvgText key={lb + i} x={x(i)} y={height - 6} fontSize={AXIS_FONT} fill={C.textMuted} textAnchor="middle">{lb}</SvgText>
            )
          ))}
          {bars.map((v, i) => v > 0 && (
            <Rect key={i} x={x(i) - barW / 2} y={y(v)} width={barW} height={plotH + PAD_TOP - y(v)} rx={3} fill={C.ink} />
          ))}
          {dashed && dashed.some(v => v > 0) && (
            <Polyline
              points={dashed.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none" stroke={C.textMuted} strokeWidth={1.5} strokeDasharray="5 4"
            />
          )}
          {line && (
            <>
              <Polyline
                points={line.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                fill="none" stroke={C.info} strokeWidth={2}
              />
              {line.map((v, i) => <Circle key={i} cx={x(i)} cy={y(v)} r={2} fill={C.info} />)}
            </>
          )}
        </Svg>
      )}
    </View>
  );
}

/** 横棒2系列。Web版の作業時間内訳 BarChart(layout=vertical) 相当 */
export function HBarChart({ rows, unit = "h" }: {
  rows: { name: string; cy: number; py: number }[];
  unit?: string;
}) {
  const maxV = niceMax(Math.max(...rows.flatMap(r => [r.cy, r.py]), 1));
  return (
    <View style={{ gap: 8 }}>
      {rows.map(r => (
        <View key={r.name} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text numberOfLines={1} style={{ width: 64, fontSize: 11, color: C.textSub, textAlign: "right" }}>{r.name}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ height: 12, width: `${(r.cy / maxV) * 100}%`, minWidth: r.cy > 0 ? 3 : 0, backgroundColor: C.ink, borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
              <Text style={{ fontSize: 10, color: C.textSub }}>{r.cy}{unit}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ height: 12, width: `${(r.py / maxV) * 100}%`, minWidth: r.py > 0 ? 3 : 0, backgroundColor: C.inkSoft, borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
              <Text style={{ fontSize: 10, color: C.textMuted }}>{r.py > 0 ? `${r.py}${unit}` : ""}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** 多系列折れ線。Web版の GDD LineChart 相当 */
export function MultiLineChart({ labels, series, height = 190 }: {
  labels: string[];
  series: { name: string; color: string; values: (number | null)[] }[];
  height?: number;
}) {
  const [w, onLayout] = useWidth();
  const allVals = series.flatMap(s => s.values.filter((v): v is number => v != null));
  const maxV = niceMax(Math.max(...allVals, 1));
  const plotW = Math.max(0, w - PAD_LEFT - PAD_RIGHT);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const n = labels.length;
  const x = (i: number) => PAD_LEFT + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2);
  const y = (v: number) => PAD_TOP + plotH * (1 - v / maxV);
  const ticks = [0, 0.5, 1].map(t => maxV * t);

  return (
    <View onLayout={onLayout} style={{ width: "100%" }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {ticks.map(t => (
            <SvgLine key={t} x1={PAD_LEFT} x2={w - PAD_RIGHT} y1={y(t)} y2={y(t)} stroke={C.hairline} strokeWidth={1} strokeDasharray="3 3" />
          ))}
          {ticks.map(t => (
            <SvgText key={`l${t}`} x={PAD_LEFT - 4} y={y(t) + 3} fontSize={AXIS_FONT} fill={C.textMuted} textAnchor="end">{Math.round(t)}</SvgText>
          ))}
          {labels.map((lb, i) => i % 2 === 0 && (
            <SvgText key={lb} x={x(i)} y={height - 6} fontSize={AXIS_FONT} fill={C.textMuted} textAnchor="middle">{lb}</SvgText>
          ))}
          {series.map(s => {
            const pts = s.values
              .map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
              .filter(Boolean)
              .join(" ");
            return <Polyline key={s.name} points={pts} fill="none" stroke={s.color} strokeWidth={2} />;
          })}
        </Svg>
      )}
    </View>
  );
}

/** 散布図。Web版の DeepDive ScatterChart 相当 */
export function ScatterPlot({ points, color = C.ink, height = 190, xUnit = "", yUnit = "" }: {
  points: { x: number; y: number }[];
  color?: string;
  height?: number;
  xUnit?: string;
  yUnit?: string;
}) {
  const [w, onLayout] = useWidth();
  const maxX = niceMax(Math.max(...points.map(p => p.x), 1));
  const maxY = niceMax(Math.max(...points.map(p => p.y), 1));
  const plotW = Math.max(0, w - PAD_LEFT - PAD_RIGHT);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const x = (v: number) => PAD_LEFT + (plotW * v) / maxX;
  const y = (v: number) => PAD_TOP + plotH * (1 - v / maxY);
  const xt = [0, 0.5, 1].map(t => maxX * t);
  const yt = [0, 0.5, 1].map(t => maxY * t);

  return (
    <View onLayout={onLayout} style={{ width: "100%" }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {yt.map(t => (
            <SvgLine key={`y${t}`} x1={PAD_LEFT} x2={w - PAD_RIGHT} y1={y(t)} y2={y(t)} stroke={C.hairline} strokeWidth={1} strokeDasharray="3 3" />
          ))}
          {yt.map(t => (
            <SvgText key={`yl${t}`} x={PAD_LEFT - 4} y={y(t) + 3} fontSize={AXIS_FONT} fill={C.textMuted} textAnchor="end">{Math.round(t)}{yUnit}</SvgText>
          ))}
          {xt.map(t => (
            <SvgText key={`xl${t}`} x={x(t)} y={height - 6} fontSize={AXIS_FONT} fill={C.textMuted} textAnchor="middle">{Math.round(t)}{xUnit}</SvgText>
          ))}
          {points.map((p, i) => (
            <Circle key={i} cx={x(p.x)} cy={y(p.y)} r={4} fill={color} opacity={0.7} />
          ))}
        </Svg>
      )}
    </View>
  );
}
