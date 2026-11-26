// All sound is synthesized at run time with WebAudio: a filtered engine tone,
// a wind bed that follows airspeed, and short chimes for gates and landings.
// There are no audio files and nothing starts before a user gesture.

export function createAudio() {
  let context = null;
  let engineGain = null;
  let windGain = null;
  let engineTone = null;
  let muted = false;

  function makeNoiseBuffer(ctx) {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function start() {
    if (context || muted) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    try {
      context = new Ctor();
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 620;
      engineGain = context.createGain();
      engineGain.gain.value = 0.06;
      engineTone = context.createOscillator();
      engineTone.type = 'sawtooth';
      engineTone.frequency.value = 74;
      const sub = context.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 37;
      engineTone.connect(filter);
      sub.connect(filter);
      filter.connect(engineGain).connect(context.destination);
      engineTone.start();
      sub.start();

      const wind = context.createBufferSource();
      wind.buffer = makeNoiseBuffer(context);
      wind.loop = true;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 900;
      band.Q.value = 0.4;
      windGain = context.createGain();
      windGain.gain.value = 0.01;
      wind.connect(band).connect(windGain).connect(context.destination);
      wind.start();
    } catch {
      context = null;
    }
  }

  function update(plane) {
    if (!context || muted) return;
    const now = context.currentTime;
    engineTone.frequency.setTargetAtTime(52 + plane.throttle * 88 + plane.speed * 0.18, now, 0.12);
    engineGain.gain.setTargetAtTime(0.025 + plane.throttle * 0.075, now, 0.18);
    windGain.gain.setTargetAtTime(Math.max(0, (plane.speed - 55) / 900), now, 0.2);
  }

  function chime(frequency, duration, type = 'sine') {
    if (!context || muted) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function event(kind) {
    if (kind === 'gate') chime(660, 0.28);
    else if (kind === 'drop') chime(420, 0.34, 'triangle');
    else if (kind === 'land') { chime(520, 0.5); chime(780, 0.55); }
    else if (kind === 'crash') chime(130, 0.7, 'sawtooth');
  }

  function toggle() {
    muted = !muted;
    if (muted && context) {
      engineGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      windGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
    }
    return muted;
  }

  return { start, update, event, toggle, get muted() { return muted; } };
}
