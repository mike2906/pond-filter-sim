import type { Design, Fitting, FittingType, FlowDirection, Id, Link, Node, Stage, UnitSystem } from '@pond/engine';
import { useState } from 'react';
import { FITTING_LABEL } from '../solver/preview';
import { getPath, setPath } from '../solver/paths';
import { useDesign, useDesignStore } from '../state/context';
import { LINK_KIND_LABEL, NODE_KIND_LABEL, type LinkKind, type NodeKind } from '../state/factory';
import { elementFields, OPTIONAL_DEFAULTS, type FieldDesc } from '../state/fields';
import { fmtText } from '../units/quantities';
import { placement } from './layout';
import { NumberField } from './NumberField';
import { ElementResult } from './Results';

const STAGE_LABEL: Record<Stage['type'], string> = {
  vortex: 'Vortex',
  settlement: 'Settlement',
  sieve: 'Sieve',
  drum: 'Drum filter',
  brushes: 'Brushes',
  matting: 'Matting',
  'static-media': 'Static media (K1, Hel-X)',
  'moving-bed': 'Moving-bed K1',
  beads: 'Bead filter',
  'gravel-bed': 'Gravel bed',
  generic: 'Generic (K or fixed loss)',
};

export function defaultStage(type: Stage['type']): Stage {
  const planar = { type: 'planar' as const, flowAreaM2: 0.36, depthM: 0.3 };
  switch (type) {
    case 'vortex': return { type, diameterM: 0.8 };
    case 'settlement': return { type, baffles: 2 };
    case 'sieve': return { type, apertureM: 0.0003, widthM: 0.3, openAreaFraction: 0.35 };
    case 'drum': return { type, meshM: 0.00007, screenAreaM2: 0.3, openAreaFraction: 0.3, backwashSetpointM: 0.04, washVolumeM3: 0.03 };
    case 'brushes': return { type, brushDiameterM: 0.15, bristleDiameterM: 0.0004, count: 12, rows: 3, spacingM: 0.02, lengthM: 0.6 };
    case 'matting': return { type, fibreDiameterM: 0.0007, porosity: 0.96, geometry: planar };
    case 'static-media': return { type, media: 'k1', voidage: 0.8, equivalentDiameterM: 0.009, sphericity: 0.6, floating: true, geometry: planar };
    case 'moving-bed': return { type, media: 'k1', fillFraction: 0.5, screenAreaM2: 0.1, screenOpenFraction: 0.4, aerationAirFlowM3s: 0.001 };
    case 'beads': return { type, beadDiameterM: 0.003, voidage: 0.38, bedDepthM: 0.45, bedAreaM2: 0.2, valveK: 6 };
    case 'gravel-bed': return { type, particleDiameterM: 0.008, voidage: 0.4, geometry: planar };
    case 'generic': return { type, k: 1, referenceAreaM2: 0.05 };
  }
}

const DIRECTIONS: FlowDirection[] = ['up', 'down', 'cross', 'radial-in', 'radial-out'];

export function Inspector({ units }: { units: UnitSystem }) {
  const design = useDesign((s) => s.design);
  const selection = useDesign((s) => s.selection);
  const el = selection ? (design.nodes.find((n) => n.id === selection) ?? design.links.find((l) => l.id === selection)) : undefined;
  return el ? <ElementEditor key={el.id} el={el} design={design} units={units} /> : <DesignOverview design={design} units={units} />;
}

