// Draws the night skyline used behind the signed-in home as a static SVG (public/assets/home-skyline.svg).
// It is generated from code, with a fixed seed, so the picture is reproducible and is not a copy of any reference image.
// Run: node scripts/generate-home-skyline.mjs
import { writeFileSync } from "node:fs";

const W = 1672;
const H = 369;

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

/** A tile of lit windows. Used as a fill, so thousands of windows cost a few hundred bytes. */
function windowPattern(id, color, density, cell = 5, columns = 6, rows = 8) {
  const dots = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (random() < density) dots.push(`<rect x="${column * cell + 1}" y="${row * cell + 1}" width="2.2" height="2.8" fill="${color}" opacity="${n(between(0.6, 1))}"/>`);
    }
  }
  return `<pattern id="${id}" width="${columns * cell}" height="${rows * cell}" patternUnits="userSpaceOnUse">${dots.join("")}</pattern>`;
}

const defs = [
  `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040a1f"/><stop offset=".5" stop-color="#091a47"/><stop offset="1" stop-color="#1d2f7c"/></linearGradient>`,
  `<radialGradient id="horizon" cx=".28" cy="1" r=".62"><stop offset="0" stop-color="#7b5bff" stop-opacity=".62"/><stop offset=".45" stop-color="#2d63d8" stop-opacity=".28"/><stop offset="1" stop-color="#0a1a45" stop-opacity="0"/></radialGradient>`,
  `<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#bfe9ff" stop-opacity=".55"/><stop offset="1" stop-color="#3fa7ff" stop-opacity="0"/></radialGradient>`,
  `<linearGradient id="glassBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f86e6"/><stop offset=".45" stop-color="#1b4aa6"/><stop offset="1" stop-color="#0a1f55"/></linearGradient>`,
  `<linearGradient id="glassViolet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5bf0"/><stop offset=".5" stop-color="#3a2fa6"/><stop offset="1" stop-color="#14185a"/></linearGradient>`,
  `<linearGradient id="glassTeal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#31c7d8"/><stop offset=".5" stop-color="#1a6fa0"/><stop offset="1" stop-color="#0a2552"/></linearGradient>`,
  `<linearGradient id="glassDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27468f"/><stop offset="1" stop-color="#0a1740"/></linearGradient>`,
  `<linearGradient id="far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a3a82"/><stop offset="1" stop-color="#0a1a45"/></linearGradient>`,
  `<linearGradient id="tower" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7fb8ff"/><stop offset=".35" stop-color="#f4fbff"/><stop offset=".7" stop-color="#9ccaff"/><stop offset="1" stop-color="#4c86d8"/></linearGradient>`,
  `<linearGradient id="towerShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#0a1a45" stop-opacity=".55"/></linearGradient>`,
  `<linearGradient id="klTower" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7ad9"/><stop offset=".5" stop-color="#9a7bff"/><stop offset="1" stop-color="#3a6fe0"/></linearGradient>`,
  `<linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a66"/><stop offset="1" stop-color="#060d26"/></linearGradient>`,
  `<linearGradient id="fadeSide" x1="0" y1="0" x2="1" y2="0"><stop offset=".6" stop-color="#fff"/><stop offset=".82" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
  `<mask id="sideMask"><rect width="${W}" height="${H}" fill="url(#fadeSide)"/></mask>`,
  `<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
  `<filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>`,
  windowPattern("winWarm", "#ffd58a", 0.5),
  windowPattern("winCool", "#8fdcff", 0.46),
  windowPattern("winWhite", "#ffffff", 0.34),
  windowPattern("winPink", "#ff9be2", 0.3),
];

const parts = [];
parts.push(`<rect width="${W}" height="${H}" fill="url(#sky)"/>`);
parts.push(`<rect width="${W}" height="${H}" fill="url(#horizon)"/>`);

// A scatter of faint stars in the upper sky.
for (let index = 0; index < 70; index += 1) {
  parts.push(`<circle cx="${n(between(0, 1250))}" cy="${n(between(0, 150))}" r="${n(between(0.5, 1.3))}" fill="#cfe6ff" opacity="${n(between(0.2, 0.7))}"/>`);
}

const art = [];

