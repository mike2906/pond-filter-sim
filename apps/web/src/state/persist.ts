import { checkDesign, SCHEMA_VERSION, type Design } from '@pond/engine';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

const AUTOSAVE_KEY = 'pond-filter-sim:design:v1';
const HASH_PREFIX = '#d=';
const LINK_KINDS: string[] = ['pipe', 'opening', 'weir', 'grille', 'stage', 'valve', 'pump', 'airlift'];

export type ParseResult = { ok: true; design: Design } | { ok: false; error: string };

/**
 * Validates an untrusted design (import, share link, autosave). Checks the
 * envelope and references; the solver reports physical problems.
 */
export function parseDesign(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a design file.' };
  const d = raw as Partial<Design>;
  if (d.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported design version ${String(d.schemaVersion)} (this app reads version ${SCHEMA_VERSION}).` };
  }
  if (!Array.isArray(d.nodes) || !Array.isArray(d.links)) return { ok: false, error: 'The design has no nodes or links list.' };
  if (typeof d.name !== 'string' || !d.water || typeof d.water.tempC !== 'number') return { ok: false, error: 'The design is missing its name or water temperature.' };
  for (const n of d.nodes) {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !['pond', 'chamber', 'junction'].includes(n.kind)) {
      return { ok: false, error: 'The design has a node it does not recognise.' };
    }
  }
  for (const l of d.links) {
    if (!l || typeof l !== 'object' || typeof l.id !== 'string' || typeof l.from !== 'string' || typeof l.to !== 'string' || !LINK_KINDS.includes(l.kind)) {
      return { ok: false, error: 'The design has a connection it does not recognise.' };
    }
  }
  const issues = checkDesign(d as Design);
  if (issues.length) return { ok: false, error: issues.map((i) => i.message).join('; ') };
  return { ok: true, design: d as Design };
}

export function parseDesignJson(text: string): ParseResult {
  try {
    return parseDesign(JSON.parse(text));
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
}

export function encodeShare(design: Design): string {
  return compressToEncodedURIComponent(JSON.stringify(design));
}

export function decodeShare(encoded: string): ParseResult {
  const json = decompressFromEncodedURIComponent(encoded);
  if (!json) return { ok: false, error: 'The share link is damaged or incomplete.' };
  return parseDesignJson(json);
}

export function shareUrl(design: Design, loc: Pick<Location, 'origin' | 'pathname' | 'search'> = window.location): string {
  return `${loc.origin}${loc.pathname}${loc.search}${HASH_PREFIX}${encodeShare(design)}`;
}

export function designFromHash(hash: string): ParseResult | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  return decodeShare(hash.slice(HASH_PREFIX.length));
}

export function loadAutosave(): Design | null {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const r = parseDesignJson(raw);
    return r.ok ? r.design : null;
  } catch {
    return null;
  }
}

export function saveAutosave(design: Design): void {
  try {
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(design));
  } catch {
    // Storage can be unavailable (private mode, full); autosave is a convenience.
  }
}

export function downloadJson(design: Design): void {
  const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${design.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'design'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
