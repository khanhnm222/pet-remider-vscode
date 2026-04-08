/**
* Generates Lottie JSON animation files for each pet type.
* Each pet gets walk, idle, sleep, and (for flyers) fly animations.
* Run: node scripts/generate-lottie.js
*/
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../media/lottie');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Lottie helpers ────────────────────────────────────────────────────────────

/**
* Make a Lottie keyframe value for position/scale/rotation.
* t = time in frames, v = value array, ease = [ox,oy,ix,iy] bezier handles
*/
function kf(t, v, easeOut = [0.167, 0.167], easeIn = [0.833, 0.833]) {
  return {
    t,
    s: Array.isArray(v) ? v : [v],
    e: Array.isArray(v) ? v : [v],
    i: { x: [easeIn[0]],  y: [easeIn[1]]  },
    o: { x: [easeOut[0]], y: [easeOut[1]] },
  };
}

/** Make a static (no animation) transform */
function staticTransform({ ax = 0, ay = 0, px = 0, py = 0, sx = 100, sy = 100, r = 0 } = {}) {
  return {
    a: { a: 0, k: [ax, ay] },
    p: { a: 0, k: [px, py] },
    s: { a: 0, k: [sx, sy] },
    r: { a: 0, k: r },
    o: { a: 0, k: 100 },
    sk: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
    nm: 'Transform',
  };
}

/** Make an animated rotation property */
function animRotation(keyframes) {
  return { a: 1, k: keyframes, ix: 10 };
}

/** Make an animated position property */
function animPosition(keyframes) {
  return { a: 1, k: keyframes, ix: 2 };
}

/** Make a static rotation */
function staticR(r) { return { a: 0, k: r, ix: 10 }; }

/** Make a static position */
function staticP(x, y) { return { a: 0, k: [x, y, 0], ix: 2 }; }

/** Ellipse shape */
function ellipse(w, h, cx, cy, color) {
  return {
    ty: 'gr',
    nm: 'Ellipse',
    it: [
      { ty: 'el', nm: 'Ellipse Path', s: { a: 0, k: [w, h] }, p: { a: 0, k: [cx, cy] } },
      { ty: 'fl', nm: 'Fill', c: { a: 0, k: color }, o: { a: 0, k: 100 }, r: 1 },
      { ty: 'tr', ...staticTransform() },
    ],
  };
}

/** Rectangle shape */
function rect(w, h, cx, cy, r, color) {
  return {
    ty: 'gr',
    nm: 'Rect',
    it: [
      { ty: 'rc', nm: 'Rect Path', s: { a: 0, k: [w, h] }, p: { a: 0, k: [cx, cy] }, r: { a: 0, k: r } },
      { ty: 'fl', nm: 'Fill', c: { a: 0, k: color }, o: { a: 0, k: 100 }, r: 1 },
      { ty: 'tr', ...staticTransform() },
    ],
  };
}

/**
* Create a shape layer with given shapes and an animated transform.
*/
function shapeLayer(nm, shapes, transform, inPoint = 0, outPoint = 60) {
  return {
    ddd: 0, ind: 1, ty: 4, nm, sr: 1, ks: transform,
    ao: 0, shapes, ip: inPoint, op: outPoint, st: 0, bm: 0,
  };
}

