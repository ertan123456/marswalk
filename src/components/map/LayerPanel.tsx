import { useState } from 'react';
import { groupedLayers } from '../../data/config';
import type { LayerAdapter, LegendSpec } from '../../data/types';
import { rampCssGradient } from '../../lib/raster';
import { useMission } from '../../store/useMission';
import { Badge, Button, Panel, ProvenanceBadge, Switch } from '../ui/primitives';

function LegendBody({ legend }: { legend: LegendSpec }) {
  if (legend.type === 'continuous') {
    return (
      <div>
        <div className="h-2 rounded-[1px] border border-line/60" style={{ background: rampCssGradient(legend.stops) }} />
        <div className="flex justify-between num text-[9px] text-ink-faint mt-1">
          <span>
            {legend.min} {legend.unit}
          </span>
          <span>
            {legend.max} {legend.unit}
          </span>
        </div>
        {legend.note && <p className="text-[10px] leading-relaxed text-ink-faint mt-1.5">{legend.note}</p>}
      </div>
    );
  }
  if (legend.type === 'categorical') {
    return (
      <div className="space-y-1">
        {legend.items.map((c) => (
          <div key={c.code} className="flex items-start gap-2">
            <span className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-[1px] border border-black/40" style={{ background: c.color }} />
            <div>
              <div className="text-[11px] text-ink leading-tight">{c.label}</div>
              {c.note && <div className="text-[10px] text-ink-faint leading-relaxed">{c.note}</div>}
            </div>
          </div>
        ))}
        {legend.note && <p className="text-[10px] leading-relaxed text-ink-faint pt-1">{legend.note}</p>}
      </div>
    );
  }
  if (legend.type === 'vector') {
    return (
      <div className="space-y-1">
        {legend.items.map((c) => (
          <div key={c.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[1px]"
              style={{
                background: c.color + '33',
                border: '1px ' + (c.passable ? 'dashed' : 'solid') + ' ' + c.color,
              }}
            />
            <span className="text-[11px] text-ink">{c.label}</span>
          </div>
        ))}
        {legend.note && <p className="text-[10px] leading-relaxed text-ink-faint pt-1">{legend.note}</p>}
      </div>
    );
  }
  return legend.note ? <p className="text-[10px] leading-relaxed text-ink-faint">{legend.note}</p> : null;
}

function LayerCard({ adapter }: { adapter: LayerAdapter }) {
  const state = useMission((s) => s.layers[adapter.id]);
  const toggleLayer = useMission((s) => s.toggleLayer);
  const setOpacity = useMission((s) => s.setLayerOpacity);
  const [open, setOpen] = useState(false);

  if (!state) return null;
  const controllable = adapter.mapRenderable;

  return (
    <div
      className={
        'border rounded-[2px] transition-colors ' +
        (state.visible && controllable ? 'border-line bg-deck-800/50' : 'border-line/50 bg-deck-900/40')
      }
    >
      <div className="flex items-start gap-2 px-2.5 py-2">
        {controllable ? (
          <div className="pt-[3px]">
            <Switch checked={state.visible} onChange={() => toggleLayer(adapter.id)} label={'Toggle ' + adapter.name} />
          </div>
        ) : (
          <div className="pt-[2px]">
            <Badge>chart</Badge>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 text-left cursor-pointer min-w-0"
          aria-expanded={open}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={'text-[12px] leading-tight ' + (state.visible ? 'text-ink' : 'text-ink-dim')}>
              {adapter.name}
            </span>
            <ProvenanceBadge provenance={adapter.provenance} />
          </div>
          <div className="text-[10px] text-ink-faint leading-tight mt-0.5 truncate">
            {adapter.mission + ' · ' + adapter.instrument}
          </div>
        </button>
        <span className="text-ink-faint text-[10px] pt-[2px] select-none">{open ? '−' : '+'}</span>
      </div>

      {controllable && state.visible && (
        <div className="px-2.5 pb-2">
          <div className="flex items-center gap-2">
            <span className="label shrink-0">opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.opacity}
              onChange={(e) => setOpacity(adapter.id, Number(e.target.value))}
              className="flex-1 cursor-pointer"
            />
            <span className="num text-[10px] text-ink-dim w-8 text-right">{Math.round(state.opacity * 100)}%</span>
          </div>
        </div>
      )}

      {open && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-line/50 space-y-2">
          <LegendBody legend={adapter.legend} />
          <div>
            <span className="label !text-ink-faint">how this layer was made</span>
            <p className="text-[10px] leading-relaxed text-ink-faint mt-0.5">{adapter.sourceNote}</p>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-line/40">
            <span className="num text-[9px] text-ink-faint">{adapter.credit}</span>
            {adapter.sourceUrl && (
              <a
                href={adapter.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="num text-[10px] text-probe-400 underline decoration-dotted hover:text-probe-500"
              >
                source ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LayerPanel() {
  const setOnlyBasemap = useMission((s) => s.setOnlyBasemap);
  const groups = groupedLayers();

  return (
    <Panel
      title="Data layers"
      right={
        <Button onClick={setOnlyBasemap} title="Hide every analysis layer">
          reset
        </Button>
      }
      dense
    >
      <div className="p-2 space-y-2">
        {groups.map(({ group, layers }) => (
          <section key={group} aria-label={group}>
            <h3 className="label pb-1 px-0.5">{group}</h3>
            <div className="space-y-1.5">
              {layers.map((a) => (
                <LayerCard key={a.id} adapter={a} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}
