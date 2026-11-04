import { useCallback, useEffect, useRef, useState } from 'react';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * viewBox pan and zoom for an SVG: wheel or pinch to zoom, drag empty space to
 * pan. Elements that handle their own drags stop propagation of pointerdown.
 */
export function usePanZoom(fit: Box) {
  const [box, setBox] = useState<Box>(fit);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ box: Box; mid: { x: number; y: number }; dist: number } | null>(null);
  const fitKey = `${fit.x.toFixed(3)},${fit.y.toFixed(3)},${fit.w.toFixed(3)},${fit.h.toFixed(3)}`;
  const zoomed = useRef(false);

  // Follow the fitted box until the user zooms or pans.
  useEffect(() => {
    if (!zoomed.current) setBox(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const reset = useCallback(() => {
    zoomed.current = false;
    setBox(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  /** Screen px → user units. Accounts for preserveAspectRatio meet. */
  const unitsPerPx = useCallback((b: Box) => {
    const el = svgRef.current;
    if (!el) return 1;
    const r = el.getBoundingClientRect();
    return Math.max(b.w / Math.max(1, r.width), b.h / Math.max(1, r.height));
  }, []);

  const toUser = useCallback(
    (clientX: number, clientY: number, b: Box = box) => {
      const el = svgRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      const k = unitsPerPx(b);
      const ox = b.x + b.w / 2 - (r.width * k) / 2;
      const oy = b.y + b.h / 2 - (r.height * k) / 2;
      return { x: ox + (clientX - r.left) * k, y: oy + (clientY - r.top) * k };
    },
    [box, unitsPerPx],
  );

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      zoomed.current = true;
      setBox((b) => {
        const minW = fit.w / 12;
        const maxW = fit.w * 3;
        const w = Math.min(maxW, Math.max(minW, b.w / factor));
        const f = b.w / w;
        const c = cx !== undefined && cy !== undefined ? toUser(cx, cy, b) : { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const h = b.h / f;
        return { x: c.x - (c.x - b.x) / f, y: c.y - (c.y - b.y) / f, w, h };
      });
    },
    [fit.w, toUser],
  );

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    startGesture();
  };
  const startGesture = () => {
    const pts = [...pointers.current.values()];
    if (pts.length === 0) {
      gesture.current = null;
      return;
    }
    const mid = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    const dist = pts.length > 1 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0;
    gesture.current = { box, mid, dist };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    const mid = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    const k = unitsPerPx(g.box);
    let { x, y, w, h } = g.box;
    if (pts.length > 1 && g.dist > 0) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const f = Math.min(12, Math.max(0.3, dist / g.dist));
      const c = toUser(g.mid.x, g.mid.y, g.box);
      w = g.box.w / f;
      h = g.box.h / f;
      x = c.x - (c.x - g.box.x) / f;
      y = c.y - (c.y - g.box.y) / f;
    }
    const dx = (mid.x - g.mid.x) * k * (w / g.box.w);
    const dy = (mid.y - g.mid.y) * k * (w / g.box.w);
    if (Math.abs(mid.x - g.mid.x) + Math.abs(mid.y - g.mid.y) > 2 || pts.length > 1) zoomed.current = true;
    setBox({ x: x - dx, y: y - dy, w, h });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    startGesture();
  };

  return {
    box,
    svgRef,
    viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
    toUser,
    zoomIn: () => zoomAt(1.4),
    zoomOut: () => zoomAt(1 / 1.4),
    reset,
    isZoomed: () => zoomed.current,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