// ── Pet color palettes ────────────────────────────────────────────────────────
const PALETTES = {
  cat:       { body: [1, 0.8, 0.6, 1], detail: [0.4, 0.3, 0.2, 1], eye: [0.2, 0.15, 0.1, 1] },
  dog:       { body: [0.85, 0.65, 0.35, 1], detail: [0.6, 0.4, 0.15, 1], eye: [0.15, 0.1, 0.05, 1] },
  rabbit:    { body: [0.95, 0.9, 0.9, 1], detail: [0.9, 0.7, 0.7, 1], eye: [0.1, 0.1, 0.12, 1] },
  rat:       { body: [0.6, 0.6, 0.65, 1], detail: [0.45, 0.45, 0.5, 1], eye: [0.1, 0.1, 0.1, 1] },
  ox:        { body: [0.4, 0.3, 0.2, 1], detail: [0.3, 0.2, 0.1, 1], eye: [0.05, 0.05, 0.05, 1] },
  tiger:     { body: [0.95, 0.55, 0.1, 1], detail: [0.15, 0.1, 0.05, 1], eye: [0.1, 0.08, 0.02, 1] },
  snake:     { body: [0.2, 0.65, 0.3, 1], detail: [0.1, 0.45, 0.15, 1], eye: [1, 0.85, 0, 1] },
  horse:     { body: [0.55, 0.4, 0.25, 1], detail: [0.35, 0.25, 0.12, 1], eye: [0.1, 0.08, 0.05, 1] },
  goat:      { body: [0.9, 0.88, 0.82, 1], detail: [0.5, 0.45, 0.38, 1], eye: [0.15, 0.12, 0.08, 1] },
  monkey:    { body: [0.65, 0.45, 0.25, 1], detail: [0.85, 0.72, 0.6, 1], eye: [0.1, 0.08, 0.05, 1] },
  rooster:   { body: [0.8, 0.25, 0.1, 1], detail: [1, 0.7, 0, 1], eye: [0.05, 0.05, 0.05, 1] },
  pig:       { body: [1, 0.75, 0.8, 1], detail: [0.95, 0.55, 0.65, 1], eye: [0.1, 0.08, 0.08, 1] },
  dragon:    { body: [0.25, 0.75, 0.35, 1], detail: [1, 0.45, 0.05, 1], eye: [1, 0.9, 0, 1] },
  bird:      { body: [0.2, 0.55, 0.95, 1], detail: [1, 0.75, 0.1, 1], eye: [0.05, 0.05, 0.05, 1] },
  bee:       { body: [1, 0.82, 0.0, 1], detail: [0.1, 0.1, 0.1, 1], eye: [0.05, 0.05, 0.05, 1] },
  butterfly: { body: [0.85, 0.3, 0.9, 1], detail: [0.5, 0.1, 0.6, 1], eye: [0.1, 0.05, 0.1, 1] },
  parrot:    { body: [0.15, 0.75, 0.25, 1], detail: [1, 0.4, 0.05, 1], eye: [0.05, 0.05, 0.05, 1] },
};

// ── Build a generic quadruped walk animation ─────────────────────────────────

