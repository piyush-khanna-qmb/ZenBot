function typewriter(el, text, speed = 32) {
  el.textContent = '';
  let i = 0;
  const tick = () => {
    el.textContent = text.slice(0, ++i);
    if (i < text.length) setTimeout(tick, speed);
  };
  tick();
}

const RING_R = 60;
const RING_LEN = 2 * Math.PI * RING_R;

const PHASES = [
  { key: 'inhale', label: 'Inhale' },
  { key: 'hold1', label: 'Hold' },
  { key: 'exhale', label: 'Exhale' },
  { key: 'hold2', label: 'Hold' },
];

export function init(panel, fog) {
  panel.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'tab-content';

  const card = document.createElement('section');
  card.className = 'card wide';
  card.innerHTML = `
    <h2>Mindfulness</h2>
    <p class="note">A slow box-breathing cycle to help settle a foggy mind. Optional and calm — stop anytime.</p>
    <div class="breathing-stage">
      <div class="ringwrap">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle class="ring-bg" cx="70" cy="70" r="${RING_R}" />
          <circle id="mfRing" class="ring-fg" cx="70" cy="70" r="${RING_R}" />
        </svg>
        <div id="mfLabel" class="ring-label"></div>
      </div>
      <button id="mfToggle" type="button" class="glass-btn primary">Start</button>
    </div>
    <div class="breathing-timings">
      <label class="row"><span>Inhale</span><span class="unit"><input id="mfInhale" type="number" min="1" max="30" /> sec</span></label>
      <label class="row"><span>Hold</span><span class="unit"><input id="mfHold1" type="number" min="0" max="30" /> sec</span></label>
      <label class="row"><span>Exhale</span><span class="unit"><input id="mfExhale" type="number" min="1" max="30" /> sec</span></label>
      <label class="row"><span>Hold</span><span class="unit"><input id="mfHold2" type="number" min="0" max="30" /> sec</span></label>
    </div>
  `;
  wrap.appendChild(card);
  panel.appendChild(wrap);

  const ring = card.querySelector('#mfRing');
  ring.style.strokeDasharray = String(RING_LEN);
  ring.style.strokeDashoffset = String(RING_LEN);

  const inputs = {
    breathing_inhale: card.querySelector('#mfInhale'),
    breathing_hold1: card.querySelector('#mfHold1'),
    breathing_exhale: card.querySelector('#mfExhale'),
    breathing_hold2: card.querySelector('#mfHold2'),
  };
  for (const [key, input] of Object.entries(inputs)) {
    input.value = fog[key];
    const min = key.includes('hold') ? 0 : 1;
    input.addEventListener('change', () => {
      const v = Math.min(30, Math.max(min, parseInt(input.value, 10) || min));
      input.value = v;
      fog[key] = v;
    });
  }

  const label = card.querySelector('#mfLabel');
  const toggle = card.querySelector('#mfToggle');

  let running = false;
  let raf = null;
  let phaseIndex = 0;
  let phaseStart = 0;

  function phaseSeconds(key) {
    return Math.max(0.1, fog[`breathing_${key}`] || 1);
  }

  function frame(now) {
    if (!running) return;
    const total = phaseSeconds(PHASES[phaseIndex].key) * 1000;
    const elapsed = now - phaseStart;
    const frac = Math.min(1, elapsed / total);
    let visualFrac;
    if (phaseIndex === 0) visualFrac = frac;
    else if (phaseIndex === 1) visualFrac = 1;
    else if (phaseIndex === 2) visualFrac = 1 - frac;
    else visualFrac = 0;
    ring.style.strokeDashoffset = String(RING_LEN * (1 - visualFrac));

    if (elapsed >= total) {
      phaseIndex = (phaseIndex + 1) % PHASES.length;
      phaseStart = now;
      typewriter(label, PHASES[phaseIndex].label);
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    phaseIndex = 0;
    phaseStart = performance.now();
    typewriter(label, PHASES[0].label);
    toggle.textContent = 'Stop';
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    ring.style.strokeDashoffset = String(RING_LEN);
    label.textContent = '';
    toggle.textContent = 'Start';
  }

  toggle.addEventListener('click', () => (running ? stop() : start()));
}