function outline(x, width, top, roof) {
  const bottom = H + 4;
  if (roof === "peak") return `${n(x)},${n(top + 12)} ${n(x + width / 2)},${n(top)} ${n(x + width)},${n(top + 12)} ${n(x + width)},${bottom} ${n(x)},${bottom}`;
  if (roof === "slant") return `${n(x)},${n(top + 16)} ${n(x + width)},${n(top)} ${n(x + width)},${bottom} ${n(x)},${bottom}`;
  return `${n(x)},${n(top)} ${n(x + width)},${n(top)} ${n(x + width)},${bottom} ${n(x)},${bottom}`;
}

function building({ x, width, top, fill, windows, glass = true, antenna = false, neon, opacity = 1, setback = false, roof = "flat" }) {
  const height = H - top + 4;
  const group = [`<g opacity="${opacity}">`];
  const shape = outline(x, width, top, roof);
  group.push(`<polygon points="${shape}" fill="url(#${fill})"/>`);
  if (windows) group.push(`<polygon points="${shape}" fill="url(#${windows})"/>`);
  if (glass) {
    group.push(`<rect x="${n(x)}" y="${n(top + 14)}" width="1.4" height="${n(height - 14)}" fill="#9fd4ff" opacity=".5"/>`);
    if (roof === "flat") group.push(`<rect x="${n(x)}" y="${n(top)}" width="${n(width)}" height="1.6" fill="#9fd4ff" opacity=".4"/>`);
  }
  if (setback) {
    const inner = width * 0.6;
    group.push(`<rect x="${n(x + (width - inner) / 2)}" y="${n(top - 14)}" width="${n(inner)}" height="15" fill="url(#${fill})"/>`);
    group.push(`<rect x="${n(x + (width - inner) / 2)}" y="${n(top - 14)}" width="${n(inner)}" height="1.4" fill="#9fd4ff" opacity=".5"/>`);
  }
  if (antenna) {
    const cx = x + width / 2;
    group.push(`<rect x="${n(cx - 0.6)}" y="${n(top - 26)}" width="1.2" height="${n(27)}" fill="#6fb6ff" opacity=".8"/><circle cx="${n(cx)}" cy="${n(top - 27)}" r="2" fill="#ff4d5e" filter="url(#glow)"/>`);
  }
  if (neon) {
    group.push(`<rect x="${n(x + width * between(0.25, 0.7))}" y="${n(top + 6)}" width="1.8" height="${n(height * 0.8)}" fill="${neon}" opacity=".85" filter="url(#glow)"/>`);
  }
  group.push("</g>");
  return group.join("");
}

// Far layer: pale silhouettes that give the skyline depth.
for (let x = 0; x < 1300; ) {
  const width = between(26, 54);
  art.push(building({ x, width, top: between(196, 268), fill: "far", windows: "winCool", glass: false, opacity: 0.55 }));
  x += width + between(0, 6);
}

// Middle layer: the bulk of the city, left to right, leaving the gap where the twin towers stand.
const fills = ["glassBlue", "glassBlue", "glassDark", "glassDark", "glassBlue", "glassViolet", "glassTeal"];
const windowsFor = ["winWarm", "winCool", "winWhite", "winCool", "winWarm", "winPink"];
for (let x = 0; x < 1250; ) {
  const width = between(30, 62);
  const insideTowers = x + width > 292 && x < 448;
  if (!insideTowers) {
    const leftCluster = x < 300;
    const rightCluster = x > 560 && x < 1060;
    const top = leftCluster ? between(112, 215) : rightCluster ? between(128, 226) : between(176, 250);
    art.push(
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
        opacity: leftCluster || rightCluster ? 1 : 0.92,
      }),
    );
  }
  x += width + between(0, 4);
}