function buildGroundWalk(petType, totalFrames = 30) {
  const pal = PALETTES[petType];
  const W = 80, H = 80;

  // Body layer - horizontal bounce during walk
  const bodyTransform = {
    a: { a: 0, k: [0, 0] },
    p: {
      a: 1, k: [
        kf(0,  [40, 48, 0], [0.33, 0], [0.67, 1]),
        kf(8,  [40, 44, 0], [0.33, 0], [0.67, 1]),
        kf(15, [40, 48, 0], [0.33, 0], [0.67, 1]),
        kf(23, [40, 44, 0], [0.33, 0], [0.67, 1]),
        kf(30, [40, 48, 0], [0.33, 0], [0.67, 1]),
      ]
    },
    s: { a: 0, k: [100, 100, 100] },
    r: {
      a: 1, k: [
        kf(0,  [0]),
        kf(8,  [-2]),
        kf(15, [0]),
        kf(23, [2]),
        kf(30, [0]),
      ]
    },
    o: { a: 0, k: 100 },
    sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 },
    nm: 'Body',
  };

  // Front leg - swing
  const frontLegL = {
    a: { a: 0, k: [0, -14] },
    p: { a: 0, k: [24, 60, 0] },
    s: { a: 0, k: [100, 100, 100] },
    r: { a: 1, k: [kf(0,[20]),kf(8,[-20]),kf(15,[20]),kf(23,[-20]),kf(30,[20])] },
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'FLeg',
  };
  const frontLegR = {
    a: { a: 0, k: [0, -14] },
    p: { a: 0, k: [24, 60, 0] },
    s: { a: 0, k: [100, 100, 100] },
    r: { a: 1, k: [kf(0,[-20]),kf(8,[20]),kf(15,[-20]),kf(23,[20]),kf(30,[-20])] },
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'FLeg2',
  };
  // Back leg - opposite phase
  const backLegL = {
    a: { a: 0, k: [0, -14] },
    p: { a: 0, k: [54, 60, 0] },
    s: { a: 0, k: [100, 100, 100] },
    r: { a: 1, k: [kf(0,[-20]),kf(8,[20]),kf(15,[-20]),kf(23,[20]),kf(30,[-20])] },
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'BLeg',
  };
  const backLegR = {
    a: { a: 0, k: [0, -14] },
    p: { a: 0, k: [54, 60, 0] },
    s: { a: 0, k: [100, 100, 100] },
    r: { a: 1, k: [kf(0,[20]),kf(8,[-20]),kf(15,[20]),kf(23,[-20]),kf(30,[20])] },
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'BLeg2',
  };

  const tailAnim = {
    a: { a: 0, k: [0, -10] },
    p: { a: 0, k: [64, 52, 0] },
    s: { a: 0, k: [100, 100, 100] },
    r: { a: 1, k: [kf(0,[30]),kf(8,[-30]),kf(15,[30]),kf(23,[-30]),kf(30,[30])] },
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'Tail',
  };

  const layers = [
    // Tail
    { ddd:0, ind:6, ty:4, nm:'Tail', sr:1, ks: tailAnim, ao:0, ip:0, op:totalFrames, st:0, bm:0,
      shapes:[
        rect(8, 20, 0, 10, 4, pal.detail),
      ]
    },
    // Back legs
    { ddd:0, ind:5, ty:4, nm:'BackLegL', sr:1, ks: backLegL, ao:0, ip:0, op:totalFrames, st:0, bm:0,
      shapes:[ rect(9, 22, 0, 14, 4, pal.detail) ]
    },
    { ddd:0, ind:4, ty:4, nm:'BackLegR', sr:1, ks: backLegR, ao:0, ip:0, op:totalFrames, st:0, bm:0,
      shapes:[ rect(9, 22, 0, 14, 4, pal.detail) ]
    },
    // Body
    { ddd:0, ind:3, ty:4, nm:'Body', sr:1, ks: bodyTransform, ao:0, ip:0, op:totalFrames, st:0, bm:0,
      shapes:[
        ellipse(38, 28, 0, 0, pal.body),
        ellipse(22, 20, -10, -16, pal.body),  // head
        ellipse(5, 5, -20, -15, pal.detail),   // ear
        ellipse(5, 5, -4, -22, pal.detail),    // ear2
        ellipse(4, 3, -13, -18, pal.eye),      // eye
        ellipse(8, 6, -14, -11, [1,1,1,1]),    // muzzle
      ]
    },
    // Front legs
    { ddd:0, ind:2, ty:4, nm:'FrontLegL', sr:1, ks: frontLegL, ao:0, ip:0, op:totalFrames, st:0, bm:0,
      shapes:[ rect(9, 22, 0, 14, 4, pal.body) ]
    },
    { ddd:0, ind:1, ty:4, nm:'FrontLegR', sr:1, ks: frontLegR, ao:0, ip:0, op:totalFrames, st:0, bm:0,
      shapes:[ rect(9, 22, 0, 14, 4, pal.body) ]
    },
  ];

  return {
    v: '5.9.0', fr: 30, ip: 0, op: totalFrames, w: W, h: H,
    nm: `${petType}-walk`, ddd: 0, assets: [], layers,
  };
}

function buildGroundIdle(petType, totalFrames = 60) {
  const pal = PALETTES[petType];

  const bodyFloat = {
    a: { a: 0, k: [0, 0] },
    p: {
      a: 1, k: [
        kf(0,  [40, 50, 0], [0.45, 0], [0.55, 1]),
        kf(15, [40, 44, 0], [0.45, 0], [0.55, 1]),
        kf(30, [40, 50, 0], [0.45, 0], [0.55, 1]),
        kf(45, [40, 44, 0], [0.45, 0], [0.55, 1]),
        kf(60, [40, 50, 0], [0.45, 0], [0.55, 1]),
      ]
    },
    s: {
      a: 1, k: [
        kf(0,  [100, 100, 100]),
        kf(15, [102, 96, 100]),
        kf(30, [100, 100, 100]),
        kf(45, [102, 96, 100]),
        kf(60, [100, 100, 100]),
      ]
    },
    r: { a: 0, k: 0 },
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'Body',
  };

  // Tail wag
  const tailWag = {
    a: { a: 0, k: [0, -10] },
    p: { a: 0, k: [64, 54, 0] },
    s: { a: 0, k: [100, 100, 100] },
    r: { a: 1, k: [kf(0,[20]),kf(10,[-20]),kf(20,[20]),kf(30,[-20]),kf(40,[20]),kf(50,[-20]),kf(60,[20])] },
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'Tail',
  };

  const staticLeg = (x, y) => ({
    a: { a: 0, k: [0, -12] }, p: { a: 0, k: [x, y, 0] },
    s: { a: 0, k: [100, 100, 100] }, r: { a: 0, k: 5 },
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'Leg',
  });

  return {
    v: '5.9.0', fr: 30, ip: 0, op: totalFrames, w: 80, h: 80,
    nm: `${petType}-idle`, ddd: 0, assets: [],
    layers: [
      { ddd:0, ind:5, ty:4, nm:'Tail', sr:1, ks: tailWag, ao:0, ip:0, op:totalFrames, st:0, bm:0,
        shapes:[rect(8,20,0,10,4,pal.detail)] },
      { ddd:0, ind:4, ty:4, nm:'BackLegs', sr:1, ks: staticLeg(54,62), ao:0, ip:0, op:totalFrames, st:0, bm:0,
        shapes:[rect(18,18,0,12,8,pal.detail)] },
      { ddd:0, ind:3, ty:4, nm:'Body', sr:1, ks: bodyFloat, ao:0, ip:0, op:totalFrames, st:0, bm:0,
        shapes:[
          ellipse(38,28,0,0,pal.body),
          ellipse(22,20,-10,-16,pal.body),
          ellipse(5,5,-20,-15,pal.detail),
          ellipse(5,5,-4,-22,pal.detail),
          ellipse(4,3,-13,-18,pal.eye),
          ellipse(8,6,-14,-11,[1,1,1,1]),
        ]
      },
      { ddd:0, ind:2, ty:4, nm:'FrontLegs', sr:1, ks: staticLeg(24,62), ao:0, ip:0, op:totalFrames, st:0, bm:0,
        shapes:[rect(18,18,0,12,8,pal.body)] },
    ],
  };
}

