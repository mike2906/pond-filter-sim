import type { UnitSystem } from '@pond/engine';
import { useEffect, useState } from 'react';
import { BottomSheet, type Snap } from './components/BottomSheet';
import { Drawing, type DrawingView } from './components/Drawing';
import { Header } from './components/Header';
import { EditPanel, ResultsPanel, TimePanel, useWaterStats } from './components/Panels';
import { useMediaQuery } from './hooks/useMediaQuery';
import { loadPrefs, savePrefs, type ThemePref } from './prefs';

type Tab = 'edit' | 'results' | 'time';
const TABS: { id: Tab; label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'results', label: 'Results' },
  { id: 'time', label: 'Time' },
];
const PEEK_HEIGHT = 132;

export function App() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [view, setView] = useState<DrawingView>('section');
  const [tempC, setTempC] = useState(15);
  const [tab, setTab] = useState<Tab>('results');
  const [snap, setSnap] = useState<Snap>('peek');
  const desktop = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    savePrefs(prefs);
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
  }, [prefs]);

  const setUnits = (units: UnitSystem) => setPrefs((p) => ({ ...p, units }));
  const setTheme = (theme: ThemePref) => setPrefs((p) => ({ ...p, theme }));

  const edit = <EditPanel units={prefs.units} tempC={tempC} onTempC={setTempC} />;
  const results = <ResultsPanel units={prefs.units} tempC={tempC} />;
  const time = <TimePanel />;

  return (
    <div className="app">
      <Header units={prefs.units} theme={prefs.theme} onUnits={setUnits} onTheme={setTheme} />
      {desktop ? (
        <main className="workspace workspace--desktop" data-layout="desktop">
          <Drawing view={view} onView={setView} />
          {edit}
          {time}
          {results}
        </main>
      ) : (
        <main
          className="workspace workspace--compact"
          data-layout="compact"
          style={{ ['--sheet-peek' as string]: `${PEEK_HEIGHT}px` }}
        >
          <Drawing view={view} onView={setView} />
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
            peek={<PeekStats units={prefs.units} tempC={tempC} />}
          >
            {tab === 'edit' ? edit : tab === 'results' ? results : time}
          </BottomSheet>
        </main>
      )}
    </div>
  );
}

function PeekStats({ units, tempC }: { units: UnitSystem; tempC: number }) {
  const stats = useWaterStats(tempC, units);
  return (
    <div className="peek" aria-label="Key results">
      {stats.map((s) => (
        <div className="stat" key={s.key}>
          <div className="k">{s.key}</div>
          <div className="v num">
            {s.value}
            <span className="u">{s.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
