// ─── 日付の文字列化（端末の現地時間で行う）──────────────────────────
// toISOString() は UTC なので、日本時間の0〜9時は前日になり、
// 日付ピッカーに渡した現地0時の Date も前日として文字列化されてしまう。
// 作業記録の日付（散布日を含む法令記録）が1日ずれるため、現地時間で作る。
// 実測と経緯: docs/handoff-appstore-release.md の「日付が UTC でずれる」

/** Date → "YYYY-MM-DD"（端末の現地時間） */
export const toDateStr = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 今日の "YYYY-MM-DD"（端末の現地時間） */
export const todayStr = (): string => toDateStr(new Date());

/** 今日の "MM-DD"（端末の現地時間）。年をまたがない同時期比較に使う */
export const todayMmDd = (): string => todayStr().slice(5);

/** 今日から n 日ずらした "YYYY-MM-DD"（負の値で過去） */
export const shiftDays = (days: number, base: Date = new Date()): string => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
};
