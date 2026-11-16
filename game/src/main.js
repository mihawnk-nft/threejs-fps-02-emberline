// STEELLINE — a tactical 5v5 FPS on Ironworks Yard. SABLE (you + 3 bot allies)
// plants the spike at A or B; EMBER (4 bots) defends. First to 5 rounds takes
// the match. The player always carries the spike; if the player dies it drops,
// and the nearest living ally picks it up on arrival.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS, createWeapons } from './weapons.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createMover } from './mover.js';
import { createCombat } from './combat.js';
import { createMatch } from './match.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createEconomy, BUY_ITEMS } from './economy.js';
import { createAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') ?? 1);
const FIXED = params.has('fixed') && params.get('fixed') !== '0';

// Deterministic RNG for recorded shots; otherwise Math.random.
let rngState = (SEED * 2654435761) >>> 0;
function random() {
  if (!FIXED) return Math.random();
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  rngState >>>= 0;
  return rngState / 4294967296;
}

const container = document.getElementById('game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 40, 110);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const world = createWorld(scene);
const match = createMatch();
const economy = createEconomy();
const audio = createAudio();
const mover = createMover(world.colliders, { x: 0, z: 15, yaw: 0 }, 5.6);
const hud = createHud(world.colliders);
const weapons = createWeapons(camera);
scene.add(camera);

const player = {
  kind: 'player',
  team: 'sable',
  name: 'YOU',
  health: 100,
  alive: true,
  chestPos() {
    return playerChest;
  },
  damage(amount, part, attacker) {
    if (!player.alive) return false;
    if (economy.state.armor > 0) {
      const absorbed = Math.min(economy.state.armor, Math.round(amount * 0.5));
      economy.state.armor -= absorbed;
      amount -= absorbed;
    }
    player.health -= amount;
    if (player.health <= 0) {
      player.health = 0;
      player.alive = false;
      if (attacker && attacker.kind === 'bot') {
        hud.killfeed(attacker.name, 'YOU', part === 'head', 'ember');
        checkElimination();
      }
      if (match.state.bomb.carrier === 'player') {
        match.state.bomb.carrier = null;
        match.state.bomb.droppedAt = mover.state.position.clone();
      }
      return true;
    }
    hud.damageFlash();
    audio.hurt();
    return false;
  },
};
const playerChest = new THREE.Vector3();
function updatePlayerChest() {
  playerChest.set(mover.state.position.x, mover.state.position.y + 1.2, mover.state.position.z);
}

const combat = createCombat(scene, world, (target, amount, part, attacker) => {
  if (target.kind === 'player') {
    return player.damage(amount, part, attacker);
  }
  const died = target.damage(amount, part, attacker);
  if (attacker === player) {
    hud.hitMarker(died);
    if (died) {
      if (part === 'head') audio.headshot();
      else audio.hit();
    } else {
      audio.hit();
    }
  }
  return died;
});

// The player's hit volume: a torso box and a head sphere, kept glued to the
// camera so bots can raycast the player like any other target.
const playerTorsoHit = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.34), new THREE.MeshBasicMaterial({ visible: false }));
playerTorsoHit.userData.target = player;
playerTorsoHit.userData.part = 'torso';
const playerHeadHit = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
playerHeadHit.userData.target = player;
playerHeadHit.userData.part = 'head';
scene.add(playerTorsoHit, playerHeadHit);
combat.registerTarget(playerTorsoHit);
combat.registerTarget(playerHeadHit);

function syncPlayerHitMeshes() {
  const p = mover.state.position;
  playerTorsoHit.position.set(p.x, p.y + 1.09, p.z);
  playerTorsoHit.rotation.y = mover.state.yaw;
  playerHeadHit.position.set(p.x, p.y + 1.56, p.z);
  playerHeadHit.rotation.y = mover.state.yaw;
}

