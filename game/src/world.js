// The map: Ironworks Yard, an original two-site industrial yard. SABLE (attackers)
// spawn south; sites A (Furnace, north-west) and B (Silo, north-east) sit north,
// reached by three lanes — west, mid and east — with a connector between the sites
// and crates for cover. Every box is a collider for bodies and a surface a bullet
// stops on. Waypoints below are the graph the bots pathfind on; every graph edge is
// a straight walk with no wall or crate in the way (checked by hand).
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { concreteTexture, wallTexture, hazardTexture, siteTexture } from './textures.js';

export const SITES = {
  A: { name: 'Furnace', center: new THREE.Vector3(-15, 0, -12), min: new THREE.Vector3(-19, 0, -16), max: new THREE.Vector3(-11, 0, -8) },
  B: { name: 'Silo', center: new THREE.Vector3(15, 0, -12), min: new THREE.Vector3(11, 0, -16), max: new THREE.Vector3(19, 0, -8) },
};

export const SPAWNS = {
  attackers: [
    { x: -6, z: 15, yaw: 0 },
    { x: 0, z: 15.5, yaw: 0 },
    { x: 6, z: 15, yaw: 0 },
    { x: -2, z: 16.5, yaw: 0 },
  ],
  defenders: [
    { x: -17, z: -13, yaw: Math.PI },
    { x: -13, z: -14, yaw: Math.PI },
    { x: 17, z: -13, yaw: Math.PI },
    { x: 13, z: -14, yaw: Math.PI },
  ],
};

