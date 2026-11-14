import type { ReactNode } from 'react';

export function Panel({
  title,
  right,
  children,
  className = '',
  dense = false,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section
      className={
        'border border-line bg-deck-900/80 backdrop-blur-[2px] rounded-sm overflow-hidden ' + className
      }
    >
      {title && (
        <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-deck-800/60">
          <h2 className="label !text-ink-dim">{title}</h2>
          {right}
        </header>
      )}
      <div className={dense ? '' : 'p-3'}>{children}</div>
    </section>
  );
}

export function Readout({
  label,
  value,
  unit,
  tone = 'default',
  hint,
  size = 'md',
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'nominal' | 'caution' | 'danger' | 'accent';
  hint?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const toneClass =
    tone === 'nominal'
      ? 'text-nominal'
      : tone === 'caution'
        ? 'text-caution'
        : tone === 'danger'
          ? 'text-danger'
          : tone === 'accent'
            ? 'text-mars-300'
            : 'text-ink';
  const sizeClass = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg';
  return (
    <div title={hint}>
      <div className="label">{label}</div>
      <div className={'num ' + sizeClass + ' ' + toneClass + ' leading-tight'}>
        {value}
        {unit && <span className="text-ink-faint text-[0.62em] ml-1">{unit}</span>}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = 'default',
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'mock' | 'nominal' | 'caution' | 'danger' | 'accent';
  title?: string;
}) {
  const map = {
    default: 'border-line text-ink-faint',
    mock: 'border-caution/50 text-caution bg-caution/10',
    nominal: 'border-nominal/50 text-nominal bg-nominal/10',
    caution: 'border-caution/50 text-caution bg-caution/10',
    danger: 'border-danger/50 text-danger bg-danger/10',
    accent: 'border-mars-400/50 text-mars-300 bg-mars-500/10',
  } as const;
  return (
    <span
      title={title}
      className={
        'inline-flex items-center shrink-0 border rounded-[2px] px-1.5 py-[1px] font-mono text-[9px] tracking-[0.12em] uppercase ' +
        map[tone]
      }
    >
      {children}
    </span>
  );
}

export function MockBadge({ isMock }: { isMock: boolean }) {
  if (!isMock) return <Badge tone="nominal" title="Live mission data">LIVE</Badge>;
  return (
    <Badge tone="mock" title="Synthetic stand-in. Swap the adapter to go live — see DATA_TODO.md">
      Mock data
    </Badge>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        'relative h-[14px] w-[26px] shrink-0 rounded-full border transition-colors cursor-pointer ' +
        (checked ? 'bg-mars-500/70 border-mars-400' : 'bg-deck-600 border-line')
      }
    >
      <span
        className={
          'absolute top-[1px] h-[10px] w-[10px] rounded-full bg-ink transition-transform ' +
          (checked ? 'translate-x-[13px]' : 'translate-x-[1px]')
        }
      />
    </button>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label">{label}</span>
        <span className="num text-xs text-ink">
          {format ? format(value) : value}
          {unit && <span className="text-ink-faint ml-0.5">{unit}</span>}
        </span>
      </span>
      <input
        type="range"
        className="w-full mt-1.5 cursor-pointer"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Button({
  children,
  onClick,
  active = false,
  tone = 'default',
  className = '',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  tone?: 'default' | 'accent' | 'danger';
  className?: string;
  title?: string;
}) {
  const base =
    'font-mono text-[10px] tracking-[0.12em] uppercase px-2.5 py-1.5 border rounded-[2px] transition-colors cursor-pointer whitespace-nowrap';
  const style = active
    ? 'bg-mars-500/25 border-mars-400 text-mars-300'
    : tone === 'accent'
      ? 'bg-mars-500/15 border-mars-500/60 text-mars-300 hover:bg-mars-500/25'
      : tone === 'danger'
        ? 'bg-danger/10 border-danger/50 text-danger hover:bg-danger/20'
        : 'bg-deck-800 border-line text-ink-dim hover:bg-deck-700 hover:text-ink';
  return (
    <button type="button" title={title} onClick={onClick} className={base + ' ' + style + ' ' + className}>
      {children}
    </button>
  );
}

export function Alert({
  tone,
  title,
  children,
}: {
  tone: 'caution' | 'danger' | 'nominal';
  title: string;
  children?: ReactNode;
}) {
  const map = {
    caution: 'border-caution/45 bg-caution/8 text-caution',
    danger: 'border-danger/45 bg-danger/8 text-danger',
    nominal: 'border-nominal/40 bg-nominal/8 text-nominal',
  } as const;
  return (
    <div className={'border-l-2 border rounded-[2px] px-2.5 py-2 ' + map[tone]}>
      <div className="font-mono text-[10px] tracking-[0.12em] uppercase">{title}</div>
      {children && <div className="text-[11px] leading-relaxed mt-1 text-ink-dim">{children}</div>}
    </div>
  );
}

export function KeyVal({ k, v, tone }: { k: string; v: ReactNode; tone?: 'danger' | 'caution' | 'nominal' }) {
  const t =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'caution'
        ? 'text-caution'
        : tone === 'nominal'
          ? 'text-nominal'
          : 'text-ink';
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px] border-b border-line/40 last:border-0">
      <span className="text-[11px] text-ink-faint shrink-0">{k}</span>
      <span className={'num text-[11px] text-right ' + t}>{v}</span>
    </div>
  );
}
