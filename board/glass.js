"use strict";
(() => {
  const glass = document.querySelector('.board-glass');
  if (!glass) return;
  const beads = glass.querySelector('.condensation-layer');
  const drips = glass.querySelector('.drip-layer');
  const seed = Math.floor(Math.random() * 0xffffffff);
  let resizeTimer;

  function randomSequence() {
    let state = seed;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function createGlassDrop(random, flowing = false) {
    const drop = document.createElement('i');
    drop.className = flowing ? 'glass-drop glass-drip' : 'glass-drop';
    const size = flowing ? 9 + random() * 5 : 4 + Math.pow(random(), 2) * 7;
    drop.style.width = size.toFixed(2) + 'px';
    drop.style.height = (size * (flowing ? 1.65 : .85 + random() * .55)).toFixed(2) + 'px';
    drop.style.left = (2 + random() * 96).toFixed(2) + '%';
    drop.style.top = flowing ? '-24px' : (2 + random() * 96).toFixed(2) + '%';
    drop.style.setProperty('--drop-alpha', (flowing ? .58 + random() * .18 : .25 + random() * .23).toFixed(2));
    drop.style.borderRadius = `${42 + random() * 16}% ${35 + random() * 20}% ${43 + random() * 15}% ${38 + random() * 18}% / 58% 52% 44% 48%`;
    if (flowing) {
      const duration = 24 + random() * 14;
      drop.style.setProperty('--flow-duration', duration.toFixed(2) + 's');
      drop.style.setProperty('--flow-delay', (-random() * duration).toFixed(2) + 's');
      drop.style.setProperty('--flow-distance', (glass.clientHeight + 64) + 'px');
      drop.style.setProperty('--flow-sway', (-7 + random() * 14).toFixed(2) + 'px');
      drop.style.setProperty('--trail-length', (40 + random() * 40).toFixed(2) + 'px');
    }
    return drop;
  }

  function buildCornerCondensation(random, fragment) {
    const count = 4 * Math.min(52, Math.max(24, Math.round(glass.clientWidth * glass.clientHeight / 40000)));
    const spanX = Math.min(25, 280 / glass.clientWidth * 100);
    const spanY = Math.min(29, 240 / glass.clientHeight * 100);
    for (let corner = 0; corner < 4; corner++) {
      for (let i = 0; i < count; i++) {
        const drop = createGlassDrop(random);
        drop.classList.add('glass-corner-bead');
        drop.dataset.corner = String(corner);
        const x = .8 + Math.pow(random(), 1.5) * spanX;
        const y = .8 + Math.pow(random(), 1.5) * spanY;
        drop.style.left = ((corner % 2 ? 100 - x : x)).toFixed(2) + '%';
        drop.style.top = ((corner > 1 ? 100 - y : y)).toFixed(2) + '%';
        const fade = 1 - Math.min(1, Math.hypot(x / spanX, y / spanY) / 1.6) * .55;
        drop.style.setProperty('--drop-alpha', ((.36 + random() * .2) * fade).toFixed(2));
        fragment.appendChild(drop);
      }
    }
  }

  function buildCondensation() {
    const random = randomSequence();
    const area = glass.clientWidth * glass.clientHeight;
    const beadCount = Math.min(150, Math.max(20, Math.round(area / 18000)));
    const dripCount = Math.min(6, Math.max(3, Math.round(area / 360000)));
    const still = document.createDocumentFragment();
    const flowing = document.createDocumentFragment();
    for (let i = 0; i < beadCount; i++) still.appendChild(createGlassDrop(random));
    buildCornerCondensation(random, still);
    for (let i = 0; i < dripCount; i++) {
      const drop = createGlassDrop(random, true);
      // Spread streams across the glass and start them inside the visible area.
      drop.style.left = ((i + .25 + random() * .5) / dripCount * 100).toFixed(2) + '%';
      const duration = parseFloat(drop.style.getPropertyValue('--flow-duration'));
      drop.style.setProperty('--flow-delay', (-duration * (.14 + i / dripCount * .68)).toFixed(2) + 's');
      flowing.appendChild(drop);
    }
    beads.replaceChildren(still);
    drips.replaceChildren(flowing);
  }

  function updateGlassVisibility() {
    glass.classList.toggle('is-paused', document.hidden);
  }
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildCondensation, 180);
  });
  document.addEventListener('visibilitychange', updateGlassVisibility);
  buildCondensation();
  updateGlassVisibility();
})();