// Twin towers, lit from within, with their glow behind them.
function tower(cx) {
  const tiers = [
    { half: 25, from: 369, to: 262 },
    { half: 22, from: 262, to: 206 },
    { half: 19, from: 206, to: 154 },
    { half: 16, from: 154, to: 112 },
    { half: 13, from: 112, to: 76 },
    { half: 10, from: 76, to: 48 },
    { half: 7, from: 48, to: 34 },
  ];
  const out = [`<ellipse cx="${cx}" cy="150" rx="86" ry="190" fill="url(#halo)"/>`];
  for (const tier of tiers) {
    const x = cx - tier.half;
    out.push(`<rect x="${x}" y="${tier.to}" width="${tier.half * 2}" height="${tier.from - tier.to}" fill="url(#tower)"/>`);
    for (let column = 1; column < 5; column += 1) {
      out.push(`<rect x="${n(x + (tier.half * 2 * column) / 5)}" y="${tier.to}" width=".9" height="${tier.from - tier.to}" fill="#2a5fb8" opacity=".5"/>`);
    }
    out.push(`<rect x="${x - 1.5}" y="${tier.to}" width="${tier.half * 2 + 3}" height="2.4" fill="#ffffff" opacity=".9"/>`);
  }
  out.push(`<rect x="${cx - 25}" y="262" width="50" height="107" fill="url(#towerShade)"/>`);
  // The crown and spire.
  out.push(`<path d="M${cx - 7} 34 Q${cx} 16 ${cx + 7} 34Z" fill="#f4fbff"/>`);
  out.push(`<rect x="${cx - 0.9}" y="6" width="1.8" height="30" fill="#dff1ff"/>`);
  out.push(`<circle cx="${cx}" cy="6" r="2.2" fill="#ffffff" filter="url(#glow)"/>`);
  return out.join("");
}
art.push(`<g filter="url(#glow)">${tower(327)}${tower(402)}</g>`);
// The sky bridge that joins the towers.
art.push(`<rect x="351" y="212" width="26" height="9" fill="#dff1ff" stroke="#8fc8ff" stroke-width="1"/><path d="M349 224 Q364 208 379 224" fill="none" stroke="#dff1ff" stroke-width="2"/>`);

// Broadcast tower with a lit pod.
function broadcastTower(cx) {
  return [
    `<ellipse cx="${cx}" cy="150" rx="46" ry="150" fill="url(#halo)" opacity=".5"/>`,
    `<path d="M${cx - 5} 369 L${cx - 2.4} 190 L${cx + 2.4} 190 L${cx + 5} 369Z" fill="url(#klTower)"/>`,
    `<path d="M${cx - 13} 168 Q${cx} 150 ${cx + 13} 168 L${cx + 11} 184 Q${cx} 192 ${cx - 11} 184Z" fill="#ffd2f2" filter="url(#glow)"/>`,
    `<rect x="${cx - 16}" y="186" width="32" height="6" rx="3" fill="#b9a7ff"/>`,
    `<rect x="${cx - 1.2}" y="64" width="2.4" height="104" fill="#ff9ae3" filter="url(#glow)"/>`,
    `<circle cx="${cx}" cy="62" r="3" fill="#ffffff" filter="url(#glow)"/>`,
  ].join("");
}
art.push(broadcastTower(908));

// Bridge and road with light trails, and dark trees in the foreground.
art.push(`<path d="M-20 369 L-20 342 Q200 318 430 340 T800 322 L800 369Z" fill="url(#road)"/>`);
for (const [color, offset, width] of [["#ffb347", 0, 3], ["#ff6a4d", 5, 2.4], ["#ffe28a", -5, 2], ["#ff4d8a", 10, 1.6]]) {
  art.push(`<path d="M170 ${352 + offset} Q330 ${322 + offset} 520 ${338 + offset} T860 ${322 + offset}" fill="none" stroke="${color}" stroke-width="${width}" opacity=".9" filter="url(#glow)"/>`);
}
for (let x = 0; x < 330; x += between(14, 26)) {
  const radius = between(14, 28);
  art.push(`<ellipse cx="${n(x)}" cy="${n(369 - between(0, 12))}" rx="${n(radius)}" ry="${n(radius * 0.9)}" fill="#041a2a"/>`);
}
art.push(`<rect y="352" width="${W}" height="20" fill="#050d24" opacity=".85"/>`);

parts.push(`<g mask="url(#sideMask)">${art.join("")}</g>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMinYMax slice"><defs>${defs.join("")}</defs>${parts.join("")}</svg>\n`;
writeFileSync(new URL("../public/assets/home-skyline.svg", import.meta.url), svg);
console.log(`home-skyline.svg ${Math.round(svg.length / 1024)} KB`);