function buildGroundSleep(petType, totalFrames = 90) {
  const pal = PALETTES[petType];

  const bodySway = {
    a: { a: 0, k: [40, 55] },
    p: { a: 0, k: [40, 55, 0] },
    s: { a: 0, k: [100, 100, 100] },
    r: { a: 1, k: [
      kf(0,[-5],[0.5,0],[0.5,1]),
      kf(22,[5],[0.5,0],[0.5,1]),
      kf(45,[-5],[0.5,0],[0.5,1]),
      kf(67,[5],[0.5,0],[0.5,1]),
      kf(90,[-5],[0.5,0],[0.5,1]),
    ]},
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'Sleeping',
  };

  // Z Z Z text layers as shapes
  const zLayer = (x, y, delay, idx) => ({
    ddd:0, ind: idx, ty:4, nm:`Z${idx}`, sr:1, ao:0, ip:0, op:totalFrames, st:delay, bm:0,
    ks: {
      a: { a: 0, k: [0,0] },
      p: { a: 1, k: [
        kf(delay,    [x, y, 0]),
        kf(delay+30, [x+5, y-20, 0]),
      ]},
      s: { a: 1, k: [kf(delay,[60,60,100]),kf(delay+30,[120,120,100])] },
      r: { a: 0, k: -10 },
      o: { a: 1, k: [kf(delay,[0]),kf(delay+5,[100]),kf(delay+25,[100]),kf(delay+30,[0])] },
      sk:{a:0,k:0}, sa:{a:0,k:0}, nm:'Z',
    },
    shapes:[
      { ty:'gr', nm:'Z', it:[
        { ty:'sh', nm:'Z path', ks:{ a:0, k:{ i:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
          o:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
          v:[[-5,-6],[5,-6],[0,-6],[-5,6],[5,6],[0,6]], c:false }}},
        { ty:'st', nm:'Stroke', c:{a:0,k:pal.detail}, o:{a:0,k:100}, w:{a:0,k:2}, lc:2, lj:2 },
        { ty:'tr', ...staticTransform() },
      ]},
    ],
  });

  return {
    v: '5.9.0', fr: 30, ip: 0, op: totalFrames, w: 80, h: 80,
    nm: `${petType}-sleep`, ddd: 0, assets: [],
    layers: [
      zLayer(55, 28, 0,  10),
      zLayer(62, 20, 15, 9),
      zLayer(70, 12, 30, 8),
      { ddd:0, ind:3, ty:4, nm:'Body', sr:1, ks: bodySway, ao:0, ip:0, op:totalFrames, st:0, bm:0,
        shapes:[
          ellipse(42,26,0,0,pal.body),    // curled body
          ellipse(22,20,-10,-14,pal.body), // head resting
          ellipse(6,5,-20,-13,pal.detail),
          ellipse(6,5,-5,-20,pal.detail),
          ellipse(4,3,-13,-16,pal.eye),
          ellipse(36,14,4,10,pal.detail), // tail wrapped around
        ]
      },
    ],
  };
}

