import { describe, expect, it } from 'vitest';
import { simpleGravityAirlift } from '../fixtures/simple-gravity-airlift';
import { solve } from './solve';

describe('solve (M0 stub)', () => {
  it('returns invalid-design with the issues for a broken design', () => {
    const result = solve({ ...simpleGravityAirlift, nodes: [] , links: [], layout: {} });
    expect(result.status).toBe('invalid-design');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('throws until the solver lands', () => {
    expect(() => solve(simpleGravityAirlift)).toThrow(/milestone 1/);
  });
});
