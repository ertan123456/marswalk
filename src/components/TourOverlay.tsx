/**
 * Caption bar for the guided demo.
 *
 * Sits above everything, says what the viewer is looking at, and shows how far
 * through the tour they are. Any click on it, or Escape, stops the tour and
 * restores the state it started from.
 */

import { useEffect, useState } from 'react';
import { TOUR_BEATS } from '../lib/tour';
import { useMission } from '../store/useMission';

export function TourOverlay() {
  const running = useMission((s) => s.tourRunning);
  const beat = useMission((s) => s.tourBeat);
  const caption = useMission((s) => s.tourCaption);
  const stopTour = useMission((s) => s.stopTour);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const t0 = performance.now();
    const id = window.setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
    return () => window.clearInterval(id);
  }, [running]);

  if (!running) return null;

  const total = TOUR_BEATS.reduce((a, b) => a + b.hold, 0);
  const pct = Math.min(100, (elapsed / total) * 100);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[900] flex justify-center p-3">
      <div className="pointer-events-auto w-[min(760px,94vw)] border border-mars-400/50 bg-void/95 backdrop-blur rounded-sm shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
        <div className="h-[2px] bg-deck-600">
          <div
            className="h-full bg-mars-400 transition-[width] duration-100 ease-linear"
            style={{ width: pct + '%' }}
          />
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="num text-[10px] text-mars-300 shrink-0 tabular-nums">
            {String(beat + 1).padStart(2, '0')}/{String(TOUR_BEATS.length).padStart(2, '0')}
          </span>
          <p className="flex-1 text-[13px] leading-snug text-ink">{caption}</p>
          <button
            type="button"
            onClick={stopTour}
            className="shrink-0 font-mono text-[10px] tracking-[0.14em] uppercase px-2.5 py-1.5 border border-line bg-deck-800 text-ink-dim hover:text-ink rounded-[2px] cursor-pointer"
          >
            stop · esc
          </button>
        </div>
      </div>
    </div>
  );
}
