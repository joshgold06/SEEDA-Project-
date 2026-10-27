"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import type { Opportunity } from "@/lib/data";
import { FOCUS_BOXES, OUTLINES, outlinePath, PLACES, project, REFERENCE_CITIES, type MapFocus, type MapPlace, type ViewBox } from "@/lib/leads/geo";
import { ACTIVE_REGION_SENTENCE, REGION_ABBR, type Region } from "@/lib/leads/taxonomy";

export interface PlaceGroup {
  place: MapPlace;
  leads: Opportunity[];
  topScore: number;
}

export const tierColor = (score: number) => (score >= 65 ? "var(--color-brand)" : score >= 50 ? "#6fa8d8" : "#9fb0c6");

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Zoom limits are set against the whole-region view: 1x is everything, 40x is a few kilometres across.
const WHOLE = FOCUS_BOXES.all;
const MAX_ZOOM = 40;
const MIN_W = WHOLE.w / MAX_ZOOM;
const MAX_W = WHOLE.w * 1.1;
// Past this zoom, bubbles get their town names so a close-up of a bunched area can be read.
const LABEL_ZOOM = 4;
const DRAG_THRESHOLD = 4;

/** Keep the middle of the view on the map so it can't be dragged away into empty space. */
const keepOnMap = (b: ViewBox): ViewBox => {
  const cx = clamp(b.x + b.w / 2, WHOLE.x, WHOLE.x + WHOLE.w);
  const cy = clamp(b.y + b.h / 2, WHOLE.y, WHOLE.y + WHOLE.h);
  return { x: cx - b.w / 2, y: cy - b.h / 2, w: b.w, h: b.h };
};
const PROVINCE_LABELS: { region: Region; text: string; at: [number, number] }[] = [
  { region: "Alberta", text: "ALBERTA", at: [58.6, -114.9] },
  { region: "British Columbia", text: "BRITISH COLUMBIA", at: [58.3, -127.6] },
  { region: "Saskatchewan", text: "SASKATCHEWAN", at: [58.6, -106] },
  { region: "Manitoba", text: "MANITOBA", at: [58.9, -98.2] },
  { region: "Ontario", text: "ONTARIO", at: [53.3, -86.5] },
];

interface Props {
  groups: PlaceGroup[];
  focus: MapFocus;
  selectedKey: string | null;
  highlightKey: string | null;
  onSelect: (key: string | null) => void;
  onHover: (key: string | null) => void;
}

