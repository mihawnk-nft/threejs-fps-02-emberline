// The look plan, in one place. A dusk industrial yard: cold blue-grey concrete, warm
// amber site lighting, teal for SABLE (the player's team) and ember red for EMBER.
// Every colour in the game is one of these names; the same names are the CSS custom
// properties in index.html. Lighting makes every shade the game needs.
export const PALETTE = {
  canvas: '#14161a', // sky / void
  surface: '#23282e', // walls, upper structures
  hairline: '#31383f', // crates, low cover, trim
  ink: '#e9e6df', // light fixtures, text
  muted: '#98a0a8', // secondary text, metal
  accent: '#f0a830', // amber: site lights, buy menu, bomb
  sable: '#3fb8a6', // SABLE team (player side)
  ember: '#e8542f', // EMBER team (opponents)
  hazard: '#e8c832', // hazard stripes
  ground: '#1b1e22', // floor
};

export function shade(name) {
  return PALETTE[name];
}
