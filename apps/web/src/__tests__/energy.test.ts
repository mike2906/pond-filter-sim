import { describe, expect, it } from 'vitest';
import { keyStats } from '../components/Results';
import { runSolve } from '../solver/run';
import { TEMPLATES } from '../templates';

describe('flow per watt', () => {
  it('shows power and flow per watt for a pump with a power curve', () => {
    const d = TEMPLATES.find((t) => t.id === 'gravity-pump')!.design;
    const s = runSolve(d);
    expect(s.result.links['pump']?.energy?.electricalW).toBeGreaterThan(0);
    const stats = keyStats(d, s.cases, 'metric');
    const fpw = stats.find((x) => x.key === 'Flow per watt');
    expect(fpw?.unit).toBe('m³/h per W');
    expect(Number(fpw?.value)).toBeGreaterThan(0.05);
  });
});
