/**
 * Landing screen.
 *
 * The data loads behind it, so the CTA is instant by the time anyone reaches
 * for it — and the backdrop is the real HiRISE mosaic of the AOI, not stock
 * art. If loading fails, this is also where that gets said plainly instead of
 * leaving a spinner turning forever.
 */

import { AOI } from '../lib/geo';
import { useMission } from '../store/useMission';
import { TOUR_SECONDS } from '../lib/tour';

const BASE = import.meta.env.BASE_URL || '/';

export function Landing() {
  const booted = useMission((s) => s.booted);
  const stage = useMission((s) => s.bootStage);
  const error = useMission((s) => s.bootError);
  const start = useMission((s) => s.start);
  const startTour = useMission((s) => s.startTour);

  return (
    <div className="fixed inset-0 z-[1000] bg-void overflow-hidden">
      {/* real orbital imagery of the AOI, dimmed */}
      <div
        className="absolute inset-0 opacity-[0.42]"
        style={{
          backgroundImage: `url(${BASE}data/ortho/basemap.webp)`,
          backgroundSize: 'cover',
          backgroundPosition: '72% 35%',
          filter: 'contrast(1.1)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(100deg, #07080a 22%, rgba(7,8,10,0.86) 46%, rgba(7,8,10,0.35) 78%)' }}
        aria-hidden="true"
      />

      <div className="relative h-full flex items-center">
        <div className="w-[min(760px,92vw)] mx-auto sm:mx-0 sm:ml-[8vw] px-4">
          <div className="label !text-mars-400">NASA Space Apps Challenge 2026</div>
          <h1 className="font-mono text-[clamp(34px,7vw,72px)] leading-none tracking-[0.18em] text-mars-400 mt-3">
            MARSWALK
          </h1>
          <p className="text-[clamp(15px,2.2vw,20px)] leading-snug text-ink mt-4 max-w-[52ch]">
            Plan a Mars EVA across the ground Curiosity has actually driven — and prove the crew can
            always get home.
          </p>
          <p className="text-[13px] leading-relaxed text-ink-dim mt-3 max-w-[58ch]">
            {AOI.name}. Real HiRISE elevation and imagery, 1,039 surveyed rover positions, and a route
            planner that checks at every step whether the crew could abandon the EVA and still reach
            safety with their reserve intact.
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-7">
            <button
              type="button"
              onClick={start}
              disabled={!booted || !!error}
              className={
                'font-mono text-[12px] tracking-[0.16em] uppercase px-5 py-3 border rounded-[2px] transition-colors ' +
                (booted && !error
                  ? 'bg-mars-500/25 border-mars-400 text-mars-200 hover:bg-mars-500/40 cursor-pointer'
                  : 'bg-deck-800 border-line text-ink-faint cursor-wait')
              }
            >
              {error ? 'unavailable' : booted ? 'Start mission planning' : 'Loading…'}
            </button>
            <button
              type="button"
              onClick={() => {
                start();
                startTour();
              }}
              disabled={!booted || !!error}
              className={
                'font-mono text-[12px] tracking-[0.16em] uppercase px-4 py-3 border rounded-[2px] transition-colors ' +
                (booted && !error
                  ? 'bg-deck-800 border-line text-ink-dim hover:text-ink cursor-pointer'
                  : 'bg-deck-900 border-line/50 text-ink-faint cursor-wait')
              }
            >
              Guided demo · {TOUR_SECONDS}s
            </button>
          </div>

          <div className="mt-6 h-[2px] w-[min(420px,80vw)] bg-deck-700 overflow-hidden rounded-full">
            <div
              className={'h-full transition-[width] duration-300 ' + (error ? 'bg-danger' : 'bg-mars-400')}
              style={{ width: error ? '100%' : booted ? '100%' : '55%' }}
            />
          </div>
          <div className={'num text-[11px] mt-2 ' + (error ? 'text-danger' : 'text-ink-dim')}>
            {error ?? stage}
          </div>

          <p className="text-[10px] leading-relaxed text-ink-faint mt-8 max-w-[58ch]">
            Data: NASA/JPL-Caltech · NASA/JPL-Caltech/University of Arizona · USGS. Not affiliated with,
            endorsed by, or sponsored by NASA.
          </p>
        </div>
      </div>
    </div>
  );
}
