/**
 * Shared 3D scene: DEM mesh, draped layer texture, traverse line, markers.
 *
 * The orbit view and the helmet HUD render the same scene with different
 * cameras, so what the crew sees in the visor is the same terrain the planner
 * routed across.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { AOI } from '../../lib/geo';
import type { LocalPoint } from '../../lib/geo';
import { getTerrain } from '../../data/mock/terrain';
import { getHazards } from '../../data/mock/hazards';
import { layerImageURL } from '../../lib/layerImage';
import { getAdapter } from '../../data/config';
import { useMission } from '../../store/useMission';

/** Mesh resolution: every other DEM post, which is plenty at this scale. */
const MESH_SEG = 255;
const EYE_HEIGHT_M = 1.72;

/** AOI-local metres -> three.js world (X east, Y up, Z south). */
export function toWorld(p: LocalPoint, elevation: number, exag: number, base: number): THREE.Vector3 {
  return new THREE.Vector3(p.x - AOI.sizeM / 2, (elevation - base) * exag, AOI.sizeM / 2 - p.y);
}

function useDrapeTexture(layerId: string): THREE.Texture | null {
  const layerData = useMission((s) => s.layerData);
  return useMemo(() => {
    const adapter = getAdapter(layerId);
    const data = layerData[layerId];
    if (!adapter || !data) return null;
    const url = layerImageURL(layerId, data, adapter.legend);
    if (!url) return null;
    const tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [layerId, layerData]);
}

function Terrain({ exag, base }: { exag: number; base: number }) {
  const drapeLayerId = useMission((s) => s.drapeLayerId);
  const texture = useDrapeTexture(drapeLayerId);

  const geometry = useMemo(() => {
    const t = getTerrain();
    const geo = new THREE.PlaneGeometry(AOI.sizeM, AOI.sizeM, MESH_SEG, MESH_SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const n = MESH_SEG + 1;
    const stride = (t.grid - 1) / MESH_SEG;
    for (let row = 0; row < n; row++) {
      const gr = Math.min(t.grid - 1, Math.round(row * stride));
      for (let col = 0; col < n; col++) {
        const gc = Math.min(t.grid - 1, Math.round(col * stride));
        pos.setY(row * n + col, (t.elevation[gr * t.grid + gc] - base) * exag);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [exag, base]);

  return (
    <mesh geometry={geometry} receiveShadow>
      {texture ? (
        <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
      ) : (
        <meshStandardMaterial color="#8a6a4f" roughness={1} metalness={0} />
      )}
    </mesh>
  );
}

function TraverseLine({ exag, base }: { exag: number; base: number }) {
  const plan = useMission((s) => s.plan);

  const runs = useMemo(() => {
    if (!plan || plan.samples.length < 2) return [];
    const out: { points: [number, number, number][]; ok: boolean }[] = [];
    let cur: [number, number, number][] = [];
    let ok = plan.samples[0].walkBackOk;
    const step = Math.max(1, Math.floor(plan.samples.length / 900));
    for (let i = 0; i < plan.samples.length; i += step) {
      const s = plan.samples[i];
      const v = toWorld(s.point, s.elevation, exag, base);
      if (s.walkBackOk !== ok && cur.length > 1) {
        cur.push([v.x, v.y + 2.5, v.z]);
        out.push({ points: cur, ok });
        cur = [];
        ok = s.walkBackOk;
      }
      cur.push([v.x, v.y + 2.5, v.z]);
    }
    if (cur.length > 1) out.push({ points: cur, ok });
    return out;
  }, [plan, exag, base]);

  return (
    <group>
      {runs.map((r, i) => (
        <group key={i}>
          <Line points={r.points} color={r.ok ? '#5ad6e8' : '#ef4444'} lineWidth={2.5} />
          <Line points={r.points} color={r.ok ? '#5ad6e8' : '#ef4444'} lineWidth={9} transparent opacity={0.16} />
        </group>
      ))}
    </group>
  );
}

function HazardOutlines({ exag, base }: { exag: number; base: number }) {
  const t = getTerrain();
  const rings = useMemo(() => {
    return getHazards()
      .filter((f) => !f.passable)
      .slice(0, 8)
      .map((f) => {
        const step = Math.max(1, Math.floor(f.ring.length / 160));
        const pts: [number, number, number][] = [];
        for (let i = 0; i < f.ring.length; i += step) {
          const p = f.ring[i];
          const col = Math.min(t.grid - 1, Math.max(0, Math.floor((p.x / AOI.sizeM) * t.grid)));
          const row = Math.min(t.grid - 1, Math.max(0, Math.floor(((AOI.sizeM - p.y) / AOI.sizeM) * t.grid)));
          const v = toWorld(p, t.elevation[row * t.grid + col], exag, base);
          pts.push([v.x, v.y + 1.5, v.z]);
        }
        if (pts.length > 1) pts.push(pts[0]);
        return pts;
      })
      .filter((p) => p.length > 2);
  }, [exag, base, t]);

  return (
    <group>
      {rings.map((pts, i) => (
        <Line key={i} points={pts} color="#ef4444" lineWidth={1.4} transparent opacity={0.72} />
      ))}
    </group>
  );
}

/**
 * A station marker that holds a roughly constant screen size: the same marker
 * has to read from 3.5 km up in the orbit view and from 20 m away on the walk.
 */
function Marker({
  position,
  color,
  code,
  onSelect,
}: {
  position: THREE.Vector3;
  color: string;
  code: string;
  onSelect: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    const d = camera.position.distanceTo(position);
    g.scale.setScalar(Math.min(36, Math.max(3.4, d * 0.0102)));
  });

  return (
    <group ref={ref} position={[position.x, position.y, position.z]}>
      <mesh position={[0, 1.35, 0]} onClick={onSelect}>
        <octahedronGeometry args={[0.5, 0]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Line
        points={[
          [0, 0, 0],
          [0, 1.35, 0],
        ]}
        color={color}
        lineWidth={1.6}
        transparent
        opacity={0.85}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.76, 0.9, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[0, 2.1, 0]} center zIndexRange={[20, 0]}>
        <div
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.14em',
            color,
            textShadow: '0 0 8px #000, 0 0 3px #000',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {code}
        </div>
      </Html>
    </group>
  );
}

function StationMarkers({ exag, base }: { exag: number; base: number }) {
  const plan = useMission((s) => s.plan);
  const selectWaypoint = useMission((s) => s.selectWaypoint);
  if (!plan) return null;

  return (
    <group>
      {plan.stations.map((s, i) => {
        const v = toWorld(s.point, plan.samples[s.sampleIndex]?.elevation ?? 0, exag, base);
        const isHab = s.kind === 'habitat';
        const color = isHab ? '#3ddc97' : s.walkBackOk ? '#ff8f4d' : '#ef4444';
        return (
          <Marker
            key={s.id + i}
            position={v}
            color={color}
            code={s.code}
            onSelect={() => selectWaypoint(isHab ? null : s.id)}
          />
        );
      })}
    </group>
  );
}

/** Butterscotch Martian sky: a dusty gradient dome with a low sun. */
function Sky() {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#5c5560') },
        mid: { value: new THREE.Color('#bd9070') },
        bottom: { value: new THREE.Color('#ecc8a0') },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
        varying vec3 vPos;
        void main() {
          float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
          vec3 c = h < 0.52
            ? mix(bottom, mid, smoothstep(0.30, 0.52, h))
            : mix(mid, top, smoothstep(0.52, 0.86, h));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
  }, []);
  return (
    <mesh material={material} scale={[1, 1, 1]}>
      <sphereGeometry args={[9000, 32, 20]} />
    </mesh>
  );
}

/** Drives the camera along the traverse at walking height. */
function FlyThrough({ exag, base, firstPerson }: { exag: number; base: number; firstPerson: boolean }) {
  const { camera } = useThree();
  const plan = useMission((s) => s.plan);
  const flying = useMission((s) => s.flying);
  const progress = useMission((s) => s.traverseProgress);
  const setProgress = useMission((s) => s.setTraverseProgress);
  const setFlying = useMission((s) => s.setFlying);
  const lastRef = useRef(progress);

  useFrame((_, delta) => {
    if (!plan || plan.samples.length < 2) return;

    if (flying) {
      const next = progress + delta / 55; // whole traverse in ~55 s
      if (next >= 1) {
        setProgress(1);
        setFlying(false);
      } else {
        setProgress(next);
      }
    }

    if (!firstPerson && !flying) return;

    const n = plan.samples.length;
    const p = useMission.getState().traverseProgress;
    const i = Math.min(n - 1, Math.round(p * (n - 1)));
    const ahead = plan.samples[Math.min(n - 1, i + Math.max(4, Math.round(n * 0.012)))];
    const cur = plan.samples[i];

    const eye = toWorld(cur.point, cur.elevation, exag, base);
    eye.y += EYE_HEIGHT_M * exag;
    const look = toWorld(ahead.point, ahead.elevation, exag, base);
    look.y += EYE_HEIGHT_M * exag;

    if (firstPerson) {
      camera.position.lerp(eye, lastRef.current === p ? 1 : 0.35);
      camera.lookAt(look);
    } else {
      // Chase camera: far enough back and high enough that the horizon stays in
      // frame, otherwise the fly-through is just a close-up of the dirt.
      const far = plan.samples[Math.min(n - 1, i + Math.max(10, Math.round(n * 0.035)))];
      const target = toWorld(far.point, far.elevation, exag, base);
      const back = eye.clone().sub(look).normalize().multiplyScalar(240);
      const chase = eye.clone().add(back);
      chase.y += 150;
      camera.position.lerp(chase, 0.07);
      camera.lookAt(target);
    }
    lastRef.current = p;
  });

  return null;
}

export function MarsScene({ firstPerson = false }: { firstPerson?: boolean }) {
  const exag = useMission((s) => s.exaggeration);
  const t = getTerrain();
  const base = t.minElev;
  const { camera } = useThree();

  useEffect(() => {
    if (firstPerson) {
      const cam = camera as THREE.PerspectiveCamera;
      cam.fov = 78; // helmet visor field of view
      cam.near = 0.5;
      cam.far = 14000;
      cam.updateProjectionMatrix();
    }
  }, [camera, firstPerson]);

  return (
    <>
      <Sky />
      <fogExp2 attach="fog" args={[0xc9a37f, firstPerson ? 0.00032 : 0.00008]} />
      <hemisphereLight args={[0xd9b48f, 0x3a2a22, 1.05]} />
      <directionalLight position={[-2600, 2100, -2600]} intensity={1.25} color={0xfff0dd} />
      <ambientLight intensity={0.28} />
      <Terrain exag={exag} base={base} />
      <HazardOutlines exag={exag} base={base} />
      <TraverseLine exag={exag} base={base} />
      <StationMarkers exag={exag} base={base} />
      <FlyThrough exag={exag} base={base} firstPerson={firstPerson} />
    </>
  );
}
