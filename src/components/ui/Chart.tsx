import { useMemo, useRef, useState } from 'react';

export interface Pt {
  x: number;
  y: number;
}

export interface PlotSeries {
  key: string;
  label: string;
  unit: string;
  color: string;
  points: Pt[];
  /** fill under the line */
  area?: boolean;
  dashed?: boolean;
  /** plot against the right-hand axis */
  axis?: 'left' | 'right';
}

export interface PlotBand {
  from: number;
  to: number;
  color: string;
  label?: string;
}

export interface PlotMarker {
  x: number;
  color: string;
  label?: string;
  dashed?: boolean;
}

interface PlotProps {
  series: PlotSeries[];
  bands?: PlotBand[];
  markers?: PlotMarker[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  yRightLabel?: string;
  xTickFormat?: (v: number) => string;
  yTickFormat?: (v: number) => string;
  yRightTickFormat?: (v: number) => string;
  /** force the left y domain */
  yDomain?: [number, number];
  hoverFormat?: (x: number, values: { s: PlotSeries; y: number }[]) => string[];
}

const PAD = { l: 42, r: 10, t: 10, b: 20 };
const VW = 480;

function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) return [lo];
  const span = hi - lo;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 0.001; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

export function Plot({
  series,
  bands = [],
  markers = [],
  height = 150,
  xLabel,
  yLabel,
  yRightLabel,
  xTickFormat = (v) => String(Math.round(v)),
  yTickFormat = (v) => String(Math.round(v)),
  yRightTickFormat = (v) => String(Math.round(v)),
  yDomain,
  hoverFormat,
}: PlotProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const vh = height;
  const padR = series.some((s) => s.axis === 'right') ? 40 : PAD.r;

  const dom = useMemo(() => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let l0 = Infinity;
    let l1 = -Infinity;
    let r0 = Infinity;
    let r1 = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (s.axis === 'right') {
          if (p.y < r0) r0 = p.y;
          if (p.y > r1) r1 = p.y;
        } else {
          if (p.y < l0) l0 = p.y;
          if (p.y > l1) l1 = p.y;
        }
      }
    }
    if (!isFinite(x0)) {
      x0 = 0;
      x1 = 1;
    }
    if (!isFinite(l0)) {
      l0 = 0;
      l1 = 1;
    }
    if (yDomain) {
      l0 = yDomain[0];
      l1 = yDomain[1];
    } else {
      const padY = (l1 - l0) * 0.12 || 1;
      l0 -= padY;
      l1 += padY;
    }
    if (isFinite(r0)) {
      const padR2 = (r1 - r0) * 0.12 || 1;
      r0 -= padR2;
      r1 += padR2;
    }
    return { x0, x1: x1 === x0 ? x0 + 1 : x1, l0, l1, r0, r1 };
  }, [series, yDomain]);

  const sx = (v: number) => PAD.l + ((v - dom.x0) / (dom.x1 - dom.x0)) * (VW - PAD.l - padR);
  const syL = (v: number) => vh - PAD.b - ((v - dom.l0) / (dom.l1 - dom.l0 || 1)) * (vh - PAD.t - PAD.b);
  const syR = (v: number) => vh - PAD.b - ((v - dom.r0) / (dom.r1 - dom.r0 || 1)) * (vh - PAD.t - PAD.b);

  const xTicks = niceTicks(dom.x0, dom.x1, 5);
  const yTicks = niceTicks(dom.l0, dom.l1, 4);
  const yRTicks = isFinite(dom.r0) ? niceTicks(dom.r0, dom.r1, 4) : [];

  const hovered = useMemo(() => {
    if (hoverX === null) return null;
    const vals = series.map((s) => {
      let best = s.points[0];
      let bd = Infinity;
      for (const p of s.points) {
        const d = Math.abs(p.x - hoverX);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return { s, y: best ? best.y : 0, x: best ? best.x : hoverX };
    });
    return vals;
  }, [hoverX, series]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VW;
    if (px < PAD.l || px > VW - padR) {
      setHoverX(null);
      return;
    }
    const v = dom.x0 + ((px - PAD.l) / (VW - PAD.l - padR)) * (dom.x1 - dom.x0);
    setHoverX(v);
  };

  const path = (s: PlotSeries) => {
    const sy = s.axis === 'right' ? syR : syL;
    return s.points.map((p, i) => (i === 0 ? 'M' : 'L') + sx(p.x).toFixed(2) + ' ' + sy(p.y).toFixed(2)).join(' ');
  };
  const areaPath = (s: PlotSeries) => {
    const sy = s.axis === 'right' ? syR : syL;
    if (s.points.length === 0) return '';
    const top = s.points.map((p, i) => (i === 0 ? 'M' : 'L') + sx(p.x).toFixed(2) + ' ' + sy(p.y).toFixed(2)).join(' ');
    return (
      top +
      ' L' +
      sx(s.points[s.points.length - 1].x).toFixed(2) +
      ' ' +
      (vh - PAD.b) +
      ' L' +
      sx(s.points[0].x).toFixed(2) +
      ' ' +
      (vh - PAD.b) +
      ' Z'
    );
  };

  const hoverLines = hovered && hoverFormat ? hoverFormat(hovered[0]?.x ?? 0, hovered) : null;

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={'0 0 ' + VW + ' ' + vh}
        className="w-full block"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverX(null)}
      >
        {bands.map((b, i) => (
          <rect
            key={i}
            x={sx(b.from)}
            y={PAD.t}
            width={Math.max(0, sx(b.to) - sx(b.from))}
            height={vh - PAD.t - PAD.b}
            fill={b.color}
          />
        ))}

        {yTicks.map((t) => (
          <g key={'y' + t}>
            <line x1={PAD.l} x2={VW - padR} y1={syL(t)} y2={syL(t)} stroke="#2a303b" strokeWidth="0.6" />
            <text x={PAD.l - 5} y={syL(t) + 3} textAnchor="end" className="fill-[#616b7c]" style={{ fontSize: 8, fontFamily: 'ui-monospace, monospace' }}>
              {yTickFormat(t)}
            </text>
          </g>
        ))}
        {yRTicks.map((t) => (
          <text
            key={'yr' + t}
            x={VW - padR + 5}
            y={syR(t) + 3}
            textAnchor="start"
            className="fill-[#616b7c]"
            style={{ fontSize: 8, fontFamily: 'ui-monospace, monospace' }}
          >
            {yRightTickFormat(t)}
          </text>
        ))}
        {xTicks.map((t) => (
          <text
            key={'x' + t}
            x={sx(t)}
            y={vh - 6}
            textAnchor="middle"
            className="fill-[#616b7c]"
            style={{ fontSize: 8, fontFamily: 'ui-monospace, monospace' }}
          >
            {xTickFormat(t)}
          </text>
        ))}

        <line x1={PAD.l} x2={VW - padR} y1={vh - PAD.b} y2={vh - PAD.b} stroke="#2a303b" />
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={vh - PAD.b} stroke="#2a303b" />

        {markers.map((m, i) => (
          <line
            key={i}
            x1={sx(m.x)}
            x2={sx(m.x)}
            y1={PAD.t}
            y2={vh - PAD.b}
            stroke={m.color}
            strokeWidth="1"
            strokeDasharray={m.dashed === false ? undefined : '3 3'}
          />
        ))}

        {series.map((s) => (
          <g key={s.key}>
            {s.area && <path d={areaPath(s)} fill={s.color} opacity="0.13" />}
            <path
              d={path(s)}
              fill="none"
              stroke={s.color}
              strokeWidth="1.4"
              strokeDasharray={s.dashed ? '4 3' : undefined}
              strokeLinejoin="round"
            />
          </g>
        ))}

        {hoverX !== null && (
          <line x1={sx(hoverX)} x2={sx(hoverX)} y1={PAD.t} y2={vh - PAD.b} stroke="#5ad6e8" strokeWidth="0.8" />
        )}
        {hovered &&
          hovered.map((h) => (
            <circle
              key={h.s.key}
              cx={sx(h.x)}
              cy={(h.s.axis === 'right' ? syR : syL)(h.y)}
              r="2.4"
              fill={h.s.color}
              stroke="#0b0d11"
              strokeWidth="0.8"
            />
          ))}

        {yLabel && (
          <text x={4} y={PAD.t + 2} className="fill-[#616b7c]" style={{ fontSize: 7.5, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.1em' }}>
            {yLabel}
          </text>
        )}
        {yRightLabel && (
          <text x={VW - 4} y={PAD.t + 2} textAnchor="end" className="fill-[#616b7c]" style={{ fontSize: 7.5, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.1em' }}>
            {yRightLabel}
          </text>
        )}
        {xLabel && (
          <text x={VW - padR} y={PAD.t + 2} textAnchor="end" className="fill-[#616b7c]" style={{ fontSize: 7.5, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.1em' }}>
            {xLabel}
          </text>
        )}
      </svg>

      {hoverLines && hoverLines.length > 0 && (
        <div className="pointer-events-none absolute top-1 right-1 bg-deck-800/95 border border-line rounded-[2px] px-2 py-1">
          {hoverLines.map((l, i) => (
            <div key={i} className="num text-[10px] text-ink whitespace-nowrap">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: { label: string; color: string; unit?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
      {series.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1.5 text-[10px] text-ink-dim">
          <span className="h-[2px] w-3 rounded-full" style={{ background: s.color }} />
          {s.label}
          {s.unit && <span className="text-ink-faint">({s.unit})</span>}
        </span>
      ))}
    </div>
  );
}
