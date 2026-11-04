import { describe, expect, it } from 'vitest';
import { decodeShare, designFromHash, encodeShare, parseDesign, parseDesignJson } from '../state/persist';
import { TEMPLATES } from '../templates';

describe('saving and sharing', () => {
  it('round-trips every template through a share link', () => {
    for (const t of TEMPLATES) {
      const r = decodeShare(encodeShare(t.design));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.design).toEqual(t.design);
    }
  });

  it('keeps share links short enough to paste', () => {
    for (const t of TEMPLATES) expect(encodeShare(t.design).length).toBeLessThan(4000);
  });

  it('reads a design from the URL hash and ignores other hashes', () => {
    const d = TEMPLATES[0]!.design;
    const r = designFromHash(`#d=${encodeShare(d)}`);
    expect(r?.ok).toBe(true);
    expect(designFromHash('#other')).toBeNull();
    expect(designFromHash('#d=garbage')?.ok).toBe(false);
  });

  it('rejects malformed or mismatched designs with a readable reason', () => {
    expect(parseDesignJson('not json')).toEqual({ ok: false, error: 'The file is not valid JSON.' });
    expect(parseDesign({ schemaVersion: 99 }).ok).toBe(false);
    const bad = structuredClone(TEMPLATES[0]!.design);
    bad.links[0]!.to = 'nowhere';
    const r = parseDesign(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nowhere/);
  });
});