function DesignOverview({ design, units }: { design: Design; units: UnitSystem }) {
  const store = useDesignStore();
  const { edit, select, addNode, addLink } = store.getState();
  const nodes = design.nodes;
  const [kind, setKind] = useState<LinkKind>('pipe');
  const [from, setFrom] = useState<Id>(nodes[0]?.id ?? '');
  const [to, setTo] = useState<Id>(nodes[1]?.id ?? nodes[0]?.id ?? '');
  const validFrom = nodes.some((n) => n.id === from) ? from : (nodes[0]?.id ?? '');
  const validTo = nodes.some((n) => n.id === to) ? to : (nodes[1]?.id ?? '');

  return (
    <>
      <div className="field">
        <label htmlFor="design-name">Design name</label>
        <input id="design-name" key={design.name} className="text" defaultValue={design.name} onBlur={(e) => e.target.value !== design.name && edit((d) => void (d.name = e.target.value || 'Untitled'))} />
      </div>
      <NumberField label="Water temperature" value={design.water.tempC} quantity="temperature" units={units} min={0} max={40} onChange={(v) => edit((d) => void (d.water.tempC = v))} hint="Viscosity nearly doubles between 25 °C and 2 °C." />

      <h3>Elements</h3>
      <ul className="el-list">
        {nodes.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => select(n.id)}>
              <span className={`kind-dot kind-dot--${n.kind}`} />
              {n.name}
              <span className="muted">{NODE_KIND_LABEL[n.kind]}</span>
            </button>
          </li>
        ))}
        {design.links.map((l) => (
          <li key={l.id}>
            <button type="button" onClick={() => select(l.id)}>
              <span className={`kind-dot kind-dot--link`} />
              {l.name ?? LINK_KIND_LABEL[l.kind]}
              <span className="muted">{LINK_KIND_LABEL[l.kind]}{l.isolated ? ', isolated' : ''}</span>
            </button>
          </li>
        ))}
      </ul>

      <h3>Add</h3>
      <div className="btn-row">
        {(['chamber', 'junction', 'pond'] as NodeKind[]).map((k) => (
          <button key={k} type="button" className="btn" onClick={() => addNode(k)}>
            + {NODE_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="add-link">
        <div className="field">
          <label htmlFor="add-kind">Connection</label>
          <select id="add-kind" className="select select--full" value={kind} onChange={(e) => setKind(e.target.value as LinkKind)}>
            {(Object.keys(LINK_KIND_LABEL) as LinkKind[]).map((k) => (
              <option key={k} value={k}>{LINK_KIND_LABEL[k]}{k === 'airlift' ? ' (preview)' : ''}</option>
            ))}
          </select>
        </div>
        <div className="field-pair">
          <NodeSelect id="add-from" label="From" nodes={nodes} value={validFrom} onChange={setFrom} />
          <NodeSelect id="add-to" label="To" nodes={nodes} value={validTo} onChange={setTo} />
        </div>
        <button type="button" className="btn btn--primary" disabled={!validFrom || !validTo || validFrom === validTo} onClick={() => addLink(kind, validFrom, validTo)}>
          Add {LINK_KIND_LABEL[kind].toLowerCase()}
        </button>
      </div>
    </>
  );
}

function NodeSelect({ id, label, nodes, value, onChange }: { id: string; label: string; nodes: Node[]; value: Id; onChange: (id: Id) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select select--full" value={value} onChange={(e) => onChange(e.target.value)}>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>{n.name}</option>
        ))}
      </select>
    </div>
  );
}

