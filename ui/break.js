// Break takeover screen. The primary monitor gets the ZenBot core (orb) + a glass
// HUD: a water/stretch reminder, a countdown, an optional 1-minute eye-care deck,
// then the "are you happy?" question. Secondary monitors get a quiet dim screen.
// All input is swallowed except the triple-ESC escape hatch and on-screen buttons.
const invoke = window.__TAURI__.core.invoke;

const $ = (id) => document.getElementById(id);
const RING_LEN = 276.46;

let phase = 'enter'; // enter -> countdown -> offer -> exercise -> ask -> react
let info = null;
let orb = null;
let audio = null;
let exercises = [];
let perCardMs = 10000;

function sound(fn) {
  if (!info.settings.sound) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    fn(audio);
  } catch {
    /* no audio available, stay silent */
  }
}

function pluck(ctx, freq, at, dur = 0.5, gain = 0.1, type = 'sine') {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime + at);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + at);
  o.stop(ctx.currentTime + at + dur);
}

// A synthesized "powering-up" sweep — the AI equivalent of the old woof.
const chimeIn = () => sound((ctx) => { pluck(ctx, 523.25, 0, 0.6, 0.09, 'triangle'); pluck(ctx, 783.99, 0.16, 0.6, 0.07, 'triangle'); });
const chimeDone = () => sound((ctx) => { pluck(ctx, 659.25, 0, 0.5, 0.09, 'triangle'); pluck(ctx, 987.77, 0.14, 0.5, 0.08, 'triangle'); pluck(ctx, 1318.5, 0.28, 0.6, 0.06, 'triangle'); });
const boot = () =>
  sound((ctx) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.35);
    g.gain.setValueAtTime(0.14, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.42);
  });
const blip = () => sound((ctx) => pluck(ctx, 880, 0, 0.18, 0.06, 'square'));

function typewriter(el, text, speed = 26) {
  el.textContent = '';
  let i = 0;
  const tick = () => {
    el.textContent = text.slice(0, ++i);
    if (i < text.length) setTimeout(tick, speed);
  };
  tick();
}

// --- input swallowing + triple-ESC escape hatch ---
const ESC_TAP_WINDOW_MS = 1200;
let escTaps = 0;
let escResetTimer = null;

function registerEscTap() {
  clearTimeout(escResetTimer);
  escTaps += 1;
  $('skip-pill').classList.remove('hidden');
  $('skip-fill').style.width = `${(escTaps / 3) * 100}%`;
  if (escTaps >= 3) {
    escTaps = 0;
    leave(null);
    return;
  }
  escResetTimer = setTimeout(() => {
    escTaps = 0;
    $('skip-fill').style.width = '0%';
    $('skip-pill').classList.add('hidden');
  }, ESC_TAP_WINDOW_MS);
}

function installInputGuards() {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && info.settings.allow_escape && !e.repeat) {
        registerEscTap();
      }
      if (phase === 'exercise') {
        if (e.key === 'ArrowLeft') { e.preventDefault(); advanceCard(-1); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); advanceCard(1); return; }
      }
      if (phase === 'ask') {
        const k = e.key.toLowerCase();
        if (k === 'y') answer('happy');
        if (k === 'n') answer('meh');
      }
      // let modifier combos through; swallow the rest so nothing leaks to the desktop
      if (!e.metaKey && !e.ctrlKey) e.preventDefault();
    },
    true
  );
  window.addEventListener('contextmenu', (e) => e.preventDefault(), true);
  window.addEventListener(
    'mousedown',
    (e) => { if (!e.target.closest('.interactive')) e.preventDefault(); },
    true
  );
  if (info.settings.allow_escape) {
    setTimeout(() => {
      $('skip-pill').classList.remove('hidden');
      $('skip-fill').style.width = '0%';
      setTimeout(() => { if (escTaps === 0) $('skip-pill').classList.add('hidden'); }, 2600);
    }, 1200);
  }
}

