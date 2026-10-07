import { memo, useId } from 'react';
import useTheme from '../hooks/useTheme';

/**
 * Ultra HD ambient layer.
 *  • Dark  – Antarctic night: soft drifting light, Milky Way, twinkling star field,
 *            Southern Cross + Pointers, Magellanic Clouds, frequent meteors.
 *  • Light – moving sunlight & rays, drifting clouds, gusts of wind, fluttering leaves.
 * Everything is generated once from a fixed seed (stable between renders) and animated with
 * transform / opacity only, so it stays on the compositor and never blocks the page.
 */

// Deterministic PRNG so the sky looks the same on every visit and never re-randomises on render.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = seeded(20260707);
const between = (min, max) => min + rnd() * (max - min);
const fixed = (n, d = 2) => Number(n.toFixed(d));

// Star field: three box-shadow layers (one element each) that twinkle at different rates.
const STAR_LAYERS = [
  { count: 140, size: 1, alpha: [0.35, 0.75], duration: 7 },
  { count: 70, size: 1.5, alpha: [0.5, 0.9], duration: 11 },
  { count: 28, size: 2, alpha: [0.7, 1], duration: 5 },
].map((layer, li) => ({
  ...layer,
  key: li,
  shadow: Array.from({ length: layer.count }, () => {
    const tint = rnd() < 0.18 ? '200,220,255' : rnd() < 0.1 ? '255,232,200' : '255,255,255';
    return `${fixed(between(0, 100))}vw ${fixed(between(0, 100))}vh 0 ${layer.size > 1 ? fixed(layer.size / 2, 1) : 0}px rgba(${tint},${fixed(between(...layer.alpha))})`;
  }).join(','),
}));

// Southern Cross (Crux) + the Pointers (α & β Centauri) – positions in % of the viewport.
const SOUTHERN_STARS = [
  { x: 78, y: 16, s: 4.2, name: 'Gacrux' },
  { x: 76.2, y: 31, s: 5, name: 'Acrux' },
  { x: 71.5, y: 22.5, s: 4.6, name: 'Mimosa' },
  { x: 82.5, y: 21, s: 3.6, name: 'Imai' },
  { x: 80.3, y: 24.5, s: 2.2, name: 'Ginan' },
  { x: 60, y: 30, s: 5.4, name: 'Rigil Kentaurus' },
  { x: 64.5, y: 27.5, s: 4.6, name: 'Hadar' },
];

const METEORS = Array.from({ length: 12 }, (_, i) => ({
  key: i,
  style: {
    '--x': `${fixed(between(25, 105))}vw`,
    '--y': `${fixed(between(-6, 45))}vh`,
    '--len': `${Math.round(between(90, 220))}px`,
    '--ang': `${fixed(between(-42, -22))}deg`,
    '--dist': `${Math.round(between(45, 85))}vw`,
    '--dur': `${fixed(between(7, 15))}s`,
    '--delay': `${fixed(-between(0, 15))}s`,
  },
}));

// Weak devices (≤ 4 cores or ≤ 4 GB RAM) get a lighter sky with fewer moving layers.
const LITE = typeof navigator !== 'undefined'
  && ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4);

/**
 * Night glow: a few very large, soft light pools (pure radial gradients – no filters, masks or
 * blend modes) drifting slowly. Each is its own GPU layer that only moves / fades, so it is
 * painted once and costs almost nothing per frame.
 */
const NIGHT_GLOWS = [
  { key: 0, style: { '--x': '62%', '--y': '-12%', '--size': '78vmax', '--c': '64, 210, 190', '--o': 0.22, '--dur': '34s', '--delay': '0s' } },
  { key: 1, style: { '--x': '-18%', '--y': '8%', '--size': '70vmax', '--c': '96, 120, 255', '--o': 0.2, '--dur': '41s', '--delay': '-14s' } },
  { key: 2, style: { '--x': '30%', '--y': '46%', '--size': '64vmax', '--c': '150, 100, 255', '--o': 0.14, '--dur': '47s', '--delay': '-27s' } },
  { key: 3, style: { '--x': '78%', '--y': '58%', '--size': '52vmax', '--c': '70, 190, 255', '--o': 0.12, '--dur': '38s', '--delay': '-9s' } },
];

function NightGlow() {
  const glows = LITE ? NIGHT_GLOWS.slice(0, 2) : NIGHT_GLOWS;
  return (
    <div className="night-glow">
      {glows.map((g) => <span key={g.key} className="glow-orb" style={g.style} />)}
    </div>
  );
}

const LEAF_COLORS = [
  ['#7fa865', '#b7cf8e'], ['#5f9150', '#9cc27a'], ['#a3b96b', '#d6dd9a'],
  ['#c9a24a', '#e8c977'], ['#8db36f', '#c4dba0'], ['#d08a45', '#ecb978'],
];
const LEAVES = Array.from({ length: 18 }, (_, i) => {
  const [c1, c2] = LEAF_COLORS[i % LEAF_COLORS.length];
  return {
    key: i,
    style: {
      '--left': `${fixed(between(-12, 92))}vw`,
      '--size': `${fixed(between(10, 20))}px`,
      '--dur': `${fixed(between(16, 30))}s`,
      '--delay': `${fixed(-between(0, 30))}s`,
      '--drift': `${Math.round(between(18, 42))}vw`,
      '--sway': `${Math.round(between(20, 70))}px`,
      '--spin': `${fixed(between(2.2, 4.8))}s`,
      '--c1': c1,
      '--c2': c2,
    },
  };
});

