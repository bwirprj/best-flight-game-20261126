// A small arcade flight model: throttle sets thrust, a bank turns the aeroplane,
// low speed makes the wing sink, and the ground only forgives a configured
// landing on the runway. The same orientation basis places the camera and the
// aeroplane's own polygons.

import { PLANE, RUNWAY, START, clamp, deg, rad } from './config.js';
import { heightAt, isOnRunway, runwayFrame } from './world.js';

export function createAircraft(shot) {
  return {
    x: shot?.x ?? START.x,
    y: shot?.y ?? START.y,
    z: shot?.z ?? START.z,
    heading: rad(shot?.heading ?? START.heading),
    pitch: shot?.pitch ?? START.pitch,
    roll: shot?.roll ?? START.roll,
    speed: shot?.speed ?? START.speed,
    throttle: shot?.throttle ?? START.throttle,
    fuel: PLANE.fuelCapacity,
    health: 100,
    gear: shot?.gear ?? false,
    gearTravel: shot?.gear ? 1 : 0,
    bankInput: 0,
    pitchInput: 0,
    rudderInput: 0,
    sink: 1,
    verticalSpeed: 0,
    airborne: true,
    crashed: false,
    landed: false,
    touchdownSink: 0,
    strobe: 0,
    elapsed: 0,
  };
}

export function aircraftBasis(plane) {
  const ch = Math.cos(plane.heading), sh = Math.sin(plane.heading);
  const cp = Math.cos(plane.pitch), sp = Math.sin(plane.pitch);
  const cr = Math.cos(plane.roll), sr = Math.sin(plane.roll);
  const forward = { x: sh * cp, y: sp, z: ch * cp };
  const levelRight = { x: ch, y: 0, z: -sh };
  const levelUp = { x: -sh * sp, y: cp, z: -ch * sp };
  const right = {
    x: levelRight.x * cr - levelUp.x * sr,
    y: levelRight.y * cr - levelUp.y * sr,
    z: levelRight.z * cr - levelUp.z * sr,
  };
  const up = {
    x: levelUp.x * cr + levelRight.x * sr,
    y: levelUp.y * cr + levelRight.y * sr,
    z: levelUp.z * cr + levelRight.z * sr,
  };
  return { forward, right, up };
}

export function toWorld(plane, local) {
  const b = aircraftBasis(plane);
  return {
    x: plane.x + b.right.x * local.x + b.up.x * local.y + b.forward.x * local.z,
    y: plane.y + b.right.y * local.x + b.up.y * local.y + b.forward.y * local.z,
    z: plane.z + b.right.z * local.x + b.up.z * local.y + b.forward.z * local.z,
  };
}

export function stepAircraft(plane, input, dt) {
  plane.elapsed += dt;
  plane.strobe = (plane.elapsed % 1.1) < 0.09 ? 1 : 0;

  plane.throttle = clamp(plane.throttle + input.throttle * dt * 0.4, 0, 1);
  const thrust = plane.throttle * 28;
  const brake = input.brake ? 9 : 0;
  const drag = Math.max(0, plane.speed - 32) * 0.16 + plane.speed * plane.speed * 0.0011 + brake;
  plane.speed = clamp(plane.speed + (thrust - drag) * dt, 12, PLANE.maxSpeed + 8);

  const authority = 0.6 + 0.4 * clamp(plane.speed / PLANE.cruiseSpeed, 0, 1.6);
  plane.roll = clamp(plane.roll + input.roll * PLANE.rollRate * authority * dt, -1.16, 1.16);
  if (Math.abs(input.roll) < 0.02) plane.roll *= Math.pow(0.55, dt);
  plane.pitch = clamp(plane.pitch + input.pitch * PLANE.pitchRate * authority * dt, -0.62, 0.78);

  if (plane.speed < PLANE.stallSpeed) {
    const severity = (PLANE.stallSpeed - plane.speed) / PLANE.stallSpeed;
    plane.pitch -= severity * 0.55 * dt;
    plane.roll += Math.sin(plane.elapsed * 7) * severity * 0.24 * dt;
  }

  const turn = Math.tan(plane.roll) * 9.81 / Math.max(plane.speed, 30) * 1.65;
  plane.heading += (turn + input.rudder * PLANE.yawRate * authority) * dt;
  if (plane.heading > Math.PI * 2) plane.heading -= Math.PI * 2;
  if (plane.heading < 0) plane.heading += Math.PI * 2;

  plane.sink = clamp(Math.pow(PLANE.stallSpeed / Math.max(plane.speed, 25), 2) * 7 - 1, -0.5, 14);
  plane.verticalSpeed = plane.speed * Math.sin(plane.pitch) - plane.sink;
  plane.fuel = Math.max(0, plane.fuel - PLANE.fuelBurn * plane.throttle * (1 + plane.speed / 200) * dt);
  if (plane.fuel <= 0) plane.throttle = 0;

  const targetGear = plane.gear ? 1 : 0;
  plane.gearTravel += clamp(targetGear - plane.gearTravel, -dt * 0.8, dt * 0.8);

  if (plane.airborne) {
    plane.x += Math.sin(plane.heading) * plane.speed * Math.cos(plane.pitch) * dt;
    plane.z += Math.cos(plane.heading) * plane.speed * Math.cos(plane.pitch) * dt;
    plane.y += plane.verticalSpeed * dt;
    checkContact(plane);
  } else {
    plane.speed *= Math.pow(0.22, dt);
    plane.y = Math.max(0, heightAt(plane.x, plane.z)) + 1.2;
  }
}

