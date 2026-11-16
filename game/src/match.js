// The match: one place for all match state — rounds, the timer, the spike, the
// score — so the HUD, the bots and the shooting all read the same truth. First
// to 5 round wins takes the match (9 rounds max). A round ends on elimination,
// on the spike exploding, on a defuse, or on the timer running out with the
// spike unplanted (defenders win). The player always carries the spike; if the
// player dies it drops, and the nearest living ally picks it up on arrival.
import { SITES } from './world.js';

const ROUNDS_TO_WIN = 5;
const ROUND_SECONDS = 100;
const BUY_SECONDS = 12;
const BOMB_SECONDS = 40;
const PLANT_SECONDS = 3.2;
const DEFUSE_SECONDS = 5;

export function createMatch() {
  const state = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    scoreSable: 0,
    scoreEmber: 0,
    timer: BUY_SECONDS,
    buyOpen: false,
    bomb: {
      plantedAt: null, // site 'A' | 'B' | null
      siteCenter: null,
      site: null,
      timer: 0,
      carrier: 'player', // 'player' | bot | null (dropped)
      droppedAt: null,
    },
    plantProgress: 0,
    defuseProgress: 0,
    lastWinner: null,
    lastReason: '',
    message: '',
  };

  const listeners = [];
  function emit(event, data) {
    for (const fn of listeners) fn(event, data);
  }

  function startMatch() {
    state.phase = 'buy';
    state.round = 1;
    state.scoreSable = 0;
    state.scoreEmber = 0;
    state.timer = BUY_SECONDS;
    state.buyOpen = true;
    state.bomb = { plantedAt: null, siteCenter: null, site: null, timer: 0, carrier: 'player', droppedAt: null };
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.lastWinner = null;
    state.lastReason = '';
    emit('matchStart');
  }

  function startRound() {
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.buyOpen = true;
    state.bomb.plantedAt = null;
    state.bomb.siteCenter = null;
    state.bomb.site = null;
    state.bomb.timer = 0;
    state.bomb.carrier = 'player';
    state.bomb.droppedAt = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    emit('roundStart', { round: state.round });
  }

  function beginLive() {
    state.phase = 'live';
    state.timer = ROUND_SECONDS;
    state.buyOpen = false;
    emit('liveStart');
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.lastWinner = winner;
    state.lastReason = reason;
    if (winner === 'sable') state.scoreSable += 1;
    else state.scoreEmber += 1;
    const matchOver = state.scoreSable >= ROUNDS_TO_WIN || state.scoreEmber >= ROUNDS_TO_WIN || state.round >= 9;
    if (matchOver) {
      state.phase = 'matchEnd';
    } else {
      state.phase = 'roundEnd';
      state.timer = 5;
    }
    emit('roundEnd', { winner, reason, scoreSable: state.scoreSable, scoreEmber: state.scoreEmber });
    if (matchOver) {
      emit('matchEnd', { winner: state.scoreSable > state.scoreEmber ? 'sable' : 'ember' });
    }
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  function plantBomb(site) {
    state.bomb.plantedAt = site;
    state.bomb.site = site;
    state.bomb.siteCenter = SITES[site].center;
    state.bomb.timer = BOMB_SECONDS;
    state.bomb.carrier = null;
    state.plantProgress = 0;
    emit('planted', { site });
  }

  function step(dt) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) beginLive();
    } else if (state.phase === 'live') {
      state.timer -= dt;
      if (state.bomb.plantedAt) {
        state.bomb.timer -= dt;
        if (state.bomb.timer <= 0) {
          endRound('sable', 'The spike detonated.');
          return;
        }
      } else if (state.timer <= 0) {
        endRound('ember', 'Time expired with no plant.');
        return;
      }
    } else if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) nextRound();
    }
  }

  function siteOf(position) {
    for (const [key, site] of Object.entries(SITES)) {
      if (position.x > site.min.x && position.x < site.max.x
        && position.z > site.min.z && position.z < site.max.z) return key;
    }
    return null;
  }

  return {
    state,
    on(fn) {
      listeners.push(fn);
    },
    startMatch,
    startRound,
    beginLive,
    endRound,
    nextRound,
    plantBomb,
    step,
    siteOf,
    ROUNDS_TO_WIN,
    ROUND_SECONDS,
    BUY_SECONDS,
    BOMB_SECONDS,
    PLANT_SECONDS,
    DEFUSE_SECONDS,
  };
}