export function LeadMap({ groups, focus, selectedKey, highlightKey, onSelect, onHover }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 450 });
  const [box, setBox] = useState<ViewBox>(FOCUS_BOXES[focus]);
  const boxRef = useRef(box);
  boxRef.current = box;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number; box: ViewBox; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);
  const suppressClick = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setSize({ w: Math.max(320, el.clientWidth), h: Math.max(320, el.clientHeight) });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Glide to the chosen view instead of jumping.
  useEffect(() => {
    const from = boxRef.current;
    const to = FOCUS_BOXES[focus];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBox(to);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = ease(Math.min(1, (now - start) / 550));
      setBox({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, w: from.w + (to.w - from.w) * t, h: from.h + (to.h - from.h) * t });
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [focus]);

  // A screen position as a point on the map, for zooming towards the cursor.
  const toMapPoint = useCallback((clientX: number, clientY: number): [number, number] => {
    const rect = svgRef.current?.getBoundingClientRect();
    const b = boxRef.current;
    const { w, h } = sizeRef.current;
    const s = Math.min(w / b.w, h / b.h);
    const offX = (w - b.w * s) / 2;
    const offY = (h - b.h * s) / 2;
    return [b.x + (clientX - (rect?.left ?? 0) - offX) / s, b.y + (clientY - (rect?.top ?? 0) - offY) / s];
  }, []);

  // Moving the view by hand takes over from any glide in progress.
  const setView = useCallback((b: ViewBox) => {
    cancelAnimationFrame(animRef.current);
    boxRef.current = b;
    setBox(b);
  }, []);

  const zoomAt = useCallback(
    (factor: number, at?: [number, number]) => {
      const b = boxRef.current;
      const w = clamp(b.w / factor, MIN_W, MAX_W);
      const k = w / b.w;
      const [px, py] = at ?? [b.x + b.w / 2, b.y + b.h / 2];
      setView(keepOnMap({ x: px - (px - b.x) * k, y: py - (py - b.y) * k, w, h: b.h * k }));
    },
    [setView]
  );

  // Wheel zoom needs a non-passive listener so the page doesn't scroll at the same time.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), toMapPoint(e.clientX, e.clientY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, toMapPoint]);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
      dragRef.current = null;
    } else if (e.button === 0 || e.pointerType === "touch") {
      dragRef.current = { x: e.clientX, y: e.clientY, box: boxRef.current, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0 && dist > 0) zoomAt(dist / pinchDist.current, toMapPoint((a.x + b.x) / 2, (a.y + b.y) / 2));
      pinchDist.current = dist;
      suppressClick.current = true;
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      // Only start capturing once it is really a drag, so plain clicks on bubbles still work.
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    const s = Math.min(sizeRef.current.w / drag.box.w, sizeRef.current.h / drag.box.h);
    setView(keepOnMap({ ...drag.box, x: drag.box.x - dx / s, y: drag.box.y - dy / s }));
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = 0;
    if (dragRef.current?.moved) {
      // The click that ends a drag shouldn't select or deselect a place.
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 0);
    }
    if (pointers.current.size === 0) dragRef.current = null;
  };

  const zoom = WHOLE.w / box.w;
  const resetView = () => {
    const from = boxRef.current;
    const to = FOCUS_BOXES[focus];
    cancelAnimationFrame(animRef.current);
    const start = performance.now();
    const tick = (now: number) => {
      const t = ease(Math.min(1, (now - start) / 400));
      setView({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, w: from.w + (to.w - from.w) * t, h: from.h + (to.h - from.h) * t });
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  };

  // Sizes below are in screen pixels; divide by this to get SVG units so pins and text keep their size while zooming.
  const unit = 1 / Math.min(size.w / box.w, size.h / box.h);
  const px = (n: number) => n * unit;
  const radiusFor = (count: number) => Math.min(30, 10 + 5.5 * Math.sqrt(count - 1 + 0.6));

  const placed = useMemo(() => groups.map((g) => ({ ...g, xy: project(g.place.lat, g.place.lng) })), [groups]);
  const visibleCities = REFERENCE_CITIES.map((name) => ({ name, xy: project(...PLACES[name]) })).filter(({ xy }) => xy[0] > box.x && xy[0] < box.x + box.w && xy[1] > box.y && xy[1] < box.y + box.h);
  const hovered = placed.find((g) => g.place.key === highlightKey);

  // A town name goes to the right of its bubble unless another bubble is in the way, then to the left.
  const labelOnLeft = (xy: [number, number], label: string, r: number) => {
    const reach = r + px(5) + px(label.length * 6.6);
    const blocked = (side: 1 | -1) =>
      placed.some((o) => {
        if (o.xy === xy) return false;
        const dx = (o.xy[0] - xy[0]) * side;
        const near = Math.abs(o.xy[1] - xy[1]) < px(16);
        return near && dx > 0 && dx < reach + px(radiusFor(o.leads.length));
      });
    return blocked(1) && !blocked(-1);
  };

  return (
    <div ref={wrapRef} className="relative h-full min-h-[380px] w-full overflow-hidden rounded-xl border border-line" style={{ background: "var(--map-water)" }}>
      <svg
        ref={svgRef}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        width={size.w}
        height={size.h}
        role="group"
        aria-label={`Map of lead locations across ${ACTIVE_REGION_SENTENCE}. Scroll or use the zoom buttons to zoom, drag to move.`}
        className="block cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onClickCapture={(e) => { if (suppressClick.current) e.stopPropagation(); }}
        onClick={() => onSelect(null)}
        onDoubleClick={(e) => zoomAt(2, toMapPoint(e.clientX, e.clientY))}
      >
        {(Object.keys(OUTLINES) as Region[]).map((region) => (
          <path key={region} d={outlinePath(region)} fill={focus === region ? "var(--map-land-active)" : "var(--map-land)"} stroke="var(--map-border)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}

        {PROVINCE_LABELS.map(({ region, text, at }) => {
          const [x, y] = project(...at);
          return (
            <text key={region} x={x} y={y} textAnchor="middle" fontSize={px(13)} letterSpacing={px(4)} fill="var(--map-label)" opacity={0.55} fontWeight={600} pointerEvents="none">
              {zoom < 1.8 ? REGION_ABBR[region] : text}
            </text>
          );
        })}

        {visibleCities.map(({ name, xy }) => {
          // Push the label past a bubble sitting on the same town so neither hides the other.
          const bubble = placed.find((g) => g.place.key === name);
          // Close up, the bubble carries its own name, so the grey reference label would only get in the way.
          if (bubble && zoom >= LABEL_ZOOM) return null;
          const gap = bubble ? px(radiusFor(bubble.leads.length) + 5) : px(6);
          return (
            <g key={name} pointerEvents="none">
              {!bubble && <circle cx={xy[0]} cy={xy[1]} r={px(2.4)} fill="var(--map-label)" />}
              <text x={xy[0] + gap} y={xy[1] + px(3.5)} fontSize={px(10.5)} fill="var(--map-label)">{name}</text>
            </g>
          );
        })}

        {placed.map(({ place, leads, topScore, xy }) => {
          const selected = selectedKey === place.key;
          const lit = highlightKey === place.key;
          if (place.provinceWide) {
            // Many headlines name only a province. Show those as one pill under the province name
            // rather than a misleading bubble sitting at an arbitrary spot.
            const text = `${leads.length} province-wide`;
            const w = px(text.length * 6.4 + 26);
            const h = px(26);
            return (
              <g
                key={place.key}
                className="fade-in cursor-pointer outline-none"
                role="button"
                tabIndex={0}
                aria-label={`${place.region}: ${leads.length} leads that name only the province, top score ${topScore}`}
                aria-pressed={selected}
                onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : place.key); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selected ? null : place.key); } }}
                onMouseEnter={() => onHover(place.key)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(place.key)}
                onBlur={() => onHover(null)}
              >
                <rect x={xy[0] - w / 2} y={xy[1] - h / 2} width={w} height={h} rx={h / 2} fill="var(--color-surface)" fillOpacity={0.92} stroke={tierColor(topScore)} strokeWidth={px(selected || lit ? 2.4 : 1.4)} strokeDasharray={selected ? undefined : `${px(4)} ${px(3)}`} />
                <circle cx={xy[0] - w / 2 + px(12)} cy={xy[1]} r={px(4)} fill={tierColor(topScore)} />
                <text x={xy[0] + px(6)} y={xy[1] + px(4)} textAnchor="middle" fontSize={px(11.5)} fontWeight={600} fill="var(--color-ink)" pointerEvents="none">{text}</text>
              </g>
            );
          }
          const r = px(radiusFor(leads.length));
          const label = `${place.label}: ${leads.length} lead${leads.length === 1 ? "" : "s"}, top score ${topScore}`;
          return (
            <g
              key={place.key}
              className="fade-in cursor-pointer outline-none"
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-pressed={selected}
              onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : place.key); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selected ? null : place.key); } }}
              onMouseEnter={() => onHover(place.key)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(place.key)}
              onBlur={() => onHover(null)}
            >
              {(selected || lit) && <circle cx={xy[0]} cy={xy[1]} r={r + px(5)} fill="none" stroke={tierColor(topScore)} strokeWidth={px(2)} opacity={0.5} />}
              <circle
                cx={xy[0]}
                cy={xy[1]}
                r={r}
                fill={tierColor(topScore)}
                fillOpacity={place.provinceWide ? 0.35 : 0.9}
                stroke={selected ? "var(--color-ink)" : "var(--color-surface)"}
                strokeWidth={px(selected ? 2.5 : 1.5)}
                strokeDasharray={place.provinceWide ? `${px(4)} ${px(3)}` : undefined}
              />
              <text x={xy[0]} y={xy[1] + px(4)} textAnchor="middle" fontSize={px(12)} fontWeight={700} fill="#fff" pointerEvents="none">
                {leads.length}
              </text>
              {zoom >= LABEL_ZOOM && (
                <text x={xy[0] + (labelOnLeft(xy, place.label, r) ? -(r + px(5)) : r + px(5))} y={xy[1] + px(4)} textAnchor={labelOnLeft(xy, place.label, r) ? "end" : "start"} fontSize={px(11.5)} fontWeight={600} fill="var(--color-ink)" stroke="var(--map-water)" strokeWidth={px(3)} paintOrder="stroke" strokeLinejoin="round" pointerEvents="none">
                  {place.label}
                </text>
              )}
            </g>
          );
        })}

        {hovered && (() => {
          const text = `${hovered.place.label} · ${hovered.leads.length} lead${hovered.leads.length === 1 ? "" : "s"} · top ${hovered.topScore}`;
          const w = px(text.length * 6.3 + 16);
          const h = px(24);
          const r = hovered.place.provinceWide ? px(13) : px(radiusFor(hovered.leads.length));
          const x = Math.min(Math.max(hovered.xy[0] - w / 2, box.x + px(6)), box.x + box.w - w - px(6));
          const y = hovered.xy[1] - r - h - px(8) < box.y + px(4) ? hovered.xy[1] + r + px(8) : hovered.xy[1] - r - h - px(8);
          return (
            <g pointerEvents="none">
              <rect x={x} y={y} width={w} height={h} rx={px(6)} fill="var(--color-rail)" />
              <text x={x + w / 2} y={y + px(16)} textAnchor="middle" fontSize={px(11.5)} fill="#fff">{text}</text>
            </g>
          );
        })()}
      </svg>
      <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm" role="group" aria-label="Map zoom">
        <button onClick={() => zoomAt(1.8)} disabled={box.w <= MIN_W * 1.001} aria-label="Zoom in" title="Zoom in" className="grid size-8 place-items-center text-ink hover:bg-neutral-100 disabled:opacity-40"><Plus className="size-4" /></button>
        <button onClick={() => zoomAt(1 / 1.8)} disabled={box.w >= MAX_W * 0.999} aria-label="Zoom out" title="Zoom out" className="grid size-8 place-items-center border-t border-line text-ink hover:bg-neutral-100 disabled:opacity-40"><Minus className="size-4" /></button>
        <button onClick={resetView} aria-label="Reset view" title="Reset view" className="grid size-8 place-items-center border-t border-line text-ink hover:bg-neutral-100"><Maximize className="size-3.5" /></button>
      </div>
      <span className="pointer-events-none absolute top-3 right-14 rounded bg-surface/80 px-1.5 py-0.5 font-mono text-[10.5px] text-neutral-500" aria-live="polite">{zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}×</span>
      <span className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-neutral-400">Scroll to zoom, drag to move. Simplified outlines, not to scale</span>
    </div>
  );
}
