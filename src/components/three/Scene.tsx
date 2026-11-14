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
import { getTerrain } from '../../data/real/terrain';
import { layerImageURL } from '../../lib/layerImage';
import { getAdapter } from '../../data/config';
import { useMission } from '../../store/useMission';

/**
 * Mesh resolution. The AOI is a tall strip (474 x 1024 posts), so the mesh
 * keeps that aspect instead of forcing a square grid.
 */
const MESH_SEG_X = 236;
const MESH_SEG_Y = 511;
const EYE_HEIGHT_M = 1.72;

/** AOI-local metres -> three.js world (X east, Y up, Z south). */
export function toWorld(p: LocalPoint, elevation: number, exag: number, base: number): THREE.Vector3 {
  return new THREE.Vector3(p.x - AOI.sizeXM / 2, (elevation - base) * exag, AOI.sizeYM / 2 - p.y);
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
    const geo = new THREE.PlaneGeometry(AOI.sizeXM, AOI.sizeYM, MESH_SEG_X, MESH_SEG_Y);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nx = MESH_SEG_X + 1;
    const ny = MESH_SEG_Y + 1;
    const strideX = (t.width - 1) / MESH_SEG_X;
    const strideY = (t.height - 1) / MESH_SEG_Y;
    for (let row = 0; row < ny; row++) {
      const gr = Math.min(t.height - 1, Math.round(row * strideY));
      for (let col = 0; col < nx; col++) {
        const gc = Math.min(t.width - 1, Math.round(col * strideX));
        pos.setY(row * nx + col, (t.elevation[gr * t.width + gc] - base) * exag);
      }
    }
    // Drop every triangle that touches a cell with no stereo coverage. The
    // heightmap fills those cells so the raster stays continuous, but rendering
    // them would invent cliffs that are not on Mars. The mesh therefore shows
    // the real data footprint - a tilted HiRISE stereo swath - and nothing else.
    const idx: number[] = [];
    const covered = (col: number, row: number) => {
      const gr = Math.min(t.height - 1, Math.round(row * strideY));
      const gc = Math.min(t.width - 1, Math.round(col * strideX));
      return t.coverage[gr * t.width + gc] === 1;
    };
    for (let row = 0; row < MESH_SEG_Y; row++) {
      for (let col = 0; col < MESH_SEG_X; col++) {
        if (!covered(col, row) || !covered(col + 1, row) ||
            !covered(col, row + 1) || !covered(col + 1, row + 1)) continue;
        const a = row * nx + col;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setIndex(idx);

    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [exag, base]);

  return (
    <mesh geometry={geometry} receiveShadow>
      {texture ? (
        <meshStandardMaterial map={texture} roughness={0.95} metalness={0} side={THREE.DoubleSide} />
      ) : (
        <meshStandardMaterial color="#8a6a4f" roughness={1} metalness={0} side={THREE.DoubleSide} />
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

/**
 * A station marker that holds a roughly constant screen size: the same marker
 * has to read from kilometres up in the orbit view and from 20 m away on the walk.
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
      <sphereGeometry args={[70000, 32, 20]} />
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
      <fogExp2 attach="fog" args={[0xc9a37f, firstPerson ? 0.00032 : 0.000035]} />
      <hemisphereLight args={[0xd9b48f, 0x3a2a22, 1.05]} />
      <directionalLight position={[-12000, 9000, -12000]} intensity={1.25} color={0xfff0dd} />
      <ambientLight intensity={0.28} />
      <Terrain exag={exag} base={base} />
      <TraverseLine exag={exag} base={base} />
      <StationMarkers exag={exag} base={base} />
      <FlyThrough exag={exag} base={base} firstPerson={firstPerson} />
    </>
  );
}
