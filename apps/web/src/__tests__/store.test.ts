import { describe, expect, it } from 'vitest';
import { createDesignStore } from '../state/store';
import { TEMPLATES } from '../templates';

const fresh = () => createDesignStore(structuredClone(TEMPLATES[0]!.design));

describe('design store', () => {
  it('undoes and redoes edits', () => {
    const s = fresh();
    const before = s.getState().design.water.tempC;
    s.getState().edit((d) => void (d.water.tempC = 22));
    expect(s.getState().design.water.tempC).toBe(22);
    s.getState().undo();
    expect(s.getState().design.water.tempC).toBe(before);
    s.getState().redo();
    expect(s.getState().design.water.tempC).toBe(22);
  });

  it('records one history step for a whole drag', () => {
    const s = fresh();
    s.getState().checkpoint();
    for (let i = 0; i < 5; i++) s.getState().edit((d) => void (d.layout!['vortex'] = { xM: i, yM: 0 }), { record: false });
    s.getState().undo();
    expect(s.getState().design.layout!['vortex']).toEqual(TEMPLATES[0]!.design.layout!['vortex']);
  });

  it('removing a node removes its connections and layout', () => {
    const s = fresh();
    s.getState().remove('vortex');
    const d = s.getState().design;
    expect(d.nodes.some((n) => n.id === 'vortex')).toBe(false);
    expect(d.links.some((l) => l.from === 'vortex' || l.to === 'vortex')).toBe(false);
    expect(d.layout!['vortex']).toBeUndefined();
  });

  it('adds elements with unique ids and selects them', () => {
    const s = fresh();
    const a = s.getState().addNode('chamber');
    const b = s.getState().addNode('chamber');
    expect(a).not.toBe(b);
    expect(s.getState().selection).toBe(b);
    const l = s.getState().addLink('pipe', a, b);
    expect(s.getState().design.links.find((x) => x.id === l)?.from).toBe(a);
  });

  it('lays out designs that arrive without plan positions', () => {
    const d = structuredClone(TEMPLATES[0]!.design);
    delete d.layout;
    const s = createDesignStore(d);
    const layout = s.getState().design.layout!;
    for (const n of d.nodes) expect(layout[n.id]).toBeDefined();
    expect(layout['pond']!.xM).toBeLessThan(layout['vortex']!.xM);
  });
});
