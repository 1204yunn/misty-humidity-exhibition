"use strict";
(() => {
  const board = document.getElementById("mist-board");
  const layer = document.getElementById("photo-layer");
  const demoMode = new URLSearchParams(location.search).has("demo");
  const samples = [
    [1018, "今天的空氣，好像有點重。"], [1015, "有些記憶，像霧一樣。"],
    [1025, "留下一點點濕氣。"], [1039, "雨停了，痕跡還在。"],
    [1043, "看不清楚，也是一種觀看。"], [1056, "那些慢慢消失的瞬間。"],
    [1067, "今天，你有感覺到濕度嗎？"], [1074, "留在玻璃上的記憶。"],
    [1084, "在霧裡，遇見另一個故事。"], [1080, "有點濕濕的日常。"],
    [1011, "那些藏在霧裡的片刻。"], [1020, "空氣留下的溫柔痕跡。"],
    [1035, "記憶隨著水氣慢慢浮現。"], [1041, "有些故事還沒消散。"],
    [1050, "讓這一刻停留久一點。"]
  ].map(([id, text], i) => ({ id: "demo-" + i, image: "https://picsum.photos/id/" + id + "/800/800", text }));
  const queue = [];
  let sequence = 0;
  const slots = [];
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  const segmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("zh-Hant", { granularity: "grapheme" }) : null;
  const characters = text => segmenter
    ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);


  let resizeTimer;
  let layoutViewport = '';
  let resizeRelease;
  const reader = document.getElementById('story-reader');
  let readingSlot = null, closeTimer;
  const storyText = value => typeof value === 'string' ? value.trim() : '';
  function closeStory(immediate = false) {
    if (!reader.open) return;
    clearTimeout(closeTimer);
    const finish = () => {
      reader.close(); reader.classList.remove('is-visible');
      readingSlot?.card.classList.remove('is-reading');
      board.classList.remove('is-reading-story');
      readingSlot = null;
    };
    reader.classList.remove('is-visible');
    if (immediate || reducedMotion.matches) finish();
    else closeTimer = setTimeout(finish, 240);
  }
  function openStory(slot) {
    if (!slot.memory?.story || slot.card.classList.contains('is-changing') || reader.open) return;
    readingSlot = slot;
    slot.card.classList.add('is-reading');
    board.classList.add('is-reading-story');
    document.getElementById('story-reader-title').textContent = slot.memory.text;
    document.getElementById('story-reader-body').textContent = slot.memory.story;
    reader.showModal();
    requestAnimationFrame(() => { if (reader.open) reader.classList.add('is-visible'); });
  }
  document.getElementById('story-reader-close').addEventListener('click', () => closeStory());
  reader.addEventListener('cancel', event => { event.preventDefault(); closeStory(); });
  reader.addEventListener('click', event => { if (event.target === reader) closeStory(); });


  // Smooth, asymmetric outlines share one visual language, with stable variations.
  const outlines = [
    'M50 5 C62 3 70 10 78 16 C90 19 93 33 91 44 C99 56 90 68 84 76 C79 90 63 88 53 94 C40 96 34 86 24 84 C10 79 13 65 7 55 C2 42 11 34 14 25 C21 11 35 13 42 7 C45 5 47 5 50 5Z',
    'M48 7 C60 1 70 12 80 17 C91 25 88 38 95 48 C97 62 87 70 81 81 C71 92 59 87 47 94 C35 95 27 85 18 78 C7 70 12 57 6 46 C4 34 15 26 20 18 C27 7 38 11 48 7Z',
    'M52 6 C65 4 73 15 82 20 C94 27 89 39 94 50 C97 63 84 71 80 80 C72 93 59 88 48 94 C35 94 27 83 18 80 C7 73 12 60 6 49 C3 37 14 29 17 20 C25 8 40 13 52 6Z',
    'M46 6 C58 2 68 12 78 15 C90 21 88 34 94 45 C99 58 87 67 84 77 C77 91 64 88 53 94 C40 98 33 86 23 83 C10 78 12 65 7 54 C2 42 13 34 15 24 C21 11 35 12 46 6Z'
  ];
  function waterMask(index) {
    const path = outlines[index % outlines.length];
    // Fade to zero before the bitmap edge; asymmetric feathering preserves central detail.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4.5"/></filter><filter id="edge" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4"/></filter><linearGradient id="wet" x1="0" y1="0" x2="1" y2=".7"><stop stop-color="white" stop-opacity=".15"/><stop offset=".4" stop-color="white"/><stop offset=".7" stop-color="white" stop-opacity=".85"/><stop offset="1" stop-color="white" stop-opacity=".1"/></linearGradient><radialGradient id="fade"><stop offset=".48" stop-color="white"/><stop offset=".72" stop-color="white" stop-opacity=".95"/><stop offset=".88" stop-color="white" stop-opacity=".35"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient><mask id="boundary"><rect width="100" height="100" fill="url(#fade)"/></mask></defs><g mask="url(#boundary)"><path d="${path}" fill="white" opacity=".7" filter="url(#soft)"/><path d="${path}" fill="url(#wet)" filter="url(#edge)"/></g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }
  function caption(card, text, width) {
    const root = card.querySelector('.memory-caption');
    root.textContent = text.replace(/\s+/gu, ' ').trim();
    root.hidden = !root.textContent;
    if (root.hidden) return;
    root.setAttribute('aria-label', text);
    const height = parseFloat(card.style.height) || width;
    let font = Math.min(23, width * .052, height * .105);
    // At most two lines, always within the lower interior of the wet outline.
    for (; font > 7; font -= .5) {
      measure.font = `500 ${font}px "Microsoft JhengHei", "PingFang TC", sans-serif`;
      if (measure.measureText(root.textContent).width <= width * .64 * 2) break;
    }
    root.style.fontSize = font + 'px';
  }
  function fill(slot, memory) {
    slot.memory = memory;
    slot.card.dataset.source = memory.source || 'mobile';
    slot.card.classList.toggle('has-story', Boolean(memory.story));
    slot.card.tabIndex = memory.story ? 0 : -1;
    if (memory.story) {
      slot.card.setAttribute('role', 'button');
      slot.card.setAttribute('aria-haspopup', 'dialog');
      slot.card.setAttribute('aria-label', '閱讀故事：' + memory.text);
    } else {
      for (const name of ['role', 'aria-haspopup', 'aria-label']) slot.card.removeAttribute(name);
    }
    sizeSlot(slot, memory.ratio || 1.4);
    const surface = slot.card.querySelector(".memory-surface");
    surface.replaceChildren();
    if (memory.image) {
      const img = document.createElement("img");
      img.alt = "";
      const reportImage = (ok, detail) => {
        console[ok ? "info" : "error"]("[留言牆] " + detail, memory.id);
        const debug = document.getElementById("sync-debug");
        if (debug) debug.textContent = detail;
      };
      img.addEventListener("load", () => {
        if (slot.memory !== memory) return;
        memory.ratio = img.naturalWidth / img.naturalHeight;
        layout();
        reportImage(true, `照片載入成功：${img.naturalWidth} × ${img.naturalHeight}`);
      }, { once: true });
      img.addEventListener("error", () => {
        reportImage(false, "照片載入失敗：請在 Network 檢查 Cloudinary HTTP 狀態或網路封鎖。");
        img.remove();
      }, { once: true });
      img.src = memory.image;
      const wash = img.cloneNode(false);
      wash.className = 'memory-wash'; wash.setAttribute('aria-hidden', 'true');
      img.className = 'memory-original';
      surface.append(wash, img);
    }
    caption(slot.card, memory.text, parseFloat(slot.card.style.width) || slot.d);
  }

  // Near-round 280px memories with subtle size variation and uncropped central images.
  const originalSize = 280;
  // A little overlap is welcome; narrow screens rotate through fewer round memories.
  const capacity = () => Math.min(15,
    Math.max(1, Math.floor((board.clientWidth - 16) / 300)) *
    Math.max(1, Math.floor((board.clientHeight - 100) / 300)));
  const anchors = [
    [.22, .25], [.56, .38], [.81, .65], [.33, .77], [.76, .18],
    [.47, .59], [.91, .41], [.11, .53], [.64, .84], [.39, .20],
    [.72, .49], [.16, .87], [.48, .89], [.92, .84], [.55, .13]
  ];
  function scatterRandom(index, step) {
    let n = Math.imul(index + 31, 374761393) ^ Math.imul(step + 17, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function placeMemory(slot, placed, w, h) {
    const d = slot.d, xPad = 12 + slot.travelX * .65, yPad = 12 + slot.travelY * .65;
    const minX = d / 2 + xPad, maxX = Math.max(minX, w - d / 2 - xPad);
    const minY = d / 2 + yPad, maxY = Math.max(minY, h - d / 2 - 12 - slot.travelY * .35);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const [ax, ay] = anchors[slot.index];
    const targetX = clamp(ax * w, minX, maxX), targetY = clamp(ay * h, minY, maxY);
    const logo = document.getElementById('brand-logo').getBoundingClientRect();
    let best;
    for (let n = 0; n < 96; n++) {
      const x = n === 0 ? targetX : minX + scatterRandom(slot.index * 101 + n, 1) * (maxX - minX);
      const y = n === 0 ? targetY : minY + scatterRandom(slot.index * 101 + n, 2) * (maxY - minY);
      let overlap = 0, alignment = 0;
      for (const other of placed) {
        const desired = (d + other.d) * .43 + 16;
        const distance = Math.hypot(x - other.cx, y - other.cy);
        overlap += Math.pow(Math.max(0, 1 - distance / desired), 2) * 30;
        alignment += Math.max(0, 1 - Math.abs(y - other.cy) / 38) * .16;
      }
      const logoHit = x - d / 2 < logo.left + logo.width * .84 && y - d / 2 - slot.travelY * .65 < logo.top + logo.height * .66 ? 5 : 0;
      const preference = Math.hypot((x - targetX) / w, (y - targetY) / h) * .65;
      const score = overlap + alignment + logoHit + preference;
      if (!best || score < best.score) best = { x, y, score };
    }
    slot.cx = best.x; slot.cy = best.y;
  }
  // Keep every record supplied by the approved Firestore query for rotation.
  let rotationCursor = 0;
  let lastRotatedOrder = -1;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function show(slot, memory, immediate = false) {
    if (slot.targetId === memory.id) {
      caption(slot.card, memory.text, parseFloat(slot.card.style.width) || slot.d);
      return;
    }
    slot.targetId = memory.id;
    clearTimeout(slot.timer);
    const commit = () => {
      fill(slot, memory);
      slot.card.classList.remove("is-changing");
      if (!immediate) {
        const contents = slot.card.querySelector('.memory-contents');
        contents.style.animation = 'none';
        void contents.offsetWidth;
        slot.card.style.setProperty('--delay', '0s');
        contents.style.animation = '';
      }
    };
    if (immediate || reducedMotion.matches || !slot.memory) commit();
    else {
      slot.card.classList.add("is-changing");
      slot.timer = setTimeout(commit, 900);
    }
  }

  function render(immediate = false) {
    const used = new Set();
    for (const slot of slots) {
      const current = queue.find(item => item.id === slot.targetId);
      if (current && !used.has(current.id)) used.add(current.id);
      else slot.targetId = null;
    }
    for (const slot of slots) {
      const memory = queue.find(item => item.id === slot.targetId)
        || [...queue].reverse().find(item => !used.has(item.id));
      if (memory) {
        used.add(memory.id);
        slot.card.hidden = false;
        show(slot, memory, immediate);
      } else {
        clearTimeout(slot.timer);
        slot.targetId = null;
        slot.memory = null;
        slot.card.hidden = true;
        slot.card.querySelector('.memory-surface').replaceChildren();
      }
    }
  }

  // Rotate one photo at a time while the other cards continue floating.
  setInterval(() => {
    const visible = new Set(slots.map(slot => slot.targetId));
    const next = queue.find(item => item.order > lastRotatedOrder && !visible.has(item.id))
      || queue.find(item => !visible.has(item.id));
    const available = readingSlot ? [] : slots;
    if (!next || !available.length) return;
    lastRotatedOrder = next.order;
    show(available[rotationCursor++ % available.length], next);
  }, 8000);

  function layout() {
    const w = board.clientWidth, h = board.clientHeight;
    const viewport = w + 'x' + h;
    const resizing = viewport !== layoutViewport;
    if (resizing) {
      layoutViewport = viewport;
      board.classList.add('is-resizing');
    }
    const count = Math.min(queue.length, capacity());
    const placed = [];
    while (slots.length > count) {
      const slot = slots.pop();
      if (slot === readingSlot) closeStory(true);
      clearTimeout(slot.timer); slot.card.remove();
    }
    for (let i = 0; i < count; i++) {
      let slot = slots[i];
      if (!slot) {
        const card = document.createElement('article');
        card.className = 'memory';
        card.style.setProperty('--water-mask', waterMask(i));
        card.innerHTML = '<div class="memory-contents"><div class="memory-surface"></div><p class="memory-caption"></p></div>';
        card.style.setProperty('--duration', (14 + (i * 7 % 12)) + 's');
        card.style.setProperty('--fade-duration', (46 + i % 5 * 4) + 's');
        card.style.setProperty('--float-delay', (-i * 3.71) + 's');
        card.style.setProperty('--delay', (-i * 4.7) + 's');
        card.style.setProperty('--float-direction', i % 2 ? 'reverse' : 'normal');
        slot = { card, index: i };
        card.addEventListener('click', () => openStory(slot));
        card.addEventListener('keydown', event => {
          if (slot.memory?.story && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault(); openStory(slot);
          }
        });
        slots.push(slot); layer.appendChild(card);
      }
      slot.d = originalSize * (.92 + scatterRandom(i, 7) * .16);
      const d = slot.d, height = d;
      slot.card.style.zIndex = String(1 + i * 7 % 4);
      slot.card.style.setProperty('--base-angle', ((scatterRandom(i, 8) - .5) * 2.2).toFixed(2) + 'deg');
      slot.card.style.setProperty('--memory-depth', (.94 + scatterRandom(i, 9) * .06).toFixed(2));
      // Total vertical travel 48-96px, horizontal travel 16-36px, bounded by viewport.
      slot.travelY = Math.max(0, Math.min(48 + i * 11 % 49, h - height - 36));
      slot.travelX = Math.max(0, Math.min(16 + i * 7 % 21, w - d - 24));
      slot.card.style.setProperty('--travel-y', slot.travelY + 'px');
      slot.card.style.setProperty('--travel-x', slot.travelX + 'px');
      slot.card.style.setProperty('--tilt', ((i % 2 ? -1 : 1) * (1 + i % 3 * .4)) + 'deg');
      placeMemory(slot, placed, w, h);
      placed.push(slot);
      slot.card.dataset.position = String(i + 1);
      sizeSlot(slot, slot.memory?.ratio || 1.4);
    }
    render(true);
    if (resizing) {
      void board.offsetWidth;
      cancelAnimationFrame(resizeRelease);
      resizeRelease = requestAnimationFrame(() => board.classList.remove('is-resizing'));
    }
  }

  function sizeSlot(slot, ratio = slot.memory?.ratio || 1.4) {
    const width = slot.d, height = slot.d;
    slot.card.style.width = width + 'px';
    slot.card.style.height = height + 'px';
    const padX = 10 + (slot.travelX || 0) * .65;
    const padTop = 10 + (slot.travelY || 0) * .65;
    const padBottom = 10 + (slot.travelY || 0) * .35;
    slot.card.style.left = Math.max(padX, Math.min(board.clientWidth - width - padX, slot.cx - width / 2)) + 'px';
    slot.card.style.top = Math.max(padTop, Math.min(board.clientHeight - height - padBottom, slot.cy - height / 2)) + 'px';
    if (slot.memory) caption(slot.card, slot.memory.text, width);
  }

  function discard(memory) {
    if (memory?.image?.startsWith("blob:")) URL.revokeObjectURL(memory.image);
  }

  function enqueue(memory) {
    if (queue.some(item => item.id === memory.id)) return;
    queue.push({ ...memory, order: sequence++ });
    // Approved exhibit photos enter a visible slot immediately, even on a full wall.
    layout();
    if (memory.source === 'exhibit' && !slots.some(slot => slot.targetId === memory.id)) {
      const target = slots.find(slot => slot !== readingSlot);
      if (target) show(target, queue.find(item => item.id === memory.id));
    }
  }

  // Real displays start empty. Fake photos exist only in explicit demo mode.
  if (demoMode) {
    for (const memory of samples) queue.push({ ...memory, order: sequence++ });
    document.querySelector(".board-footer").textContent += " ／ 示範模式";
  }
  window.mistyBoard = {
    receive(data, id) {
      if (demoMode || data.isPublic !== true || data.moderationStatus !== "approved"
        || typeof data.shortMessage !== "string" || (!data.shortMessage.trim() && !(data.source === "exhibit" && data.schemaVersion === 2))
        || characters(data.shortMessage).length > 12) return false;
      let url;
      try { url = new URL(data.imageUrl); } catch { return false; }
      if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.port
        || url.username || url.password || url.search || url.hash
        || !url.pathname.startsWith("/zwlt6flv/image/upload/") || !/\.(jpe?g|png|webp)$/i.test(url.pathname)) return false;
      enqueue({ id, text: data.shortMessage, image: data.imageUrl, story: storyText(data.story), source: data.source === 'exhibit' ? 'exhibit' : 'mobile' });
      return true;
    },
    remove(id) {
      if (demoMode) return;
      if (readingSlot?.memory?.id === id) closeStory(true);
      const index = queue.findIndex(item => item.id === id);
      if (index >= 0) { discard(queue[index]); queue.splice(index, 1); layout(); }
    },
    clearPublic() {
      if (demoMode) return;
      closeStory(true);
      while (queue.length) discard(queue.shift());
      layout();
    },
  };
  window.addEventListener("resize", () => { cancelAnimationFrame(resizeTimer); resizeTimer = requestAnimationFrame(layout); });
  document.fonts.ready.then(layout);
  document.getElementById("upload-button").addEventListener("click", () => document.getElementById("photo-upload").click());
  document.getElementById("photo-upload").addEventListener("change", event => {
    if (!demoMode) return;
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      alert("請選擇 10 MB 以下的圖片。"); return;
    }
    const text = prompt("本機排版預覽（不會上傳 Firebase）：請輸入照片的文字", "留在霧裡的一段故事。");
    if (text === null) return;
    const id = "local-" + Date.now() + "-" + sequence;
    const url = URL.createObjectURL(file);
    enqueue({ id, image: url, text: text.trim() || "留在霧裡的一段故事。" });


  });
})();







