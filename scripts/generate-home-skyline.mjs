// Draws the night city used behind the signed-in home as a static SVG (public/assets/home-skyline.svg).
// It is generated from code with a fixed seed, so the picture is reproducible and is not a copy of any reference image.
// Layers, back to front: sky and glow, haze, far city, main city, twin towers, broadcast tower, river with the
// reflection of the city, a lit bridge with light trails, bokeh and foreground trees.
// Run: node scripts/generate-home-skyline.mjs
import { writeFileSync } from "node:fs";

const W = 1672;
const H = 369;
const WL = 292; // the waterline: everything above is city, below is river

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seeded(20261015);
const between = (low, high) => low + (high - low) * random();
const pick = (list) => list[Math.floor(random() * list.length)];
const n = (value) => Math.round(value * 10) / 10;

/** A tile of lit windows used as a fill, so thousands of windows cost a few hundred bytes. */
function windowPattern(id, color, density, cell, columns, rows, lit = 2.4) {
  const dots = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (random() < density) dots.push(`<rect x="${column * cell + 1}" y="${row * cell + 1}" width="${lit}" height="${n(lit * 1.25)}" fill="${color}" opacity="${n(between(0.55, 1))}"/>`);
    }
  }
  return `<pattern id="${id}" width="${columns * cell}" height="${rows * cell}" patternUnits="userSpaceOnUse">${dots.join("")}</pattern>`;
}