// Waypoint graph: nodes the bots walk between (BFS in bots.js). Edges follow the lanes.
export const WAYPOINTS = [
  { id: 'spawnW', x: -6, z: 15, links: ['spawnC', 'westLow'] },
  { id: 'spawnC', x: 0, z: 15, links: ['spawnW', 'spawnE', 'midLow'] },
  { id: 'spawnE', x: 6, z: 15, links: ['spawnC', 'eastLow'] },
  { id: 'westLow', x: -12, z: 8, links: ['spawnW', 'westMid'] },
  { id: 'midLow', x: 0, z: 8, links: ['spawnC', 'midDoor'] },
  { id: 'eastLow', x: 12, z: 8, links: ['spawnE', 'eastMid'] },
  { id: 'westMid', x: -12, z: 2, links: ['westLow', 'westHigh', 'midDoor'] },
  { id: 'midDoor', x: 0, z: 5, links: ['midLow', 'westMid', 'eastMid', 'midTop'] },
  { id: 'eastMid', x: 12, z: 2, links: ['eastLow', 'midDoor', 'eastHigh'] },
  { id: 'westHigh', x: -13, z: -5, links: ['westMid', 'siteA', 'conW'] },
  { id: 'midTop', x: 0, z: -4, links: ['midDoor', 'conW', 'conE'] },
  { id: 'eastHigh', x: 13, z: -5, links: ['eastMid', 'siteB', 'conE'] },
  { id: 'conW', x: -7, z: -8, links: ['westHigh', 'midTop', 'siteA'] },
  { id: 'conE', x: 7, z: -8, links: ['eastHigh', 'midTop', 'siteB'] },
  { id: 'siteA', x: -15, z: -12, links: ['westHigh', 'conW', 'siteA2'] },
  { id: 'siteA2', x: -14, z: -15.5, links: ['siteA'] },
  { id: 'siteB', x: 15, z: -12, links: ['eastHigh', 'conE', 'siteB2'] },
  { id: 'siteB2', x: 14, z: -15.5, links: ['siteB'] },
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const concrete = concreteTexture();
  const wallTex = wallTexture();
  const hazard = hazardTexture();

  const floorMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.95, metalness: 0.02 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.08 });
  const crateMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.9, metalness: 0.05 });
  const containerMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a4a52'), roughness: 0.7, metalness: 0.25 });
  const containerMatB = new THREE.MeshStandardMaterial({ color: new THREE.Color('#54402e'), roughness: 0.7, metalness: 0.25 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.8, metalness: 0.05 });
  const amberGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const tealGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sable) });

  const colliders = [];
  const shootables = [];

  // box: solid, collidable, shootable. flat: a floor decal, no collision.
  // deco: a visible mesh with no collision and no bullet stop (glow strips).
  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function flat(width, depth, x, z, material, y = 0.02) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function deco(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  // Floor: 44 x 36 m of painted concrete.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 36), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3(new THREE.Vector3(-22, -0.4, -18), new THREE.Vector3(22, 0, 18)));

  // Outer walls, 5 m high, open to the dusk sky.
  box(44.4, 5, 0.4, 0, 2.5, -18.2, wallMat);
  box(44.4, 5, 0.4, 0, 2.5, 18.2, wallMat);
  box(0.4, 5, 36.4, -22.2, 2.5, 0, wallMat);
  box(0.4, 5, 36.4, 22.2, 2.5, 0, wallMat);

  // Lane dividers (z -2..10): west wall at x -6, east wall at x 6, each with a gap
  // at z 1.5..4 (the south cross).
  box(0.4, 3.4, 6, -6, 1.7, 7, wallMat);
  box(0.4, 3.4, 4, -6, 1.7, -0.5, wallMat);
  box(0.4, 3.4, 6, 6, 1.7, 7, wallMat);
  box(0.4, 3.4, 4, 6, 1.7, -0.5, wallMat);
  // Mid door: a wall across mid at z 3 with a 2.4 m doorway and a lintel above it.
  box(4.4, 3.4, 0.4, -4.2, 1.7, 3, wallMat);
  box(4.4, 3.4, 0.4, 4.2, 1.7, 3, wallMat);
  box(4.4, 1.0, 0.4, 0, 2.9, 3, wallMat);

  // Cover: crates (1.1 m, crouch cover), placed off every waypoint line.
  const crates = [
    [-15.5, 5.5], [-9, -1], [15.5, 5.5], [9, -1], [-3, 11],
    [-3.5, -7.5], [3.5, -7.5], [-17, -8.5], [17, -8.5], [-9, -13], [9, -13],
  ];
  for (const [x, z] of crates) box(1.2, 1.1, 1.2, x, 0.55, z, crateMat);
  // A stacked pair at mid-east, a sightline break that never blocks the x=0 lane.
  box(1.2, 1.1, 1.2, 2.9, 0.55, 6.5, crateMat);
  box(1.2, 1.1, 1.2, 4.1, 0.55, 6.5, crateMat);
  box(1.2, 1.1, 1.2, 3.5, 1.65, 6.5, crateMat);

  // Containers (2.6 m, full cover): along the north wall and the outer lanes.
  box(2.4, 2.6, 4, -20, 1.3, -16.5, containerMat);
  box(4, 2.6, 2, -11, 1.3, -17, containerMatB);
  box(2.4, 2.6, 4, 20, 1.3, -16.5, containerMatB);
  box(4, 2.6, 2, 11, 1.3, -17, containerMat);
  box(4, 2.6, 2, -20, 1.3, 2, containerMatB);
  box(4, 2.6, 2, 20, 1.3, 2, containerMat);

  // Site floors: painted A / B markers and hazard edging (decals, no collision).
  const markerA = new THREE.MeshStandardMaterial({ map: siteTexture('A'), roughness: 0.9 });
  const markerB = new THREE.MeshStandardMaterial({ map: siteTexture('B'), roughness: 0.9 });
  flat(5, 5, -15, -12, markerA, 0.03);
  flat(5, 5, 15, -12, markerB, 0.03);
  flat(8, 0.5, -15, -8.2, hazardMat, 0.025);
  flat(8, 0.5, 15, -8.2, hazardMat, 0.025);
  flat(8, 0.5, -15, -15.8, hazardMat, 0.025);
  flat(8, 0.5, 15, -15.8, hazardMat, 0.025);

  // Amber light strips over each site entrance; teal strip over the attacker spawn.
  deco(3, 0.12, 0.12, -15, 3.3, -8, amberGlow);
  deco(3, 0.12, 0.12, 15, 3.3, -8, amberGlow);
  deco(4, 0.12, 0.12, 0, 3.3, 14.5, tealGlow);

  // Distant silos beyond the walls, for a skyline.
  const siloMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.95 });
  for (const [x, z, h] of [[-30, -26, 16], [-14, -30, 21], [8, -28, 13], [28, -24, 18], [-28, 26, 12], [30, 24, 15]]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, h, 14), siloMat);
    silo.position.set(x, h / 2 - 1, z);
    group.add(silo);
  }

  // Light: dusk hemisphere, a warm low key sun with shadows, a cool fill, and amber
  // point lights over the two sites.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a97a8'), new THREE.Color(PALETTE.ground), 1.15);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.2);
  key.position.set(18, 22, 14);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(-14, 12, 16);
  scene.add(fill);
  for (const site of Object.values(SITES)) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 22, 20, 1.6);
    lamp.position.set(site.center.x, 4.2, site.center.z);
    scene.add(lamp);
  }

  return { colliders, shootables, group };
}
