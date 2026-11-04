import { describe, expect, it } from 'vitest';
import { simpleGravityAirlift } from '../fixtures/simple-gravity-airlift';
import { solve } from './solve';

describe('solve', () => {
  it('returns invalid-design with the issues for a broken design', () => {
    const result = solve({ ...simpleGravityAirlift, nodes: [] , links: [], layout: {} });
    expect(result.status).toBe('invalid-design');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.every((w) => w.code === 'invalid-design')).toBe(true);
  });

});
