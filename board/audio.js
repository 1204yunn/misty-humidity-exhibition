
let audioContext;
let masterGain;
let started = false;
let timers = new Set();

// 製作柔和的空氣雜訊
function makeNoise(seconds = 5) {
  const rate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(
    1, Math.floor(rate * seconds), rate
  );

  const data = buffer.getChannelData(0);

  // 平滑的隨機雜訊
  let smooth = 0;
  for (let i = 0; i < data.length; i++) {
    smooth = smooth * 0.92 +
      (Math.random() * 2 - 1) * 0.08;
    data[i] = smooth * 0.65;
  }

  return buffer;
}

// 第一層：持續存在的薄霧
function createSoftMist() {
  const source = audioContext.createBufferSource();
  source.buffer = makeNoise();
  source.loop = true;

  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1050;

  const gain = audioContext.createGain();
  gain.gain.value = 0.035;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  source.start();
}

// 第二層：一陣陣左右飄動的微風
function playWind() {
  if (!started || audioContext.state !== "running") return;

  const now = audioContext.currentTime;
  const duration = 4 + Math.random() * 4;

  const source = audioContext.createBufferSource();
  source.buffer = makeNoise(6);
  source.loop = true;

  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(
    650 + Math.random() * 450, now
  );
  filter.Q.value = 0.35;

  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(
    0.11, now + duration * 0.42
  );
  gain.gain.linearRampToValueAtTime(
    0.0001, now + duration
  );

  // 左右聲道緩慢移動
  const pan = audioContext.createStereoPanner();
  const fromLeft = Math.random() > 0.5;

  pan.pan.setValueAtTime(
    fromLeft ? -0.65 : 0.65, now
  );
  pan.pan.linearRampToValueAtTime(
    fromLeft ? 0.65 : -0.65,
    now + duration
  );

  source.connect(filter);
  filter.connect(gain);
  gain.connect(pan);
  pan.connect(masterGain);

  source.start(now);
  source.stop(now + duration + 0.1);
}

// 第三層：細小水滴
function playDrop() {
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  const pitch = 950 + Math.random() * 450;

  osc.type = "sine";
  osc.frequency.setValueAtTime(pitch, now);
  osc.frequency.exponentialRampToValueAtTime(
    pitch * 0.58, now + 0.13
  );

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(
    0.025, now + 0.009
  );
  gain.gain.exponentialRampToValueAtTime(
    0.0001, now + 0.35
  );

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.4);
}

// 第四層：透明玻璃音
function playGlass() {
  const now = audioContext.currentTime;

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  const notes = [880, 1046.5, 1174.7, 1318.5];
  osc.type = "sine";
  osc.frequency.value =
    notes[Math.floor(Math.random() * notes.length)];

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(
    0.013, now + 0.04
  );
  gain.gain.exponentialRampToValueAtTime(
    0.0001, now + 1.8
  );

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 1.9);
}

// 隨機安排風聲
function scheduleWind() {
  if (!started) return;

  playWind();

  const next = 7000 + Math.random() * 9000;
  queueAudioTask(scheduleWind, next);
}

// 隨機安排水滴與玻璃音
function scheduleDetails() {
  if (!started) return;

  if (audioContext.state === "running") {
    if (Math.random() < 0.7) {
      playDrop();
    } else {
      playGlass();
    }
  }

  const next = 4500 + Math.random() * 7500;
  queueAudioTask(scheduleDetails, next);
}

