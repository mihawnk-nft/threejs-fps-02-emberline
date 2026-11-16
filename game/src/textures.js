// Procedural textures, painted once at boot from a seeded generator: no image assets,
// no network, deterministic so a screenshot is the same every run. Three canvases:
// concrete floor (panel seams, stains, painted lane arrows), wall panels (rivets,
// grime), hazard stripes (site edges). Each is a CanvasTexture the world reuses.
import * as THREE from 'three';

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 512px concrete: dark base, large panel seams every 128px, speckles, a few oil stains,
// and a faint painted chevron lane marker the map reads at a glance.
export function concreteTexture(seed = 7) {
  const random = mulberry32(seed);
  const canvas = makeCanvas(512);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#23262b';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5200; i += 1) {
    const v = 28 + Math.floor(random() * 26);
    ctx.fillStyle = `rgba(${v}, ${v + 3}, ${v + 7}, ${0.25 + random() * 0.4})`;
    ctx.fillRect(Math.floor(random() * 512), Math.floor(random() * 512), 1 + Math.floor(random() * 2), 1 + Math.floor(random() * 2));
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(512, i * 128); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * 128 + 3, 0); ctx.lineTo(i * 128 + 3, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128 + 3); ctx.lineTo(512, i * 128 + 3); ctx.stroke();
  }
  for (let i = 0; i < 9; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const r = 18 + random() * 46;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, 'rgba(8,8,10,0.5)');
    grad.addColorStop(1, 'rgba(8,8,10,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // Painted chevron, amber, pointing north (toward the sites).
  ctx.fillStyle = 'rgba(240,168,48,0.5)';
  for (const [cx, cy] of [[128, 380], [384, 380], [256, 128]]) {
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy + 22); ctx.lineTo(cx, cy - 26); ctx.lineTo(cx + 34, cy + 22);
    ctx.lineTo(cx + 16, cy + 22); ctx.lineTo(cx, cy - 4); ctx.lineTo(cx - 16, cy + 22);
    ctx.closePath(); ctx.fill();
  }
  return toTexture(canvas, 6, 6);
}

// 256px wall panel: vertical steel plates, rivet dots, a grime gradient at the base.
export function wallTexture(seed = 21) {
  const random = mulberry32(seed);
  const canvas = makeCanvas(256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b3036';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i += 1) {
    const v = 38 + Math.floor(random() * 18);
    ctx.fillStyle = `rgba(${v}, ${v + 4}, ${v + 8}, 0.3)`;
    ctx.fillRect(Math.floor(random() * 256), Math.floor(random() * 256), 2, 2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 256; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (let x = 32; x < 256; x += 64) {
    for (let y = 16; y < 256; y += 48) {
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  const grad = ctx.createLinearGradient(0, 180, 0, 256);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 180, 256, 76);
  return toTexture(canvas, 2, 1);
}

// 128px hazard stripes, amber on dark, for site edges and container rims.
export function hazardTexture() {
  const canvas = makeCanvas(128);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#17191c';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#e8c832';
  for (let x = -128; x < 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 128); ctx.lineTo(x + 16, 128); ctx.lineTo(x + 16 + 128, 0); ctx.lineTo(x + 128, 0);
    ctx.closePath(); ctx.fill();
  }
  return toTexture(canvas, 1, 1);
}

// 256px site marker: a big painted letter (A or B) in amber on dark, laid on the floor.
export function siteTexture(letter) {
  const canvas = makeCanvas(256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(23,25,28,0.9)';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(240,168,48,0.95)';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 228, 228);
  ctx.fillStyle = '#f0a830';
  ctx.font = 'bold 150px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 136);
  return toTexture(canvas, 1, 1);
}
