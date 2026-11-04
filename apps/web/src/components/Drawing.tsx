export type DrawingView = 'section' | 'plan';

interface Props {
  view: DrawingView;
  onView: (v: DrawingView) => void;
}

/** The plan and side-elevation drawing. In M0 it shows a fixed example layout. */
export function Drawing({ view, onView }: Props) {
  return (
    <section className="card drawing-card" aria-label="Filter drawing">
      <div className="drawing-toolbar">
        <div className="seg" role="group" aria-label="Drawing view">
          <button type="button" aria-pressed={view === 'plan'} onClick={() => onView('plan')}>
            Plan
          </button>
          <button type="button" aria-pressed={view === 'section'} onClick={() => onView('section')}>
            Section
          </button>
        </div>
        <span className="label">Example layout, not yet solved</span>
      </div>
      <div className="drawing">{view === 'section' ? <SectionExample /> : <PlanExample />}</div>
    </section>
  );
}

// Water levels step down from the pond (exaggerated) to show the idea.
const CHAMBERS = [
  { x: 250, w: 120, level: 92, name: 'Vortex' },
  { x: 384, w: 120, level: 100, name: 'Matting' },
  { x: 518, w: 120, level: 106, name: 'Static K1' },
  { x: 652, w: 124, level: 118, name: 'Airlift' },
] as const;
const FLOOR = 250;
const WALL_TOP = 70;
const POND_LEVEL = 86;

function SectionExample() {
  return (
    <svg viewBox="0 0 800 290" role="img" aria-label="Side elevation: pond, three filter chambers and an airlift chamber, with water levels falling stage by stage">
      <rect x="0" y={FLOOR} width="800" height="40" fill="var(--ground)" />
      <line x1="16" x2="784" y1={POND_LEVEL} y2={POND_LEVEL} stroke="var(--text-muted)" strokeDasharray="5 5" strokeWidth="1" />
      <text x="20" y={POND_LEVEL - 8} fontSize="12" fill="var(--text-muted)">pond level</text>
      {/* Pond */}
      <path d={`M16 ${POND_LEVEL} L216 ${POND_LEVEL} L216 ${FLOOR + 20} L60 ${FLOOR + 20} Z`} fill="var(--water)" />
      <line x1="16" x2="216" y1={POND_LEVEL} y2={POND_LEVEL} stroke="var(--water-line)" strokeWidth="2" />
      <text x="120" y="190" textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--text)">Pond</text>
      {/* Bottom drain */}
      <path d={`M150 ${FLOOR + 14} H250`} stroke="var(--structure)" strokeWidth="8" strokeLinecap="round" />
      {CHAMBERS.map((c, i) => (
        <g key={c.name}>
          <rect x={c.x} y={c.level} width={c.w} height={FLOOR - c.level} fill="var(--water)" />
          <line x1={c.x} x2={c.x + c.w} y1={c.level} y2={c.level} stroke="var(--water-line)" strokeWidth="2" />
          {c.name === 'Matting' && (
            <rect x={c.x + 14} y={c.level + 14} width={c.w - 28} height={110} fill="var(--media)" fillOpacity="0.35" stroke="var(--media)" strokeDasharray="3 3" />
          )}
          {c.name === 'Static K1' && (
            <g fill="none" stroke="var(--media)" strokeOpacity="0.8">
              {Array.from({ length: 18 }, (_, k) => (
                <circle key={k} cx={c.x + 22 + (k % 6) * 15} cy={c.level + 28 + Math.floor(k / 6) * 18} r="5" />
              ))}
            </g>
          )}
          {c.name === 'Vortex' && (
            <path d={`M${c.x + 20} ${FLOOR} L${c.x + c.w / 2} ${FLOOR - 26} L${c.x + c.w - 20} ${FLOOR}`} fill="none" stroke="var(--structure)" strokeWidth="1.5" />
          )}
          <path d={`M${c.x} ${WALL_TOP} V${FLOOR} H${c.x + c.w} V${WALL_TOP}`} fill="none" stroke="var(--structure)" strokeWidth="3" />
          <text x={c.x + c.w / 2} y={c.name === 'Vortex' ? FLOOR - 40 : FLOOR - 16} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text)">{c.name}</text>
          {i < CHAMBERS.length - 1 && (
            <path d={`M${c.x + c.w - 2} ${FLOOR - 70} h18`} stroke="var(--structure)" strokeWidth="6" />
          )}
        </g>
      ))}
      {/* Airlift riser and return */}
      <path d={`M752 ${FLOOR - 8} V40 H120 V${POND_LEVEL - 6}`} fill="none" stroke="var(--structure)" strokeWidth="5" strokeLinejoin="round" />
      <g fill="var(--surface)" stroke="var(--water-line)" strokeWidth="1.2">
        {[220, 196, 170, 146, 120, 96, 72, 52].map((y, k) => (
          <circle key={y} cx={752 + (k % 2 ? 1.5 : -1.5)} cy={y} r={2 + k * 0.35} />
        ))}
      </g>
      <text x="436" y="32" textAnchor="middle" fontSize="12" fill="var(--text-muted)">return to pond</text>
    </svg>
  );
}

function PlanExample() {
  return (
    <svg viewBox="0 0 800 290" role="img" aria-label="Plan view: pond with bottom drain feeding a row of filter chambers">
      <ellipse cx="170" cy="145" rx="150" ry="115" fill="var(--water)" stroke="var(--water-line)" strokeWidth="2" />
      <circle cx="170" cy="150" r="10" fill="var(--structure)" />
      <text x="170" y="120" textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--text)">Pond</text>
      <path d="M180 150 H380" stroke="var(--structure)" strokeWidth="8" strokeLinecap="round" />
      <circle cx="420" cy="150" r="48" fill="var(--water)" stroke="var(--structure)" strokeWidth="3" />
      <text x="420" y="154" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text)">Vortex</text>
      {[
        { x: 486, name: 'Matting' },
        { x: 586, name: 'K1' },
        { x: 686, name: 'Airlift' },
      ].map((c) => (
        <g key={c.name}>
          <rect x={c.x} y="100" width="90" height="100" rx="4" fill="var(--water)" stroke="var(--structure)" strokeWidth="3" />
          <text x={c.x + 45} y="154" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text)">{c.name}</text>
        </g>
      ))}
      <path d="M731 200 V250 H170 V262" fill="none" stroke="var(--structure)" strokeWidth="5" strokeDasharray="10 6" />
      <text x="450" y="272" textAnchor="middle" fontSize="12" fill="var(--text-muted)">return to pond</text>
    </svg>
  );
}