function ElementEditor({ el, design, units }: { el: Node | Link; design: Design; units: UnitSystem }) {
  const store = useDesignStore();
  const { edit, select, remove } = store.getState();
  const isLink = 'from' in el;
  const fields = elementFields(el);

  const update = (path: string, value: unknown) =>
    edit((d) => {
      const target = isLink ? d.links.find((l) => l.id === el.id) : d.nodes.find((n) => n.id === el.id);
      if (target) setPath(target, path, value);
    });

  const field = (f: FieldDesc) => {
    const raw = getPath(el, f.path);
    const value = typeof raw === 'number' ? raw : (OPTIONAL_DEFAULTS[f.path] ?? 0);
    return (
      <NumberField
        key={f.path}
        label={f.label}
        value={value}
        quantity={f.quantity}
        units={units}
        onChange={(v) => update(f.path, v)}
        {...(f.min !== undefined ? { min: f.min } : {})}
        {...(f.max !== undefined ? { max: f.max } : {})}
        {...(f.hint ? { hint: f.hint } : {})}
        {...(f.integer ? { integer: true } : {})}
      />
    );
  };

  const kindLabel = isLink ? LINK_KIND_LABEL[el.kind] : NODE_KIND_LABEL[el.kind];
  const name = el.name ?? '';

  return (
    <>
      <div className="inspector-head">
        <button type="button" className="link-btn" onClick={() => select(null)}>
          ← All elements
        </button>
        <span className="badge">{kindLabel}</span>
      </div>
      <div className="field">
        <label htmlFor={`name-${el.id}`}>Name</label>
        <input id={`name-${el.id}`} key={name} className="text" defaultValue={name} onBlur={(e) => e.target.value !== name && update('name', e.target.value)} />
      </div>

      <ElementResult id={el.id} units={units} />

      {!isLink && el.kind === 'chamber' && (
        <div className="seg seg--block" role="group" aria-label="Chamber shape">
          <button type="button" aria-pressed={el.shape.type === 'rect'} onClick={() => el.shape.type !== 'rect' && update('shape', { type: 'rect', lengthM: el.shape.diameterM, widthM: el.shape.diameterM })}>
            Rectangular
          </button>
          <button type="button" aria-pressed={el.shape.type === 'round'} onClick={() => el.shape.type !== 'round' && update('shape', { type: 'round', diameterM: Math.max(el.shape.lengthM, el.shape.widthM) })}>
            Round
          </button>
        </div>
      )}

      {isLink && (
        <>
          <div className="field-pair">
            <NodeSelect id={`from-${el.id}`} label="From" nodes={design.nodes} value={el.from} onChange={(v) => update('from', v)} />
            <NodeSelect id={`to-${el.id}`} label="To" nodes={design.nodes} value={el.to} onChange={(v) => update('to', v)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={!!el.isolated} onChange={(e) => update('isolated', e.target.checked)} />
            Isolated (closed for maintenance)
          </label>
        </>
      )}

      {isLink && el.kind === 'stage' && (
        <div className="field-pair">
          <div className="field">
            <label htmlFor={`stage-${el.id}`}>Stage type</label>
            <select id={`stage-${el.id}`} className="select select--full" value={el.stage.type} onChange={(e) => update('stage', defaultStage(e.target.value as Stage['type']))}>
              {(Object.keys(STAGE_LABEL) as Stage['type'][]).map((t) => (
                <option key={t} value={t}>{STAGE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`dir-${el.id}`}>Flow direction</label>
            <select id={`dir-${el.id}`} className="select select--full" value={el.direction} onChange={(e) => update('direction', e.target.value)}>
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>{d.replace('-', ' ')}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      {isLink && el.kind === 'stage' && 'geometry' in el.stage && (
        <div className="seg seg--block" role="group" aria-label="Bed geometry">
          <button type="button" aria-pressed={el.stage.geometry.type === 'planar'} onClick={() => update('stage.geometry', { type: 'planar', flowAreaM2: 0.36, depthM: 0.3 })}>
            Flat bed
          </button>
          <button type="button" aria-pressed={el.stage.geometry.type === 'radial'} onClick={() => update('stage.geometry', { type: 'radial', outerRadiusM: 0.625, innerRadiusM: 0.475, activeHeightM: 0.39 })}>
            Radial ring
          </button>
        </div>
      )}
      {isLink && el.kind === 'opening' && (
        <div className="seg seg--block" role="group" aria-label="Opening shape">
          <button type="button" aria-pressed={el.shape.type === 'circle'} onClick={() => update('shape', { type: 'circle', diameterM: 0.11 })}>
            Round hole
          </button>
          <button type="button" aria-pressed={el.shape.type === 'rect'} onClick={() => update('shape', { type: 'rect', widthM: 0.3, heightM: 0.2 })}>
            Rectangular slot
          </button>
        </div>
      )}
      {isLink && el.kind === 'valve' && (
        <div className="field">
          <label htmlFor={`vt-${el.id}`}>Valve type</label>
          <select id={`vt-${el.id}`} className="select select--full" value={el.valveType} onChange={(e) => update('valveType', e.target.value)}>
            {['ball', 'gate', 'butterfly', 'slide'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}
      {isLink && el.kind === 'weir' && (
        <label className="check">
          <input
            type="checkbox"
            checked={!!el.standpipe?.fitted}
            onChange={(e) => update('standpipe', { fitted: e.target.checked, fittedCrestM: el.standpipe?.fittedCrestM ?? el.crestM + 0.3 })}
          />
          Standpipe fitted (isolates by raising the crest)
        </label>
      )}

      {fields.map(field)}

      {isLink && el.kind === 'pipe' && <PlanLengthHint link={el} design={design} units={units} onUse={(v) => update('lengthM', v)} />}
      {isLink && el.kind === 'pipe' && <FittingsEditor fittings={el.fittings} onChange={(f) => update('fittings', f)} />}
      {isLink && el.kind === 'pump' && <PumpCurveEditor link={el} units={units} onChange={(c) => update('curve', c)} />}
      {isLink && el.kind === 'airlift' && (
        <p className="notice">Airlift physics arrives in milestone 3. Until then this element uses a placeholder line, so treat its flow as illustrative only.</p>
      )}

      <div className="btn-row btn-row--end">
        <button
          type="button"
          className="btn btn--danger"
          disabled={!isLink && el.kind === 'pond' && design.nodes.filter((n) => n.kind === 'pond').length === 1}
          onClick={() => remove(el.id)}
        >
          Delete {isLink ? 'connection' : 'element'}
        </button>
      </div>
    </>
  );
}

function PlanLengthHint({ link, design, units, onUse }: { link: Link & { kind: 'pipe' }; design: Design; units: UnitSystem; onUse: (v: number) => void }) {
  const ia = design.nodes.findIndex((n) => n.id === link.from);
  const ib = design.nodes.findIndex((n) => n.id === link.to);
  if (ia < 0 || ib < 0) return null;
  const a = placement(design, design.nodes[ia]!, ia);
  const b = placement(design, design.nodes[ib]!, ib);
  const plan = Math.hypot(b.xM - a.xM, b.yM - a.yM);
  const vertical = Math.abs(link.inletElevationM - link.outletElevationM);
  const route = Number((plan + vertical).toFixed(2));
  if (Math.abs(route - link.lengthM) < 0.05) return null;
  return (
    <div className="hint hint--action">
      Plan distance plus drop is {fmtText(route, 'length', units)}.{' '}
      <button type="button" className="link-btn" onClick={() => onUse(route)}>
        Use it
      </button>
    </div>
  );
}

const FITTINGS = Object.keys(FITTING_LABEL) as FittingType[];

function FittingsEditor({ fittings, onChange }: { fittings: Fitting[]; onChange: (f: Fitting[]) => void }) {
  const [adding, setAdding] = useState<FittingType>('elbow-90-short');
  const set = (i: number, count: number) => onChange(fittings.map((f, j) => (j === i ? { ...f, count } : f)).filter((f) => f.count > 0));
  return (
    <div className="sub">
      <h3>Fittings</h3>
      {fittings.length === 0 && <p className="muted">No fittings.</p>}
      <ul className="fittings">
        {fittings.map((f, i) => (
          <li key={`${f.type}-${i}`}>
            <span>{FITTING_LABEL[f.type]}</span>
            <div className="mini-stepper">
              <button type="button" aria-label={`Fewer ${FITTING_LABEL[f.type]}`} onClick={() => set(i, f.count - 1)}>−</button>
              <span className="num">{f.count}</span>
              <button type="button" aria-label={`More ${FITTING_LABEL[f.type]}`} onClick={() => set(i, f.count + 1)}>+</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <select aria-label="Fitting to add" className="select select--full" value={adding} onChange={(e) => setAdding(e.target.value as FittingType)}>
          {FITTINGS.map((t) => <option key={t} value={t}>{FITTING_LABEL[t]}</option>)}
        </select>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const i = fittings.findIndex((f) => f.type === adding);
            onChange(i >= 0 ? fittings.map((f, j) => (j === i ? { ...f, count: f.count + 1 } : f)) : [...fittings, { type: adding, count: 1 }]);
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function PumpCurveEditor({ link, units, onChange }: { link: Link & { kind: 'pump' }; units: UnitSystem; onChange: (c: { flowM3s: number; headM: number }[]) => void }) {
  const pts = link.curve;
  const set = (i: number, key: 'flowM3s' | 'headM', v: number) => onChange(pts.map((p, j) => (j === i ? { ...p, [key]: v } : p)));
  return (
    <div className="sub">
      <h3>Pump curve</h3>
      <p className="muted">Points from the maker's chart: flow against head. The operating point is where this meets the system.</p>
      {pts.map((p, i) => (
        <div className="field-pair" key={i}>
          <NumberField label={`Flow ${i + 1}`} value={p.flowM3s} quantity="flow" units={units} min={0} onChange={(v) => set(i, 'flowM3s', v)} />
          <NumberField label={`Head ${i + 1}`} value={p.headM} quantity="length" units={units} min={0} onChange={(v) => set(i, 'headM', v)} />
        </div>
      ))}
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => onChange([...pts, { flowM3s: (pts[pts.length - 1]?.flowM3s ?? 0) * 1.1, headM: 0 }])}>
          + Point
        </button>
        <button type="button" className="btn" disabled={pts.length <= 2} onClick={() => onChange(pts.slice(0, -1))}>
          − Point
        </button>
      </div>
    </div>
  );
}
