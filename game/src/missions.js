// Sortie state: four gates, an optional supply drop at Gull Isle, and a runway
// landing judged from gear, speed, sink rate, bank and localizer alignment.

import { GATES, PLANE, clamp } from './config.js';
import { gateRings, villageSite, runwayOffset } from './world.js';

export function createMission(shot) {
  const target = clamp(shot?.gate ?? 0, 0, GATES.length);
  const landing = shot?.stage === 'landing' || target === GATES.length;
  return {
    stage: landing ? 'landing' : 'gates',
    target,
    passed: target,
    clock: 0,
    score: target * 500,
    heading: landing ? 'FINAL / RUNWAY 27' : 'GATE RUN / SALT KEY CIRCUIT',
    objective: landing
      ? 'Gear down. 128 kt or less. Sink under 28 ft/s. Centreline.'
      : `Fly gate ${target + 1} of ${GATES.length}. P drops supplies over Gull Isle.`,
    flash: '',
    flashAt: -10,
    crashed: false,
    complete: false,
    crashReason: '',
    dropped: false,
    events: [],
  };
}

function announce(mission, message, time) {
  mission.flash = message;
  mission.flashAt = time;
}

function crossedGate(plane, gate) {
  const nx = Math.sin(gate.yaw), nz = Math.cos(gate.yaw);
  const before = (plane.prev.x - gate.x) * nx + (plane.prev.z - gate.z) * nz;
  const after = (plane.x - gate.x) * nx + (plane.z - gate.z) * nz;
  if (before === after || before * after > 0) return false;
  const t = clamp(-before / (after - before), 0, 1);
  const px = plane.prev.x + (plane.x - plane.prev.x) * t;
  const py = plane.prev.y + (plane.y - plane.prev.y) * t;
  const pz = plane.prev.z + (plane.z - plane.prev.z) * t;
  const right = (px - gate.x) * gate.right.x + (pz - gate.z) * gate.right.z;
  const radius = Math.hypot(right, py - gate.y);
  return radius <= gate.r + 7;
}

export function trySupplyDrop(mission, plane, time) {
  if (mission.crashed || mission.complete) return;
  const site = villageSite();
  const distance = Math.hypot(plane.x - site.x, plane.z - site.z);
  if (mission.dropped || distance > site.r * 1.6 || plane.y < site.y + 25 || plane.y > site.y + 190) {
    announce(mission, 'NO DROP ZONE BELOW', time);
    return;
  }
  mission.dropped = true;
  mission.score += 400;
  announce(mission, 'SUPPLIES DELIVERED  +400', time);
  mission.events.push('drop');
}

export function updateMission(mission, plane, time, dt) {
  if (mission.crashed || mission.complete) return null;
  mission.clock += dt;

  if (plane.crashed) {
    mission.crashed = true;
    mission.crashReason = crashExplanation(plane);
    mission.events.push('crash');
    return 'crash';
  }

  if (mission.stage === 'gates') {
    const gate = gateRings[mission.target];
    const near = Math.hypot(plane.x - gate.x, plane.y - gate.y, plane.z - gate.z) < 18;
    if (crossedGate(plane, gate) || near) {
      mission.passed += 1;
      mission.target += 1;
      mission.score += 500;
      announce(mission, `${gate.name} CLEARED  +500`, time);
      mission.events.push('gate');
      if (mission.target >= GATES.length) {
        mission.stage = 'landing';
        mission.heading = 'FINAL / RUNWAY 27';
        mission.objective = 'Gear down. 128 kt or less. Sink under 28 ft/s. Centreline.';
        announce(mission, 'ALL GATES CLEAR - RETURN TO RUNWAY 27', time);
      }
      return 'gate';
    }
  }

  if (mission.stage === 'landing' && plane.landed) {
    const offset = runwayOffset(plane.x, plane.z);
    const centreBonus = Math.round(clamp(1 - Math.abs(offset.cross) / 36, 0, 1) * 300);
    mission.score += 1200 + centreBonus + Math.round(plane.fuel * 4);
    mission.complete = true;
    announcementForLanding(mission, time, centreBonus);
    mission.events.push('land');
    return 'land';
  }
  return null;
}

function announcementForLanding(mission, time, bonus) {
  announce(mission, `TOUCHDOWN  +${1200 + bonus}`, time);
}

function crashExplanation(plane) {
  const ground = Math.max(0, plane.y - 2);
  if (ground < 4) return 'Aircraft went into the water.';
  if (!plane.gear) return 'Gear was up at touchdown.';
  if (plane.speed > PLANE.landingSpeed) return 'Touchdown was too fast for the landing gear.';
  if (plane.touchdownSink > PLANE.landingSink) return 'Impact was too hard, sink rate exceeded the limit.';
  const offset = runwayOffset(plane.x, plane.z);
  if (Math.abs(offset.cross) > 36) return 'Aircraft touched down outside the runway edge.';
  return 'Aircraft struck the terrain.';
}

export function consumeEvents(mission) {
  const events = mission.events.slice();
  mission.events.length = 0;
  return events;
}
