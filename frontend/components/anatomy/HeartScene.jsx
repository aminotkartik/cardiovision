'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Tube } from '@react-three/drei';
import * as THREE from 'three';
import { scoreColor } from '../../lib/predictions';

const VESSEL_PATHS = {
  LAD: [
    [0.0, 0.75, 0.31], [-0.03, 0.53, 0.38], [-0.01, 0.24, 0.40],
    [0.02, -0.08, 0.40], [0.10, -0.42, 0.37], [0.20, -0.79, 0.30],
  ],
  LCX: [
    [-0.02, 0.74, 0.30], [0.23, 0.77, 0.33], [0.50, 0.68, 0.31],
    [0.77, 0.51, 0.26], [0.87, 0.28, 0.18], [0.82, 0.10, 0.10],
  ],
  RCA: [
    [-0.04, 0.73, 0.30], [-0.30, 0.70, 0.32], [-0.59, 0.52, 0.29],
    [-0.76, 0.21, 0.24], [-0.70, -0.16, 0.19], [-0.48, -0.48, 0.14],
  ],
};

const VESSEL_LABELS = {
  LAD: { position: [0.11, -0.94, 0.36], label: 'LAD' },
  LCX: { position: [0.92, 0.22, 0.22], label: 'LCX' },
  RCA: { position: [-0.85, -0.27, 0.23], label: 'RCA' },
};

function createHeartGeometry() {
  const shape = new THREE.Shape();
  const points = 120;
  for (let index = 0; index <= points; index += 1) {
    const theta = (index / points) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(theta), 3) * 0.075;
    const y = (13 * Math.cos(theta) - 5 * Math.cos(2 * theta) - 2 * Math.cos(3 * theta) - Math.cos(4 * theta)) * 0.075;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.3,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.08,
    bevelThickness: 0.06,
    curveSegments: 20,
  });
  geometry.translate(0, 0, -0.15);
  geometry.computeVertexNormals();
  return geometry;
}

function tubeCurve(points) {
  return new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, 'catmullrom', 0.45);
}

function CameraController({ command }) {
  const controls = useRef(null);
  const { camera } = useThree();
  useEffect(() => {
    if (!command?.id) return;
    if (command.action === 'front') {
      camera.position.set(0, 0, 5.7);
      if (controls.current) controls.current.target.set(0, 0, 0);
    } else if (command.action === 'reset') {
      camera.position.set(0.18, 0.05, 5.7);
      if (controls.current) controls.current.target.set(0, 0, 0);
    } else if (command.action === 'zoom-in' || command.action === 'zoom-out') {
      const target = controls.current?.target || new THREE.Vector3(0, 0, 0);
      const direction = new THREE.Vector3().subVectors(camera.position, target);
      const multiplier = command.action === 'zoom-in' ? 0.82 : 1.22;
      direction.multiplyScalar(multiplier);
      direction.clampLength(3.3, 9);
      camera.position.copy(target).add(direction);
    }
    camera.updateProjectionMatrix();
    controls.current?.update();
  }, [command, camera]);
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} enablePan minDistance={3.3} maxDistance={9} rotateSpeed={0.62} />;
}

