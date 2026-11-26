// Tuning constants for Saltline Patrol. One place to change how the aeroplane
// flies, how the world is laid out, and what each screenshot preset shows.

export const PALETTE = {
  skyTop: '#0b1d33',
  skyMid: '#275673',
  skyHaze: '#e2a77c',
  sun: '#ffdba6',
  seaFar: '#2b6b7c',
  seaNear: '#164f63',
  seaGlint: '#8fe0d2',
  foam: '#d7ece0',
  sand: '#e6cb9b',
  grass: '#57a076',
  grassDark: '#39775e',
  rock: '#8a8172',
  peak: '#d2c5ad',
  shadow: '#244a51',
  hud: '#8cf3df',
  hudDim: '#3d8f8c',
  amber: '#ffc46b',
  danger: '#ff7868',
  ink: '#08151f',
};

export const WORLD = {
  cell: 90,          // terrain mesh spacing, metres
  radius: 23,        // cells drawn in each direction from the camera
  seaLevel: 0,
  fogStart: 700,
  fogEnd: 3100,
  gravity: 9.81,
};

export const PLANE = {
  minSpeed: 32,      // below this the wing stalls
  cruiseSpeed: 82,
  maxSpeed: 138,
  stallSpeed: 44,
  maxThrottle: 1,
  fuelCapacity: 100,
  fuelBurn: 0.047,   // units per second at full throttle
  rollRate: 1.85,    // radians per second at full stick
  pitchRate: 0.82,
  yawRate: 0.32,
  gearSpeed: 68,     // gear starts to complain above this speed
  landingSpeed: 66,
  landingSink: 8.5,
  bodyRadius: 8,
};

export const RUNWAY = {
  x: 420,
  z: 300,
  y: 26,
  heading: 270,      // degrees, landing towards the west
  length: 640,
  width: 72,
};

export const ISLANDS = [
  { x: 420, z: 300, rx: 650, rz: 520, h: 168, name: 'Salt Key' },
  { x: 1450, z: -520, rx: 540, rz: 430, h: 225, name: 'Cinder Ridge' },
  { x: 1760, z: 640, rx: 430, rz: 500, h: 132, name: 'North Reef' },
  { x: -240, z: 1460, rx: 580, rz: 400, h: 118, name: 'Gull Isle' },
  { x: -1420, z: -780, rx: 470, rz: 540, h: 96, name: 'Low Cays' },
];

export const GATES = [
  { x: -520, y: 265, z: 300, r: 58, name: 'MATCH' },
  { x: 120, y: 365, z: 645, r: 48, name: 'PILLAR' },
  { x: 1400, y: 335, z: -215, r: 52, name: 'RIDGE' },
  { x: 1250, y: 118, z: 300, r: 45, name: 'HOME' },
];

export const CLOUDS = [
  { x: -300, y: 460, z: 1200, s: 1.3 },
  { x: 900, y: 520, z: 1500, s: 1.6 },
  { x: 1900, y: 410, z: -900, s: 1.1 },
  { x: -1500, y: 390, z: 500, s: 1.4 },
  { x: 400, y: 620, z: -1400, s: 1.8 },
  { x: 2200, y: 470, z: 1200, s: 1.2 },
];

export const START = {
  x: -1120, y: 225, z: 300, heading: 90, pitch: 0.02,
  roll: 0, speed: 82, throttle: 0.74,
};

// ?shot=name sets a deterministic moment of actual game state. It skips only
// the title screen; all rendering and flight physics stay the same.
export const SHOTS = {
  cover: {
    camera: 'chase', stage: 'gates', gate: 0,
    x: -1120, y: 225, z: 300, heading: 90, pitch: 0.025, roll: -0.12,
    speed: 86, throttle: 0.78, gear: false,
  },
  approach: {
    camera: 'chase', stage: 'landing', gate: GATES.length,
    x: 990, y: 76, z: 300, heading: 270, pitch: -0.045, roll: 0.03,
    speed: 54, throttle: 0.3, gear: true,
  },
  cockpit: {
    camera: 'cockpit', stage: 'gates', gate: 0,
    x: -690, y: 265, z: 312, heading: 90, pitch: 0.035, roll: 0,
    speed: 92, throttle: 0.82, gear: false,
  },
  bank: {
    camera: 'chase', stage: 'gates', gate: 2,
    x: 880, y: 360, z: 30, heading: 122, pitch: 0.055, roll: -0.46,
    speed: 98, throttle: 0.9, gear: false,
  },
};

export const deg = (rad) => rad * 180 / Math.PI;
export const rad = (degrees) => degrees * Math.PI / 180;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
