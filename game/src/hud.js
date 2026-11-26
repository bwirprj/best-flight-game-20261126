// Instruments and mission typography. The tapes, compass and attitude ball are
// drawn as live instruments: the numbers move with the flight model, and the
// warning lamps read real aircraft state rather than decoration.

import { PALETTE, PLANE, RUNWAY, clamp, deg } from './config.js';
import { gateRings } from './world.js';

function text(ctx, value, x, y, size, color, align = 'left', weight = 600) {
  ctx.save();
  ctx.font = `${weight} ${size}px ui-monospace, "SFMono-Regular", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
  ctx.restore();
}

function panel(ctx, x, y, w, h, fill = 'rgba(6,24,32,0.58)', stroke = 'rgba(140,243,223,0.22)') {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function tape(ctx, x, y, w, h, value, step, color, format) {
  const mid = y + h / 2;
  panel(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, w - 2, h - 2);
  ctx.clip();
  const pxPerUnit = h / (step * 8);
  const base = Math.floor(value / step) * step;
  for (let i = -6; i <= 6; i++) {
    const v = base + i * step;
    const ty = mid - (v - value) * pxPerUnit;
    if (ty < y || ty > y + h) continue;
    const major = Math.abs(v % (step * 2)) < 0.01;
    ctx.strokeStyle = major ? color : 'rgba(140,243,223,0.35)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + w - (major ? 22 : 12), ty);
    ctx.lineTo(x + w - 3, ty);
    ctx.stroke();
    if (major) text(ctx, format(v), x + 8, ty, 11, 'rgba(205,240,230,0.85)');
  }
  ctx.restore();
  panel(ctx, x + 4, mid - 20, w - 8, 40, 'rgba(8,36,42,0.94)', color);
  text(ctx, format(value), x + w / 2, mid, 20, color, 'center', 700);
}

function compass(ctx, cx, y, heading) {
  const w = 470;
  panel(ctx, cx - w / 2, y, w, 44);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - w / 2 + 2, y + 2, w - 4, 40);
  ctx.clip();
  for (let d = -120; d <= 120; d += 5) {
    const hdg = (heading + d + 360) % 360;
    const x = cx + d * 1.9;
    const major = hdg % 30 === 0;
    ctx.strokeStyle = major ? PALETTE.hud : 'rgba(140,243,223,0.3)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 30);
    ctx.lineTo(x, y + (major ? 12 : 21));
    ctx.stroke();
    if (major) {
      const label = hdg === 0 ? 'N' : hdg === 90 ? 'E' : hdg === 180 ? 'S' : hdg === 270 ? 'W' : String(Math.round(hdg / 10));
      text(ctx, label, x, y + 8, 11, hdg === 0 ? PALETTE.amber : 'rgba(210,240,232,0.9)', 'center');
    }
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.amber;
  ctx.beginPath();
  ctx.moveTo(cx, y + 44);
  ctx.lineTo(cx - 7, y + 33);
  ctx.lineTo(cx + 7, y + 33);
  ctx.closePath();
  ctx.fill();
}

function attitude(ctx, cx, cy, plane) {
  const r = 80;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll);
  const shift = plane.pitch * 210;
  ctx.fillStyle = 'rgba(31,89,111,0.42)';
  ctx.fillRect(-r - 10, -r * 2 + shift, r * 2 + 20, r * 2 + 10);
  ctx.fillStyle = 'rgba(93,62,45,0.42)';
  ctx.fillRect(-r - 10, shift, r * 2 + 20, r * 2 + 10);
  ctx.strokeStyle = 'rgba(233,232,204,0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-r, shift);
  ctx.lineTo(r, shift);
  ctx.stroke();
  for (let pitchDeg = -30; pitchDeg <= 30; pitchDeg += 10) {
    if (pitchDeg === 0) continue;
    const ly = shift - pitchDeg * Math.PI / 180 * 210;
    const half = pitchDeg % 20 === 0 ? 48 : 26;
    ctx.beginPath();
    ctx.moveTo(-half, ly);
    ctx.lineTo(half, ly);
    ctx.stroke();
    text(ctx, String(Math.abs(pitchDeg)), half + 8, ly, 10, 'rgba(233,232,204,0.8)');
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(140,243,223,0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy);
  ctx.lineTo(cx - 9, cy);
  ctx.moveTo(cx + 9, cy);
  ctx.lineTo(cx + 30, cy);
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy + 5);
  ctx.stroke();
  ctx.restore();
}

function lamp(ctx, x, y, label, on, color = PALETTE.danger) {
  ctx.save();
  ctx.fillStyle = on ? color : 'rgba(90,110,110,0.25)';
  ctx.shadowColor = on ? color : 'transparent';
  ctx.shadowBlur = on ? 9 : 0;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  text(ctx, label, x + 11, y, 11, on ? color : 'rgba(170,195,190,0.55)');
}

export function drawHUD(ctx, state) {
  const { width, height, plane, mission, time } = state;
  const heading = (deg(plane.heading) + 360) % 360;
  const cx = width / 2;
  const knots = Math.round(plane.speed * 1.94384);
  const feet = Math.round(Math.max(0, plane.y) * 3.28084);

  compass(ctx, cx, 22, heading);
  text(ctx, `${String(Math.round(heading)).padStart(3, '0')}°`, cx, 86, 17, PALETTE.hud, 'center', 700);

  tape(ctx, 28, height / 2 - 150, 126, 300, knots, 20, PALETTE.hud, (v) => String(Math.round(v)));
  tape(ctx, width - 154, height / 2 - 150, 126, 300, feet, 200, PALETTE.hud, (v) => String(Math.round(v)));
  text(ctx, 'KNOTS', 91, height / 2 + 164, 12, PALETTE.hudDim, 'center');
  text(ctx, 'FEET MSL', width - 91, height / 2 + 164, 12, PALETTE.hudDim, 'center');

  attitude(ctx, cx, height / 2 + 10, plane);

  panel(ctx, 28, 100, 292, 122);
  text(ctx, mission.heading, 44, 124, 17, PALETTE.hud, 'left', 700);
  text(ctx, mission.objective, 44, 152, 13, '#dcefe7');
  text(ctx, `TIME  ${mission.clock.toFixed(1)}s`, 44, 177, 13, PALETTE.amber);
  text(ctx, `SCORE ${String(mission.score).padStart(5, '0')}`, 44, 200, 13, '#dcefe7');

  const target = mission.stage === 'gates' ? gateRings[mission.target] : null;
  if (target) {
    const distance = Math.hypot(target.x - plane.x, target.y - plane.y, target.z - plane.z);
    panel(ctx, cx - 130, 94, 260, 40);
    text(ctx, `TARGET ${target.name}  ${Math.round(distance)} m`, cx, 114, 13, PALETTE.hud, 'center', 700);
  } else if (mission.stage === 'landing') {
    const dx = RUNWAY.x - plane.x, dz = RUNWAY.z - plane.z;
    text(ctx, `RUNWAY 27  ${Math.round(Math.hypot(dx, dz))} m`, cx, 114, 13, PALETTE.amber, 'center', 700);
  }

  const barX = 30, barY = height - 62;
  panel(ctx, barX - 8, barY - 27, 220, 76);
  text(ctx, `THR ${Math.round(plane.throttle * 100)}%`, barX, barY - 10, 12, PALETTE.amber);
  ctx.fillStyle = 'rgba(255,196,107,0.2)';
  ctx.fillRect(barX, barY + 4, 180, 7);
  ctx.fillStyle = PALETTE.amber;
  ctx.fillRect(barX, barY + 4, 180 * plane.throttle, 7);
  text(ctx, `FUEL ${Math.round(plane.fuel)}%`, barX, barY + 26, 12, plane.fuel < 20 ? PALETTE.danger : PALETTE.hud);
  ctx.fillStyle = 'rgba(140,243,223,0.18)';
  ctx.fillRect(barX, barY + 38, 180, 6);
  ctx.fillStyle = plane.fuel < 20 ? PALETTE.danger : PALETTE.hud;
  ctx.fillRect(barX, barY + 38, 180 * plane.fuel / PLANE.fuelCapacity, 6);

  panel(ctx, width - 250, height - 96, 222, 68);
  text(ctx, plane.gear ? 'GEAR DOWN' : 'GEAR UP', width - 236, height - 77, 12, plane.gear ? PALETTE.hud : PALETTE.hudDim);
  text(ctx, `HULL ${Math.round(plane.health)}%`, width - 236, height - 56, 12, plane.health > 40 ? PALETTE.hud : PALETTE.danger);
  lamp(ctx, width - 92, height - 76, 'STALL', plane.speed < PLANE.stallSpeed);
  lamp(ctx, width - 92, height - 55, 'FUEL', plane.fuel < 20);
  lamp(ctx, width - 92, height - 34, 'SPD', plane.gear && plane.speed > PLANE.gearSpeed, PALETTE.amber);

  if (mission.flash && time - mission.flashAt < 1.4) {
    const alpha = clamp(1.4 - (time - mission.flashAt), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    panel(ctx, cx - 220, height - 190, 440, 46, 'rgba(8,40,44,0.88)', PALETTE.hud);
    text(ctx, mission.flash, cx, height - 167, 17, PALETTE.hud, 'center', 700);
    ctx.restore();
  }

  if (state.mode === 'cockpit') {
    text(ctx, 'COCKPIT VIEW  ·  C TO CHANGE', cx, height - 26, 11, PALETTE.hudDim, 'center');
  }
}

export function drawTitle(ctx, state) {
  const { width, height, time } = state;
  ctx.save();
  ctx.fillStyle = 'rgba(5,18,27,0.68)';
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2, cy = height / 2;
  panel(ctx, cx - 370, cy - 235, 740, 470, 'rgba(6,28,37,0.92)', 'rgba(140,243,223,0.45)');
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 340, cy - 205);
  ctx.lineTo(cx + 340, cy - 205);
  ctx.stroke();
  text(ctx, 'SALTLINE PATROL', cx, cy - 168, 44, PALETTE.hud, 'center', 700);
  text(ctx, 'ARCHIPELAGO GATE RUN  /  RUNWAY 27', cx, cy - 126, 15, PALETTE.amber, 'center');
  const lines = [
    'Fly four gates across the reef, then bring the aircraft home.',
    '',
    'W / S     throttle up and down',
    'A / D     bank left and right',
    'UP / DOWN  pitch  ·  Q / E  rudder',
    'MOUSE     pitch and bank',
    'G         landing gear  ·  C  camera',
    'ENTER     start sortie  ·  R  restart',
    '',
    'Keep speed above the stall. Gear down and under 128 kt to land.',
  ];
  lines.forEach((line, i) => text(ctx, line, cx - 310, cy - 80 + i * 28, 14, i === 0 || i === 9 ? '#e5dcc0' : 'rgba(190,222,213,0.82)'));
  const pulse = 0.6 + 0.4 * Math.sin(time * 3);
  ctx.globalAlpha = pulse;
  text(ctx, 'PRESS ENTER TO FLY', cx, cy + 200, 20, PALETTE.amber, 'center', 700);
  ctx.restore();
}

export function drawDebrief(ctx, state) {
  const { width, height, mission, plane } = state;
  ctx.save();
  ctx.fillStyle = 'rgba(4,18,26,0.74)';
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2, cy = height / 2;
  panel(ctx, cx - 300, cy - 170, 600, 340, 'rgba(6,28,37,0.95)', mission.crashed ? PALETTE.danger : PALETTE.hud);
  text(ctx, mission.crashed ? 'AIRCRAFT LOST' : 'SORTIE COMPLETE', cx, cy - 118, 30, mission.crashed ? PALETTE.danger : PALETTE.hud, 'center', 700);
  text(ctx, mission.crashed ? mission.crashReason : 'Clean landing at Salt Key, Runway 27', cx, cy - 70, 14, '#dcefe7', 'center');
  const rows = [
    ['GATES', `${mission.passed} / 4`],
    ['FLIGHT TIME', `${mission.clock.toFixed(1)} s`],
    ['FUEL LEFT', `${Math.round(plane.fuel)} %`],
    ['SCORE', String(mission.score)],
  ];
  rows.forEach(([label, value], i) => {
    const y = cy - 20 + i * 36;
    text(ctx, label, cx - 215, y, 14, PALETTE.hudDim);
    text(ctx, value, cx + 215, y, 17, PALETTE.amber, 'right', 700);
  });
  text(ctx, 'PRESS R TO FLY AGAIN', cx, cy + 135, 17, PALETTE.hud, 'center', 700);
  ctx.restore();
}
