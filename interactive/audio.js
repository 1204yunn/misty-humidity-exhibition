// Keep the original local rain recording and one reusable audio graph per page.
const button = document.querySelector('#sound-toggle');
const audio = document.querySelector('#ambient-rain');
const labelNode = document.createElement('span');
labelNode.className = 'sound-label';
button.appendChild(labelNode);
const level = .15, fadeSeconds = 2;
let context, gain, source, wanted = false, manuallyMuted = false;
let lastAudioError = '';
function ensureRainGraph() {
  if (!context) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error('Web Audio unavailable');
    context = new Context();
    gain = context.createGain(); gain.gain.value = 0;
    source = context.createMediaElementSource(audio);
    // The original rain recording is very quiet (~0.004 RMS): compensate before user volume.
    const normalize = context.createGain(); normalize.gain.value = 10;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18; limiter.knee.value = 12; limiter.ratio.value = 6;
    limiter.attack.value = .003; limiter.release.value = .2;
    source.connect(normalize).connect(limiter).connect(gain).connect(context.destination);
    context.addEventListener('statechange', () => showState(wanted && context.state === 'running' && !audio.paused && !audio.muted));
  }
  return context;
}
let revision = 0, pauseTimer, pendingStart = false, resumeAfterPageShow = false, hiddenPause = false;
let ramp = { time: 0, from: 0, to: 0 }, lastDrop = -Infinity;
function showState(playing, error = false) {
  button.setAttribute('aria-pressed', String(playing));
  const label = error ? '開啟聲音（點擊重試）' : playing ? '靜音' : '開啟聲音';
  button.setAttribute('aria-label', label);
  button.title = label;
  labelNode.textContent = label;
}
function fadeTo(target) {
  const now = context.currentTime;
  const progress = Math.min(1, Math.max(0, (now - ramp.time) / fadeSeconds));
  const current = ramp.from + (ramp.to - ramp.from) * progress;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(current, now);
  gain.gain.linearRampToValueAtTime(target, now + fadeSeconds);
  ramp = { time: now, from: current, to: target };
}
function reset(error = false) {
  wanted = false; pendingStart = false; revision++; clearTimeout(pauseTimer);
  if (gain) {
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime);
    ramp = { time: context.currentTime, from: 0, to: 0 };
  }
  audio.pause(); showState(false, error);
}
async function startRain() {
  if (context?.state === 'running' && !audio.paused && wanted) return;
  if (pendingStart && !navigator.userActivation?.isActive) return;
  wanted = true; pendingStart = true;
  const request = ++revision;
  clearTimeout(pauseTimer);
  try {
    ensureRainGraph();
    lastAudioError = ''; audio.muted = false; audio.volume = 1;
    await Promise.all([context.resume(), audio.play()]);
    if (request !== revision || !wanted) { if (!wanted) audio.pause(); return; }
    pendingStart = false; fadeTo(level); showState(true);
  } catch (error) {
    if (request !== revision) return;
    lastAudioError = error.name + ': ' + error.message;
    reset(error.name !== 'NotAllowedError');
  }
}
function pauseRain() {
  audio.muted = true;
  wanted = false; pendingStart = false;
  const request = ++revision;
  clearTimeout(pauseTimer); showState(false);
  if (!gain) return;
  fadeTo(0);
  pauseTimer = setTimeout(() => { if (request === revision && !wanted) audio.pause(); }, fadeSeconds * 1000);
}
button.addEventListener('click', () => {
  if (wanted && context?.state === 'running') {
    manuallyMuted = true; pauseRain();
  } else { manuallyMuted = false; startRain(); }
});
function firstInteraction(event) {
  if (!event.isTrusted || event.target.closest?.('#sound-toggle, .audio-diagnostics') || manuallyMuted) return;
  startRain();
}
document.addEventListener('pointerdown', firstInteraction, { passive: true });
document.addEventListener('keydown', firstInteraction);
window.addEventListener('misty-wipe', () => {
  if (manuallyMuted) return;
  // Camera gesture events cannot grant autoplay permission: the button stays available.
  if (context?.state !== 'running' || audio.paused) { startRain(); return; }
  const now = context.currentTime;
  if (now - lastDrop < 2.5 || !wanted) return;
  lastDrop = now;
  const drop = context.createOscillator(), envelope = context.createGain();
  drop.type = 'sine'; drop.frequency.setValueAtTime(1050, now);
  drop.frequency.exponentialRampToValueAtTime(620, now + .12);
  envelope.gain.setValueAtTime(.0001, now);
  envelope.gain.exponentialRampToValueAtTime(.025, now + .009);
  envelope.gain.exponentialRampToValueAtTime(.0001, now + .3);
  drop.connect(envelope).connect(gain); drop.start(now); drop.stop(now + .35);
  drop.onended = () => { drop.disconnect(); envelope.disconnect(); };
});
audio.addEventListener('error', () => { lastAudioError = 'MediaError ' + audio.error?.code + ': ' + audio.error?.message; reset(true); });
audio.addEventListener('pause', () => { if (wanted && !hiddenPause) reset(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenPause = wanted; if (hiddenPause) audio.pause(); }
  else if (hiddenPause && !manuallyMuted) { hiddenPause = false; startRain(); }
});
window.addEventListener('pagehide', () => { resumeAfterPageShow = wanted; reset(); });
window.addEventListener('pageshow', event => { if (event.persisted && resumeAfterPageShow && !manuallyMuted) startRain(); });
showState(false);