// Preserve the original mist/wind/drop synthesis and reuse the project's rain recording.
const rain = new Audio(new URL('../interactive/assets/misty_soft_rain_ambient.mp3', document.currentScript.src).href);
rain.loop = true;
rain.preload = 'metadata';
const audioButton = document.getElementById('audio-start');
let rainGain, rainSource, lastAudioError = '';
let audioWanted = true, manuallyMuted = false, audioRevision = 0, suspendTimer;
let resumeAfterPageShow = false, resumeAfterVisibility = false;
function queueAudioTask(callback, delay) {
  const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
  timers.add(timer);
}
function showAudioState() {
  const playing = audioWanted && audioContext?.state === 'running' && !rain.paused && !rain.muted && !rain.error;
  const label = playing ? '靜音' : manuallyMuted ? '開啟環境音' : '開啟環境音';
  audioButton.setAttribute('aria-pressed', String(playing));
  audioButton.setAttribute('aria-label', playing ? '靜音環境音' : '開啟環境音');
  audioButton.title = playing ? '靜音環境音' : '開啟環境音';
  audioButton.textContent = (playing ? '♫ ' : '♪ ') + label;
}
function initializeMistAudio() {
  if (audioContext) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error('Web Audio is unavailable');
  audioContext = new Context();
  masterGain = audioContext.createGain();
  masterGain.gain.value = .48;
  masterGain.connect(audioContext.destination);
  rainGain = audioContext.createGain();
  rainGain.gain.value = .22;
  rainSource = audioContext.createMediaElementSource(rain);
  const normalize = audioContext.createGain(); normalize.gain.value = 10;
  const limiter = audioContext.createDynamicsCompressor();
  limiter.threshold.value = -18; limiter.knee.value = 12; limiter.ratio.value = 6;
  limiter.attack.value = .003; limiter.release.value = .2;
  rainSource.connect(normalize).connect(limiter).connect(rainGain).connect(masterGain);
  createSoftMist();
  started = true;
  queueAudioTask(scheduleWind, 2000);
  queueAudioTask(scheduleDetails, 3500);
  audioContext.addEventListener('statechange', showAudioState);
}
async function startMistAudio() {
  clearTimeout(suspendTimer);
  audioWanted = true;
  const request = ++audioRevision;
  initializeMistAudio();
  lastAudioError = ''; rain.muted = false; rain.volume = 1;
  masterGain.gain.cancelScheduledValues(audioContext.currentTime);
  masterGain.gain.setTargetAtTime(.48, audioContext.currentTime, .3);
  // Start both within the user activation, rather than awaiting resume before play.
  try {
    await Promise.all([audioContext.resume(), rain.play()]);
    if (request !== audioRevision) return;
    showAudioState();
  } catch (error) {
    if (request === audioRevision) {
      showAudioState();
      lastAudioError = error.name + ': ' + error.message;
      if (error.name !== 'NotAllowedError') console.warn('Ambient audio:', error);
    }
  }
}
function muteMistAudio() {
  audioWanted = false; ++audioRevision;
  rain.muted = true; rain.pause();
  if (audioContext) {
    masterGain.gain.setTargetAtTime(0, audioContext.currentTime, .05);
    suspendTimer = setTimeout(() => { if (!audioWanted) { masterGain.gain.cancelScheduledValues(audioContext.currentTime); masterGain.gain.setValueAtTime(0, audioContext.currentTime); audioContext.suspend().catch(() => {}); } }, 220);
  }
  showAudioState();
}
audioButton.addEventListener('click', () => {
  if (audioWanted && audioContext?.state === 'running' && !rain.paused && !rain.muted) {
    manuallyMuted = true; muteMistAudio();
  } else {
    manuallyMuted = false; startMistAudio().catch(showAudioState);
  }
});
function unlockAmbient(event) {
  if (!event.isTrusted || event.target.closest?.('#audio-start, .audio-diagnostics') || manuallyMuted || document.hidden) return;
  if (audioContext?.state !== 'running') startMistAudio().catch(showAudioState);
}
document.addEventListener('pointerdown', unlockAmbient, { passive: true });
document.addEventListener('keydown', unlockAmbient);
rain.addEventListener('error', () => { lastAudioError = 'MediaError ' + rain.error?.code + ': ' + rain.error?.message; audioButton.title = '雨聲載入失敗，點擊重試'; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    resumeAfterVisibility = audioWanted;
    rain.pause();
    audioContext?.suspend().catch(() => {});
  } else if (resumeAfterVisibility && !manuallyMuted) {
    resumeAfterVisibility = false; startMistAudio().catch(showAudioState);
  }
});
window.addEventListener('pagehide', () => { resumeAfterPageShow = audioWanted; muteMistAudio(); });
window.addEventListener('pageshow', event => {
  if (event.persisted && resumeAfterPageShow && !manuallyMuted) startMistAudio().catch(showAudioState);
});
showAudioState();
// Autoplay is best effort. If blocked, the labelled button remains available.
startMistAudio().catch(showAudioState);
