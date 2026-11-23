import { YearCount } from './models';

export const RECENT_SPAN = 30;

export interface ChartBar extends YearCount {
  x: number;
  y: number;
  width: number;
  height: number;
  showLabel: boolean;
}

export interface ChartLayout {
  bars: ChartBar[];
  ticks: { value: number; y: number }[];
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
}

/**
 * Picks the years to draw. "recent" keeps the last 30 years that have data in view, because
 * a few very old outliers (1900, 1950…) would otherwise squash every modern bar to a sliver.
 */
export function selectYears(years: readonly YearCount[], range: 'recent' | 'all'): { shown: YearCount[]; older: number } {
  if (range === 'all' || years.length === 0) return { shown: [...years], older: 0 };
  const latest = years[years.length - 1].year;
  const from = latest - RECENT_SPAN + 1;
  const shown = years.filter((y) => y.year >= from);
  const older = years.filter((y) => y.year < from).reduce((sum, y) => sum + y.count, 0);
  return { shown, older };
}

/** Fills gaps with zero bars so the time axis is honest (no missing years squeezed out). */
export function fillGaps(years: readonly YearCount[]): YearCount[] {
  if (years.length < 2) return [...years];
  const counts = new Map(years.map((y) => [y.year, y.count]));
  const out: YearCount[] = [];
  for (let year = years[0].year; year <= years[years.length - 1].year; year++) {
    out.push({ year, count: counts.get(year) ?? 0 });
  }
  return out;
}

/** A round axis maximum: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value) return step * power;
  return 10 * power;
}

/** Sized close to the sidebar's real width, so 11px labels render at roughly 11px. */
export function layoutChart(years: readonly YearCount[], width = 360, height = 210): ChartLayout {
  const plot = { left: 38, right: width - 6, top: 10, bottom: height - 24 };
  const max = niceMax(Math.max(0, ...years.map((y) => y.count)));
  const plotWidth = plot.right - plot.left;
  const plotHeight = plot.bottom - plot.top;
  const slot = years.length ? plotWidth / years.length : plotWidth;
  const labelEvery = Math.max(1, Math.ceil(years.length / 6));
  const bars = years.map((y, i) => {
    const h = (y.count / max) * plotHeight;
    return {
      ...y,
      x: plot.left + i * slot + slot * 0.12,
      width: Math.max(1, slot * 0.76),
      y: plot.bottom - h,
      height: y.count > 0 ? Math.max(h, 1.5) : 0,
      // Label the last year always, then every Nth counting back from it.
      showLabel: (years.length - 1 - i) % labelEvery === 0,
    };
  });
  const ticks = [0, 0.5, 1].map((f) => ({ value: max * f, y: plot.bottom - plotHeight * f }));
  return { bars, ticks, width, height, plot };
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
