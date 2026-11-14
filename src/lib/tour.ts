/**
 * The guided demo: a 60-second tour for judges and for the demo video.
 *
 * It drives the store directly rather than simulating clicks, so it cannot
 * desynchronise from the UI, and every beat is cancellable. The store state is
 * snapshotted before the tour and restored when it ends — however it ends.
 *
 * The beat list mirrors submission/demo-script.md. If one changes, change both.
 */

import type { Mode } from '../store/useMission';
import type { SuitModel } from './planner';

export interface TourBeat {
  /** seconds this beat holds */
  hold: number;
  caption: string;
  /** what the beat does; omitted for a pure hold */
  act?: (api: TourApi) => void;
}

export interface TourApi {
  setMode: (m: Mode) => void;
  probePoint: (p: { x: number; y: number }) => void;
  clearProbe: () => void;
  setWaypoints: (ids: string[]) => void;
  setSuit: (patch: Partial<SuitModel>) => void;
  setShowWalkBack: (v: boolean) => void;
  setFlying: (v: boolean) => void;
  setTraverseProgress: (v: number) => void;
  allWaypointIds: string[];
  lowerThreeIds: string[];
  aoiCentre: { x: number; y: number };
}

export const TOUR_BEATS: TourBeat[] = [
  {
    hold: 5,
    caption: 'Lower Mount Sharp — real HiRISE terrain, and the path Curiosity actually drove',
    act: (a) => {
      a.setMode('PLAN');
      a.clearProbe();
      a.setShowWalkBack(false);
      a.setSuit({ mobility: 'foot' });
      a.setWaypoints(a.lowerThreeIds);
    },
  },
  {
    hold: 6,
    caption: 'Click anywhere: every layer answers, each tagged REAL, DERIVED or MODELED',
    act: (a) => a.probePoint(a.aoiCentre),
  },
  {
    hold: 5,
    caption: 'Three stations on foot — 7.92 km, 4:51, 30% of consumables left. GO.',
    act: (a) => a.clearProbe(),
  },
  {
    hold: 6,
    caption: 'Add the upper stations and it fails — and it says exactly why',
    act: (a) => a.setWaypoints(a.allWaypointIds),
  },
  {
    hold: 6,
    caption: 'Walk-back: at every step, could the crew still reach safety with their reserve?',
    act: (a) => a.setShowWalkBack(true),
  },
  {
    hold: 6,
    caption: 'Rover-assisted — barred from steeper ground than the crew, so it drops them off',
    act: (a) => {
      a.setShowWalkBack(false);
      a.setSuit({ mobility: 'rover' });
    },
  },
  {
    hold: 7,
    caption: 'The same terrain in three dimensions, clipped to the real stereo footprint',
    act: (a) => {
      a.setMode('3D');
      a.setTraverseProgress(0);
    },
  },
  {
    hold: 8,
    caption: 'Fly the route the planner solved',
    act: (a) => a.setFlying(true),
  },
  {
    hold: 7,
    caption: 'And the crew sees the same plan from inside the helmet',
    act: (a) => {
      a.setFlying(false);
      a.setMode('HUD');
      a.setTraverseProgress(0.35);
    },
  },
  {
    hold: 4,
    caption: 'Every number here is computed from real NASA data. The DATA tab shows every source.',
    act: (a) => a.setMode('PLAN'),
  },
];

export const TOUR_SECONDS = TOUR_BEATS.reduce((a, b) => a + b.hold, 0);
