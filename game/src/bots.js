// Bots: 3 SABLE allies and 4 EMBER defenders. Each bot is a mover (the same
// physics as the player) with a simple state machine: pick a site, walk the
// waypoint graph (BFS), hold an angle, fight what it sees, plant or defuse the
// spike, and rotate on sound. Bots shoot with the same hitscan resolver as the
// player, with a reaction delay and an error cone that grows with distance and
// with the target's movement — so stopping to aim pays, for them too.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS } from './world.js';
import { WEAPONS } from './weapons.js';
import { createMover } from './mover.js';

const BOT_SPEED = 4.2;
const SABLE_NAMES = ['VEX', 'ROOK', 'HAVOC'];
const EMBER_NAMES = ['ASH', 'CINDER', 'FLINT', 'SOOT'];

// Waypoint graph, built once: id -> { x, z, links }.
const NODES = new Map();
for (const node of WAYPOINTS) NODES.set(node.id, node);

function nearestNode(x, z) {
  let best = null;
  let bestDist = Infinity;
  for (const node of WAYPOINTS) {
    const d = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (d < bestDist) { bestDist = d; best = node; }
  }
  return best;
}

function findPath(fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const id = queue.shift();
    const node = NODES.get(id);
    for (const link of node.links) {
      if (prev.has(link)) continue;
      prev.set(link, id);
      if (link === toId) {
        const path = [toId];
        let cur = toId;
        while (prev.get(cur) !== null) { cur = prev.get(cur); path.unshift(cur); }
        return path;
      }
      queue.push(link);
    }
  }
  return [toId];
}

function buildBody(team) {
  const group = new THREE.Group();
  const teamColor = team === 'sable' ? PALETTE.sable : PALETTE.ember;
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.7, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22262b'), roughness: 0.85, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a186'), roughness: 0.7 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), dark);
  legL.position.set(-0.11, 0.39, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), dark);
  legR.position.set(0.11, 0.39, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), cloth);
  torso.position.y = 1.09;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.4, 0.34), dark);
  vest.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
  head.position.y = 1.56;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.05), dark);
  visor.position.set(0, 1.57, -0.13);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
  gun.position.set(0.18, 1.15, -0.3);
  group.add(legL, legR, torso, vest, head, visor, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  return { group, torso, head, gun, legL, legR };
}

