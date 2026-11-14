/** Display formatting for mission readouts. */

/** Local mean solar time as HH:MM on a 24 h 39 m sol. */
export function formatMLST(hour: number): string {
  const h = ((hour % 24.6597) + 24.6597) % 24.6597;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

/** Elapsed duration as H:MM. */
export function formatDuration(hours: number): string {
  const sign = hours < 0 ? '-' : '';
  const a = Math.abs(hours);
  const h = Math.floor(a);
  const m = Math.round((a - h) * 60);
  if (m === 60) return sign + (h + 1) + ':00';
  return sign + h + ':' + String(m).padStart(2, '0');
}

export function formatMinutes(hours: number): string {
  return (hours < 0 ? '-' : '') + Math.round(Math.abs(hours) * 60) + ' min';
}

export function formatDistance(metres: number): string {
  if (metres >= 1000) return (metres / 1000).toFixed(2) + ' km';
  return Math.round(metres) + ' m';
}

export function formatElev(m: number): string {
  return (m >= 0 ? '+' : '') + Math.round(m).toLocaleString('en-US') + ' m';
}
