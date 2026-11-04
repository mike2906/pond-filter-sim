/// <reference lib="webworker" />
import type { Design, SolveResult } from '@pond/engine';
import { goalSeek, sweep } from './explore';
import type { Metric } from './metrics';
import type { ParamRef } from './paths';
import { runSolve, runSolveLikely } from './run';

export type WorkerRequest =
  | { id: number; type: 'solve'; design: Design; initial?: SolveResult }
  | { id: number; type: 'sweep'; design: Design; param: ParamRef; min: number; max: number; steps: number; metric: Metric; integer?: boolean }
  | { id: number; type: 'goal-seek'; design: Design; param: ParamRef; min: number; max: number; metric: Metric; target: number; integer?: boolean };

const solveOnly = (d: Design) => runSolveLikely(d);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    let payload: unknown;
    if (req.type === 'solve') payload = runSolve(req.design, req.initial);
    else if (req.type === 'sweep') payload = sweep(req.design, req.param, req.min, req.max, req.steps, req.metric, solveOnly, !!req.integer);
    else payload = goalSeek(req.design, req.param, req.min, req.max, req.metric, req.target, solveOnly, !!req.integer);
    self.postMessage({ id: req.id, ok: true, payload });
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
