// The arsenal: five weapons, one table of numbers, one view model each. The module
// owns the numbers, the magazine and the reload; main.js owns the ray and the damage.
// Spread punishes moving and firing; the sniper only pays off scoped and still.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', price: 0, mag: 15, reserve: 45,
    damage: 26, headMult: 4, fireGap: 0.16, reloadTime: 1.4, auto: false,
    pellets: 1, spreadStill: 0.003, spreadMoving: 0.02, scoped: false,
  },
  vk9: {
    id: 'vk9', name: 'VK-9 SMG', price: 1500, mag: 30, reserve: 120,
    damage: 22, headMult: 4, fireGap: 0.08, reloadTime: 2.0, auto: true,
    pellets: 1, spreadStill: 0.006, spreadMoving: 0.032, scoped: false,
  },
  ar77: {
    id: 'ar77', name: 'AR-77 Rifle', price: 2700, mag: 30, reserve: 90,
    damage: 30, headMult: 4, fireGap: 0.1, reloadTime: 2.2, auto: true,
    pellets: 1, spreadStill: 0.0022, spreadMoving: 0.028, scoped: false,
  },
  m12: {
    id: 'm12', name: 'M12 Scattergun', price: 1100, mag: 6, reserve: 24,
    damage: 12, headMult: 4, fireGap: 0.85, reloadTime: 2.6, auto: false,
    pellets: 8, spreadStill: 0.045, spreadMoving: 0.06, scoped: false,
  },
  lw50: {
    id: 'lw50', name: 'LW-50 Longshot', price: 4750, mag: 5, reserve: 15,
    damage: 95, headMult: 4, fireGap: 1.4, reloadTime: 3.0, auto: false,
    pellets: 1, spreadStill: 0.004, spreadMoving: 0.05, scoped: true,
    spreadScoped: 0.0004,
  },
};

const MUZZLE_TIME = 0.06;

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const model = new THREE.Group();
  if (def.id === 'p9') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.2), body);
    const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.06), grip);
    gripMesh.position.set(0, -0.06, 0.07);
    model.add(slide, gripMesh);
    model.position.set(0.19, -0.19, -0.36);
  } else if (def.id === 'm12') {
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.5), body);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.18), grip);
    pump.position.set(0, -0.01, -0.2);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.2), grip);
    stock.position.set(0, -0.02, 0.3);
    model.add(barrel, pump, stock);
    model.position.set(0.22, -0.2, -0.42);
  } else if (def.id === 'lw50') {
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.62), body);
    barrel.position.set(0, 0.03, -0.42);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12), grip);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.07, -0.1);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.26), grip);
    stock.position.set(0, -0.02, 0.28);
    model.add(barrel, scope, stock);
    model.position.set(0.22, -0.21, -0.4);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), accent);
    mag.position.set(0, -0.1, -0.05);
    model.add(receiver, barrel, stock, mag);
    model.position.set(0.24, -0.2, -0.42);
  }
  return model;
}

export function createWeapons(camera) {
  const models = {};
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  const flashCtx = flashCanvas.getContext('2d');
  const flashGrad = flashCtx.createRadialGradient(32, 32, 2, 32, 32, 32);
  flashGrad.addColorStop(0, 'rgba(255,240,200,1)');
  flashGrad.addColorStop(0.35, 'rgba(240,168,48,0.9)');
  flashGrad.addColorStop(1, 'rgba(240,168,48,0)');
  flashCtx.fillStyle = flashGrad;
  flashCtx.fillRect(0, 0, 64, 64);
  const flashTexture = new THREE.CanvasTexture(flashCanvas);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({ map: flashTexture, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  for (const def of Object.values(WEAPONS)) {
    const model = buildViewModel(def);
    model.visible = false;
    camera.add(model);
    models[def.id] = model;
  }

  const state = {
    currentId: 'p9',
    owned: new Set(['p9']),
    ammo: { p9: { mag: 15, reserve: 45 } },
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    scoped: false,
  };

  function currentDef() {
    return WEAPONS[state.currentId];
  }

  function ensureAmmo(id) {
    if (!state.ammo[id]) {
      const def = WEAPONS[id];
      state.ammo[id] = { mag: def.mag, reserve: def.reserve };
    }
    return state.ammo[id];
  }

  function showModel() {
    for (const [id, model] of Object.entries(models)) model.visible = id === state.currentId;
  }
  showModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.currentId];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (currentDef().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const ammo = ensureAmmo(state.currentId);
        const need = currentDef().mag - ammo.mag;
        const take = Math.min(need, ammo.reserve);
        ammo.mag += take;
        ammo.reserve -= take;
      }
    }
  }

  return {
    state,
    def: currentDef,
    step,
    ready() {
      const ammo = ensureAmmo(state.currentId);
      return ammo.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = currentDef().fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = currentDef().id === 'lw50' ? 0.11 : 0.055;
    },
    takeRound() {
      const ammo = ensureAmmo(state.currentId);
      if (ammo.mag <= 0) return false;
      ammo.mag -= 1;
      return true;
    },
    reload() {
      const def = currentDef();
      const ammo = ensureAmmo(state.currentId);
      if (state.reloadLeft > 0 || ammo.mag === def.mag || ammo.reserve === 0) return;
      state.reloadLeft = def.reloadTime;
    },
    spread(speed, aiming) {
      const def = currentDef();
      if (def.scoped && aiming && speed < 0.5) return def.spreadScoped;
      return def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMoving;
    },
    equip(id) {
      if (!state.owned.has(id) || id === state.currentId) return false;
      state.currentId = id;
      state.reloadLeft = 0;
      state.cooldown = 0;
      state.scoped = false;
      ensureAmmo(id);
      showModel();
      return true;
    },
    buy(id, money) {
      const def = WEAPONS[id];
      if (!def || state.owned.has(id) || money < def.price) return -1;
      state.owned.add(id);
      ensureAmmo(id);
      return def.price;
    },
    refillRound() {
      // Ammo tops up to full at every round start; owned weapons persist.
      for (const id of state.owned) {
        const def = WEAPONS[id];
        state.ammo[id] = { mag: def.mag, reserve: def.reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    resetMatch() {
      state.currentId = 'p9';
      state.owned = new Set(['p9']);
      state.ammo = { p9: { mag: 15, reserve: 45 } };
      state.reloadLeft = 0;
      state.cooldown = 0;
      showModel();
    },
    ammo() {
      return ensureAmmo(state.currentId);
    },
  };
}