// Each cloud has its own silhouette; a separate seed leaves the rest of the sky unchanged.
const CLOUDS = [
  { top: '5vh', scale: 1.15, duration: 140, delay: -55, opacity: .88, width: 390, height: 150, peaks: [62, 49, 76, 59, 69] },
  { top: '19vh', scale: .8, duration: 110, delay: -72, opacity: .72, width: 350, height: 115, peaks: [77, 66, 62, 78, 83, 75] },
  { top: '1vh', scale: .95, duration: 170, delay: -120, opacity: .7, width: 310, height: 160, peaks: [78, 53, 42, 67] },
  { top: '30vh', scale: .6, duration: 95, delay: -40, opacity: .54, width: 410, height: 100, peaks: [86, 77, 85, 70, 82, 88] },
  { top: '11vh', scale: 1.3, duration: 200, delay: -160, opacity: .65, width: 440, height: 145, peaks: [80, 58, 71, 49, 66, 81] },
].map((cloud, key) => {
  const random = seeded(440 + key);
  const puffs = cloud.peaks.map((cy, i) => ({
    cx: 62 + i * 270 / (cloud.peaks.length - 1), cy,
    rx: 38 + random() * 23, ry: 22 + random() * 21,
  }));
  const wisps = Array.from({ length: 24 }, () => {
    const puff = puffs[Math.floor(random() * puffs.length)];
    const angle = random() * Math.PI * 2;
    return {
      cx: puff.cx + Math.cos(angle) * puff.rx * .85,
      cy: puff.cy + Math.sin(angle) * puff.ry * .8,
      rx: 9 + random() * 18, ry: 5 + random() * 12, opacity: .2 + random() * .4,
    };
  });
  return { key, puffs, wisps, style: {
    '--top': cloud.top, '--scale': cloud.scale, '--dur': `${cloud.duration}s`,
    '--delay': `${cloud.delay}s`, '--o': cloud.opacity,
    '--cloud-width': `${cloud.width}px`, '--cloud-height': `${cloud.height}px`,
  } };
});

function CloudShape({ cloud }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="cloud-shape" viewBox="0 0 400 150" preserveAspectRatio="none" focusable="false">
      <defs>
        <linearGradient id={`${id}-shade`} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="120">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".52" stopColor="#fff" />
          <stop offset="1" stopColor="#e1eaf0" stopOpacity=".7" />
        </linearGradient>
        <radialGradient id={`${id}-puff`} cx=".42" cy=".3" r=".7">
          <stop offset="0" stopColor="#fff" stopOpacity=".4" />
          <stop offset=".65" stopColor="#fff" stopOpacity=".18" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-edge`} x="-15%" y="-30%" width="130%" height="160%">
          {!LITE && <>
            <feTurbulence type="fractalNoise" baseFrequency=".035 .065" numOctaves="2" seed={cloud.key + 7} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="22" xChannelSelector="R" yChannelSelector="G" />
          </>}
          <feGaussianBlur stdDeviation={LITE ? 3 : 2.4} />
        </filter>
      </defs>
      <g filter={`url(#${id}-edge)`}>
        {cloud.wisps.map((w, i) => <ellipse key={i} {...w} fill="#fff" />)}
        <g fill={`url(#${id}-shade)`}>
          {cloud.puffs.map((p, i) => <ellipse key={i} {...p} />)}
        </g>
      </g>
      <g fill={`url(#${id}-puff)`}>
        {cloud.puffs.map((p, i) => <ellipse key={i} cx={p.cx - 7} cy={p.cy - 8} rx={p.rx * 1.08} ry={p.ry * 1.12} />)}
      </g>
    </svg>
  );
}

const WINDS = Array.from({ length: 7 }, (_, i) => ({
  key: i,
  style: {
    '--top': `${fixed(10 + i * 12 + between(-3, 3))}vh`,
    '--w': `${Math.round(between(22, 42))}vw`,
    '--dur': `${fixed(between(9, 16))}s`,
    '--delay': `${fixed(-between(0, 16))}s`,
  },
}));

function NightSky() {
  return (
    <>
      <div className="night-gradient" />
      <div className="milky-way" />
      <div className="magellanic large" />
      <div className="magellanic small" />
      {STAR_LAYERS.map((l) => (
        <span key={l.key} className="star-layer" style={{ boxShadow: l.shadow, width: l.size, height: l.size, '--dur': `${l.duration}s` }} />
      ))}
      <NightGlow />
      {SOUTHERN_STARS.map((s) => (
        <span key={s.name} className="bright-star" title={s.name} style={{ left: `${s.x}%`, top: `${s.y}%`, '--s': `${s.s}px` }} />
      ))}
      {METEORS.map((m) => <span key={m.key} className="meteor" style={m.style} />)}
    </>
  );
}

function DaySky() {
  return (
    <>
      <div className="day-gradient" />
      <div className="sun-glow" />
      <div className="sun-rays" />
      {[0, 1, 2].map((i) => <span key={i} className="sun-shaft" style={{ '--i': i }} />)}
      {CLOUDS.map((c) => <span key={c.key} className="cloud" style={c.style}><CloudShape cloud={c} /></span>)}
      {WINDS.map((w) => <span key={w.key} className="wind-streak" style={w.style} />)}
      {LEAVES.map((l) => (
        <span key={l.key} className="leaf" style={l.style}><span className="leaf-body" /></span>
      ))}
    </>
  );
}

function AmbientEffects() {
  const { resolved } = useTheme();
  return (
    <div className={`ambient-effects ambient-${resolved}${LITE ? ' ambient-lite' : ''}`} aria-hidden="true">
      {resolved === 'light' ? <DaySky /> : <NightSky />}
    </div>
  );
}

export default memo(AmbientEffects);
