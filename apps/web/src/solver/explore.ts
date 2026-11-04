import type { Design, SolveResult } from '@pond/engine';
import { readMetric, type Metric } from './metrics';
import { withParam, type ParamRef } from './paths';

export type SolveFn = (d: Design) => SolveResult;

export interface SweepPoint {
  x: number;
  y: number;
  ok: boolean;
}

/** Evaluate `metric` at `steps` evenly spaced values of one parameter. */
/** Solve with one parameter changed and read the metric off that same design. */
function evalAt(design: Design, param: ParamRef, x: number, metric: Metric, solveFn: SolveFn) {
  const d = withParam(design, param, x);
  const r = solveFn(d);
  return { r, y: readMetric(d, r, metric) };
}

/** Evaluate `metric` at `steps` evenly spaced values of one parameter. Integer parameters step by whole numbers. */
export function sweep(design: Design, param: ParamRef, min: number, max: number, steps: number, metric: Metric, solveFn: SolveFn, integer = false): SweepPoint[] {
  const n = Math.max(2, Math.min(200, Math.round(steps)));
  const xs = integer
    ? Array.from({ length: Math.floor(max) - Math.ceil(min) + 1 }, (_, i) => Math.ceil(min) + i).filter((_, i, a) => a.length <= n || i % Math.ceil(a.length / n) === 0)
    : Array.from({ length: n }, (_, i) => min + ((max - min) * i) / (n - 1));
  return xs.map((x) => {
    const { r, y } = evalAt(design, param, x, metric, solveFn);
    return { x, y, ok: r.status === 'ok' && Number.isFinite(y) };
  });
}

export type GoalSeekResult =
  | { ok: true; value: number; achieved: number; iterations: number }
  | { ok: false; reason: string; closest?: { value: number; achieved: number } };

/**
 * Find the parameter value in [min, max] where `metric` equals `target`.
 * Scans first (the response need not be monotonic), then bisects the first bracket.
 */
export function goalSeek(design: Design, param: ParamRef, min: number, max: number, metric: Metric, target: number, solveFn: SolveFn, integer = false): GoalSeekResult {
  if (integer) {
    // Whole numbers only: pick the count that lands closest to the target.
    const pts = sweep(design, param, min, max, 200, metric, solveFn, true).filter((p) => p.ok);
    if (pts.length === 0) return { ok: false, reason: 'No value in this range gives a steady solution.' };
    const best = pts.reduce((a, b) => (Math.abs(b.y - target) < Math.abs(a.y - target) ? b : a));
    const brackets = pts.some((p) => p.y >= target) && pts.some((p) => p.y <= target);
    return brackets
      ? { ok: true, value: best.x, achieved: best.y, iterations: pts.length }
      : { ok: false, reason: 'The target is not reached anywhere in this range.', closest: { value: best.x, achieved: best.y } };
  }
  const f = (x: number) => evalAt(design, param, x, metric, solveFn).y - target;
  const scan = 24;
  let prevX = min;
  let prevF = f(min);
  let closest: { value: number; achieved: number } | undefined = Number.isFinite(prevF) ? { value: min, achieved: prevF + target } : undefined;
  for (let i = 1; i <= scan; i++) {
    const x = min + ((max - min) * i) / scan;
    const fx = f(x);
    if (Number.isFinite(fx) && (!closest || Math.abs(fx) < Math.abs(closest.achieved - target))) closest = { value: x, achieved: fx + target };
    if (Number.isFinite(prevF) && Number.isFinite(fx) && Math.sign(prevF) !== Math.sign(fx)) {
      let lo = prevX;
      let hi = x;
      let flo = prevF;
      let it = 0;
      for (; it < 50 && hi - lo > Math.abs(max - min) * 1e-6; it++) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (!Number.isFinite(fm)) break;
        if (Math.sign(fm) === Math.sign(flo)) {
          lo = mid;
          flo = fm;
        } else hi = mid;
      }
      const value = (lo + hi) / 2;
      return { ok: true, value, achieved: f(value) + target, iterations: it + scan };
    }
    prevX = x;
    prevF = fx;
  }
  return closest
    ? { ok: false, reason: 'The target is not reached anywhere in this range.', closest }
    : { ok: false, reason: 'No value in this range gives a steady solution.' };
}
