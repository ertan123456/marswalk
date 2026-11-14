/**
 * English is the source dictionary.
 *
 * Every other locale is typed as `Record<Key, string>` against this file, so a
 * missing or stale translation is a compile error rather than a string that
 * silently falls back to English in front of a judge.
 *
 * Keys read as `area.thing`. Placeholders are `{name}` and are substituted by
 * `t()`; keep them identical across locales or the value will print literally.
 */

export const en = {
  // --- shell -------------------------------------------------------------
  'app.tagline': 'EVA planner',
  'app.place': 'Gale Crater — Lower Mount Sharp',
  'app.sol': 'sol {n}',
  'app.window': 'window',
  'app.status': 'status',
  'app.guidedDemo': 'guided demo',
  'app.language': 'Language',
  'app.languageEnglish': 'English',
  'app.languageTurkish': 'Türkçe',

  'mode.plan': 'PLAN',
  'mode.3d': '3D',
  'mode.hud': 'HUD',
  'mode.briefing': 'BRIEFING',
  'mode.data': 'DATA',
  'mode.planTitle': 'Habitat planning display',
  'mode.3dTitle': 'Terrain in three dimensions',
  'mode.hudTitle': "The crew's visor",
  'mode.briefingTitle': 'Mission briefing',
  'mode.dataTitle': 'Sources and provenance',

  // --- rails and panels --------------------------------------------------
  'rail.layers': 'layers',
  'rail.instruments': 'instruments',
  'rail.leftLabel': 'Left rail contents',
  'rail.drawerLabel': 'Drawer contents',
  'rail.planLabel': 'Plan rail contents',
  'rail.stations': 'stations',
  'rail.charts': 'charts',
  'rail.ai': 'ai',

  'panel.dataLayers': 'Data layers',
  'panel.reset': 'reset',
  'panel.resetTitle': 'Hide every analysis layer',
  'panel.opacity': 'opacity',
  'panel.howMade': 'how this layer was made',
  'panel.source': 'source ↗',
  'panel.notShaded': ' — not shaded',
  'panel.chart': 'chart',

  'map.measure': 'measure',
  'map.measureTitle': 'Measure distance and cut an elevation profile',
  'map.label': 'Planning map',
  'map.layersTitle': 'Show the data layers and instruments',
  'map.planTitle': 'Show the EVA plan and Mission AI',
  'map.close': 'close',
  'map.closeTitle': 'Close this panel (Esc)',

  // --- plan --------------------------------------------------------------
  'plan.title': 'EVA traverse',
  'plan.solving': 'solving',
  'plan.traverse': 'traverse',
  'plan.duration': 'EVA duration',
  'plan.consumablesLeft': 'consumables left',
  'plan.dose': 'EVA dose',
  'plan.airlockOut': 'airlock out',
  'plan.airlockIn': 'airlock in',
  'plan.onFoot': 'on foot',
  'plan.roverAssisted': 'rover-assisted',
  'plan.driven': '{d} driven',
  'plan.walked': '{d} walked',
  'plan.noDismount': 'no dismount needed',
  'plan.flightRule': 'flight rule',
  'plan.spe': 'space weather mitigation',
  'plan.scienceStations': 'Science stations',
  'plan.elevationProfile': 'Elevation profile',
  'plan.walkBack': 'Walk-back check',
  'plan.charts': 'Charts',
  'plan.chartsEmpty': 'Charts appear once a route is solved. Add at least one station.',
  'plan.walkBackNote':
    'The crew must be able to abandon the EVA at any instant and reach a safe haven with the {pct}% reserve untouched. Where the red line rises above the green one, that is no longer true.',
  'station.arrive': 'arrive',
  'station.leg': 'leg',
  'station.dropOff': 'rover drop-off',
  'station.onStation': 'on station',
  'station.consumablesAtDepart': 'consumables at depart',
  'station.walkBackMargin': 'walk-back margin',
  'station.returnToHaven': 'return to haven',
  'plan.targetBrief': 'Target brief · {code}',

  'layer.optical-base': 'Orbital basemap',
  'layer.dem-elevation': 'Elevation (DTM)',
  'layer.dem-slope': 'Slope',
  'layer.mobility-hazards': 'Mobility hazards',
  'layer.geochem-units': 'Geochemical units',
  'layer.science-regions': 'Science regions',
  'layer.science-waypoints': 'Science waypoints',
  'layer.curiosity-traverse': "Curiosity's driven path",
  'layer.rad-dose-rate': 'Radiation dose rate',
  'layer.rems-weather': 'Surface weather',

  'group.Base': 'Base',
  'group.Terrain': 'Terrain',
  'group.Geology & Minerals': 'Geology & minerals',
  'group.Safety': 'Safety',
  'group.Environment': 'Environment',

  'plan.traverseRover': 'traverse (driven + walked)',
  'plan.traverseHint': '{driven} driven, {foot} on foot',
  'plan.consumablesHint': 'Budget {budget} h at nominal workload; reserve {reserve}%',

  'verdict.go': 'GO',
  'verdict.noGo': 'NO-GO',
  'verdict.goDetail': 'All flight rules satisfied for the planned window.',

  // --- mission ai --------------------------------------------------------
  'ai.title': 'Mission AI',
  'ai.localAnalyst': 'local analyst',
  'ai.localAnalystTitle': 'Deterministic analysis computed in the browser from the solved plan',
  'ai.modelTitle': 'Answered by a local language model ({model})',
  'ai.ask': 'ask',
  'ai.thinking': 'thinking…',
  'ai.limitReached': 'limit reached',
  'ai.placeholder': 'Ask about the route, the walk-back, the data…',
  'ai.placeholderSpent': 'Daily limit reached',
  'ai.inputLabel': 'Ask Mission AI about the plan',
  'ai.askTitle': 'Ask Mission AI (Enter)',
  'ai.remaining': '{n}/{total} today',
  'ai.safety': 'safety {n}/100',
  'ai.riskLow': 'LOW risk',
  'ai.riskMedium': 'MEDIUM risk',
  'ai.riskHigh': 'HIGH risk',
  'ai.standingNote':
    'Every distance, consumable figure, walk-back margin and verdict is computed by the planner, not by a model — the assistant only explains them. The deterministic analyst runs in the browser and is always available; a local Ollama model is used instead when one is reachable, which on the published static site it is not.',

  'rail.science': 'science',

  // --- investigations ----------------------------------------------------
  'inv.title': 'Which investigation, and where',
  'inv.intro':
    'Pick an investigation and the EVA is re-timed around it: the crew spends as long as that work takes at every station that has ground to work on. The distances below are measured from the CRISM unit map, not written by hand.',
  'inv.loading': 'Waiting for the geochemistry layer…',
  'inv.clear': 'clear',
  'inv.clearTitle': 'Plan each station for its own purpose again',
  'inv.minPerStation': 'min/station',
  'inv.groundArea': '{km2} km² of qualifying ground in the AOI',
  'inv.noStation':
    'No station has qualifying ground within {m} m. This investigation cannot be done on this traverse.',
  'inv.caveat':
    'No station stands on a mapped unit. The stations are where Curiosity was surveyed; the units are where CRISM shows a spectral outlier. The distance shown is how far off-station the crew must walk, and {m} m is the limit beyond which a target counts as unsupported.',
  'inv.provenance':
    'Units cover {pct}% of the AOI, at {k} robust standard deviations above each scene’s own background. The task durations are ours, not NASA’s.',

  'inv.onTraverse': 'On the planned traverse: this investigation re-times it',
  'inv.offTraverse': 'Not on the planned traverse',
  'inv.addStation':
    'None of these stations is on the planned traverse, so choosing this investigation re-times nothing. Add one of them under stations first.',

  'inv.clay.label': 'Clay mineralogy',
  'inv.clay.question': 'Did water stand here long enough to alter the rock?',
  'inv.clay.rationale':
    'Drill, handle and analyse a sample. Smectite cannot be confirmed from a stand-off image, which is why this is the long one.',
  'inv.tuff.label': 'Tuff alteration',
  'inv.tuff.question': 'Was this volcanic ash, and what did water do to it?',
  'inv.tuff.rationale':
    'Brush, image close, then drill. Opaline silica and Al-OH sit in thin alteration rinds, so the surface has to come off before the measurement means anything.',
  'inv.riverbed.label': 'River-bed sedimentology',
  'inv.riverbed.question': 'Did water flow here, and which way?',
  'inv.riverbed.rationale':
    'Bedding and grain size are read from imaging and contact work, with no drill. The answer is in the structure rather than the chemistry.',
  'inv.sulfate.label': 'Sulfate stratigraphy',
  'inv.sulfate.question': 'When did the water dry up?',
  'inv.sulfate.rationale':
    'Brush and point-spectrometer a measured section. Several observations per station, which is why it runs longer than plain imaging.',
  'inv.hydration.label': 'Hydration survey',
  'inv.hydration.question': 'What is the bound water attached to?',
  'inv.hydration.rationale':
    'A fast spectrometer pass at each stop. Deliberately short: it is a survey meant to cover many stations, not to settle any one of them.',
  'inv.mafic.label': 'Mafic provenance',
  'inv.mafic.question': 'Where did this material come from?',
  'inv.mafic.rationale':
    'Imaging and a hand sample. Pyroxene and olivine are identifiable without drilling, so this is the cheapest investigation on the list.',

  // --- thermal -----------------------------------------------------------
  'plan.coldCost': 'cold cost',
  'plan.coldCostHint':
    'Suit heating, charged to the same budget as everything else: {soak} min warming a cold-soaked suit at egress, the rest heating it en route. Air {start}°C at airlock-out, {end}°C at ingress. Modelled, not measured.',

  // --- landing -----------------------------------------------------------
  'landing.eyebrow': 'NASA Space Apps Challenge 2026',
  'landing.start': 'Start mission planning',
  'landing.demo': 'Guided demo · {n}s',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
