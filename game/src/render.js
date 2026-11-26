// Pseudo-3D rendering for Saltline Patrol. Every vertex is projected by hand
// from a chase or cockpit camera; terrain is a painter-sorted faceted mesh with
// near-plane clipping, so the same code draws coastline, mountains, runway,
// gates and the aeroplane in one visual language. No images, no libraries.

import { PALETTE, WORLD, RUNWAY, clamp, lerp, smoothstep } from './config.js';
import { heightAt, surfaceType, runwayFrame, gateRings, cloudPuffs } from './world.js';
import { aircraftBasis, toWorld, PLANE_FACES, planeGearPoints, wingtipLights } from './aircraft.js';

const rgbCache = new Map();
function rgb(hex) {
  if (!rgbCache.has(hex)) {
    const h = hex.replace('#', '');
    rgbCache.set(hex, [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
  }
  return rgbCache.get(hex);
}

function mixColor(a, b, t) {
  const x = rgb(a), y = rgb(b);
  const k = clamp(t, 0, 1);
  const channel = (i) => Math.round(clamp(lerp(x[i], y[i], k), 0, 255)).toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function shadeColor(hex, amount) {
  const c = rgb(hex);
  return `rgb(${Math.round(clamp(c[0] * amount, 0, 255))},${Math.round(clamp(c[1] * amount, 0, 255))},${Math.round(clamp(c[2] * amount, 0, 255))})`;
}

export function createCamera() {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, focal: 500, width: 1280, height: 720 };
}

export function cameraHome(camera, plane, mode, width, height) {
  if (mode === 'cockpit') {
    const eye = toWorld(plane, { x: 0, y: 1.85, z: 1.4 });
    camera.x = eye.x; camera.y = eye.y; camera.z = eye.z;
    camera.yaw = plane.heading; camera.pitch = plane.pitch; camera.roll = plane.roll;
  } else {
    const b = aircraftBasis(plane);
    camera.x = plane.x - b.forward.x * 47 + b.up.x * 13;
    camera.y = plane.y - b.forward.y * 47 + b.up.y * 13;
    camera.z = plane.z - b.forward.z * 47 + b.up.z * 13;
    camera.yaw = plane.heading;
    camera.pitch = plane.pitch * 0.42 - 0.03;
    camera.roll = plane.roll * 0.34;
  }
  camera.width = width;
  camera.height = height;
  camera.focal = height * 0.72;
}

export function followCamera(camera, plane, mode, dt, width, height) {
  cameraHome(camera, plane, mode, width, height);
  camera.focal = height * 0.72;
  // cameraHome is the target; a light exponential lag keeps the horizon calm.
  const k = 1 - Math.exp(-dt * 6.5);
  if (!camera.ready) {
    camera.ready = true;
    return;
  }
  camera.x = lerp(camera.saved.x, camera.x, k);
  camera.y = lerp(camera.saved.y, camera.y, k);
  camera.z = lerp(camera.saved.z, camera.z, k);
  const wrap = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  camera.yaw = wrap(camera.saved.yaw, camera.yaw);
  camera.pitch = lerp(camera.saved.pitch, camera.pitch, k);
  camera.roll = lerp(camera.saved.roll, camera.roll, k);
  camera.saved = { x: camera.x, y: camera.y, z: camera.z, yaw: camera.yaw, pitch: camera.pitch, roll: camera.roll };
}

export function snapCamera(camera, plane, mode, width, height) {
  camera.ready = false;
  cameraHome(camera, plane, mode, width, height);
  camera.saved = { x: camera.x, y: camera.y, z: camera.z, yaw: camera.yaw, pitch: camera.pitch, roll: camera.roll };
}

function toCamera(p, cam) {
  const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const side = dx * cy - dz * sy;
  const ahead = dx * sy + dz * cy;
  const z = ahead * cp + dy * sp;
  const up = dy * cp - ahead * sp;
  const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
  return { x: side * cr + up * sr, y: -side * sr + up * cr, z };
}

function projectCamera(c, cam) {
  return { x: cam.width / 2 + c.x * cam.focal / c.z, y: cam.height / 2 - c.y * cam.focal / c.z, z: c.z };
}

export function projectPoint(p, cam) {
  const c = toCamera(p, cam);
  return c.z > 2 ? projectCamera(c, cam) : null;
}

function clipNear(points) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const aIn = a.z >= 2, bIn = b.z >= 2;
    if (aIn) result.push(a);
    if (aIn !== bIn) {
      const t = (2 - a.z) / (b.z - a.z);
      result.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: 2 });
    }
  }
  return result;
}