const bots = createBots(scene, world, combat, {
  enemiesOf(team) {
    const list = team === 'sable' ? bots.aliveOf('ember') : bots.aliveOf('sable');
    if (team === 'ember' && player.alive) list.push(player);
    return list;
  },
  bomb() {
    return match.state.bomb;
  },
  carrier() {
    const carrier = match.state.bomb.carrier;
    if (carrier === 'player') return player;
    if (carrier === null) return null;
    return bots.all().find((b) => b.name === carrier) ?? null;
  },
  siteA() { return SITES.A; },
  siteB() { return SITES.B; },
  phase() { return match.state.phase; },
  onKill(victim, attacker, part) {
    if (victim === player) return;
    const killerName = attacker === player ? 'YOU' : (attacker ? attacker.name : '???');
    const killerTeam = attacker === player ? 'sable' : (attacker ? attacker.team : 'sable');
    hud.killfeed(killerName, victim.name, part === 'head', killerTeam);
    if (attacker === player) {
      economy.onKill();
      hud.setMoney(economy.state.money);
    }
    if (match.state.bomb.carrier === victim.name) {
      match.state.bomb.carrier = null;
      match.state.bomb.droppedAt = victim.mover.state.position.clone();
    }
    checkElimination();
  },
  onShot(bot) {
    bots.hearShot(bot.mover.state.position, bot.team);
    if (bot.mover.state.position.distanceTo(mover.state.position) < 30) audio.shot(bot.weaponId);
  },
  onPlanted(bot) {
    match.plantBomb(bot.site);
    audio.plant();
  },
  onDefused() {
    match.endRound('ember', 'The spike was defused.');
  },
});

function resetRoundPositions() {
  mover.teleport(SPAWNS.attackers[1].x, SPAWNS.attackers[1].z, SPAWNS.attackers[1].yaw);
  bots.resetRound({
    attackers: [SPAWNS.attackers[0], SPAWNS.attackers[2], SPAWNS.attackers[3]],
    defenders: SPAWNS.defenders,
  });
}

function setupRound() {
  resetRoundPositions();
  weapons.refillRound();
  player.health = 100;
  player.alive = true;
  bots.assignRoundRoles(random() < 0.5 ? 'A' : 'B');
}

function startMatch() {
  economy.resetMatch();
  weapons.resetMatch();
  setupRound();
  match.startMatch();
  audio.beep();
}

function checkElimination() {
  if (match.state.phase !== 'live' && match.state.phase !== 'buy') return;
  const sableAlive = bots.aliveOf('sable').length + (player.alive ? 1 : 0);
  const emberAlive = bots.aliveOf('ember').length;
  if (sableAlive === 0) {
    match.endRound('ember', match.state.bomb.plantedAt ? 'SABLE was eliminated after the plant.' : 'SABLE was eliminated.');
  } else if (emberAlive === 0 && !match.state.bomb.plantedAt) {
    match.endRound('sable', 'EMBER was eliminated.');
  }
}

function plantCheck(dt) {
  const bomb = match.state.bomb;
  const inSite = match.siteOf(mover.state.position);
  const hasSpike = bomb.carrier === 'player' && !bomb.plantedAt;
  if (hasSpike && inSite && input.keys.has('plant')) {
    match.state.plantProgress = Math.min(1, match.state.plantProgress + dt / match.PLANT_SECONDS);
    hud.setPlant(match.state.plantProgress, 'PLANTING SPIKE');
    if (match.state.plantProgress >= 1) {
      match.plantBomb(inSite);
      economy.onPlant();
      hud.setMoney(economy.state.money);
      audio.plant();
    }
  } else {
    match.state.plantProgress = 0;
    hud.setPlant(0, '');
  }
}

const input = {
  keys: new Set(),
  aiming: false,
  firing: false,
  mouseDown: false,
  locked: false,
};
let triggerEdge = false;