function checkContact(plane) {
  const ground = Math.max(0, heightAt(plane.x, plane.z));
  if (plane.y > ground + 2.6) return;

  plane.touchdownSink = Math.max(0, -plane.verticalSpeed);
  const frame = runwayFrame();
  const offset = {
    along: (plane.x - frame.threshold.x) * frame.forward.x + (plane.z - frame.threshold.z) * frame.forward.z,
    cross: (plane.x - frame.threshold.x) * frame.right.x + (plane.z - frame.threshold.z) * frame.right.z,
  };
  const headingError = Math.abs(Math.atan2(
    Math.sin(plane.heading - rad(RUNWAY.heading)), Math.cos(plane.heading - rad(RUNWAY.heading)),
  ));
  const clean = isOnRunway(plane.x, plane.z)
    && plane.gear && plane.gearTravel > 0.8
    && plane.speed <= PLANE.landingSpeed
    && plane.touchdownSink <= PLANE.landingSink
    && Math.abs(plane.roll) < 0.22
    && headingError < rad(14);

  if (clean) {
    plane.y = ground + 1.2;
    plane.airborne = false;
    plane.landed = true;
  } else {
    plane.y = ground + 1.2;
    plane.crashed = true;
    plane.airborne = false;
    plane.health = 0;
  }
}

// Polygons are given in local coordinates: x right, y up, z towards the nose.
// They are drawn in the renderer with one flat colour per face and fog blend.
export const PLANE_FACES = [
  { pts: [[0, 0.2, 10.5], [-1.5, -0.4, 4], [-1.9, -0.6, -2], [0, -0.4, -7.5]], color: '#2e6e75', shade: 0.82 },
  { pts: [[0, 0.2, 10.5], [1.5, -0.4, 4], [1.9, -0.6, -2], [0, -0.4, -7.5]], color: '#e9dcc0', shade: 1.0 },
  { pts: [[0, 0.2, 10.5], [0, 1.25, 4], [0, 1.45, -2], [0, 0.7, -7]], color: '#f0e5cf', shade: 1.08 },
  { pts: [[0, 1.25, 4], [-1.5, -0.4, 4], [-1.9, -0.6, -2], [0, 1.45, -2]], color: '#b9c8bd', shade: 0.95 },
  { pts: [[0, 1.25, 4], [1.5, -0.4, 4], [1.9, -0.6, -2], [0, 1.45, -2]], color: '#d9e2d5', shade: 1.05 },
  { pts: [[-1.6, 0.35, 3.6], [-9.4, -0.15, -2.7], [-9.1, -0.2, -3.9], [-1.8, -0.35, -2.4]], color: '#4aa39c', shade: 1.0, wing: -1 },
  { pts: [[1.6, 0.35, 3.6], [9.4, -0.15, -2.7], [9.1, -0.2, -3.9], [1.8, -0.35, -2.4]], color: '#3c8d8b', shade: 0.9, wing: 1 },
  { pts: [[-1.6, 0.36, 3.6], [-9.4, -0.15, -2.7], [-9.1, -0.2, -3.9], [-1.8, -0.35, -2.4]], color: '#3a7e80', shade: 0.7, top: true },
  { pts: [[1.6, 0.36, 3.6], [9.4, -0.15, -2.7], [9.1, -0.2, -3.9], [1.8, -0.35, -2.4]], color: '#3a7e80', shade: 0.7, top: true },
  { pts: [[-0.8, 0.5, -5.4], [-4.6, 0.7, -8.4], [-4.4, 0.6, -9.1], [-0.8, 0.2, -7.2]], color: '#ddcdb0', shade: 0.95 },
  { pts: [[0.8, 0.5, -5.4], [4.6, 0.7, -8.4], [4.4, 0.6, -9.1], [0.8, 0.2, -7.2]], color: '#c5b699', shade: 0.85 },
  { pts: [[0, 1.2, -4.6], [0, 4.7, -7.7], [0, 1.1, -8.2]], color: '#2f6d76', shade: 0.88 },
  { pts: [[-0.45, 1.3, 3.4], [0, 2.1, 2.2], [0, 2.0, -1.4], [-0.7, 1.35, -1.8]], color: '#123848', shade: 1.2, glass: true },
  { pts: [[0.45, 1.3, 3.4], [0, 2.1, 2.2], [0, 2.0, -1.4], [0.7, 1.35, -1.8]], color: '#165164', shade: 1.15, glass: true },
  { pts: [[-0.9, -0.65, -6.6], [-0.9, -0.65, -8.1], [0.9, -0.65, -8.1], [0.9, -0.65, -6.6]], color: '#182b32', shade: 0.8 },
];

export function planeGearPoints(plane) {
  const t = plane.gearTravel;
  if (t < 0.05) return [];
  const nose = toWorld(plane, { x: 0, y: -0.5 - 2.2 * t, z: 6.2 });
  const left = toWorld(plane, { x: -2.4, y: -0.6 - 2.6 * t, z: -1.2 });
  const right = toWorld(plane, { x: 2.4, y: -0.6 - 2.6 * t, z: -1.2 });
  return [nose, left, right];
}

export function wingtipLights(plane) {
  return [
    toWorld(plane, { x: -9.2, y: 0, z: -2.9 }),
    toWorld(plane, { x: 9.2, y: 0, z: -2.9 }),
  ];
}

export function headingDegrees(plane) {
  return (deg(plane.heading) + 360) % 360;
}
