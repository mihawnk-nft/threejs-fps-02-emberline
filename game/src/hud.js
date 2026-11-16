// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, bomb
// status, kill feed, a top-down minimap, the buy menu and the overlay panels.
// It never touches the simulation; main.js pushes numbers in and reads the play
// and buy callbacks out.
import { BUY_ITEMS } from './economy.js';

const COPY = {
  start: {
    title: 'STEELLINE',
    copy: 'A tactical strike on Ironworks Yard. Plant the spike at A or B, or eliminate EMBER. First to 5 rounds takes the match.',
    action: 'Deploy',
  },
  paused: {
    title: 'STEELLINE',
    copy: 'Paused. Click to resume.',
    action: 'Resume',
  },
  roundEnd: { title: '', copy: '', action: 'Next round' },
  matchEnd: { title: '', copy: '', action: 'Play again' },
};

export function createHud(colliders) {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const ammoBox = el('ammo');
  const healthNum = el('health-num');
  const healthBar = el('health-bar');
  const armorNum = el('armor-num');
  const moneyNum = el('money-num');
  const timerNum = el('timer-num');
  const timerBox = el('timer');
  const scoreSable = el('score-sable');
  const scoreEmber = el('score-ember');
  const roundNum = el('round-num');
  const bombStatus = el('bomb-status');
  const killfeed = el('killfeed');
  const hitmarker = el('hitmarker');
  const damageFlash = el('damage-flash');
  const flashOverlay = el('flash-overlay');
  const scopeOverlay = el('scope-overlay');
  const crosshair = el('crosshair');
  const weaponName = el('weapon-name');
  const buyMenu = el('buy-menu');
  const buyItems = el('buy-items');
  const buyMoney = el('buy-money');
  const plantBar = el('plant-bar');
  const plantFill = el('plant-fill');
  const plantLabel = el('plant-label');
  const toastBox = el('toast');
  const minimap = el('minimap');
  const mapCtx = minimap ? minimap.getContext('2d') : null;

  let hitTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = -1;
  let lastScore = '';
  let lastBomb = '';
  let buyHandler = null;

  // Minimap: the yard is 44 x 36 m; the canvas is 176 x 144 (4 px per metre).
  function drawMinimap(player, teammates, spotted) {
    if (!mapCtx) return;
    const ctx = mapCtx;
    const W = minimap.width;
    const H = minimap.height;
    const toX = (x) => (x + 22) * 4;
    const toY = (z) => (z + 18) * 4;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(20,22,26,0.85)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#31383f';
    for (const box of colliders) {
      const w = box.max.x - box.min.x;
      const d = box.max.z - box.min.z;
      if (w > 30 || d > 30) continue; // the floor: skip, the background is the floor
      if (box.max.y < 0.5) continue; // flat decals
      ctx.fillRect(toX(box.min.x), toY(box.min.z), Math.max(1, w * 4), Math.max(1, d * 4));
    }
    ctx.fillStyle = '#f0a830';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A', toX(-15), toY(-12) + 4);
    ctx.fillText('B', toX(15), toY(-12) + 4);
    for (const enemy of spotted) {
      ctx.fillStyle = '#e8542f';
      ctx.beginPath();
      ctx.arc(toX(enemy.x), toY(enemy.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3fb8a6';
    for (const mate of teammates) {
      ctx.beginPath();
      ctx.arc(toX(mate.x), toY(mate.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white wedge pointing where they face.
    ctx.save();
    ctx.translate(toX(player.x), toY(player.z));
    ctx.rotate(Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw)) + Math.PI / 2);
    ctx.fillStyle = '#e9e6df';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    setHealth(hp, armor) {
      const h = Math.max(0, Math.round(hp));
      if (h === lastHealth && armor === lastArmor) return;
      lastHealth = h;
      lastArmor = armor;
      healthNum.textContent = String(h);
      healthBar.style.width = `${h}%`;
      healthBar.classList.toggle('low', h <= 30);
      armorNum.textContent = armor > 0 ? `+${Math.round(armor)}` : '';
    },
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setMoney(money) {
      if (money === lastMoney) return;
      lastMoney = money;
      moneyNum.textContent = `$${money}`;
      if (buyMoney) buyMoney.textContent = `$${money}`;
    },
    setTimer(seconds, phase) {
      const shown = Math.max(0, Math.ceil(seconds));
      if (shown === lastTimer) return;
      lastTimer = shown;
      const mm = Math.floor(shown / 60);
      const ss = String(shown % 60).padStart(2, '0');
      timerNum.textContent = `${mm}:${ss}`;
      timerBox.classList.toggle('urgent', shown <= 10 && phase === 'live');
      timerBox.classList.toggle('buy', phase === 'buy');
    },
    setScore(sable, ember, round) {
      const key = `${sable}-${ember}-${round}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreSable.textContent = String(sable);
      scoreEmber.textContent = String(ember);
      roundNum.textContent = `ROUND ${round}`;
    },
    setBomb(text) {
      if (text === lastBomb) return;
      lastBomb = text;
      bombStatus.textContent = text;
      bombStatus.classList.toggle('planted', text.includes('DETONATES'));
    },
    setWeaponName(name) {
      weaponName.textContent = name;
    },
    killfeed(killer, victim, headshot, killerTeam) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      const killerSpan = document.createElement('span');
      killerSpan.textContent = killer;
      killerSpan.className = killerTeam === 'sable' ? 'team-sable' : 'team-ember';
      const victimSpan = document.createElement('span');
      victimSpan.textContent = victim;
      const middle = document.createElement('span');
      middle.textContent = headshot ? '  ⌖  ' : '  ✕  ';
      middle.className = 'feed-mid';
      row.append(killerSpan, middle, victimSpan);
      killfeed.prepend(row);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => row.classList.add('fade'), 4200);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageFlash.classList.remove('on');
      void damageFlash.offsetWidth;
      damageFlash.classList.add('on');
    },
    flashBlind(strength) {
      flashOverlay.style.opacity = String(Math.max(0, Math.min(1, strength)));
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    setScope(on) {
      scopeOverlay.hidden = !on;
      crosshair.style.visibility = on ? 'hidden' : 'visible';
    },
    setPlant(frac, label) {
      if (frac <= 0) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(frac * 100)}%`;
      plantLabel.textContent = label;
    },
    toast(text, ms = 2600) {
      toastBox.textContent = text;
      toastBox.classList.add('on');
      setTimeout(() => toastBox.classList.remove('on'), ms);
    },
    clearToast() {
      toastBox.classList.remove('on');
    },
    showBuy(money, ownedWeapons, onBuy) {
      buyHandler = onBuy;
      buyMenu.hidden = false;
      buyMoney.textContent = `$${money}`;
      buyItems.innerHTML = '';
      BUY_ITEMS.forEach((item, index) => {
        const owned = item.kind === 'weapon' && ownedWeapons.has(item.id);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.disabled = owned || money < item.price;
        row.innerHTML = `<span class="buy-key">${index + 1}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">${owned ? 'OWNED' : '$' + item.price}</span>`;
        row.addEventListener('click', () => buyHandler && buyHandler(item.id));
        buyItems.appendChild(row);
      });
    },
    hideBuy() {
      buyMenu.hidden = true;
      buyHandler = null;
    },
    refreshBuy(money, ownedWeapons) {
      if (buyMenu.hidden || !buyHandler) return;
      this.showBuy(money, ownedWeapons, buyHandler);
    },
    showOverlay(mode, data) {
      let text = COPY[mode];
      if (mode === 'roundEnd') {
        text = {
          title: data.winner === 'sable' ? 'ROUND WON' : 'ROUND LOST',
          copy: `${data.reason} SABLE ${data.scoreSable} — ${data.scoreEmber} EMBER.`,
          action: 'Next round',
        };
      } else if (mode === 'matchEnd') {
        text = {
          title: data.winner === 'sable' ? 'MATCH WON' : 'MATCH LOST',
          copy: `Final score SABLE ${data.scoreSable} — ${data.scoreEmber} EMBER. ${data.winner === 'sable' ? 'Ironworks Yard is yours.' : 'EMBER holds the yard.'}`,
          action: 'Play again',
        };
      }
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    drawMinimap,
  };
}
