// Sound, synthesized: every effect is an oscillator or a filtered noise burst
// through WebAudio, so the game ships no audio assets and makes no requests.
// The context is created on the first user gesture; calls before that are no-ops.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure() || ctx.state === 'suspended') return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
    source.stop(now + duration);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = null) {
    if (!ensure() || ctx.state === 'suspended') return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + duration);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    shot(weaponId) {
      if (weaponId === 'lw50') { noise(0.22, 900, 0.5); tone(120, 0.12, 0.25, 'sawtooth', 50); }
      else if (weaponId === 'm12') { noise(0.18, 700, 0.55); tone(90, 0.1, 0.3, 'sawtooth', 45); }
      else if (weaponId === 'p9') { noise(0.09, 1800, 0.35); }
      else { noise(0.11, 1400, 0.42); tone(160, 0.06, 0.12, 'square', 70); }
    },
    dryFire() {
      tone(1400, 0.03, 0.12, 'square');
    },
    reload() {
      tone(900, 0.04, 0.15, 'square');
      setTimeout(() => tone(650, 0.04, 0.15, 'square'), 260);
    },
    hit() {
      tone(2100, 0.05, 0.18, 'sine');
    },
    headshot() {
      tone(2600, 0.07, 0.2, 'sine');
      setTimeout(() => tone(3200, 0.06, 0.15, 'sine'), 60);
    },
    hurt() {
      tone(220, 0.12, 0.25, 'sawtooth', 120);
    },
    plant() {
      tone(880, 0.1, 0.2, 'sine');
      setTimeout(() => tone(880, 0.1, 0.2, 'sine'), 180);
    },
    beep() {
      tone(1200, 0.08, 0.16, 'sine');
    },
    explosion() {
      noise(0.7, 300, 0.7);
      tone(70, 0.5, 0.4, 'sine', 30);
    },
    flash() {
      tone(3000, 0.25, 0.2, 'sine', 500);
    },
    roundWin() {
      tone(523, 0.14, 0.2, 'sine');
      setTimeout(() => tone(659, 0.14, 0.2, 'sine'), 140);
      setTimeout(() => tone(784, 0.22, 0.22, 'sine'), 280);
    },
    roundLose() {
      tone(392, 0.16, 0.2, 'sine');
      setTimeout(() => tone(311, 0.24, 0.2, 'sine'), 160);
    },
    buy() {
      tone(1500, 0.05, 0.14, 'sine');
    },
    denied() {
      tone(180, 0.12, 0.2, 'square');
    },
  };
}
