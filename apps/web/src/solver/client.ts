import type { Design, SolveResult } from '@pond/engine';
import type { GoalSeekResult, SweepPoint } from './explore';
import type { Metric } from './metrics';
import type { ParamRef } from './paths';
import { runSolve, type Solved } from './run';
import type { WorkerRequest } from './worker';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type Body<T extends WorkerRequest['type']> = Omit<Extract<WorkerRequest, { type: T }>, 'id' | 'type'>;

/** Runs the solver in a Web Worker. Falls back to the main thread where workers are unavailable. */
class SolverClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  private ensure(): Worker | null {
    if (this.worker || typeof Worker === 'undefined') return this.worker;
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; payload?: unknown; error?: string }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.payload);
        else p.reject(new Error(e.data.error));
      };
      this.worker.onerror = (e) => {
        for (const p of this.pending.values()) p.reject(new Error(e.message || 'Solver worker failed'));
        this.pending.clear();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  private call<T>(type: WorkerRequest['type'], body: object): Promise<T> {
    const w = this.ensure();
    if (!w) return Promise.reject(new Error('no-worker'));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      w.postMessage({ id, type, ...body });
    });
  }

  async solve(design: Design, initial?: SolveResult): Promise<Solved> {
    try {
      return await this.call<Solved>('solve', (initial ? { design, initial } : { design }) satisfies Body<'solve'>);
    } catch {
      return runSolve(design, initial);
    }
  }

  sweep(body: { design: Design; param: ParamRef; min: number; max: number; steps: number; metric: Metric }): Promise<SweepPoint[]> {
    return this.call<SweepPoint[]>('sweep', body satisfies Body<'sweep'>);
  }

  goalSeek(body: { design: Design; param: ParamRef; min: number; max: number; metric: Metric; target: number }): Promise<GoalSeekResult> {
    return this.call<GoalSeekResult>('goal-seek', body satisfies Body<'goal-seek'>);
  }
}

export const solver = new SolverClient();
