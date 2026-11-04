import { useCallback, useRef, useState, type ReactNode } from 'react';

export type Snap = 'peek' | 'half' | 'full';

const ORDER: Snap[] = ['peek', 'half', 'full'];

interface Props {
  snap: Snap;
  onSnap: (s: Snap) => void;
  peekHeight: number;
  header: ReactNode;
  peek: ReactNode;
  children: ReactNode;
}

function snapHeight(snap: Snap, peek: number, container: number) {
  if (snap === 'peek') return peek;
  if (snap === 'half') return Math.round(container * 0.5);
  return Math.round(container * 0.9);
}

/** A draggable bottom sheet with three resting heights. Tap the handle to cycle. */
export function BottomSheet({ snap, onSnap, peekHeight, header, peek, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  const containerHeight = () => ref.current?.parentElement?.clientHeight ?? window.innerHeight;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const startH = ref.current?.getBoundingClientRect().height ?? peekHeight;
      drag.current = { startY: e.clientY, startH, moved: false };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [peekHeight],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.startY - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) {
      const max = containerHeight() * 0.9;
      setDragHeight(Math.min(max, Math.max(peekHeight, d.startH + dy)));
    }
  }, [peekHeight]);

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      onSnap(ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length] ?? 'peek');
      return;
    }
    const h = dragHeight ?? d.startH;
    const c = containerHeight();
    let best: Snap = 'peek';
    let bestDist = Infinity;
    for (const s of ORDER) {
      const dist = Math.abs(snapHeight(s, peekHeight, c) - h);
      if (dist < bestDist) {
        best = s;
        bestDist = dist;
      }
    }
    setDragHeight(null);
    onSnap(best);
  }, [dragHeight, onSnap, peekHeight, snap]);

  const height = dragHeight ?? (snap === 'peek' ? peekHeight : snap === 'half' ? '50%' : '90%');

  return (
    <div
      ref={ref}
      className={`sheet${dragHeight !== null ? ' dragging' : ''}`}
      style={{ ['--sheet-height' as string]: typeof height === 'number' ? `${height}px` : height }}
      data-snap={snap}
    >
      <button
        type="button"
        className="sheet-handle"
        aria-label={`Resize panel, currently ${snap}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') onSnap(ORDER[Math.min(2, ORDER.indexOf(snap) + 1)] ?? 'full');
          if (e.key === 'ArrowDown') onSnap(ORDER[Math.max(0, ORDER.indexOf(snap) - 1)] ?? 'peek');
        }}
      />
      {header}
      {snap === 'peek' && dragHeight === null ? peek : children}
    </div>
  );
}
