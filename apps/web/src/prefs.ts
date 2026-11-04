import type { UnitSystem } from '@pond/engine';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'pond-filter-sim:prefs:v1';

export interface Prefs {
  units: UnitSystem;
  theme: ThemePref;
}

export const DEFAULT_PREFS: Prefs = { units: 'metric', theme: 'system' };

/** Browser storage can be missing or throw (private mode, previews); never rely on it. */
export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      units: parsed.units === 'imperial-uk' || parsed.units === 'imperial-us' ? parsed.units : 'metric',
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'system',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Ignore: preferences are a convenience only.
  }
}