const KEYMAP = {
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  Space: 'jump', ShiftLeft: 'walk', ControlLeft: 'crouch',
  KeyR: 'reload', KeyQ: 'he', KeyF: 'flash', KeyE: 'plant',
  KeyB: 'buy', KeyP: 'pause',
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4', Digit5: 'slot5',
};
let paused = false;
let pointerLocked = false;
let flashStrength = 0;
let flashDecay = 1.6;
let buyMenuOpen = false;

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyP' && match.state.phase !== 'menu') {
    paused = !paused;
    if (paused) hud.showOverlay('paused');
    else hud.hideOverlay();
    return;
  }
  const action = KEYMAP[e.code];
  if (!action) return;
  if (action === 'reload' && (match.state.phase === 'live' || match.state.phase === 'buy')) {
    weapons.reload();
    audio.reload();
  }
  if (action === 'he') tryThrow('he');
  if (action === 'flash') tryThrow('flash');
  if (action === 'buy') toggleBuy();
  if (action.startsWith('slot')) {
    const n = Number(action.slice(4));
    if (buyMenuOpen) {
      const item = BUY_ITEMS[n - 1];
      if (item) tryBuy(item.id);
    } else {
      const ownedOrder = ['p9', 'vk9', 'ar77', 'm12', 'lw50'].filter((id) => weapons.state.owned.has(id));
      const id = ownedOrder[n - 1];
      if (id) equip(id);
    }
  }
  input.keys.add(action);
  if (e.code === 'Space' || e.code === 'ControlLeft') e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const action = KEYMAP[e.code];
  if (action) input.keys.delete(action);
});
window.addEventListener('blur', () => input.keys.clear());

renderer.domElement.addEventListener('click', () => {
  if (match.state.phase === 'menu' || match.state.phase === 'roundEnd' || match.state.phase === 'matchEnd') return;
  if (!pointerLocked) renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  input.locked = pointerLocked;
});
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || paused) return;
  mover.look(e.movementX, e.movementY, input.aiming ? 0.0011 : 0.0022);
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (match.state.phase !== 'live' && match.state.phase !== 'buy') return;
  if (e.button === 0) {
    input.mouseDown = true;
    input.firing = true;
    triggerEdge = true;
  }
  if (e.button === 2) {
    input.aiming = true;
    if (weapons.def().id === 'lw50') hud.setScope(true);
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) { input.mouseDown = false; input.firing = false; }
  if (e.button === 2) {
    input.aiming = false;
    hud.setScope(false);
  }
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

function tryThrow(kind) {
  if (match.state.phase !== 'live' || !player.alive) return;
  if (economy.state.grenades[kind] <= 0) {
    hud.toast(kind === 'he' ? 'No HE grenades left — buy one in the buy phase' : 'No flashbangs left — buy one in the buy phase');
    return;
  }
  economy.state.grenades[kind] -= 1;
  const eye = new THREE.Vector3(mover.state.position.x, mover.state.position.y + mover.state.eye, mover.state.position.z);
  const dir = new THREE.Vector3(-Math.sin(mover.state.yaw) * Math.cos(mover.state.pitch), Math.sin(mover.state.pitch), -Math.cos(mover.state.yaw) * Math.cos(mover.state.pitch));
  combat.throwGrenade(eye, dir, kind, player);
  audio.beep();
}
function equip(id) {
  if (!weapons.equip(id)) return;
  hud.setWeaponName(WEAPONS[id].name);
  const ammo = weapons.ammo();
  hud.setAmmo(ammo.mag, ammo.reserve);
  audio.beep();
}
function tryBuy(id) {
  if (economy.buy(id, weapons)) {
    hud.refreshBuy(economy.state.money, weapons.state.owned);
    hud.setMoney(economy.state.money);
    hud.setWeaponName(weapons.def().name);
    const ammo = weapons.ammo();
    hud.setAmmo(ammo.mag, ammo.reserve);
    audio.buy();
  } else {
    audio.denied();
  }
}
function toggleBuy() {
  if (match.state.phase !== 'buy') return;
  if (buyMenuOpen) closeBuy();
  else openBuy();
}
function openBuy() {
  buyMenuOpen = true;
  hud.showBuy(economy.state.money, weapons.state.owned, tryBuy);
}
function closeBuy() {
  buyMenuOpen = false;
  hud.hideBuy();
}