// --- phases ---
function startCountdown() {
  phase = 'countdown';
  orb?.setMode('idle');
  const total = info.settings.break_seconds;
  let remaining = total;
  $('panel').classList.add('show');
  $('ringwrap').classList.remove('hidden');
  $('count').textContent = remaining;
  typewriter($('msg'), info.message);
  chimeIn();

  const started = performance.now();
  const timer = setInterval(() => {
    const elapsed = (performance.now() - started) / 1000;
    remaining = Math.max(0, Math.ceil(total - elapsed));
    $('count').textContent = remaining;
    $('ringfg').style.strokeDashoffset = RING_LEN * Math.min(1, elapsed / total);
    if (remaining <= 0) {
      clearInterval(timer);
      if (info.settings.eye_exercises_enabled && exercises.length) startOffer();
      else startAsk();
    }
  }, 100);
}

function startOffer() {
  phase = 'offer';
  orb?.setMode('ask');
  boot();
  document.body.classList.remove('no-cursor');
  $('ringwrap').classList.add('hidden');
  typewriter($('msg'), `Eyes have been locked on the screen a while. Shall we run a one-minute eye-care routine?`);
  $('sub').textContent = `${info.settings.assistant_name} recommends it`;
  $('offer').classList.remove('hidden');
}

function startAsk() {
  phase = 'ask';
  orb?.setMode('ask');
  boot();
  document.body.classList.remove('no-cursor');
  $('panel').classList.remove('hidden');
  $('panel').classList.add('show');
  $('ringwrap').classList.add('hidden');
  $('offer').classList.add('hidden');
  typewriter($('msg'), `One more thing — are you happy?`);
  $('sub').textContent = `${info.settings.assistant_name} wants to know`;
  $('ask').classList.remove('hidden');
}

function answer(mood) {
  if (phase !== 'ask') return;
  phase = 'react';
  $('ask').classList.add('hidden');
  if (mood === 'happy') {
    chimeDone();
    orb?.setMode('happy');
    typewriter($('msg'), `Noted. ${info.settings.assistant_name} is pleased — back to it. ✦`);
  } else {
    orb?.setMode('sad');
    typewriter($('msg'), `Understood. Be kind to yourself — ${info.settings.assistant_name} has your back. ◇`);
  }
  $('sub').textContent = '';
  setTimeout(() => leave(mood), 2800);
}

let leaving = false;
async function leave(mood) {
  if (leaving) return;
  leaving = true;
  orb?.setMode('leave');
  document.body.classList.remove('shown');
  await new Promise((r) => setTimeout(r, 480));
  if (mood) await invoke('finish_break', { mood });
  else await invoke('skip_break');
}

// --- eye-exercise card deck ---
let deck = [];        // remaining cards, front = deck[0]
let deckTimer = null;
let cardStartedAt = 0;
let deckAnimating = false;

