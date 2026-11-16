// Combat: one hitscan resolver for the player and every bot, tracers, impact
// particles, and thrown grenades (HE and flash). Damage is reported through the
// onHit callback the match wires in; this module never owns health. All hot-loop
// temporaries are preallocated — no new objects per shot or per frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 12;
const MAX_PARTICLES = 240;
const GRENADE_RADIUS = 0.12;

export function createCombat(scene, world, onHit) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  // Dynamic targets: bot bodies and the player's hit volume. Each registered mesh
  // carries userData.target (a { damage(amount, part, attacker) } object) and
  // userData.part ('torso' | 'head'). shootList is the raycast list, rebuilt only
  // when targets change — never per shot.
  const targetMeshes = [];
  let shootList = world.shootables.slice();

  function rebuildShootList() {
    shootList = world.shootables.concat(targetMeshes);
  }

  // --- Tracers (pooled thin boxes, faded in 90 ms) ---
  const tracers = [];
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(tracerGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  function spawnTracer(from, to) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % MAX_TRACERS;
    tmpA.copy(from).add(to).multiplyScalar(0.5);
    tracer.mesh.position.copy(tmpA);
    tracer.mesh.lookAt(to);
    tracer.mesh.scale.set(1, 1, Math.max(0.1, from.distanceTo(to)));
    tracer.mesh.visible = true;
    tracer.mesh.material.opacity = 0.85;
    tracer.life = 0.09;
  }

  // --- Impact particles (one Points cloud, pooled) ---
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  for (let i = 0; i < MAX_PARTICLES; i += 1) positions[i * 3 + 1] = -999;
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const particleMat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(particleGeo, particleMat);
  points.frustumCulled = false;
  scene.add(points);
  const particles = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) particles.push({ life: 0, vx: 0, vy: 0, vz: 0 });
  let particleIndex = 0;
  const sparkColor = new THREE.Color(PALETTE.accent);
  const bloodColor = new THREE.Color(PALETTE.ember);

  function spawnParticles(point, count, color, speed = 3.2) {
    for (let n = 0; n < count; n += 1) {
      const p = particles[particleIndex];
      const i = particleIndex;
      particleIndex = (particleIndex + 1) % MAX_PARTICLES;
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      p.vx = (Math.random() * 2 - 1) * speed;
      p.vy = Math.random() * speed * 0.9 + 0.6;
      p.vz = (Math.random() * 2 - 1) * speed;
      p.life = 0.35 + Math.random() * 0.3;
    }
    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.color.needsUpdate = true;
  }

  // --- Grenades ---
  const grenades = [];
  const grenadeGeo = new THREE.SphereGeometry(GRENADE_RADIUS, 10, 8);
  const grenadeMatHE = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e3438'), roughness: 0.6, metalness: 0.4 });
  const grenadeMatFlash = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.4, metalness: 0.2 });
  const flashLight = new THREE.PointLight(new THREE.Color('#ffffff'), 0, 24, 1.4);
  scene.add(flashLight);

  function throwGrenade(from, dir, kind, owner) {
    const mesh = new THREE.Mesh(grenadeGeo, kind === 'flash' ? grenadeMatFlash : grenadeMatHE);
    mesh.castShadow = true;
    mesh.position.copy(from);
    scene.add(mesh);
    grenades.push({
      mesh, kind, owner,
      velocity: tmpA.copy(dir).multiplyScalar(15).add(tmpB.set(0, 3.2, 0)).clone(),
      fuse: kind === 'flash' ? 1.3 : 2.4,
      bounced: false,
    });
  }

  function hasLineOfSight(from, to) {
    tmpA.copy(to).sub(from);
    const dist = tmpA.length();
    if (dist < 0.01) return true;
    tmpA.multiplyScalar(1 / dist);
    raycaster.set(from, tmpA);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    raycaster.far = 120;
    return !hit;
  }

  function explodeGrenade(g, onFlash, onExplode) {
    const center = g.mesh.position;
    if (onExplode) onExplode(center, g.kind);
    if (g.kind === 'he') {
      spawnParticles(center, 26, sparkColor, 6);
      flashLight.position.copy(center);
      flashLight.intensity = 60;
      setTimeout(() => { flashLight.intensity = 0; }, 90);
      for (const mesh of targetMeshes) {
        const target = mesh.userData.target;
        if (!target || target === g.owner || !target.alive) continue;
        toTarget.copy(target.chestPos());
        const dist = toTarget.distanceTo(center);
        if (dist > 6.5) continue;
        if (!hasLineOfSight(center, toTarget)) continue;
        const amount = Math.round(110 - (dist / 6.5) * 90);
        onHit(target, amount, 'torso', g.owner, true);
      }
    } else {
      flashLight.position.copy(center);
      flashLight.intensity = 90;
      setTimeout(() => { flashLight.intensity = 0; }, 120);
      onFlash(center);
    }
  }

  function stepGrenades(dt, onFlash, onExplode) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.velocity.y -= 12 * dt;
      const p = g.mesh.position;
      p.x += g.velocity.x * dt;
      p.y += g.velocity.y * dt;
      p.z += g.velocity.z * dt;
      // Bounce: find the shallowest penetrating collider and reflect off it.
      for (const box of world.colliders) {
        if (p.x > box.min.x - GRENADE_RADIUS && p.x < box.max.x + GRENADE_RADIUS
          && p.y > box.min.y - GRENADE_RADIUS && p.y < box.max.y + GRENADE_RADIUS
          && p.z > box.min.z - GRENADE_RADIUS && p.z < box.max.z + GRENADE_RADIUS) {
          const dxMin = p.x - (box.min.x - GRENADE_RADIUS);
          const dxMax = (box.max.x + GRENADE_RADIUS) - p.x;
          const dyMin = p.y - (box.min.y - GRENADE_RADIUS);
          const dyMax = (box.max.y + GRENADE_RADIUS) - p.y;
          const dzMin = p.z - (box.min.z - GRENADE_RADIUS);
          const dzMax = (box.max.z + GRENADE_RADIUS) - p.z;
          const min = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax);
          if (min === dxMin) { p.x = box.min.x - GRENADE_RADIUS; g.velocity.x = -Math.abs(g.velocity.x) * 0.45; }
          else if (min === dxMax) { p.x = box.max.x + GRENADE_RADIUS; g.velocity.x = Math.abs(g.velocity.x) * 0.45; }
          else if (min === dyMin) { p.y = box.min.y - GRENADE_RADIUS; g.velocity.y = -Math.abs(g.velocity.y) * 0.45; }
          else if (min === dyMax) { p.y = box.max.y + GRENADE_RADIUS; g.velocity.y = Math.abs(g.velocity.y) * 0.45; }
          else if (min === dzMin) { p.z = box.min.z - GRENADE_RADIUS; g.velocity.z = -Math.abs(g.velocity.z) * 0.45; }
          else { p.z = box.max.z + GRENADE_RADIUS; g.velocity.z = Math.abs(g.velocity.z) * 0.45; }
          g.velocity.multiplyScalar(0.72);
          if (!g.bounced) { g.bounced = true; g.fuse = Math.min(g.fuse, 1.6); }
        }
      }
      if (p.y < GRENADE_RADIUS) {
        p.y = GRENADE_RADIUS;
        g.velocity.y = Math.abs(g.velocity.y) * 0.45;
        g.velocity.multiplyScalar(0.72);
        if (!g.bounced) { g.bounced = true; g.fuse = Math.min(g.fuse, 1.6); }
      }
      if (g.fuse <= 0) {
        explodeGrenade(g, onFlash, onExplode);
        scene.remove(g.mesh);
        grenades.splice(i, 1);
      }
    }
  }

  // --- Hitscan ---
  // origin/direction: the shot line. spread: radians of random cone. attacker: the
  // Target object firing (its own meshes are excluded). damage/headMult: numbers.
  // Returns the hit record, or null on a clean miss.
  const stats = { shots: 0, hits: 0 };
  function fireHitscan(from, dir, spread, attacker, damage, headMult, random) {
    stats.shots += 1;
    origin.copy(from);
    direction.copy(dir);
    if (spread > 0) {
      direction.x += (random() * 2 - 1) * spread;
      direction.y += (random() * 2 - 1) * spread;
      direction.z += (random() * 2 - 1) * spread;
      direction.normalize();
    }
    raycaster.set(origin, direction);
    const hits = raycaster.intersectObjects(shootList, false);
    const end = tmpB.copy(origin).addScaledVector(direction, 120);
    for (const hit of hits) {
      const target = hit.object.userData.target;
      if (target && target !== attacker && target.alive) {
        const isHead = hit.object.userData.part === 'head';
        const amount = Math.round(damage * (isHead ? headMult : 1));
        hitPoint.copy(hit.point);
        spawnTracer(origin, hitPoint);
        spawnParticles(hitPoint, isHead ? 10 : 6, target.kind === 'player' ? bloodColor : sparkColor, 2.4);
        const died = onHit(target, amount, isHead ? 'head' : 'torso', attacker, false);
        stats.hits += 1;
        return { hit: true, killed: died, target, part: isHead ? 'head' : 'torso' };
      }
      if (!target) {
        // World geometry stops the bullet.
        hitPoint.copy(hit.point);
        spawnTracer(origin, hitPoint);
        spawnParticles(hitPoint, 5, sparkColor, 1.8);
        return { hit: false, target: null, part: null };
      }
      // A dead target's mesh: the bullet passes through it.
    }
    spawnTracer(origin, end);
    return { hit: false, target: null, part: null };
  }

  function step(dt, onFlash, onExplode) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.mesh.material.opacity = Math.max(0, tracer.life / 0.09) * 0.85;
      if (tracer.life <= 0) tracer.mesh.visible = false;
    }
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const p = particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      positions[i * 3] += p.vx * dt;
      positions[i * 3 + 1] += p.vy * dt;
      positions[i * 3 + 2] += p.vz * dt;
      p.vy -= 9 * dt;
      if (p.life <= 0 || positions[i * 3 + 1] < 0.02) {
        positions[i * 3 + 1] = -999;
        p.life = 0;
      }
    }
    particleGeo.attributes.position.needsUpdate = true;
    stepGrenades(dt, onFlash, onExplode);
  }

  return {
    fireHitscan,
    throwGrenade,
    hasLineOfSight,
    step,
    registerTarget(mesh) {
      targetMeshes.push(mesh);
      rebuildShootList();
    },
    clearTargets() {
      targetMeshes.length = 0;
      rebuildShootList();
    },
    get grenadeCount() {
      return grenades.length;
    },
    get stats() {
      return stats;
    },
  };
}
