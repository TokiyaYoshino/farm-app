// ─── 天気取得（src/App.tsx の Open-Meteo 連携部の移植）─────────────────
const WMO_MAP: Record<number, string> = {
  0: "快晴", 1: "晴れ", 2: "一部曇り", 3: "曇り",
  45: "霧雨", 48: "霧雨", 51: "霧雨", 53: "霧雨", 55: "霧雨",
  61: "雨", 63: "雨", 65: "雨", 71: "雪", 73: "雪", 75: "雪",
  80: "雨", 81: "雨", 82: "雷雨", 95: "雷雨", 99: "雷雨",
};
export const wmoToLabel = (code: number): string => WMO_MAP[code] || "曇り";

export interface CurrentWeather {
  label: string;
  temp: number;
  humidity?: number;
  rain?: number;
}

/** 現在の天気＋当日6〜18時の平均湿度・合計雨量（Web版の wxAuto 相当） */
export async function fetchCurrentWeather(lat: number, lng: number): Promise<CurrentWeather> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code&hourly=relative_humidity_2m,rain&timezone=Asia%2FTokyo&forecast_days=1`,
  );
  const data = await res.json();
  const cur = data.current;
  const times: string[] = data.hourly?.time ?? [];
  const humList: number[] = data.hourly?.relative_humidity_2m ?? [];
  const rainList: number[] = data.hourly?.rain ?? [];
  const today = cur.time.substring(0, 10);
  const dayIdx = times.reduce<number[]>((acc, t, i) => {
    const h = parseInt(t.substring(11, 13));
    if (t.startsWith(today) && h >= 6 && h <= 18) acc.push(i);
    return acc;
  }, []);
  const humidity = dayIdx.length > 0
    ? Math.round(dayIdx.reduce((s, i) => s + humList[i], 0) / dayIdx.length)
    : undefined;
  const rainVal = dayIdx.reduce((s, i) => s + (rainList[i] ?? 0), 0);
  return {
    label: wmoToLabel(cur.weather_code as number),
    temp: Math.round(cur.temperature_2m),
    humidity,
    rain: rainVal > 0 ? Math.round(rainVal * 10) / 10 : undefined,
  };
}

export interface PeriodWeather { temp: string; humidity: string; rain: string; weather: string }

/** 作業時間帯の気象実績（Web版 fetchWeatherForPeriod と同一ロジック） */
export async function fetchWeatherForPeriod(
  lat: number, lng: number, date: string, startTime: string, endTime: string,
): Promise<PeriodWeather> {
  const today = new Date().toISOString().slice(0, 10);
  const baseUrl = date < today
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";
  const url = `${baseUrl}?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation,weathercode` +
    `&start_date=${date}&end_date=${date}&timezone=Asia%2FTokyo`;
  const res = await fetch(url);
  const data = await res.json();
  const hours: string[] = data.hourly?.time ?? [];
  const temps: number[] = data.hourly?.temperature_2m ?? [];
  const hums: number[] = data.hourly?.relative_humidity_2m ?? [];
  const rains: number[] = data.hourly?.precipitation ?? [];
  const codes: number[] = data.hourly?.weathercode ?? [];
  const sh = parseInt(startTime.split(":")[0]);
  const eh = parseInt(endTime.split(":")[0]);
  const idx: number[] = [];
  hours.forEach((h, i) => {
    const hr = parseInt(h.substring(11, 13));
    if (hr >= sh && hr <= eh) idx.push(i);
  });
  if (idx.length === 0) return { temp: "", humidity: "", rain: "", weather: "" };
  const avg = (arr: number[]) => (idx.reduce((s, i) => s + arr[i], 0) / idx.length).toFixed(1);
  const totalRain = idx.reduce((s, i) => s + (rains[i] ?? 0), 0).toFixed(1);
  const codeCount: Record<number, number> = {};
  idx.forEach(i => { codeCount[codes[i]] = (codeCount[codes[i]] ?? 0) + 1; });
  const dominant = parseInt(Object.entries(codeCount).sort((a, b) => b[1] - a[1])[0][0]);
  return { temp: avg(temps), humidity: avg(hums), rain: totalRain, weather: wmoToLabel(dominant) };
}
