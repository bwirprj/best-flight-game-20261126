// Procedural archipelago: seabed noise, island profiles, a flattened runway
// plateau, gate geometry and cloud banks. Nothing here is loaded from a file.

import { ISLANDS, RUNWAY, GATES, CLOUDS, START, clamp, lerp, rad, smoothstep } from './config.js';

function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

function ridged(x, y) {
  return 1 - Math.abs(noise2(x, y) * 2 - 1);
}

export function heightAt(x, z) {
  let height = -30 + noise2(x * 0.0016, z * 0.0016) * 19 + noise2(x * 0.0052, z * 0.0052) * 7;

  for (let i = 0; i < ISLANDS.length; i++) {
    const island = ISLANDS[i];
    const dx = (x - island.x) / island.rx;
    const dz = (z - island.z) / island.rz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= 1.2) continue;
    const falloff = Math.pow(clamp(1 - d, 0, 1), 0.72);
    const detail = 0.66 + 0.22 * ridged(x * 0.004 + i * 9, z * 0.004 - i * 5)
                        + 0.12 * noise2(x * 0.012, z * 0.012);
    const mound = island.h * falloff * detail - 8;
    height = Math.max(height, mound);
  }

  // Level ground under the runway, blending back into Salt Key's hills.
  const dRunway = Math.hypot(x - RUNWAY.x, z - RUNWAY.z);
  if (dRunway < 600) {
    const blend = smoothstep(390, 590, dRunway);
    height = lerp(RUNWAY.y - 2, height, blend);
  }
  return height;
}

export function surfaceType(x, z, height) {
  const variation = noise2(x * 0.018, z * 0.018);
  if (height < 1.5) return 'foam';
  if (height < 9 || variation > 0.86 && height < 28) return 'sand';
  if (height < 118) return variation > 0.55 ? 'grassDark' : 'grass';
  if (height < 178) return 'rock';
  return 'peak';
}

export function runwayFrame() {
  const h = rad(RUNWAY.heading);
  const forward = { x: Math.sin(h), z: Math.cos(h) };
  const right = { x: Math.cos(h), z: -Math.sin(h) };
  const threshold = { x: RUNWAY.x - forward.x * RUNWAY.length / 2, z: RUNWAY.z - forward.z * RUNWAY.length / 2 };
  return { forward, right, threshold };
}

export function runwayOffset(x, z) {
  const frame = runwayFrame();
  const dx = x - frame.threshold.x, dz = z - frame.threshold.z;
  return {
    along: dx * frame.forward.x + dz * frame.forward.z,
    cross: dx * frame.right.x + dz * frame.right.z,
  };
}

export function isOnRunway(x, z) {
  const o = runwayOffset(x, z);
  return o.along > -30 && o.along < RUNWAY.length + 20 && Math.abs(o.cross) < RUNWAY.width / 2 + 5;
}

// Each gate is a ring in a vertical plane facing the leg's approach heading.
export const gateRings = GATES.map((gate, index) => {
  const previous = index === 0 ? START : GATES[index - 1];
  const yaw = Math.atan2(gate.x - previous.x, gate.z - previous.z);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const points = [];
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2;
    points.push({
      x: gate.x + rx * Math.cos(a) * gate.r,
      y: gate.y + Math.sin(a) * gate.r,
      z: gate.z + rz * Math.cos(a) * gate.r,
    });
  }
  return { ...gate, yaw, right: { x: rx, z: rz }, points, index };
});

export const cloudPuffs = CLOUDS.flatMap((cloud, bank) => {
  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.399 + bank;
    puffs.push({
      x: cloud.x + Math.cos(a) * 95 * cloud.s * (0.4 + (i % 3) * 0.3),
      y: cloud.y + Math.sin(i * 1.7) * 14,
      z: cloud.z + Math.sin(a) * 70 * cloud.s * (0.4 + (i % 3) * 0.3),
      r: (55 + (i % 3) * 24) * cloud.s,
      shade: i % 3,
    });
  }
  return puffs;
});

export function villageSite() {
  return { x: -240, z: 1460, y: Math.max(0, heightAt(-240, 1460)), r: 115 };
}
