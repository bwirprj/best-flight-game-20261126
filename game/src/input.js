// Keyboard and mouse controls. Continuous axes feed the flight model; one-shot
// commands are consumed once so a held key cannot toggle gear every frame.

import { clamp } from './config.js';

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, active: false };

  const normalize = (event) => event.code || event.key.toLowerCase();

  window.addEventListener('keydown', (event) => {
    const key = normalize(event);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(event.code)) event.preventDefault();
    if (!down.has(key)) pressed.add(key);
    down.add(key);
  });
  window.addEventListener('keyup', (event) => down.delete(normalize(event)));
  window.addEventListener('blur', () => down.clear());

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
    mouse.y = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
    mouse.active = true;
  });
  canvas.addEventListener('mouseleave', () => { mouse.active = false; });
  canvas.addEventListener('mousedown', () => pressed.add('MouseFire'));

  const held = (...keys) => keys.some((key) => down.has(key));
  const tapped = (...keys) => keys.some((key) => pressed.has(key));

  function sample() {
    const keyboardRoll = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0);
    const keyboardPitch = (held('ArrowUp') ? 1 : 0) - (held('ArrowDown') ? 1 : 0);
    const rudder = (held('KeyE') ? 1 : 0) - (held('KeyQ') ? 1 : 0);
    const throttle = (held('KeyW') ? 1 : 0) - (held('KeyS') ? 1 : 0);
    return {
      roll: clamp(keyboardRoll + (mouse.active ? mouse.x * 0.85 : 0), -1, 1),
      pitch: clamp(keyboardPitch + (mouse.active ? mouse.y * 0.7 : 0), -1, 1),
      rudder,
      throttle,
      brake: held('Space'),
      gear: tapped('KeyG'),
      camera: tapped('KeyC'),
      start: tapped('Enter', 'MouseFire'),
      restart: tapped('KeyR'),
      drop: tapped('KeyP'),
      mute: tapped('KeyM'),
    };
  }

  function endFrame() {
    pressed.clear();
  }

  return { sample, endFrame };
}
