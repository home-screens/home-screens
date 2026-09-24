/**
 * How far through something (a day, a week, a year) as the locale writes a
 * percentage with one decimal: "30.8%" in en-US, "30,8 %" in da-DK.
 *
 * Floors rather than rounds, so a bar reads 100.0% only once it is full.
 * Rounding showed 100.0% at 23:58 on New Year's Eve, and at 23:58 on Sunday
 * for the week.
 */
export function formatProgressPercent(percent: number, locale: string): string {
  // The epsilon keeps an exact share (432 of 1440 minutes is 30%) from
  // flooring a float's 29.999... down to 29.9.
  const floored = Math.floor(Math.min(100, Math.max(0, percent)) * 10 + 1e-9) / 10;
  return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(floored / 100);
}