hud.onPlay(() => {
  audio.unlock();
  if (paused) {
    paused = false;
    hud.hideOverlay();
    return;
  }
  if (match.state.phase === 'menu') {
    startMatch();
    hud.hideOverlay();
    renderer.domElement.requestPointerLock();
  } else if (match.state.phase === 'roundEnd') {
    match.nextRound();
    hud.hideOverlay();
  } else if (match.state.phase === 'matchEnd') {
    startMatch();
    hud.hideOverlay();
  }
});

match.on((event, data) => {
  if (event === 'roundStart') {
    setupRound();
    hud.clearToast();
    audio.beep();
  } else if (event === 'liveStart') {
    closeBuy();
    hud.toast('Round live — plant the spike at A or B');
  } else if (event === 'planted') {
    hud.toast(`Spike planted at ${data.site} — hold the site`);
  } else if (event === 'roundEnd') {
    economy.onRoundEnd(data.winner === 'sable');
    hud.setMoney(economy.state.money);
    hud.showOverlay('roundEnd', data);
    if (data.winner === 'sable') audio.roundWin();
    else audio.roundLose();
  } else if (event === 'matchEnd') {
    hud.showOverlay('matchEnd', { winner: data.winner, scoreSable: match.state.scoreSable, scoreEmber: match.state.scoreEmber });
  }
});

// --- Screenshot helpers (used by the ?shot= harness) ---
function captureShot(name) {
  const dataUrl = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `steelline-${name}.png`;
  a.click();
}
function placeCameraForShot(name) {
  if (name === 'start' || name === 'buy') {
    mover.teleport(0, 15, 0);
    mover.state.pitch = -0.02;
  } else if (name === 'play') {
    mover.teleport(-10, 4, 0.55);
    mover.state.pitch = 0;
  } else if (name === 'end') {
    mover.teleport(15, -12, Math.PI);
    mover.state.pitch = 0;
  }
}