export function createBots(scene, world, combat, hooks) {
  const bots = [];
  const tmpDir = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  function makeBot(team, name, spawn, weaponId) {
    const mover = createMover(world.colliders, spawn, BOT_SPEED);
    const body = buildBody(team);
    scene.add(body.group);
    const def = WEAPONS[weaponId];
    const chest = new THREE.Vector3();

    const bot = {
      kind: 'bot',
      team,
      name,
      weaponId,
      def,
      mover,
      body,
      health: 100,
      alive: true,
      fall: 0,
      // AI state
      role: team === 'sable' ? 'escort' : 'hold',
      site: null,
      path: [],
      pathIndex: 0,
      holdNode: null,
      watchYaw: 0,
      target: null,
      reactionLeft: 0,
      burstLeft: 0,
      burstGap: 0,
      pauseLeft: 0,
      scanLeft: Math.random() * 0.15,
      stuckTimer: 0,
      lastPos: new THREE.Vector3(spawn.x, 0, spawn.z),
      plantLeft: 0,
      defuseLeft: 0,
      blindLeft: 0,
      investigate: null,
      walkPhase: Math.random() * Math.PI * 2,
      chest,
      chestPos() {
        chest.set(bot.mover.state.position.x, bot.mover.state.position.y + 1.2, bot.mover.state.position.z);
        return chest;
      },
      damage(amount, part, attacker) {
        if (!bot.alive) return false;
        bot.health -= amount;
        if (bot.health <= 0) bot.health = 0;
        if (bot.health > 0) return false;
        bot.alive = false;
        bot.fall = 0;
        bot.plantLeft = 0;
        bot.defuseLeft = 0;
        hooks.onKill(bot, attacker, part);
        return true;
      },
    };

    // Hit meshes: torso box + head sphere, children of the body group.
    const torsoHit = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.34), new THREE.MeshBasicMaterial({ visible: false }));
    torsoHit.position.y = 1.09;
    torsoHit.userData.target = bot;
    torsoHit.userData.part = 'torso';
    const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
    headHit.position.y = 1.56;
    headHit.userData.target = bot;
    headHit.userData.part = 'head';
    body.group.add(torsoHit, headHit);
    combat.registerTarget(torsoHit);
    combat.registerTarget(headHit);
    bot.hitMeshes = [torsoHit, headHit];
    bots.push(bot);
    return bot;
  }

  function spawnAll() {
    for (let i = 0; i < 3; i += 1) {
      const spawn = { x: -6 + i * 3, z: 15, yaw: 0 };
      makeBot('sable', SABLE_NAMES[i], spawn, i === 2 ? 'vk9' : 'ar77');
    }
    for (let i = 0; i < 4; i += 1) {
      const spawn = { x: i < 2 ? -17 + i * 4 : 13 + (i - 2) * 4, z: i % 2 === 0 ? -13 : -14, yaw: Math.PI };
      makeBot('ember', EMBER_NAMES[i], spawn, i === 3 ? 'lw50' : (i === 2 ? 'vk9' : 'ar77'));
    }
  }

  function setPath(bot, goalId) {
    const from = nearestNode(bot.mover.state.position.x, bot.mover.state.position.z);
    bot.path = findPath(from.id, goalId);
    bot.pathIndex = 0;
  }

  function assignRoundRoles(siteChoice) {
    // Attackers: two escort the carrier's site, one lurks mid. Defenders: two hold
    // A, one holds B, one roams mid. The player carries the spike.
    const allies = bots.filter((b) => b.team === 'sable');
    const enemies = bots.filter((b) => b.team === 'ember');
    allies.forEach((bot, i) => {
      bot.site = siteChoice;
      bot.role = i === 2 ? 'lurk' : 'escort';
      setPath(bot, i === 2 ? 'midDoor' : (siteChoice === 'A' ? 'siteA' : 'siteB'));
    });
    enemies.forEach((bot, i) => {
      if (i === 0) { bot.role = 'hold'; bot.holdNode = 'siteA'; setPath(bot, 'siteA'); }
      else if (i === 1) { bot.role = 'hold'; bot.holdNode = 'siteA2'; setPath(bot, 'siteA2'); }
      else if (i === 2) { bot.role = 'hold'; bot.holdNode = 'siteB'; setPath(bot, 'siteB'); }
      else { bot.role = 'roam'; bot.holdNode = 'midTop'; setPath(bot, 'midTop'); }
      bot.site = null;
    });
    for (const bot of bots) {
      bot.pathIndex = 0;
      bot.target = null;
      bot.investigate = null;
      bot.plantLeft = 0;
      bot.defuseLeft = 0;
    }
  }

  function acquireTarget(bot, random) {
    bot.scanLeft -= 0.15;
    if (bot.scanLeft > 0) return;
    bot.scanLeft = 0.15;
    const enemies = hooks.enemiesOf(bot.team);
    const eye = tmpEye.set(bot.mover.state.position.x, bot.mover.state.position.y + bot.mover.state.eye, bot.mover.state.position.z);
    let best = null;
    let bestScore = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const chest = enemy.chestPos();
      const dist = eye.distanceTo(chest);
      if (dist > 55) continue;
      if (!combat.hasLineOfSight(eye, chest)) continue;
      // Prefer close, centred targets.
      tmpDir.copy(chest).sub(eye).normalize();
      const forward = tmpTarget.set(-Math.sin(bot.mover.state.yaw), 0, -Math.cos(bot.mover.state.yaw));
      const angle = Math.acos(Math.max(-1, Math.min(1, tmpDir.dot(forward))));
      const score = dist + angle * 18;
      if (score < bestScore) { bestScore = score; best = enemy; }
    }
    if (best && best !== bot.target) {
      bot.target = best;
      bot.reactionLeft = 0.35 + random() * 0.35;
      bot.burstLeft = 0;
    } else if (!best) {
      bot.target = null;
    }
  }

  function aimAt(bot, target, random) {
    const eye = tmpEye.set(bot.mover.state.position.x, bot.mover.state.position.y + bot.mover.state.eye, bot.mover.state.position.z);
    const chest = target.chestPos();
    tmpDir.copy(chest).sub(eye);
    const dist = tmpDir.length() || 1;
    const yaw = Math.atan2(-tmpDir.x, -tmpDir.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, tmpDir.y / dist)));
    // Turn toward the target, faster when close.
    let dyaw = yaw - bot.mover.state.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.mover.state.yaw += dyaw * 0.35;
    bot.mover.state.pitch += (pitch - bot.mover.state.pitch) * 0.35;
    // Error cone: distance, target speed, and whether the bot is moving.
    const targetSpeed = target.kind === 'bot' ? target.mover.groundSpeed() : (target.groundSpeed ? target.groundSpeed() : 0);
    const moving = bot.mover.groundSpeed() > 0.5 ? 0.02 : 0;
    const error = 0.032 + dist * 0.001 + targetSpeed * 0.006 + moving;
    return error;
  }

  function stepBot(bot, dt, time, random) {
    const mover = bot.mover;
    const state = mover.state;
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.body.group.rotation.x = -bot.fall * 1.45;
      bot.body.group.position.y = -bot.fall * 0.08;
      return;
    }
    if (bot.blindLeft > 0) {
      bot.blindLeft -= dt;
      mover.step(dt, 0, 0, false, false);
      syncBody(bot, dt);
      return;
    }

    acquireTarget(bot, random);
    const bomb = hooks.bomb();
    let wishX = 0;
    let wishZ = 0;
    let fighting = false;

    // Objective overrides: plant, defuse, rotate to the planted site.
    if (bot.team === 'ember' && bomb.plantedAt) {
      if (bot.role !== 'defuse' || bot.defuseLeft <= 0) {
        const dist = Math.hypot(state.position.x - bomb.siteCenter.x, state.position.z - bomb.siteCenter.z);
        if (dist > 2.2) {
          if (bot.path.length === 0 || bot.path[bot.path.length - 1] !== (bomb.site === 'A' ? 'siteA' : 'siteB')) {
            setPath(bot, bomb.site === 'A' ? 'siteA' : 'siteB');
          }
          bot.role = 'rotate';
        } else {
          bot.role = 'defuse';
          bot.defuseLeft = 5;
        }
      }
    }
    if (bot.role === 'defuse' && bot.defuseLeft > 0) {
      bot.defuseLeft -= dt;
      if (bot.defuseLeft <= 0) hooks.onDefused(bot);
      mover.step(dt, 0, 0, false, false);
      syncBody(bot, dt);
      return;
    }
    if (bot.role === 'plant' && bot.plantLeft > 0) {
      bot.plantLeft -= dt;
      if (bot.plantLeft <= 0) hooks.onPlanted(bot);
      mover.step(dt, 0, 0, false, false);
      syncBody(bot, dt);
      return;
    }
    // The carrier plants when it reaches its site; a lurker who picks up the
    // dropped spike switches to escorting it there.
    if (bot.team === 'sable' && hooks.carrier() === bot && bot.role === 'lurk') {
      bot.role = 'escort';
      setPath(bot, bot.site === 'A' ? 'siteA' : 'siteB');
    }
    if (bot.team === 'sable' && hooks.carrier() === bot && bomb.plantedAt === null) {
      const site = bot.site === 'A' ? hooks.siteA() : hooks.siteB();
      if (state.position.x > site.min.x && state.position.x < site.max.x
        && state.position.z > site.min.z && state.position.z < site.max.z) {
        bot.role = 'plant';
        bot.plantLeft = 3.2;
        mover.step(dt, 0, 0, false, false);
        syncBody(bot, dt);
        return;
      }
    }

    if (bot.target) {
      fighting = true;
      const error = aimAt(bot, bot.target, random);
      // Bots walk to their holds and track targets during the buy phase, but
      // nobody fires before the round goes live — the player cannot shoot in
      // the buy phase either, so the buy phase stays a safe setup window.
      if (hooks.phase() !== 'live') {
        bot.reactionLeft = 0.35;
      } else if (bot.reactionLeft > 0) {
        bot.reactionLeft -= dt;
      } else {
        bot.burstGap -= dt;
        if (bot.burstLeft > 0 && bot.burstGap <= 0) {
          const eye = tmpEye.set(state.position.x, state.position.y + state.eye, state.position.z);
          tmpDir.set(-Math.sin(state.yaw) * Math.cos(state.pitch), Math.sin(state.pitch), -Math.cos(state.yaw) * Math.cos(state.pitch));
          combat.fireHitscan(eye, tmpDir, error, bot, bot.def.damage, bot.def.headMult, random);
          hooks.onShot(bot);
          bot.burstLeft -= 1;
          bot.burstGap = bot.def.fireGap;
          if (bot.burstLeft === 0) bot.pauseLeft = 0.5 + random() * 0.6;
        } else if (bot.burstLeft === 0) {
          bot.pauseLeft -= dt;
          if (bot.pauseLeft <= 0) {
            bot.burstLeft = 3 + Math.floor(random() * 3);
            bot.burstGap = 0;
          }
        }
      }
      // Strafe while fighting, or hold still if the target is far.
      const dist = state.position.distanceTo(bot.target.chestPos());
      if (dist < 18) {
        const strafeDir = Math.sin(time * 0.9 + bot.walkPhase) > 0 ? 1 : -1;
        const sin = Math.sin(state.yaw);
        const cos = Math.cos(state.yaw);
        wishX = cos * strafeDir * 0.5;
        wishZ = -sin * strafeDir * 0.5;
      }
    } else {
      // Walk the path, or hold and watch.
      if (bot.pathIndex < bot.path.length) {
        const node = NODES.get(bot.path[bot.pathIndex]);
        const dx = node.x - state.position.x;
        const dz = node.z - state.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.6) {
          bot.pathIndex += 1;
        } else {
          const targetYaw = Math.atan2(-dx, -dz);
          let dyaw = targetYaw - state.yaw;
          while (dyaw > Math.PI) dyaw -= Math.PI * 2;
          while (dyaw < -Math.PI) dyaw += Math.PI * 2;
          state.yaw += dyaw * Math.min(1, dt * 6);
          wishX = dx / dist;
          wishZ = dz / dist;
          // Stuck? Repath after 2.5 s without progress.
          if (state.position.distanceToSquared(bot.lastPos) < 0.04) {
            bot.stuckTimer += dt;
            if (bot.stuckTimer > 2.5) {
              bot.stuckTimer = 0;
              const goal = bot.path[bot.path.length - 1];
              setPath(bot, goal);
            }
          } else {
            bot.stuckTimer = 0;
          }
          bot.lastPos.copy(state.position);
        }
      } else if (bot.role === 'hold' || bot.role === 'roam') {
        // Watch the likely approach: sweep the yaw slowly.
        bot.watchYaw += dt * 0.25;
        state.yaw += Math.sin(bot.watchYaw) * dt * 0.5;
        if (bot.role === 'roam') {
          // Cycle between mid and the connector.
          if (time % 14 < 7 && bot.pathIndex >= bot.path.length) setPath(bot, 'conE');
          else if (time % 14 >= 7 && bot.pathIndex >= bot.path.length) setPath(bot, 'conW');
        }
      } else if (bot.investigate) {
        setPath(bot, bot.investigate);
        bot.investigate = null;
      }
    }

    mover.step(dt, wishX, wishZ, false, false);
    syncBody(bot, dt);
  }

  function syncBody(bot, dt) {
    const state = bot.mover.state;
    bot.body.group.position.set(state.position.x, state.position.y, state.position.z);
    bot.body.group.rotation.set(0, state.yaw, 0);
    // Walk cycle: legs swing while moving.
    const speed = bot.mover.groundSpeed();
    if (speed > 0.3 && bot.alive) {
      bot.walkPhase += dt * speed * 1.6;
      const swing = Math.sin(bot.walkPhase) * 0.5;
      bot.body.legL.rotation.x = swing;
      bot.body.legR.rotation.x = -swing;
    } else {
      bot.body.legL.rotation.x *= 0.8;
      bot.body.legR.rotation.x *= 0.8;
    }
  }

  function step(dt, time, random) {
    for (const bot of bots) stepBot(bot, dt, time, random);
  }

  function hearShot(position, team) {
    // The other team investigates the nearest waypoint to the shot, if close.
    for (const bot of bots) {
      if (!bot.alive || bot.team === team || bot.target) continue;
      const dist = Math.hypot(bot.mover.state.position.x - position.x, bot.mover.state.position.z - position.z);
      if (dist < 26) {
        const node = nearestNode(position.x, position.z);
        bot.investigate = node.id;
        if (bot.pathIndex >= bot.path.length) setPath(bot, node.id);
      }
    }
  }

  function blindBots(center, radius, duration) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const dist = bot.mover.state.position.distanceTo(center);
      if (dist > radius) continue;
      const eye = tmpEye.set(bot.mover.state.position.x, bot.mover.state.position.y + bot.mover.state.eye, bot.mover.state.position.z);
      if (!combat.hasLineOfSight(center, eye)) continue;
      bot.blindLeft = duration;
      bot.target = null;
    }
  }

  function resetRound(spawns) {
    for (const bot of bots) {
      bot.health = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.body.group.rotation.set(0, 0, 0);
      bot.body.group.position.y = 0;
      bot.target = null;
      bot.path = [];
      bot.pathIndex = 0;
      bot.plantLeft = 0;
      bot.defuseLeft = 0;
      bot.blindLeft = 0;
      bot.investigate = null;
      bot.role = bot.team === 'sable' ? 'escort' : 'hold';
    }
    const allies = bots.filter((b) => b.team === 'sable');
    const enemies = bots.filter((b) => b.team === 'ember');
    allies.forEach((bot, i) => bot.mover.teleport(spawns.attackers[i].x, spawns.attackers[i].z, spawns.attackers[i].yaw));
    enemies.forEach((bot, i) => bot.mover.teleport(spawns.defenders[i].x, spawns.defenders[i].z, spawns.defenders[i].yaw));
  }

  return {
    bots,
    spawnAll,
    assignRoundRoles,
    step,
    hearShot,
    blindBots,
    resetRound,
    aliveOf(team) {
      return bots.filter((b) => b.team === team && b.alive);
    },
    all() {
      return bots;
    },
  };
}
