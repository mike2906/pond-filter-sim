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
export function sweep(design: Design, param: ParamRef, min: number, max: number, steps: number, metric: Metric, solveFn: SolveFn): SweepPoint[] {
  const n = Math.max(2, Math.min(200, Math.round(steps)));
  const out: SweepPoint[] = [];
  for (let i = 0; i < n; i++) {
    const x = min + ((max - min) * i) / (n - 1);
    const r = solveFn(withParam(design, param, x));
    const y = readMetric(design, r, metric);
    out.push({ x, y, ok: r.status === 'ok' && Number.isFinite(y) });
  }
  return out;
}

export type GoalSeekResult =
  | { ok: true; value: number; achieved: number; iterations: number }
  | { ok: false; reason: string; closest?: { value: number; achieved: number } };

/**
 * Find the parameter value in [min, max] where `metric` equals `target`.
 * Scans first (the response need not be monotonic), then bisects the first bracket.
 */
export function goalSeek(design: Design, param: ParamRef, min: number, max: number, metric: Metric, target: number, solveFn: SolveFn): GoalSeekResult {
  const f = (x: number) => readMetric(design, solveFn(withParam(design, param, x)), metric) - target;
  const scan = 24;
  let prevX = min;
  let prevF = f(min);
  let closest = { value: min, achieved: prevF + target };
  for (let i = 1; i <= scan; i++) {
    const x = min + ((max - min) * i) / scan;
    const fx = f(x);
    if (Number.isFinite(fx) && Math.abs(fx) < Math.abs(closest.achieved - target)) closest = { value: x, achieved: fx + target };
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
  return { ok: false, reason: 'The target is not reached anywhere in this range.', closest };
}
