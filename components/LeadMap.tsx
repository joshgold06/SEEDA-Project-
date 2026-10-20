"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Opportunity } from "@/lib/data";
import { FOCUS_BOXES, OUTLINES, outlinePath, PLACES, project, REFERENCE_CITIES, type MapFocus, type MapPlace, type ViewBox } from "@/lib/leads/geo";
import type { WesternRegion } from "@/lib/leads/taxonomy";

export interface PlaceGroup {
  place: MapPlace;
  leads: Opportunity[];
  topScore: number;
}

export const tierColor = (score: number) => (score >= 65 ? "var(--color-brand)" : score >= 50 ? "#6fa8d8" : "#9fb0c6");

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const PROVINCE_LABELS: { region: WesternRegion; text: string; at: [number, number] }[] = [
  { region: "Alberta", text: "ALBERTA", at: [58.6, -114.9] },
  { region: "British Columbia", text: "BRITISH COLUMBIA", at: [58.3, -127.6] },
  { region: "Saskatchewan", text: "SASKATCHEWAN", at: [58.6, -106] },
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

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setSize({ w: Math.max(320, el.clientWidth), h: Math.max(320, el.clientHeight) });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Glide to the chosen province instead of jumping.
  useEffect(() => {
    const from = boxRef.current;
    const to = FOCUS_BOXES[focus];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBox(to);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = ease(Math.min(1, (now - start) / 550));
      setBox({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, w: from.w + (to.w - from.w) * t, h: from.h + (to.h - from.h) * t });
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  // Sizes below are in screen pixels; divide by this to get SVG units so pins and text keep their size while zooming.
  const unit = 1 / Math.min(size.w / box.w, size.h / box.h);
  const px = (n: number) => n * unit;
  const radiusFor = (count: number) => Math.min(30, 10 + 5.5 * Math.sqrt(count - 1 + 0.6));

  const placed = useMemo(() => groups.map((g) => ({ ...g, xy: project(g.place.lat, g.place.lng) })), [groups]);
  const visibleCities = REFERENCE_CITIES.map((name) => ({ name, xy: project(...PLACES[name]) })).filter(({ xy }) => xy[0] > box.x && xy[0] < box.x + box.w && xy[1] > box.y && xy[1] < box.y + box.h);
  const hovered = placed.find((g) => g.place.key === highlightKey);

  return (
    <div ref={wrapRef} className="relative h-full min-h-[380px] w-full overflow-hidden rounded-xl border border-line" style={{ background: "var(--map-water)" }}>
      <svg
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        width={size.w}
        height={size.h}
        role="group"
        aria-label="Map of lead locations across Alberta, British Columbia and Saskatchewan"
        className="block"
        onClick={() => onSelect(null)}
      >
        {(Object.keys(OUTLINES) as WesternRegion[]).map((region) => (
          <path key={region} d={outlinePath(region)} fill={focus === region ? "var(--map-land-active)" : "var(--map-land)"} stroke="var(--map-border)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}

        {PROVINCE_LABELS.map(({ region, text, at }) => {
          const [x, y] = project(...at);
          return (
            <text key={region} x={x} y={y} textAnchor="middle" fontSize={px(13)} letterSpacing={px(4)} fill="var(--map-label)" opacity={0.55} fontWeight={600} pointerEvents="none">
              {text}
            </text>
          );
        })}

        {visibleCities.map(({ name, xy }) => {
          // Push the label past a bubble sitting on the same town so neither hides the other.
          const bubble = placed.find((g) => g.place.key === name);
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
      <span className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-neutral-400">Simplified outlines, not to scale</span>
    </div>
  );
}