function CoronaryVessel({ name, points, probability, selected, onSelect }) {
  const color = scoreColor(probability);
  const curve = useMemo(() => tubeCurve(points), [points]);
  const radius = selected ? 0.029 : 0.022;
  const label = VESSEL_LABELS[name];
  return (
    <group>
      <Tube
        args={[curve, 56, radius, 8, false]}
        onClick={(event) => { event.stopPropagation(); onSelect(name); }}
        onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <meshStandardMaterial color={color} emissive={selected ? color : '#33271c'} emissiveIntensity={selected ? 0.18 : 0.025} roughness={0.36} metalness={0.12} />
      </Tube>
      <mesh position={label.position} onClick={(event) => { event.stopPropagation(); onSelect(name); }}>
        <sphereGeometry args={[selected ? 0.047 : 0.035, 12, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Html position={label.position.map((value, index) => value + (index === 0 ? 0.12 : index === 1 ? -0.02 : 0.03))} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div className={`scene-vessel-label ${selected ? 'active' : ''}`} style={{ color }}>{label.label}</div>
      </Html>
    </group>
  );
}

function HeartModel({ vesselScores, selectedVessel, onSelect }) {
  const geometry = useMemo(createHeartGeometry, []);
  const aorta = useMemo(() => tubeCurve([
    [0.18, 0.62, 0.02], [0.21, 0.98, 0.00], [0.31, 1.18, -0.02], [0.62, 1.17, -0.03], [0.75, 0.96, -0.02],
  ]), []);
  const pulmonary = useMemo(() => tubeCurve([
    [-0.12, 0.60, 0.0], [-0.28, 0.91, 0.02], [-0.44, 1.10, 0.02], [-0.59, 1.08, 0.02],
  ]), []);
  return (
    <group>
      {/* Faint thorax context only; the heart and vessel paths are deliberately schematic. */}
      <mesh position={[0, 0.04, -0.78]} scale={[1.72, 2.02, 0.28]}>
        <sphereGeometry args={[1, 24, 18]} />
        <meshBasicMaterial color="#8c735b" transparent opacity={0.035} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      <mesh geometry={geometry} position={[0, -0.01, -0.09]} castShadow receiveShadow>
        <meshStandardMaterial color="#754a53" roughness={0.7} metalness={0.03} />
      </mesh>
      {/* Soft chamber surfaces are visual cues, not segmented patient anatomy. */}
      <mesh position={[-0.39, 0.50, 0.105]} scale={[0.37, 0.37, 0.15]}>
        <sphereGeometry args={[1, 20, 16]} /><meshStandardMaterial color="#965c65" roughness={0.73} />
      </mesh>
      <mesh position={[0.38, 0.49, 0.11]} scale={[0.37, 0.38, 0.15]}>
        <sphereGeometry args={[1, 20, 16]} /><meshStandardMaterial color="#87505b" roughness={0.73} />
      </mesh>
      <mesh position={[-0.39, -0.28, 0.105]} scale={[0.42, 0.69, 0.17]} rotation={[0, 0, 0.12]}>
        <sphereGeometry args={[1, 20, 16]} /><meshStandardMaterial color="#87505d" roughness={0.75} />
      </mesh>
      <mesh position={[0.39, -0.31, 0.12]} scale={[0.43, 0.68, 0.17]} rotation={[0, 0, -0.12]}>
        <sphereGeometry args={[1, 20, 16]} /><meshStandardMaterial color="#9b6268" roughness={0.75} />
      </mesh>
      <Tube args={[aorta, 48, 0.095, 12, false]}>
        <meshStandardMaterial color="#b76158" roughness={0.5} metalness={0.13} />
      </Tube>
      <Tube args={[pulmonary, 36, 0.075, 10, false]}>
        <meshStandardMaterial color="#94535a" roughness={0.52} metalness={0.1} />
      </Tube>

      {Object.entries(VESSEL_PATHS).map(([name, points]) => (
        <CoronaryVessel
          key={name}
          name={name}
          points={points}
          probability={vesselScores?.[name] ?? null}
          selected={selectedVessel === name}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

function SceneContents({ vesselScores, selectedVessel, onSelect, command }) {
  return (
    <>
      <color attach="background" args={['#201c17']} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[3, 4, 5]} intensity={1.25} color="#ffe1b8" />
      <directionalLight position={[-3, 1, 2]} intensity={0.72} color="#c99b72" />
      <pointLight position={[0, -1.5, 2.2]} intensity={0.3} color="#ca8c67" />
      <HeartModel vesselScores={vesselScores} selectedVessel={selectedVessel} onSelect={onSelect} />
      <CameraController command={command} />
    </>
  );
}

export default function HeartScene({ vesselScores, selectedVessel, onSelect, command }) {
  return (
    <Canvas
      camera={{ position: [0.18, 0.05, 5.7], fov: 38, near: 0.1, far: 40 }}
      dpr={[1, 1.35]}
      gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }}
      fallback={<div className="canvas-fallback"><div className="canvas-fallback-card"><strong>3D rendering unavailable</strong><p>This browser could not start WebGL. The prediction, data-entry, and evaluation panels remain available without the anatomy scene.</p></div></div>}
    >
      <SceneContents vesselScores={vesselScores} selectedVessel={selectedVessel} onSelect={onSelect} command={command} />
    </Canvas>
  );
}