let elapsed = 0;
let fpsFrames = 0;
let fpsTime = 0;
let fps = 0;
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  fpsFrames += 1;
  fpsTime += dt;
  if (fpsTime >= 1) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }

  const phase = match.state.phase;
  if (!paused) {
    match.step(dt);

    // Dropped spike pickup: the nearest living SABLE ally walks to it.
    if (phase === 'live' && match.state.bomb.carrier === null && match.state.bomb.droppedAt) {
      const allies = bots.aliveOf('sable');
      let nearest = null;
      let nearestDist = Infinity;
      for (const ally of allies) {
        const d = ally.mover.state.position.distanceToSquared(match.state.bomb.droppedAt);
        if (d < nearestDist) { nearestDist = d; nearest = ally; }
      }
      if (nearest && nearestDist < 2.25) {
        match.state.bomb.carrier = nearest.name;
        match.state.bomb.droppedAt = null;
        hud.toast(`${nearest.name} picked up the spike`);
      }
    }

    if (phase === 'live' || phase === 'buy') {
      // Movement input (world-relative, yaw-relative).
      let wishX = 0;
      let wishZ = 0;
      const sin = Math.sin(mover.state.yaw);
      const cos = Math.cos(mover.state.yaw);
      if (input.keys.has('forward')) { wishX += -sin; wishZ += -cos; }
      if (input.keys.has('back')) { wishX += sin; wishZ += cos; }
      if (input.keys.has('left')) { wishX += -cos; wishZ += sin; }
      if (input.keys.has('right')) { wishX += cos; wishZ += -sin; }
      const len = Math.hypot(wishX, wishZ);
      if (len > 1) { wishX /= len; wishZ /= len; }
      if (input.keys.has('walk')) { wishX *= 0.5; wishZ *= 0.5; }
      mover.step(dt, wishX, wishZ, input.keys.has('jump'), input.keys.has('crouch'));
      weapons.step(dt);

      // Firing: auto weapons fire while held; semi-auto (p9, m12, lw50) fire once
      // per click. Spread comes from the weapon table (still / moving / scoped).
      const def = weapons.def();
      const speed = mover.groundSpeed();
      const spread = weapons.spread(speed, input.aiming);
      hud.setCrosshairGap(6 + Math.min(24, spread * 400) + (speed > 0.5 ? 3 : 0));
      const wantFire = def.auto ? input.firing : triggerEdge;
      triggerEdge = false;
      if (wantFire && phase === 'live' && player.alive && pointerLocked) {
        if (weapons.ready()) {
          if (weapons.takeRound()) {
            weapons.pullTrigger();
            const eye = new THREE.Vector3(mover.state.position.x, mover.state.position.y + mover.state.eye, mover.state.position.z);
            const dir = new THREE.Vector3(-Math.sin(mover.state.yaw) * Math.cos(mover.state.pitch), Math.sin(mover.state.pitch), -Math.cos(mover.state.yaw) * Math.cos(mover.state.pitch));
            for (let p = 0; p < def.pellets; p += 1) {
              combat.fireHitscan(eye, dir, spread, player, def.damage, def.headMult, random);
            }
            bots.hearShot(mover.state.position, 'sable');
            audio.shot(def.id);
            mover.recoil(0.0035 + def.damage * 0.00003, 0);
            const ammo = weapons.ammo();
            hud.setAmmo(ammo.mag, ammo.reserve);
          }
        }
      } else if (wantFire && phase === 'live' && player.alive && weapons.ammo().mag === 0) {
        weapons.reload();
        audio.dryFire();
      }

      plantCheck(dt);
      bots.step(dt, elapsed, random);
      combat.step(dt, (center) => {
        // Flashbang: blind bots near it, and the player if they face it with a
        // line of sight.
        bots.blindBots(center, 20, 2.0);
        const eye = new THREE.Vector3(mover.state.position.x, mover.state.position.y + mover.state.eye, mover.state.position.z);
        const dist = eye.distanceTo(center);
        if (dist > 22) return;
        if (!combat.hasLineOfSight(center, eye)) return;
        const toFlash = new THREE.Vector3().copy(center).sub(eye).normalize();
        const facing = new THREE.Vector3(-Math.sin(mover.state.yaw), 0, -Math.cos(mover.state.yaw));
        const dot = facing.dot(toFlash);
        const strength = Math.max(0, (1 - dist / 22)) * (dot > 0 ? 1 : 0.35);
        if (strength > 0.15) {
          flashStrength = Math.max(flashStrength, strength);
          flashDecay = 1.6;
          audio.flash();
        }
      }, () => {
        audio.explosion();
      });
      syncPlayerHitMeshes();
      updatePlayerChest();
    }

    // HUD refresh (cheap, cached setters skip unchanged values).
    hud.setHealth(player.health, economy.state.armor);
    hud.setMoney(economy.state.money);
    hud.setTimer(match.state.timer, phase);
    hud.setScore(match.state.scoreSable, match.state.scoreEmber, match.state.round);
    const ammo = weapons.ammo();
    hud.setAmmo(ammo.mag, ammo.reserve);
    const bomb = match.state.bomb;
    if (bomb.plantedAt) {
      hud.setBomb(`SPIKE PLANTED ${bomb.site} — DETONATES ${Math.max(0, Math.ceil(bomb.timer))}s`);
    } else if (bomb.carrier === 'player') {
      hud.setBomb('YOU CARRY THE SPIKE — PLANT AT A OR B (HOLD E)');
    } else if (bomb.carrier) {
      hud.setBomb(`${bomb.carrier} CARRIES THE SPIKE`);
    } else {
      hud.setBomb('SPIKE DROPPED — ALLY WILL RECOVER IT');
    }
    if (flashStrength > 0) {
      flashStrength = Math.max(0, flashStrength - dt / flashDecay);
      hud.flashBlind(flashStrength);
    }
    // Minimap: player + allies + enemies the player can see.
    const spotted = [];
    const eye = new THREE.Vector3(mover.state.position.x, mover.state.position.y + mover.state.eye, mover.state.position.z);
    for (const enemy of bots.aliveOf('ember')) {
      if (combat.hasLineOfSight(eye, enemy.chestPos())) spotted.push(enemy.mover.state.position);
    }
    hud.drawMinimap(
      { x: mover.state.position.x, z: mover.state.position.z, yaw: mover.state.yaw },
      bots.aliveOf('sable').map((b) => b.mover.state.position),
      spotted,
    );
  }

  camera.position.set(mover.state.position.x, mover.state.position.y + mover.state.eye, mover.state.position.z);
  camera.rotation.set(mover.state.pitch, mover.state.yaw, 0);
  // Scoped view: narrow the FOV while aiming the LW50.
  const targetFov = input.aiming && weapons.def().id === 'lw50' ? 28 : 78;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for the harness: state, screenshots, and scripted actions.