function polygon(ctx, screenPoints, fill, stroke) {
  if (screenPoints.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
  for (let i = 1; i < screenPoints.length; i++) ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function dot(ctx, x, y, r, color, glow) {
  ctx.save();
  ctx.fillStyle = color;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const heights = new Map();
  let width = 1280, height = 720;

  function resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    width = Math.max(320, canvas.clientWidth || window.innerWidth);
    height = Math.max(240, canvas.clientHeight || window.innerHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  function gridHeight(i, j) {
    const key = i * 100000 + j;
    let h = heights.get(key);
    if (h === undefined) {
      h = heightAt(i * WORLD.cell, j * WORLD.cell);
      if (heights.size > 30000) heights.clear();
      heights.set(key, h);
    }
    return h;
  }

  function drawSky(cam, time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.42, PALETTE.skyMid);
    gradient.addColorStop(0.72, PALETTE.skyHaze);
    gradient.addColorStop(1, PALETTE.seaFar);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const sunYaw = cam.yaw + 0.2;
    const sunDir = {
      x: cam.x + Math.sin(sunYaw) * 1e6,
      y: cam.y + Math.tan(0.12) * 1e6,
      z: cam.z + Math.cos(sunYaw) * 1e6,
    };
    const sun = projectPoint(sunDir, cam);
    if (sun && sun.x > -300 && sun.x < width + 300 && sun.y > -300 && sun.y < height + 300) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 230);
      glow.addColorStop(0, 'rgba(255,226,172,0.95)');
      glow.addColorStop(0.18, 'rgba(255,198,138,0.35)');
      glow.addColorStop(1, 'rgba(255,190,130,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - 240, sun.y - 240, 480, 480);
      dot(ctx, sun.x, sun.y, 26, PALETTE.sun, 30);
    }

    const horizon = [cam.yaw - 1.15, cam.yaw + 1.15].map((a) => projectPoint({
      x: cam.x + Math.sin(a) * 1e6, y: 0, z: cam.z + Math.cos(a) * 1e6,
    }, cam));
    if (horizon[0] && horizon[1]) {
      const hy = (horizon[0].y + horizon[1].y) / 2;
      const band = ctx.createLinearGradient(0, hy - 45, 0, hy + 145);
      band.addColorStop(0, 'rgba(238,180,130,0)');
      band.addColorStop(0.35, 'rgba(238,180,130,0.2)');
      band.addColorStop(1, 'rgba(238,180,130,0)');
      ctx.fillStyle = band;
      ctx.fillRect(0, hy - 45, width, 190);
    }

    // A few soft cloud bands, drawn as translucent puffs in screen space.
    for (const puff of cloudPuffs) {
      const p = projectPoint(puff, cam);
      if (!p || p.z > 3800) continue;
      const r = puff.r * cam.focal / p.z;
      if (r < 2 || r > 600) continue;
      ctx.save();
      ctx.globalAlpha = clamp(0.42 - p.z / 12000, 0.08, 0.42);
      ctx.fillStyle = puff.shade === 0 ? '#f5d6b6' : puff.shade === 1 ? '#d9c5ba' : '#9db7ba';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 1.9, r * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTerrain(cam, time) {
    const patches = [];
    const baseI = Math.floor(cam.x / WORLD.cell);
    const baseJ = Math.floor(cam.z / WORLD.cell);
    const haze = mixColor(PALETTE.skyHaze, PALETTE.skyMid, 0.42);
    for (let i = baseI - WORLD.radius; i <= baseI + WORLD.radius; i++) {
      for (let j = baseJ - WORLD.radius; j <= baseJ + WORLD.radius; j++) {
        const x0 = i * WORLD.cell, z0 = j * WORLD.cell;
        const x1 = x0 + WORLD.cell, z1 = z0 + WORLD.cell;
        const h00 = gridHeight(i, j), h10 = gridHeight(i + 1, j);
        const h01 = gridHeight(i, j + 1), h11 = gridHeight(i + 1, j + 1);
        const corners = [
          { x: x0, y: Math.max(0, h00), z: z0 },
          { x: x1, y: Math.max(0, h10), z: z0 },
          { x: x1, y: Math.max(0, h11), z: z1 },
          { x: x0, y: Math.max(0, h01), z: z1 },
        ];
        const cameraPoints = corners.map((p) => toCamera(p, cam));
        const meanZ = (cameraPoints[0].z + cameraPoints[1].z + cameraPoints[2].z + cameraPoints[3].z) / 4;
        if (meanZ < -WORLD.cell * 2) continue;
        const clipped = clipNear(cameraPoints);
        if (clipped.length < 3) continue;
        const screen = clipped.map((c) => projectCamera(c, cam));
        const avgH = (h00 + h10 + h11 + h01) / 4;
        const mx = x0 + WORLD.cell / 2, mz = z0 + WORLD.cell / 2;
        let color;
        if (avgH < 0.5) {
          const shimmer = Math.sin(mx * 0.011 + mz * 0.008 + time * 0.9) * 0.5 + 0.5;
          color = mixColor(PALETTE.seaNear, PALETTE.seaFar, clamp(meanZ / 1900, 0, 1));
          if (shimmer > 0.8 && meanZ < 1500) color = mixColor(color, PALETTE.seaGlint, (shimmer - 0.8) * 1.6);
        } else {
          const dx = (h10 - h00 + h11 - h01) / (2 * WORLD.cell);
          const dz = (h01 - h00 + h11 - h10) / (2 * WORLD.cell);
          const length = Math.hypot(dx, dz, 1);
          const lambert = (-dx * 0.5 + 0.72 + dz * 0.38) / length;
          const light = clamp(0.72 + lambert * 0.46, 0.62, 1.16);
          color = shadeColor(PALETTE[surfaceType(mx, mz, avgH)], light);
        }
        color = mixColor(color, haze, smoothstep(WORLD.fogStart, WORLD.fogEnd, meanZ));
        patches.push({ screen, depth: meanZ, color });
      }
    }
    patches.sort((a, b) => b.depth - a.depth);
    for (const patch of patches) polygon(ctx, patch.screen, patch.color, patch.color);
  }

  function drawRunway(cam) {
    const frame = runwayFrame();
    const y = RUNWAY.y + 0.35;
    const corner = (along, cross) => ({
      x: frame.threshold.x + frame.forward.x * along + frame.right.x * cross,
      y,
      z: frame.threshold.z + frame.forward.z * along + frame.right.z * cross,
    });
    const surface = [
      corner(0, -RUNWAY.width / 2), corner(RUNWAY.length, -RUNWAY.width / 2),
      corner(RUNWAY.length, RUNWAY.width / 2), corner(0, RUNWAY.width / 2),
    ].map((p) => toCamera(p, cam));
    const clipped = clipNear(surface);
    if (clipped.length < 3) return;
    polygon(ctx, clipped.map((c) => projectCamera(c, cam)), '#2b3b43', '#8ca5a1');

    const strip = (a0, a1, c0, c1, color) => {
      const pts = [corner(a0, c0), corner(a1, c0), corner(a1, c1), corner(a0, c1)]
        .map((p) => toCamera(p, cam));
      const clip = clipNear(pts);
      if (clip.length >= 3) polygon(ctx, clip.map((c) => projectCamera(c, cam)), color);
    };
    for (let a = 22; a < RUNWAY.length - 12; a += 62) strip(a, a + 30, -1.8, 1.8, '#e5dcc1');
    for (let c = -22; c <= 22; c += 11) strip(10, 42, c - 2.2, c + 2.2, '#e9dfc6');
    strip(RUNWAY.length - 45, RUNWAY.length - 10, -RUNWAY.width / 2 + 2, RUNWAY.width / 2 - 2, '#d9b37b');

    for (let a = 0; a <= RUNWAY.length; a += 55) {
      for (const side of [-1, 1]) {
        const p = projectPoint(corner(a, side * (RUNWAY.width / 2 + 5)), cam);
        if (p && p.z < 2400) dot(ctx, p.x, p.y, clamp(150 / p.z, 1.2, 5), PALETTE.hud, 6);
      }
    }
    for (let a = -240; a < 0; a += 34) {
      const p = projectPoint(corner(a, 0), cam);
      if (p && p.z < 2600) dot(ctx, p.x, p.y, clamp(190 / p.z, 1, 4), PALETTE.amber, 5);
    }
  }

  function drawGates(cam, time, targetIndex) {
    for (const gate of gateRings) {
      const projected = gate.points.map((p) => projectPoint(p, cam)).filter(Boolean);
      if (projected.length < 8) continue;
      const active = gate.index === targetIndex;
      const done = gate.index < targetIndex;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3.2 + gate.index);
      const color = done ? PALETTE.hudDim : active ? PALETTE.hud : PALETTE.amber;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(projected[0].x, projected[0].y);
      for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i].x, projected[i].y);
      ctx.closePath();
      ctx.globalAlpha = active ? 0.26 + pulse * 0.2 : 0.14;
      ctx.strokeStyle = color;
      ctx.lineWidth = active ? 19 : 10;
      ctx.stroke();
      ctx.globalAlpha = done ? 0.45 : 1;
      ctx.lineWidth = active ? 3.4 : 2.2;
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.setLineDash([9, 12]);
      ctx.stroke();
      ctx.restore();
      const top = projected.reduce((best, p) => (!best || p.y < best.y ? p : best), null);
      if (top && top.z < 2600) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = '600 14px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillText(`${gate.name} ${String(gate.index + 1).padStart(2, '0')}`, top.x, top.y - 13);
        ctx.restore();
      }
    }
  }

  function drawGuide(cam, plane, mission) {
    const gate = gateRings[mission.target];
    if (!gate || mission.stage !== 'gates') return;
    const p = projectPoint(gate, cam);
    if (!p) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(140,243,223,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 12]);
    ctx.beginPath();
    ctx.moveTo(width / 2, height * 0.58);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawAircraft(cam, plane, time) {
    const groundY = Math.max(0, heightAt(plane.x, plane.z));
    const shadow = projectPoint({ x: plane.x, y: groundY + 0.5, z: plane.z }, cam);
    if (shadow && shadow.z < 2000) {
      const size = clamp(900 / shadow.z, 5, 80);
      ctx.save();
      ctx.globalAlpha = clamp(0.4 - shadow.z / 5000, 0.07, 0.35);
      ctx.fillStyle = '#07212a';
      ctx.beginPath();
      ctx.ellipse(shadow.x, shadow.y, size * 1.5, size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const faces = PLANE_FACES.map((face) => {
      const world = face.pts.map((p) => toWorld(plane, { x: p[0], y: p[1], z: p[2] }));
      const camPts = world.map((p) => toCamera(p, cam));
      const depth = camPts.reduce((sum, c) => sum + c.z, 0) / camPts.length;
      return { face, camPts, depth };
    }).filter((f) => f.camPts.some((c) => c.z > 2));
    faces.sort((a, b) => b.depth - a.depth);
    for (const item of faces) {
      const clipped = clipNear(item.camPts);
      if (clipped.length < 3) continue;
      const p = clipped.map((c) => projectCamera(c, cam));
      let color = shadeColor(item.face.color, item.face.shade);
      if (item.face.glass) color = mixColor(color, PALETTE.hud, 0.12 + 0.06 * Math.sin(time * 2));
      polygon(ctx, p, color, 'rgba(12,35,42,0.35)');
    }

    const tips = wingtipLights(plane);
    tips.forEach((tip, i) => {
      const p = projectPoint(tip, cam);
      if (!p) return;
      const bright = plane.strobe ? '#ffffff' : i === 0 ? '#ff6c63' : '#8cf3df';
      dot(ctx, p.x, p.y, plane.strobe ? 4 : 2.6, bright, plane.strobe ? 18 : 9);
    });

    const flame = projectPoint(toWorld(plane, { x: 0, y: -0.1, z: -8.2 }), cam);
    if (flame && plane.throttle > 0.2) {
      const r = (2 + plane.throttle * 5) * cam.focal / flame.z * 2.2;
      const glow = ctx.createRadialGradient(flame.x, flame.y, 0, flame.x, flame.y, Math.max(2, r));
      glow.addColorStop(0, 'rgba(255,239,192,0.9)');
      glow.addColorStop(0.4, 'rgba(255,166,99,0.55)');
      glow.addColorStop(1, 'rgba(255,120,80,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(flame.x, flame.y, Math.max(2, r), 0, Math.PI * 2);
      ctx.fill();
    }

    const gearRoots = [
      { x: 0, y: -0.5, z: 6.2 },
      { x: -2.4, y: -0.5, z: -1.2 },
      { x: 2.4, y: -0.5, z: -1.2 },
    ];
    const gearPoints = planeGearPoints(plane);
    if (gearPoints.length) {
      ctx.strokeStyle = '#d6d2bd';
      ctx.lineWidth = 2;
      gearPoints.forEach((gp, index) => {
        const p = projectPoint(gp, cam);
        const root = projectPoint(toWorld(plane, gearRoots[index]), cam);
        if (p) dot(ctx, p.x, p.y, 3.5, '#1a2a2d');
        if (p && root) {
          ctx.beginPath();
          ctx.moveTo(root.x, root.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      });
    }
  }

  function drawCockpit(cam, plane) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,27,35,0.92)';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.79);
    ctx.quadraticCurveTo(width * 0.5, height * 0.7, width, height * 0.79);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,243,223,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#163d47';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width * 0.16, 0);
    ctx.lineTo(width * 0.04, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(width, 0);
    ctx.lineTo(width * 0.84, 0);
    ctx.lineTo(width * 0.96, height);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,196,107,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width * 0.16, 0);
    ctx.lineTo(width * 0.04, height);
    ctx.moveTo(width * 0.84, 0);
    ctx.lineTo(width * 0.96, height);
    ctx.stroke();
    ctx.restore();
  }

  function drawSpeedLines(plane) {
    const strength = clamp((plane.speed - 96) / 40, 0, 1);
    if (strength <= 0) return;
    ctx.save();
    ctx.strokeStyle = `rgba(215,236,224,${strength * 0.22})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4;
      const r0 = 180 + (i % 5) * 47;
      const x = width / 2 + Math.cos(a) * r0;
      const y = height / 2 + Math.sin(a) * r0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 60 * strength, y + Math.sin(a) * 60 * strength);
      ctx.stroke();
    }
    ctx.restore();
  }

  function render(scene) {
    const { cam, plane, time, mode, mission } = scene;
    drawSky(cam, time);
    drawTerrain(cam, time);
    drawRunway(cam);
    drawGates(cam, time, mission.target);
    drawGuide(cam, plane, mission);
    if (mode === 'cockpit') drawCockpit(cam, plane);
    else drawAircraft(cam, plane, time);
    drawSpeedLines(plane);
  }

  return { ctx, resize, render, get size() { return { width, height }; } };
}
