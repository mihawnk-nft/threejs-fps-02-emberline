// The economy: money earned per round and spent in the buy menu. The player
// starts with $800; a kill pays $300, a round win $3250, a loss $1900 plus $500
// per consecutive loss (capped at $3400), and planting pays the planter $300.
// Weapons stay owned between rounds; ammo tops up each round. Grenades are
// consumables: one HE and one flash at most, bought fresh each round.
import { WEAPONS } from './weapons.js';

export const BUY_ITEMS = [
  { id: 'vk9', kind: 'weapon', name: 'VK-9 SMG', price: 1500, desc: 'Fast close-range spray, 30 rounds' },
  { id: 'ar77', kind: 'weapon', name: 'AR-77 Rifle', price: 2700, desc: 'The all-round rifle, 30 rounds' },
  { id: 'm12', kind: 'weapon', name: 'M12 Scattergun', price: 1100, desc: 'Eight pellets, devastating up close' },
  { id: 'lw50', kind: 'weapon', name: 'LW-50 Longshot', price: 4750, desc: 'One-shot sniper, scope with right-click' },
  { id: 'armor', kind: 'armor', name: 'Kevlar Vest', price: 650, desc: 'Absorbs half of every hit' },
  { id: 'he', kind: 'grenade', name: 'HE Grenade', price: 300, desc: 'Explodes for up to 110 damage' },
  { id: 'flash', kind: 'grenade', name: 'Flashbang', price: 200, desc: 'Blinds anyone looking at it' },
];

export function createEconomy() {
  const state = {
    money: 800,
    armor: 0,
    grenades: { he: 0, flash: 0 },
    lossStreak: 0,
    kills: 0,
  };

  return {
    state,
    resetMatch() {
      state.money = 800;
      state.armor = 0;
      state.grenades = { he: 0, flash: 0 };
      state.lossStreak = 0;
      state.kills = 0;
    },
    buy(itemId, weapons) {
      const item = BUY_ITEMS.find((entry) => entry.id === itemId);
      if (!item || state.money < item.price) return false;
      if (item.kind === 'weapon') {
        const spent = weapons.buy(item.id, state.money);
        if (spent < 0) return false;
        state.money -= spent;
        weapons.equip(item.id);
        return true;
      }
      if (item.kind === 'armor') {
        if (state.armor >= 100) return false;
        state.money -= item.price;
        state.armor = 100;
        return true;
      }
      if (item.kind === 'grenade') {
        if (state.grenades[item.id] >= 1) return false;
        state.money -= item.price;
        state.grenades[item.id] = 1;
        return true;
      }
      return false;
    },
    onKill() {
      state.money += 300;
      state.kills += 1;
    },
    onPlant() {
      state.money += 300;
    },
    onRoundEnd(won) {
      if (won) {
        state.money += 3250;
        state.lossStreak = 0;
      } else {
        state.lossStreak += 1;
        state.money += Math.min(3400, 1900 + (state.lossStreak - 1) * 500);
      }
      state.grenades = { he: 0, flash: 0 };
    },
    weaponPrice(id) {
      return WEAPONS[id] ? WEAPONS[id].price : 0;
    },
  };
}
