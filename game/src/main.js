// Saltline Patrol: boot, input dispatch, fixed-frame flight simulation and the
// title / sortie / debrief state machine. The optional ?shot= preset freezes a
// real moment of play for screenshots without altering the game itself.

import { SHOTS, START, PALETTE } from './config.js';
import { createAircraft, stepAircraft } from './aircraft.js';
import { createMission, updateMission, trySupplyDrop, consumeEvents } from './missions.js';
import { createRenderer, createCamera, snapCamera, followCamera } from './render.js';
import { drawHUD, drawTitle, drawDebrief } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('view');
const status = document.getElementById('status');
const query = new URLSearchParams(location.search);
const shotName = query.get('shot');
const shot = shotName && SHOTS[shotName] ? SHOTS[shotName] : null;

const renderer = createRenderer(canvas);
const camera = createCamera();
const input = createInput(canvas);
const audio = createAudio();

let state = shot ? 'playing' : 'title';
let cameraMode = shot?.camera ?? 'chase';
let plane = createAircraft(shot);
let mission = createMission(shot);
let time = 0;
let finishAt = 0;
let lastStatus = '';

let lastWidth = 0, lastHeight = 0;
function viewSize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  if (w === lastWidth && h === lastHeight && lastWidth) return { width: lastWidth, height: lastHeight };
  const size = renderer.resize();
  lastWidth = size.width;
  lastHeight = size.height;
  return size;
}

function resetSortie() {
  plane = createAircraft(null);
  mission = createMission(null);
  finishAt = 0;
  const { width, height } = viewSize();
  snapCamera(camera, plane, cameraMode, width, height);
  state = 'playing';
}

function handleCommands(controls) {
  if (controls.mute) audio.toggle();
  if (state === 'title') {
    if (controls.start || controls.camera || controls.gear) {
      audio.start();
      resetSortie();
    }
    return;
  }
  if (controls.restart) {
    resetSortie();
    return;
  }
  if (state !== 'playing') return;
  if (controls.camera) cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
  if (controls.gear) plane.gear = !plane.gear;
  if (controls.drop) trySupplyDrop(mission, plane, time);
}

function step(dt, controls) {
  time += dt;
  if (state !== 'playing') return;

  plane.prev = { x: plane.x, y: plane.y, z: plane.z };
  stepAircraft(plane, controls, dt);
  const event = updateMission(mission, plane, time, dt);
  for (const sound of consumeEvents(mission)) audio.event(sound);
  audio.update(plane);

  if ((plane.crashed || plane.landed) && !finishAt) finishAt = time + 1.2;
  if (finishAt && time > finishAt) state = 'debrief';

  const { width, height } = viewSize();
  followCamera(camera, plane, cameraMode, dt, width, height);
}

function draw() {
  const { width, height } = viewSize();
  const scene = {
    cam: camera, plane, mission, time, mode: cameraMode, width, height,
  };
  renderer.render(scene);
  if (state !== 'title') drawHUD(renderer.ctx, scene);
  if (state === 'title') drawTitle(renderer.ctx, scene);
  if (state === 'debrief') drawDebrief(renderer.ctx, scene);

  const announcement = state === 'title'
    ? 'Saltline Patrol. Press Enter to fly.'
    : state === 'debrief'
      ? (mission.crashed ? 'Aircraft lost. Press R to restart.' : 'Sortie complete. Press R to restart.')
      : `${mission.heading}. ${mission.objective}`;
  if (announcement !== lastStatus) {
    status.textContent = announcement;
    lastStatus = announcement;
  }
}

let previous = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
  previous = now;
  const controls = input.sample();
  handleCommands(controls);
  step(dt, controls);
  input.endFrame();
  draw();
  requestAnimationFrame(frame);
}

viewSize();
snapCamera(camera, plane, cameraMode, renderer.size.width, renderer.size.height);
window.addEventListener('resize', () => {
  viewSize();
  camera.focal = renderer.size.height * 0.72;
});
requestAnimationFrame(frame);

// A small read-only hook makes browser verification unambiguous.
window.__saltline = {
  get snapshot() {
    return {
      state,
      cameraMode,
      x: plane.x, y: plane.y, z: plane.z,
      heading: plane.heading, speed: plane.speed, throttle: plane.throttle,
      gear: plane.gear, stage: mission.stage, target: mission.target,
      score: mission.score, palette: PALETTE.hud,
    };
  },
};