function parseExercise(line) {
  const idx = line.indexOf('|');
  if (idx === -1) return { title: line.trim(), body: '' };
  return { title: line.slice(0, idx).trim(), body: line.slice(idx + 1).trim() };
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, Math.ceil(sec)) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startDeck() {
  phase = 'exercise';
  orb?.setMode('exercise');
  document.body.classList.remove('no-cursor');
  $('offer').classList.add('hidden');
  $('panel').classList.remove('show');
  $('panel').classList.add('hidden');

  const cardsEl = $('cards');
  cardsEl.innerHTML = '';
  deck = exercises.map((line, i) => {
    const ex = parseExercise(line);
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <div class="card-index">${String(i + 1).padStart(2, '0')} / ${String(exercises.length).padStart(2, '0')}</div>
      <div class="card-eye">◉</div>
      <h2 class="card-title"></h2>
      <p class="card-body"></p>
      <div class="card-timer"><div class="card-timer-fill"></div></div>`;
    el.querySelector('.card-title').textContent = ex.title;
    el.querySelector('.card-body').textContent = ex.body;
    cardsEl.appendChild(el);
    return { el, fill: el.querySelector('.card-timer-fill') };
  });

  $('deck').classList.remove('hidden');
  requestAnimationFrame(() => $('deck').classList.add('show'));
  layoutCards();
  startCardTimer();
}

function layoutCards() {
  deck.forEach((c, i) => {
    c.el.style.zIndex = String(100 - i);
    c.el.style.transform = `translateY(${i * 14}px) scale(${1 - i * 0.05})`;
    c.el.style.opacity = i > 3 ? '0' : String(1 - i * 0.22);
    c.el.classList.toggle('front', i === 0);
  });
  $('deck-progress').textContent = `${exercises.length - deck.length + 1} / ${exercises.length}`;
}

function startCardTimer() {
  cardStartedAt = performance.now();
  clearInterval(deckTimer);
  deckTimer = setInterval(() => {
    const front = deck[0];
    if (!front) return;
    const elapsed = performance.now() - cardStartedAt;
    const frac = Math.min(1, elapsed / perCardMs);
    front.fill.style.width = `${frac * 100}%`;
    const remainingCards = deck.length - 1;
    const totalRemainingSec = remainingCards * (perCardMs / 1000) + (perCardMs / 1000) * (1 - frac);
    $('deck-total').textContent = fmtClock(totalRemainingSec);
    if (frac >= 1) advanceCard(1);
  }, 60);
}

function advanceCard(dir) {
  if (deckAnimating || !deck.length) return;
  deckAnimating = true;
  blip();
  const front = deck.shift();
  front.el.classList.add('front');
  front.el.style.transition = 'transform 0.42s cubic-bezier(.4,0,.2,1), opacity 0.42s ease';
  front.el.style.transform = `translateX(${dir * 140}%) rotate(${dir * 18}deg)`;
  front.el.style.opacity = '0';
  setTimeout(() => front.el.remove(), 440);

  if (deck.length === 0) {
    setTimeout(finishDeck, 300);
    return;
  }
  layoutCards();
  startCardTimer();
  setTimeout(() => { deckAnimating = false; }, 220);
}

function finishDeck() {
  clearInterval(deckTimer);
  deck = [];
  $('deck').classList.remove('show');
  chimeDone();
  setTimeout(() => {
    $('deck').classList.add('hidden');
    startAsk();
  }, 420);
}

// pointer-drag swipe on the front card
function installDeckSwipe() {
  const cardsEl = $('cards');
  let dragging = null;
  cardsEl.addEventListener('pointerdown', (e) => {
    if (deckAnimating || !deck.length) return;
    dragging = { startX: e.clientX, el: deck[0].el };
    dragging.el.style.transition = 'none';
    cardsEl.setPointerCapture(e.pointerId);
  });
  cardsEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    dragging.el.style.transform = `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
    dragging.el.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / 500));
  });
  const release = (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const el = dragging.el;
    dragging = null;
    if (Math.abs(dx) > 120) {
      advanceCard(dx > 0 ? 1 : -1);
    } else {
      el.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      layoutCards();
    }
  };
  cardsEl.addEventListener('pointerup', release);
  cardsEl.addEventListener('pointercancel', release);
}

// --- boot ---
async function main() {
  info = await invoke('get_break_info');
  perCardMs = Math.max(3, info.settings.eye_seconds_per_card || 10) * 1000;
  exercises = (info.settings.eye_exercises || []).filter((l) => l && l.trim());
  installInputGuards();
  requestAnimationFrame(() => document.body.classList.add('shown'));

  if (!info.primary) {
    // Secondary monitors get only the dim + one quiet line.
    document.body.classList.add('secondary');
    $('scene').remove();
    $('grid').remove();
    $('deck').remove();
    $('sub').textContent = '';
    $('msg').textContent = `${info.settings.assistant_name}: break in progress on your main display.`;
    $('panel').classList.add('show');
    return;
  }

  $('assistant-name').textContent = (info.settings.assistant_name || 'ZenBot').toUpperCase();
  const mod = await import('./orb.js');
  orb = mod.createOrb($('scene'));
  installDeckSwipe();

  // let the core materialize, then start the clock
  setTimeout(startCountdown, 1900);
}

$('btn-happy').addEventListener('click', () => answer('happy'));
$('btn-meh').addEventListener('click', () => answer('meh'));
$('btn-eyes').addEventListener('click', () => { if (phase === 'offer') startDeck(); });
$('btn-skip-eyes').addEventListener('click', () => { if (phase === 'offer') startAsk(); });

main();
