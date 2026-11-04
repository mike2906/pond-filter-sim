import type { UnitSystem } from '@pond/engine';
import type { ThemePref } from '../prefs';
import { useDesign } from '../state/context';
import { DesignMenu } from './DesignMenu';

interface Props {
  units: UnitSystem;
  theme: ThemePref;
  onUnits: (u: UnitSystem) => void;
  onTheme: (t: ThemePref) => void;
  onToast: (msg: string) => void;
}

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<ThemePref, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };

export function Header({ units, theme, onUnits, onTheme, onToast }: Props) {
  const canUndo = useDesign((s) => s.past.length > 0);
  const canRedo = useDesign((s) => s.future.length > 0);
  const undo = useDesign((s) => s.undo);
  const redo = useDesign((s) => s.redo);
  const name = useDesign((s) => s.design.name);
  return (
    <header className="header">
      <div className="brand">
        <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="var(--accent)" />
          <path d="M5 18c3-3 5-3 8 0s5 3 8 0 5-3 6-1" fill="none" stroke="var(--on-accent)" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M5 24c3-3 5-3 8 0s5 3 8 0 5-3 6-1" fill="none" stroke="var(--on-accent)" strokeOpacity="0.6" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <h1>
          Pond Filter Simulator
          <small>{name}</small>
        </h1>
      </div>
      <div className="header-actions">
        <button type="button" className="icon-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
        </button>
        <button type="button" className="icon-btn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg>
        </button>
        <DesignMenu onToast={onToast} />
        <select className="select" aria-label="Units" value={units} onChange={(e) => onUnits(e.target.value as UnitSystem)}>
          <option value="metric">Metric</option>
          <option value="imperial-uk">UK imperial</option>
          <option value="imperial-us">US imperial</option>
        </select>
        <button
          type="button"
          className="icon-btn"
          aria-label={`${THEME_LABEL[theme]}. Switch theme`}
          title={THEME_LABEL[theme]}
          onClick={() => onTheme(NEXT_THEME[theme])}
        >
          {theme === 'dark' ? <MoonIcon /> : theme === 'light' ? <SunIcon /> : <AutoIcon />}
        </button>
      </div>
    </header>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
function AutoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
    </svg>
  );
}