const defs = [
  `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#030816"/><stop offset=".45" stop-color="#07153a"/><stop offset=".8" stop-color="#162a72"/><stop offset="1" stop-color="#3b3fa0"/></linearGradient>`,
  `<radialGradient id="glowL" cx=".2" cy="1" r=".6"><stop offset="0" stop-color="#8f6bff" stop-opacity=".7"/><stop offset=".5" stop-color="#3366dd" stop-opacity=".28"/><stop offset="1" stop-color="#0a1a45" stop-opacity="0"/></radialGradient>`,
  `<radialGradient id="glowR" cx=".62" cy="1" r=".45"><stop offset="0" stop-color="#ff7ac8" stop-opacity=".3"/><stop offset="1" stop-color="#ff7ac8" stop-opacity="0"/></radialGradient>`,
  `<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#cfeeff" stop-opacity=".6"/><stop offset="1" stop-color="#3fa7ff" stop-opacity="0"/></radialGradient>`,
  `<linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a8df0"/><stop offset=".4" stop-color="#1d4fb0"/><stop offset="1" stop-color="#0a1f55"/></linearGradient>`,
  `<linearGradient id="gViolet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e6bf5"/><stop offset=".5" stop-color="#3f33b0"/><stop offset="1" stop-color="#14185a"/></linearGradient>`,
  `<linearGradient id="gTeal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38d0e0"/><stop offset=".5" stop-color="#1a72a8"/><stop offset="1" stop-color="#0a2552"/></linearGradient>`,
  `<linearGradient id="gSteel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b5ba8"/><stop offset="1" stop-color="#0c1a48"/></linearGradient>`,
  `<linearGradient id="gFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a4a96"/><stop offset="1" stop-color="#0d1e52"/></linearGradient>`,
  `<linearGradient id="shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".22" stop-color="#cfe9ff" stop-opacity=".34"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
  `<linearGradient id="tower" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6fa6f0"/><stop offset=".3" stop-color="#f6fbff"/><stop offset=".62" stop-color="#a9d0ff"/><stop offset="1" stop-color="#3f78d0"/></linearGradient>`,
  `<linearGradient id="towerShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#0a1a45" stop-opacity=".6"/></linearGradient>`,
  `<linearGradient id="pod" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd6f3"/><stop offset="1" stop-color="#a98bff"/></linearGradient>`,
  `<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7cff" stop-opacity="0"/><stop offset="1" stop-color="#8f7bff" stop-opacity=".5"/></linearGradient>`,
  `<linearGradient id="river" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2c78"/><stop offset=".4" stop-color="#0b1648"/><stop offset="1" stop-color="#040a22"/></linearGradient>`,
  `<linearGradient id="reflFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".62"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
  `<mask id="reflMask"><rect y="${WL}" width="${W}" height="${H - WL}" fill="url(#reflFade)"/></mask>`,
  `<linearGradient id="fadeSide" x1="0" y1="0" x2="1" y2="0"><stop offset=".55" stop-color="#fff"/><stop offset=".86" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
  `<mask id="sideMask"><rect width="${W}" height="${H}" fill="url(#fadeSide)"/></mask>`,
  `<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
  `<filter id="soft"><feGaussianBlur stdDeviation="1.4"/></filter>`,
  `<filter id="blurBig"><feGaussianBlur stdDeviation="9"/></filter>`,
  windowPattern("winWarm", "#ffd58a", 0.5, 6, 6, 8),
  windowPattern("winCool", "#8fdcff", 0.46, 6, 6, 8),
  windowPattern("winWhite", "#ffffff", 0.36, 5, 7, 9, 2),
  windowPattern("winPink", "#ff9be2", 0.32, 6, 6, 8),
  windowPattern("winTiny", "#bfe6ff", 0.55, 4, 9, 12, 1.4),
];

const city = [];

// Far layer: pale, hazy silhouettes that give the skyline depth.
for (let x = -10; x < 1350; ) {
  const width = between(22, 50);
  const top = between(186, 262);
  city.push(`<g opacity=".55"><rect x="${n(x)}" y="${n(top)}" width="${n(width)}" height="${n(WL - top + 2)}" fill="url(#gFar)"/><rect x="${n(x)}" y="${n(top)}" width="${n(width)}" height="${n(WL - top + 2)}" fill="url(#winTiny)" opacity=".7"/></g>`);
  x += width + between(0, 5);
}

function building({ x, width, top, fill, windows, antenna, neon, setback, roof }) {
  const height = WL - top + 2;
  const out = [];
  const shape =
    roof === "peak" ? `${n(x)},${n(top + 12)} ${n(x + width / 2)},${n(top)} ${n(x + width)},${n(top + 12)} ${n(x + width)},${WL + 2} ${n(x)},${WL + 2}`
    : roof === "slant" ? `${n(x)},${n(top + 16)} ${n(x + width)},${n(top)} ${n(x + width)},${WL + 2} ${n(x)},${WL + 2}`
    : `${n(x)},${n(top)} ${n(x + width)},${n(top)} ${n(x + width)},${WL + 2} ${n(x)},${WL + 2}`;
  out.push(`<polygon points="${shape}" fill="url(#${fill})"/>`);
  out.push(`<polygon points="${shape}" fill="url(#${windows})"/>`);
  out.push(`<polygon points="${shape}" fill="url(#shine)"/>`);
  out.push(`<rect x="${n(x)}" y="${n(top + 14)}" width="1.3" height="${n(height - 14)}" fill="#a8d8ff" opacity=".5"/>`);
  if (roof === "flat") out.push(`<rect x="${n(x)}" y="${n(top)}" width="${n(width)}" height="1.6" fill="#a8d8ff" opacity=".45"/>`);
  if (setback) {
    const inner = width * 0.6;
    const ix = x + (width - inner) / 2;
    out.push(`<rect x="${n(ix)}" y="${n(top - 14)}" width="${n(inner)}" height="15" fill="url(#${fill})"/><rect x="${n(ix)}" y="${n(top - 14)}" width="${n(inner)}" height="1.4" fill="#a8d8ff" opacity=".55"/>`);
  }
  if (antenna) {
    const cx = x + width / 2;
    out.push(`<rect x="${n(cx - 0.6)}" y="${n(top - 28)}" width="1.2" height="29" fill="#7fbcff" opacity=".85"/><circle cx="${n(cx)}" cy="${n(top - 29)}" r="2.2" fill="#ff4d5e" filter="url(#glow)"/>`);
  }
  if (neon) out.push(`<rect x="${n(x + width * between(0.25, 0.7))}" y="${n(top + 6)}" width="1.8" height="${n(height * 0.7)}" fill="${neon}" opacity=".85" filter="url(#glow)"/>`);
  return out.join("");
}

const fills = ["gBlue", "gBlue", "gSteel", "gSteel", "gBlue", "gViolet", "gTeal"];
const windowsFor = ["winWarm", "winCool", "winWhite", "winCool", "winWarm", "winPink", "winTiny"];
for (let x = 0; x < 1300; ) {
  const width = between(30, 64);
  const insideTowers = x + width > 288 && x < 452;
  if (!insideTowers) {
    const left = x < 300;
    const right = x > 560 && x < 1070;
    const top = left ? between(108, 212) : right ? between(122, 224) : between(176, 252);
    city.push(
      building({
        x,
        width,
        top,
        fill: pick(fills),
        windows: pick(windowsFor),
        antenna: random() < 0.3,
        setback: random() < 0.22,
        roof: random() < 0.18 ? "peak" : random() < 0.22 ? "slant" : "flat",
        neon: random() < 0.2 ? pick(["#2de2f0", "#ff7ad9", "#9a7bff"]) : undefined,
      }),
    );
  }
  x += width + between(0, 4);
}

// The twin towers: eight tiers with ribs, lit from within, joined by a sky bridge.
function tower(cx) {
  const tiers = [
    { half: 26, from: WL, to: 250 },
    { half: 23, from: 250, to: 200 },
    { half: 20, from: 200, to: 152 },
    { half: 17, from: 152, to: 112 },
    { half: 14, from: 112, to: 78 },
    { half: 11, from: 78, to: 52 },
    { half: 8, from: 52, to: 36 },
  ];
  const out = [`<ellipse cx="${cx}" cy="150" rx="92" ry="200" fill="url(#halo)"/>`];
  for (const tier of tiers) {
    const x = cx - tier.half;
    out.push(`<rect x="${x}" y="${tier.to}" width="${tier.half * 2}" height="${tier.from - tier.to}" fill="url(#tower)"/>`);
    for (let column = 1; column < 6; column += 1) out.push(`<rect x="${n(x + (tier.half * 2 * column) / 6)}" y="${tier.to}" width=".9" height="${tier.from - tier.to}" fill="#2a5fb8" opacity=".55"/>`);
    for (let row = tier.to + 7; row < tier.from; row += 7) out.push(`<rect x="${x}" y="${row}" width="${tier.half * 2}" height=".7" fill="#3a6fc8" opacity=".32"/>`);
    out.push(`<rect x="${x - 1.6}" y="${tier.to}" width="${tier.half * 2 + 3.2}" height="2.4" fill="#fff" opacity=".95"/>`);
  }
  out.push(`<rect x="${cx - 26}" y="250" width="52" height="${WL - 250}" fill="url(#towerShade)"/>`);
  out.push(`<path d="M${cx - 8} 36 Q${cx} 16 ${cx + 8} 36Z" fill="#f6fbff"/><rect x="${cx - 0.9}" y="6" width="1.8" height="32" fill="#e3f3ff"/><circle cx="${cx}" cy="6" r="2.4" fill="#fff" filter="url(#glow)"/>`);
  return out.join("");
}
city.push(`<g filter="url(#glow)">${tower(327)}${tower(403)}</g>`);
city.push(`<rect x="352" y="206" width="26" height="9" fill="#e3f3ff" stroke="#9ccfff"/><path d="M350 219 Q365 203 380 219" fill="none" stroke="#e3f3ff" stroke-width="2"/>`);

// Broadcast tower with a lit pod.
city.push(
  [
    `<ellipse cx="908" cy="150" rx="50" ry="160" fill="url(#halo)" opacity=".5"/>`,
    `<path d="M903 ${WL} L905.6 190 L910.4 190 L913 ${WL}Z" fill="#c98bff"/>`,
    `<path d="M895 168 Q908 150 921 168 L919 184 Q908 192 897 184Z" fill="url(#pod)" filter="url(#glow)"/>`,
    `<rect x="892" y="186" width="32" height="6" rx="3" fill="#b9a7ff"/>`,
    `<rect x="906.8" y="64" width="2.4" height="104" fill="#ff9ae3" filter="url(#glow)"/>`,
    `<circle cx="908" cy="62" r="3" fill="#fff" filter="url(#glow)"/>`,
  ].join(""),
);

// Haze where the city meets the water.
city.push(`<rect y="${WL - 70}" width="${W}" height="72" fill="url(#haze)"/>`);

const parts = [];
parts.push(`<rect width="${W}" height="${H}" fill="url(#sky)"/>`);
parts.push(`<rect width="${W}" height="${H}" fill="url(#glowL)"/><rect width="${W}" height="${H}" fill="url(#glowR)"/>`);
for (let index = 0; index < 90; index += 1) {
  parts.push(`<circle cx="${n(between(0, 1300))}" cy="${n(between(0, 150))}" r="${n(between(0.4, 1.3))}" fill="#d6e8ff" opacity="${n(between(0.2, 0.75))}"/>`);
}

const scene = [];
scene.push(`<g id="city">${city.join("")}</g>`);

// The river and the reflection of the city in it.
scene.push(`<rect y="${WL}" width="${W}" height="${H - WL}" fill="url(#river)"/>`);
scene.push(`<g mask="url(#reflMask)" filter="url(#soft)" opacity=".8"><g transform="translate(0 ${2 * WL}) scale(1 -1)"><use href="#city"/></g></g>`);
for (let row = 0; row < 14; row += 1) {
  const y = WL + 5 + row * 5.2;
  scene.push(`<rect x="${n(between(0, 500))}" y="${n(y)}" width="${n(between(120, 520))}" height=".7" fill="#9fc4ff" opacity="${n(between(0.05, 0.16))}"/>`);
}

// The bridge with its lamps and the light trails over the water.
scene.push(`<path d="M-20 ${WL + 40} Q260 ${WL + 8} 560 ${WL + 30} T1010 ${WL + 18}" fill="none" stroke="#0a1238" stroke-width="16"/>`);
for (const [color, offset, width] of [["#ffb347", 0, 3.2], ["#ff6a4d", 5, 2.4], ["#ffe28a", -5, 2], ["#ff4d8a", 10, 1.6], ["#7fe8ff", 14, 1.4]]) {
  scene.push(`<path d="M120 ${WL + 40 + offset} Q330 ${WL + 12 + offset} 560 ${WL + 30 + offset} T1010 ${WL + 18 + offset}" fill="none" stroke="${color}" stroke-width="${width}" opacity=".92" filter="url(#glow)"/>`);
}
for (let x = 140; x < 1000; x += 34) {
  const y = WL + 36 - Math.sin(((x - 140) / 860) * Math.PI) * 14;
  scene.push(`<circle cx="${x}" cy="${n(y - 9)}" r="1.8" fill="#fff3c8" filter="url(#glow)"/>`);
}

// Bokeh and foreground trees.
for (let index = 0; index < 26; index += 1) {
  scene.push(`<circle cx="${n(between(0, 1100))}" cy="${n(between(WL - 20, H - 6))}" r="${n(between(3, 9))}" fill="${pick(["#ffd58a", "#8fdcff", "#ff9be2", "#ffffff"])}" opacity="${n(between(0.1, 0.26))}" filter="url(#soft)"/>`);
}
for (let x = -6; x < 360; x += between(12, 22)) {
  const radius = between(13, 26);
  scene.push(`<ellipse cx="${n(x)}" cy="${n(H - between(0, 10))}" rx="${n(radius)}" ry="${n(radius * 0.95)}" fill="#04162a"/>`);
}
scene.push(`<rect y="${H - 12}" width="${W}" height="14" fill="#040a1c" opacity=".9"/>`);

parts.push(`<g mask="url(#sideMask)">${scene.join("")}</g>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMinYMax slice"><defs>${defs.join("")}</defs>${parts.join("")}</svg>\n`;
writeFileSync(new URL("../public/assets/home-skyline.svg", import.meta.url), svg);
console.log(`home-skyline.svg ${Math.round(svg.length / 1024)} KB`);