window.__steelline = {
  get state() {
    return {
      phase: match.state.phase,
      round: match.state.round,
      scoreSable: match.state.scoreSable,
      scoreEmber: match.state.scoreEmber,
      fps,
      playerAlive: player.alive,
      playerHealth: player.health,
      sableAlive: bots.aliveOf('sable').length + (player.alive ? 1 : 0),
      emberAlive: bots.aliveOf('ember').length,
      bomb: match.state.bomb.plantedAt,
    };
  },
  start() {
    startMatch();
    hud.hideOverlay();
  },
  captureShot,
  placeCameraForShot,
  screenshot(name) {
    placeCameraForShot(name);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  },
  teleport(x, z, yaw) {
    mover.teleport(x, z, yaw);
  },
  setPhase(phase) {
    if (phase === 'buy') match.state.phase = 'buy';
    else if (phase === 'live') match.state.phase = 'live';
  },
  // Internals for the live play-test harness (and for debugging in the console).
  match,
  bots,
  player,
  economy,
  weapons,
  mover,
  combat,
};

if (DEBUG) {
  document.body.classList.add('debug');
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.innerHTML = '<b>STEELLINE debug</b><div id="debug-state">loading…</div>';
  document.body.appendChild(panel);
  setInterval(() => {
    const s = window.__steelline.state;
    document.getElementById('debug-state').textContent = JSON.stringify(s);
  }, 250);
}

hud.setWeaponName(weapons.def().name);

// Screenshot mode: set the scene up for the requested shot, render twice, then
// signal the harness with window.__shotReady.
if (SHOT) {
  bots.spawnAll();
  startMatch();
  // The start overlay is visible by default; hide it so shots 1-3 show the yard
  // and the HUD. (The 'end' shot re-shows an overlay of its own below.)
  hud.hideOverlay();
  if (SHOT === 'buy') {
    placeCameraForShot('buy');
    openBuy();
  } else if (SHOT === 'play') {
    placeCameraForShot('play');
    match.state.phase = 'live';
    match.state.timer = 80;
    // A few EMBER bots visible ahead of the camera for the gameplay shot.
    const emberSpots = [[-11, -5], [-7, -7], [-13, -2], [-9, -9]];
    let ei = 0;
    for (const b of bots.all()) {
      if (b.team !== 'ember') continue;
      const spot = emberSpots[ei % emberSpots.length];
      ei += 1;
      b.mover.teleport(spot[0], spot[1], Math.PI * 0.75);
    }
  } else if (SHOT === 'end') {
    placeCameraForShot('end');
    match.state.phase = 'matchEnd';
    match.state.scoreSable = 5;
    match.state.scoreEmber = 2;
    hud.showOverlay('matchEnd', { winner: 'sable', scoreSable: 5, scoreEmber: 2 });
  } else {
    placeCameraForShot('start');
  }
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    requestAnimationFrame(() => {
      renderer.render(scene, camera);
      window.__shotReady = true;
    });
  });
} else {
  bots.spawnAll();
  hud.showOverlay('start');
}

animate();