function buildFlyAnim(petType, totalFrames = 24) {
  const pal = PALETTES[petType];

  const bodyBob = {
    a: { a: 0, k: [0, 0] },
    p: {
      a: 1, k: [
        kf(0,  [40, 40, 0], [0.33, 0], [0.67,1]),
        kf(6,  [40, 36, 0], [0.33, 0], [0.67,1]),
        kf(12, [40, 40, 0], [0.33, 0], [0.67,1]),
        kf(18, [40, 36, 0], [0.33, 0], [0.67,1]),
        kf(24, [40, 40, 0], [0.33, 0], [0.67,1]),
      ]
    },
    s: { a: 0, k: [100, 100, 100] },
    r: { a: 0, k: 0 },
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'Body',
  };

  // Wing flap — scaleY ping-pong
  const wingL = {
    a: { a: 0, k: [16, 0] },
    p: { a: 0, k: [24, 40, 0] },
    s: {
      a: 1, k: [
        kf(0,  [100, 100, 100]),
        kf(6,  [110, 40,  100]),
        kf(12, [100, 100, 100]),
        kf(18, [110, 40,  100]),
        kf(24, [100, 100, 100]),
      ]
    },
    r: { a: 0, k: -15 },
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'WingL',
  };
  const wingR = {
    a: { a: 0, k: [-16, 0] },
    p: { a: 0, k: [56, 40, 0] },
    s: {
      a: 1, k: [
        kf(0,  [100, 100, 100]),
        kf(6,  [110, 40,  100]),
        kf(12, [100, 100, 100]),
        kf(18, [110, 40,  100]),
        kf(24, [100, 100, 100]),
      ]
    },
    r: { a: 0, k: 15 },
    o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'WingR',
  };

  return {
    v: '5.9.0', fr: 30, ip: 0, op: totalFrames, w: 80, h: 80,
    nm: `${petType}-fly`, ddd: 0, assets: [],
    layers: [
      { ddd:0, ind:3, ty:4, nm:'WingL', sr:1, ks: wingL, ao:0, ip:0, op:totalFrames, st:0, bm:0,
        shapes:[ ellipse(28, 18, 0, 0, [...pal.detail.slice(0,3), 0.8]) ]
      },
      { ddd:0, ind:2, ty:4, nm:'WingR', sr:1, ks: wingR, ao:0, ip:0, op:totalFrames, st:0, bm:0,
        shapes:[ ellipse(28, 18, 0, 0, [...pal.detail.slice(0,3), 0.8]) ]
      },
      { ddd:0, ind:1, ty:4, nm:'Body', sr:1, ks: bodyBob, ao:0, ip:0, op:totalFrames, st:0, bm:0,
        shapes:[
          ellipse(22, 28, 0, 0, pal.body),  // body oval
          ellipse(18, 16, 0, -18, pal.body), // head
          ellipse(4, 4, -7, -20, pal.eye),   // eye
          ellipse(8, 5, 2, -10, pal.detail), // beak/snout
        ]
      },
    ],
  };
}

// ── Generate all files ────────────────────────────────────────────────────────

const GROUND_PETS = ['cat','dog','rabbit','rat','ox','tiger','snake','horse','goat','monkey','rooster','pig'];
const FLY_PETS   = ['dragon','bird','bee','butterfly','parrot'];

let count = 0;

for (const pet of GROUND_PETS) {
  fs.writeFileSync(path.join(OUT_DIR, `${pet}-walk.json`),  JSON.stringify(buildGroundWalk(pet)));
  fs.writeFileSync(path.join(OUT_DIR, `${pet}-idle.json`),  JSON.stringify(buildGroundIdle(pet)));
  fs.writeFileSync(path.join(OUT_DIR, `${pet}-sleep.json`), JSON.stringify(buildGroundSleep(pet)));
  count += 3;
}

for (const pet of FLY_PETS) {
  fs.writeFileSync(path.join(OUT_DIR, `${pet}-fly.json`),   JSON.stringify(buildFlyAnim(pet)));
  fs.writeFileSync(path.join(OUT_DIR, `${pet}-idle.json`),  JSON.stringify(buildFlyAnim(pet, 60)));
  count += 2;
}

console.log(`✅ Generated ${count} Lottie JSON files in media/lottie/`);
 