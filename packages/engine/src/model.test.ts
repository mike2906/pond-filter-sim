import { describe, expect, it } from 'vitest';
import { simpleGravityAirlift } from '../fixtures/simple-gravity-airlift';
import { checkDesign, type Design } from './model';

describe('checkDesign', () => {
  it('accepts the example design', () => {
    expect(checkDesign(simpleGravityAirlift)).toEqual([]);
  });

  it('reports unknown nodes, duplicate ids and self-links', () => {
    const broken: Design = {
      ...simpleGravityAirlift,
      links: [
        ...simpleGravityAirlift.links,
        { id: 'airlift', kind: 'weir', from: 'k1', to: 'nowhere', crestM: 0, widthM: 1 },
        { id: 'loop', kind: 'weir', from: 'k1', to: 'k1', crestM: 0, widthM: 1 },
      ],
    };
    const messages = checkDesign(broken).map((i) => i.message);
    expect(messages).toContain('Duplicate id "airlift"');
    expect(messages).toContain('Unknown node "nowhere"');
    expect(messages).toContain('A link cannot start and end at the same node');
  });

  it('requires a pond', () => {
    const noPond: Design = { ...simpleGravityAirlift, nodes: simpleGravityAirlift.nodes.filter((n) => n.kind !== 'pond'), links: [], layout: {} };
    expect(checkDesign(noPond).map((i) => i.message)).toContain('A design needs at least one pond node');
  });
});
