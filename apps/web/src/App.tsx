import type { UnitSystem } from '@pond/engine';
import { useEffect, useState } from 'react';
import { BottomSheet, type Snap } from './components/BottomSheet';
import { Drawing, type DrawingView } from './components/Drawing';
import { ExplorePanel } from './components/Explore';
import { Header } from './components/Header';
import { Inspector } from './components/Inspector';
import { ResultsPanel, StatTiles, useKeyStats } from './components/Results';
import type { ScaleMode } from './components/SectionView';
import { useMediaQuery } from './hooks/useMediaQuery';
import { loadPrefs, savePrefs, type ThemePref } from './prefs';
import { useDesign, useDesignStore } from './state/context';

type Tab = 'edit' | 'results' | 'explore';
const TABS: { id: Tab; label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'results', label: 'Results' },
  { id: 'explore', label: 'Explore' },
];
const PEEK_HEIGHT = 132;

export function App({ bootMessage }: { bootMessage?: string }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [view, setView] = useState<DrawingView>('both');
  const [scale, setScale] = useState<ScaleMode>('stretch');
  const [tab, setTab] = useState<Tab>('results');
  const [snap, setSnap] = useState<Snap>('peek');
  const [toast, setToast] = useState<string | null>(bootMessage ?? null);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const wide = useMediaQuery('(min-width: 1280px)');
  const store = useDesignStore();
  const selection = useDesign((s) => s.selection);

  useEffect(() => {
    savePrefs(prefs);
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
  }, [prefs]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Selecting something on a phone opens the editor for it.
  useEffect(() => {
    if (!desktop && selection) {
      setTab('edit');
      setSnap((s) => (s === 'peek' ? 'half' : s));
    }
  }, [selection, desktop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) store.getState().redo();
        else store.getState().undo();
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        store.getState().redo();
      } else if (e.key === 'Escape' && !typing && !document.querySelector('dialog[open]')) {
        store.getState().select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const setUnits = (units: UnitSystem) => setPrefs((p) => ({ ...p, units }));
  const setTheme = (theme: ThemePref) => setPrefs((p) => ({ ...p, theme }));

  const edit = (
    <div className="panel panel--inspector" role="region" aria-label="Edit">
      <h2>Edit</h2>
      <Inspector units={prefs.units} />
    </div>
  );
  const results = <ResultsPanel units={prefs.units} />;
  const explore = <ExplorePanel units={prefs.units} />;
  const drawing = <Drawing view={view} onView={setView} scale={scale} onScale={setScale} units={prefs.units} allowBoth={wide} />;

  return (
    <div className="app">
      <Header units={prefs.units} theme={prefs.theme} onUnits={setUnits} onTheme={setTheme} onToast={setToast} />
      {desktop ? (
        <main className="workspace workspace--desktop" data-layout="desktop">
          {drawing}
          {edit}
          {explore}
          {results}
        </main>
      ) : (
        <main className="workspace workspace--compact" data-layout="compact" data-snap={snap} style={{ ['--sheet-peek' as string]: `${PEEK_HEIGHT}px` }}>
          {drawing}
          <BottomSheet
            snap={snap}
            onSnap={setSnap}
            peekHeight={PEEK_HEIGHT}
            header={
              <div className="tabs" role="tablist" aria-label="Panels">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => {
                      setTab(t.id);
                      if (snap === 'peek') setSnap('half');
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            }
            peek={<PeekStats units={prefs.units} />}
          >
            {tab === 'edit' ? edit : tab === 'results' ? results : explore}
          </BottomSheet>
        </main>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function PeekStats({ units }: { units: UnitSystem }) {
  return <StatTiles stats={useKeyStats(units)} compact />;
}
