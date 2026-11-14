/**
 * 2D layered planning map.
 *
 * Leaflet with CRS.Simple: the AOI is a planar frame in metres
 * (lat = northing, lng = easting), which is how Mars raster products at this
 * scale are delivered. No Earth datum, no web-Mercator distortion, and the
 * pixel grid maps 1:1 to the DEM the planner runs on.
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { AOI } from '../../lib/geo';
import { layerImageURL } from '../../lib/layerImage';
import { LAYER_IDS, mapLayers } from '../../data/config';
import { buildReturnField } from '../../lib/planner';
import { renderGridToDataURL } from '../../lib/raster';
import { useMission } from '../../store/useMission';
import { getHabitat, MISSION } from '../../data/real/science';

const AOI_BOUNDS = L.latLngBounds([0, 0], [AOI.sizeYM, AOI.sizeXM]);

function toLatLng(p: { x: number; y: number }): L.LatLngExpression {
  return [p.y, p.x];
}

export function MapView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<Map<string, L.Layer>>(new Map());
  const routeRef = useRef<L.LayerGroup | null>(null);
  const markerRef = useRef<L.LayerGroup | null>(null);
  const measureRef = useRef<L.LayerGroup | null>(null);
  const envelopeRef = useRef<L.ImageOverlay | null>(null);

  const layers = useMission((s) => s.layers);
  const layerData = useMission((s) => s.layerData);
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);
  const booted = useMission((s) => s.booted);
  const measureMode = useMission((s) => s.measureMode);
  const measureA = useMission((s) => s.measureA);
  const measureB = useMission((s) => s.measureB);
  const showWalkBack = useMission((s) => s.showWalkBack);
  const selectedWaypointId = useMission((s) => s.selectedWaypointId);
  const traverseProgress = useMission((s) => s.traverseProgress);

  /* ---------------------------------------------------------------- map init */
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = L.map(hostRef.current, {
      crs: L.CRS.Simple,
      minZoom: -3.4,
      maxZoom: 1.5,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: true,
      zoomControl: true,
      maxBounds: AOI_BOUNDS.pad(0.35),
      maxBoundsViscosity: 0.7,
    });
    map.fitBounds(AOI_BOUNDS, { padding: [12, 12] });
    map.attributionControl.setPrefix('');
    map.attributionControl.addAttribution(
      'AOI ' + (AOI.sizeXM / 1000).toFixed(2) + ' × ' + (AOI.sizeYM / 1000).toFixed(2) + ' km · Gale Crater, lower Mount Sharp · HiRISE DTM frame',
    );

    // One pane per layer so draw order follows the registry.
    mapLayers().forEach((a, i) => {
      const pane = map.createPane('layer-' + a.id);
      pane.style.zIndex = String(300 + i * 10);
    });
    const routePane = map.createPane('route');
    routePane.style.zIndex = '480';
    const markerPane = map.createPane('markers');
    markerPane.style.zIndex = '520';
    const envPane = map.createPane('envelope');
    envPane.style.zIndex = '460';

    routeRef.current = L.layerGroup([], { pane: 'route' }).addTo(map);
    markerRef.current = L.layerGroup([], { pane: 'markers' }).addTo(map);
    measureRef.current = L.layerGroup([], { pane: 'markers' }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const p = { x: e.latlng.lng, y: e.latlng.lat };
      if (p.x < 0 || p.y < 0 || p.x > AOI.sizeXM || p.y > AOI.sizeYM) return;
      const st = useMission.getState();
      if (st.measureMode) st.pushMeasurePoint(p);
      else st.probePoint(p);
    });

    // Leaflet caches its container size, so a layout change (rail collapsing at
    // the tablet breakpoint, window resize) leaves the map rendering at the old
    // size until it is told otherwise.
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(hostRef.current);

    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      overlayRef.current.clear();
    };
  }, []);

  /* ------------------------------------------------------------ raster layers */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !booted) return;

    for (const adapter of mapLayers()) {
      const data = layerData[adapter.id];
      const state = layers[adapter.id];
      if (!data || !state) continue;

      const key = adapter.id;
      let existing = overlayRef.current.get(key);

      if (data.type === 'raster-image' || data.type === 'raster-grid' || data.type === 'categorical-grid') {
        const url = layerImageURL(adapter.id, data, adapter.legend);
        if (!url) continue;
        if (!existing) {
          const ov = L.imageOverlay(url, AOI_BOUNDS, {
            pane: 'layer-' + adapter.id,
            opacity: state.opacity,
            className: data.type === 'categorical-grid' ? 'categorical-overlay' : undefined,
            interactive: false,
          });
          overlayRef.current.set(key, ov);
          existing = ov;
        }
        const ov = existing as L.ImageOverlay;
        ov.setOpacity(state.opacity);
        if (state.visible && !map.hasLayer(ov)) ov.addTo(map);
        if (!state.visible && map.hasLayer(ov)) map.removeLayer(ov);
      } else if (data.type === 'path') {
        // Curiosity's real driven traverse. Ground truth, drawn under the plan.
        if (!existing) {
          const group = L.layerGroup([], { pane: 'layer-' + adapter.id });
          for (const seg of data.segments) {
            if (seg.length < 2) continue;
            L.polyline(seg.map(toLatLng), {
              pane: 'layer-' + adapter.id,
              color: '#f2d06b',
              weight: 1.6,
              opacity: 0.9,
              interactive: false,
            }).addTo(group);
          }
          const sols = data.solRange;
          const tip =
            '<div style="font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.08em;color:#f2d06b">' +
            "CURIOSITY'S DRIVEN PATH</div>" +
            '<div style="font-size:11px;color:#9aa3b2;margin-top:3px;max-width:230px;line-height:1.45">' +
            (sols ? 'Sols ' + sols[0] + '–' + sols[1] + '. ' : '') +
            'Surveyed rover positions from NASA MMGIS — a route a real vehicle drove.</div>';
          const hit = L.polyline(
            (data.segments[0] ?? []).map(toLatLng),
            { pane: 'layer-' + adapter.id, color: 'transparent', weight: 12 },
          );
          hit.bindTooltip(tip, { className: 'mw-tip', sticky: true, opacity: 1 });
          hit.addTo(group);
          overlayRef.current.set(key, group);
          existing = group;
        }
        const group = existing as L.LayerGroup;
        group.eachLayer((l) => {
          const pl = l as L.Polyline;
          if ((pl.options as L.PolylineOptions).color === 'transparent') return;
          pl.setStyle({ opacity: state.opacity });
        });
        if (state.visible && !map.hasLayer(group)) group.addTo(map);
        if (!state.visible && map.hasLayer(group)) map.removeLayer(group);
      }
    }
  }, [booted, layerData, layers]);

  /* ------------------------------------------- return-to-safety isochrone field */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !booted) return;

    if (envelopeRef.current) {
      map.removeLayer(envelopeRef.current);
      envelopeRef.current = null;
    }
    if (!showWalkBack) return;

    // In rover mode, reaching the rover ends the emergency - it drives the crew
    // home - so every drop-off counts as a safe haven alongside the habitat.
    const havens: { label: string; point: { x: number; y: number } }[] = [
      { label: 'Habitat', point: getHabitat() },
    ];
    for (const d of plan?.dropOffs ?? []) {
      havens.push({ label: 'Rover at ' + d.stationCode, point: d.point });
    }

    const field = buildReturnField(suit, havens);
    const usable = suit.evaBudgetH * (1 - suit.reserveFraction);
    const BAND_H = 0.5;
    const ramp = [
      [90, 214, 232],
      [61, 220, 151],
      [200, 214, 90],
      [242, 181, 58],
      [239, 120, 60],
    ];

    const url = renderGridToDataURL(field.grid, field.grid, (i, out, o) => {
      const c = field.consumablesH[i];
      if (!isFinite(c)) {
        out[o] = 90;
        out[o + 1] = 94;
        out[o + 2] = 104;
        out[o + 3] = 120;
        return;
      }
      if (c > usable) {
        out[o] = 239;
        out[o + 1] = 68;
        out[o + 2] = 68;
        out[o + 3] = 150;
        return;
      }
      const band = Math.min(ramp.length - 1, Math.floor(field.timeH[i] / BAND_H));
      const col = ramp[band];
      out[o] = col[0];
      out[o + 1] = col[1];
      out[o + 2] = col[2];
      out[o + 3] = band % 2 === 0 ? 34 : 64;
    });

    const ov = L.imageOverlay(url, AOI_BOUNDS, { pane: 'envelope', opacity: 0.9, interactive: false });
    ov.addTo(map);
    envelopeRef.current = ov;
  }, [booted, showWalkBack, suit, plan]);

  /* ---------------------------------------------------------------- the route */
  useEffect(() => {
    const group = routeRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    if (!plan || plan.samples.length < 2) return;

    // Break the line wherever the walk-back verdict OR the mobility mode
    // changes, so it is obvious at a glance which stretches are driven and
    // which are walked.
    let run: L.LatLngExpression[] = [toLatLng(plan.samples[0].point)];
    let runOk = plan.samples[0].walkBackOk;
    let runMode = plan.samples[0].mode;

    const flush = () => {
      if (run.length < 2) return;
      const color = runOk ? (runMode === 'rover' ? '#5ad6e8' : '#ff8f4d') : '#ef4444';
      L.polyline(run, {
        pane: 'route',
        color,
        weight: runMode === 'rover' ? 4 : 2.6,
        opacity: 0.95,
        dashArray: runMode === 'foot' && plan.mobility === 'rover' ? '5 4' : undefined,
      }).addTo(group);
      L.polyline(run, { pane: 'route', color, weight: 9, opacity: 0.14 }).addTo(group);
    };

    for (let i = 1; i < plan.samples.length; i++) {
      const s = plan.samples[i];
      if (s.walkBackOk !== runOk || s.mode !== runMode) {
        run.push(toLatLng(s.point));
        flush();
        run = [toLatLng(s.point)];
        runOk = s.walkBackOk;
        runMode = s.mode;
      } else {
        run.push(toLatLng(s.point));
      }
    }
    flush();

    const idx = Math.min(plan.samples.length - 1, Math.round(traverseProgress * (plan.samples.length - 1)));
    const cur = plan.samples[idx];
    L.circleMarker(toLatLng(cur.point), {
      pane: 'route',
      radius: 5,
      color: '#ffffff',
      weight: 2,
      fillColor: cur.mode === 'rover' ? '#5ad6e8' : '#ff8f4d',
      fillOpacity: 1,
    }).addTo(group);
  }, [plan, traverseProgress]);

  /* -------------------------------------------------------------- the markers */
  useEffect(() => {
    const group = markerRef.current;
    if (!group) return;
    group.clearLayers();

    const sci = layerData[LAYER_IDS.science];
    const visible = layers[LAYER_IDS.science]?.visible;
    const order = useMission.getState().waypointOrder;

    const hab = plan?.stations[0]?.point ?? getHabitat();
    {
      const icon = L.divIcon({
        className: '',
        html:
          '<div style="transform:translate(-50%,-50%);display:flex;align-items:center;gap:6px">' +
          '<div style="width:14px;height:14px;border:2px solid #3ddc97;background:#0b0d11;transform:rotate(45deg)"></div>' +
          '<div style="font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.12em;color:#3ddc97;white-space:nowrap;text-shadow:0 0 6px #000">HAB</div>' +
          '</div>',
        iconSize: [0, 0],
      });
      L.marker(toLatLng(hab), { icon, pane: 'markers' })
        .bindTooltip(MISSION.habitatName, { className: 'mw-tip', direction: 'top' })
        .addTo(group);
    }

    // Rover drop-offs: where the vehicle could go no further and the crew walked.
    for (const d of plan?.dropOffs ?? []) {
      const icon = L.divIcon({
        className: '',
        html:
          '<div style="transform:translate(-50%,-50%);display:flex;align-items:center;gap:5px">' +
          '<div style="width:11px;height:11px;border:2px solid #5ad6e8;border-radius:2px;background:#0b0d11"></div>' +
          '<div style="font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.1em;color:#5ad6e8;white-space:nowrap;text-shadow:0 0 6px #000">DROP</div>' +
          '</div>',
        iconSize: [0, 0],
      });
      L.marker(toLatLng(d.point), { icon, pane: 'markers' })
        .bindTooltip(
          '<div style="font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.08em;color:#5ad6e8">ROVER DROP-OFF &middot; ' +
            d.stationCode +
            '</div><div style="font-size:11px;color:#9aa3b2;margin-top:3px;max-width:220px;line-height:1.45">' +
            MISSION.roverSupport.name +
            ' can go no further. The crew walks the last ' +
            Math.round(d.walkM) +
            ' m, and the rover waits here as the safe haven.</div>',
          { className: 'mw-tip', direction: 'top', opacity: 1 },
        )
        .addTo(group);
    }

    if (!sci || sci.type !== 'points' || !visible) return;

    for (const p of sci.points) {
      const inPlan = order.indexOf(p.id);
      const station = plan?.stations.find((s) => s.id === p.id);
      const bad = station ? !station.walkBackOk : false;
      const selected = selectedWaypointId === p.id;
      const color = bad ? '#ef4444' : inPlan >= 0 ? '#ff8f4d' : '#616b7c';
      const icon = L.divIcon({
        className: '',
        html:
          '<div style="transform:translate(-50%,-50%);display:flex;align-items:center;gap:5px;' +
          (selected ? 'filter:drop-shadow(0 0 8px ' + color + ')' : '') +
          '">' +
          '<div style="position:relative;width:12px;height:12px;border-radius:50%;border:2px solid ' +
          color +
          ';background:' +
          (inPlan >= 0 ? color : 'transparent') +
          ';box-shadow:0 0 0 2px #07080a"></div>' +
          '<div style="font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.1em;color:' +
          color +
          ';white-space:nowrap;text-shadow:0 0 6px #000">' +
          p.code +
          '</div></div>',
        iconSize: [0, 0],
      });
      const m = L.marker(toLatLng(p.position), { icon, pane: 'markers', riseOnHover: true });
      m.bindTooltip(
        '<div style="font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.08em;color:' +
          color +
          '">' +
          p.code +
          ' &middot; ' +
          p.title.toUpperCase() +
          '</div><div style="font-size:11px;color:#9aa3b2;margin-top:3px">' +
          p.targetMineral +
          ' &middot; ' +
          p.taskMinutes +
          ' min on station</div>',
        { className: 'mw-tip', direction: 'top', opacity: 1 },
      );
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        useMission.getState().selectWaypoint(p.id);
        useMission.getState().probePoint(p.position);
      });
      m.addTo(group);
    }
  }, [plan, layerData, layers, selectedWaypointId]);

  /* ---------------------------------------------------------- measure overlay */
  useEffect(() => {
    const group = measureRef.current;
    if (!group) return;
    group.clearLayers();
    const pts = [measureA, measureB].filter(Boolean) as { x: number; y: number }[];
    for (const p of pts) {
      L.circleMarker(toLatLng(p), {
        pane: 'markers',
        radius: 3.5,
        color: '#5ad6e8',
        weight: 2,
        fillColor: '#07080a',
        fillOpacity: 1,
      }).addTo(group);
    }
    if (measureA && measureB) {
      L.polyline([toLatLng(measureA), toLatLng(measureB)], {
        pane: 'markers',
        color: '#5ad6e8',
        weight: 1.5,
        dashArray: '5 4',
      }).addTo(group);
    }
  }, [measureA, measureB]);

  /* ------------------------------------------------------------ cursor style */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.style.cursor = measureMode ? 'crosshair' : '';
  }, [measureMode]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
