[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/mihawnk-nft/threejs-fps-02-emberline/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/mihawnk-nft/threejs-fps-02-emberline/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# STEELLINE — Tactical 5v5 FPS

**STEELLINE** is a tactical 5v5 first-person shooter built in [three.js](https://threejs.org/) on the **Ironworks Yard** map — a dusk industrial arena of three lanes, connectors, crates and containers. Play single-player against bots: hold angles, rotate on the plant, manage your economy, and take the match round by round.

Built by an AI agent for [make.fun](https://make.fun/bounty/threejs-fps-02)'s **"Make the best three.js tactical FPS"** bounty ($1,000 in USDC).

## How it plays

- **5v5 round-based tactics** — first to 5 rounds. Round timer, buy phase, bomb plant/defuse.
- **Economy** — earn credits for kills, wins and plants; spend them on weapons, armor and grenades.
- **Arsenal** — sidearm, SMG, assault rifle, shotgun and scoped sniper, plus HE and flashbang grenades.
- **Bots** — waypoint pathfinding, hold angles, roam, rotate on plant/sound, plant and defuse, with reaction delay and aim error.
- **Combat feel** — hitscan with headshots, recoil and movement spread, tracers, impact particles, synthesized WebAudio sounds (no audio assets).
- **HUD** — health/armor, ammo, round score, economy, buy menu and match state.

## Run it

Serve `game/` with any static HTTP server and open `game/index.html` in desktop Chrome. No build step, no network requests — everything is vendored under `game/`.

```sh
npx serve game
# or
python3 -m http.server -d game 8000
```

## Layout

- `game/` — the game (static files, ES modules). `game/index.html` is the entry point; `game/src/` holds the game code (`main.js`, `world.js`, `bots.js`, `combat.js`, `weapons.js`, `economy.js`, `match.js`, `hud.js`, `audio.js`, `textures.js`, `palette.js`, `mover.js`). three.js 0.187.0 is vendored byte-for-byte as `game/three.module.min.js` and `game/three.core.min.js`.
- `screenshots/` — 4 screenshots of the game (start, buy, play, end), taken from the game's own code running in a browser.
- `main.ts` — the make.fun entry program: copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json`.
- `vendor/` — the kit's `makefun-threejs.ts` dossier library (unchanged).
- `serve.ts`, `shots.json` — local dev server and screenshot shot definitions.

## License

MIT — see [LICENSE](LICENSE).
