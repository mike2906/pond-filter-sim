import type { UnitSystem } from '@pond/engine';
import { useElementSize } from '../hooks/useElementSize';
import { useDesign, useDesignStore } from '../state/context';
import { PlanView } from './PlanView';
import { SectionView, type ScaleMode } from './SectionView';

export type DrawingView = 'section' | 'plan' | 'both';

interface Props {
  view: DrawingView;
  onView: (v: DrawingView) => void;
  scale: ScaleMode;
  onScale: (s: ScaleMode) => void;
  units: UnitSystem;
  allowBoth: boolean;
}

/** The linked plan and side-elevation drawings. Selecting in one highlights in the other. */
export function Drawing({ view, onView, scale, onScale, units, allowBoth }: Props) {
  const store = useDesignStore();
  const design = useDesign((s) => s.design);
  const selection = useDesign((s) => s.selection);
  const solved = useDesign((s) => s.solved);
  const solving = useDesign((s) => s.solving);
  const select = useDesign((s) => s.select);
  const [sectionRef, sectionSize] = useElementSize<HTMLDivElement>();
  const [planRef, planSize] = useElementSize<HTMLDivElement>();
  const shown = !allowBoth && view === 'both' ? 'section' : view;

  const onMove = (id: string, xM: number, yM: number, first: boolean) => {
    if (first) store.getState().checkpoint();
    store.getState().edit(
      (d) => {
        d.layout ??= {};
        const prev = d.layout[id];
        d.layout[id] = { ...prev, xM, yM };
      },
      { record: false },
    );
  };

  const section = (
    <div className="drawing-pane" key="section" ref={sectionRef}>
      {sectionSize.width > 0 && (
        <SectionView design={design} cases={solved?.cases ?? null} selection={selection} onSelect={select} scale={scale} units={units} stale={solving} size={sectionSize} />
      )}
    </div>
  );
  const plan = (
    <div className="drawing-pane" key="plan" ref={planRef}>
      {planSize.width > 0 && <PlanView design={design} selection={selection} onSelect={select} onMove={onMove} units={units} size={planSize} />}
    </div>
  );

  return (
    <section className="card drawing-card" aria-label="Filter drawing">
      <div className="drawing-toolbar">
        <div className="seg" role="group" aria-label="Drawing view">
          <button type="button" aria-pressed={shown === 'plan'} onClick={() => onView('plan')}>
            Plan
          </button>
          <button type="button" aria-pressed={shown === 'section'} onClick={() => onView('section')}>
            Section
          </button>
          {allowBoth && (
            <button type="button" aria-pressed={shown === 'both'} onClick={() => onView('both')}>
              Both
            </button>
          )}
        </div>
        {shown !== 'plan' && (
          <div className="seg seg--small" role="group" aria-label="Vertical scale">
            <button type="button" aria-pressed={scale === 'stretch'} onClick={() => onScale('stretch')} title="Magnify the band around the pond surface so small drawdowns are visible">
              Stretched
            </button>
            <button type="button" aria-pressed={scale === 'true'} onClick={() => onScale('true')}>
              True scale
            </button>
          </div>
        )}
        {solved?.source === 'preview' && (
          <span className="badge badge--preview" title="The engine's network solver isn't finished yet. Results come from simplified placeholder maths.">
            Preview maths
          </span>
        )}
      </div>
      <div className={`drawing drawing--${shown}`}>
        {shown === 'section' ? section : shown === 'plan' ? plan : [plan, section]}
      </div>
    </section>
  );
}
