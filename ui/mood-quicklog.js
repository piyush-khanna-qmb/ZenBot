const invoke = window.__TAURI__.core.invoke;
const $ = (id) => document.getElementById(id);

const MOODS = ['great', 'good', 'okay', 'low', 'foggy'];
const MOOD_LABEL = { great: 'Great', good: 'Good', okay: 'Okay', low: 'Low', foggy: 'Foggy' };
const BUCKETS = ['just now', '<1h', '1-3h', '3-6h', '>6h', 'none today'];
const WEATHER_OPTIONS = ['sunny', 'cloudy', 'rainy', 'cold', 'hot', 'not sure'];

let state = {
  mood: 'okay', moodTouched: false,
  energy: 3, energyTouched: false,
  concentration: 3, concentrationTouched: false,
};
let dismissTimer = null;

function renderPillRow(container, options, labels, get, set) {
  container.innerHTML = '';
  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pill' + (get() === opt ? ' active' : '');
    b.textContent = labels ? labels[opt] : opt;
    b.addEventListener('click', () => {
      set(opt);
      renderPillRow(container, options, labels, get, set);
    });
    container.appendChild(b);
  }
}

function renderMoodRow() {
  renderPillRow(
    $('moodRow'),
    MOODS,
    MOOD_LABEL,
    () => state.mood,
    (v) => { state.mood = v; state.moodTouched = true; }
  );
}

function renderEnergyRow() {
  renderPillRow(
    $('energyRow'),
    [1, 2, 3, 4, 5],
    null,
    () => state.energy,
    (v) => { state.energy = v; state.energyTouched = true; }
  );
}

function renderConcentrationRow() {
  renderPillRow(
    $('concentrationRow'),
    [1, 2, 3, 4, 5],
    null,
    () => state.concentration,
    (v) => { state.concentration = v; state.concentrationTouched = true; }
  );
}

function resetForm() {
  state = {
    mood: 'okay', moodTouched: false,
    energy: 3, energyTouched: false,
    concentration: 3, concentrationTouched: false,
  };
  $('dumpText').value = '';
  renderMoodRow();
  renderConcentrationRow();
  renderEnergyRow();
  $('phase-dump').classList.remove('hidden');
  $('phase-followup').classList.add('hidden');
  $('phase-result').classList.add('hidden');
  $('followupContent').innerHTML = '';
}

function sleepHoursValue(sleepInput, wakeInput) {
  const s = sleepInput.value;
  const w = wakeInput.value;
  if (!s || !w) return null;
  const [sh, sm] = s.split(':').map(Number);
  const [wh, wm] = w.split(':').map(Number);
  let mins = (wh * 60 + wm) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

// --- follow-up builders: each appends its DOM into `root` and returns a getter ---

function buildFogFollowup(root, onDecided) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML = `
    <span class="label">Sounds like brain fog — sound right?</span>
    <div class="pills">
      <button type="button" class="pill" id="fogYes">Yes</button>
      <button type="button" class="pill" id="fogNo">No, just low</button>
    </div>
  `;
  root.appendChild(wrap);
  wrap.querySelector('#fogYes').addEventListener('click', () => onDecided(true));
  wrap.querySelector('#fogNo').addEventListener('click', () => onDecided(false));
}

function appendNotesField(root, data) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML = `
    <span class="label">Anything else? <em>(optional)</em></span>
    <textarea class="followup-notes" rows="3" placeholder="any extra context…"></textarea>
  `;
  root.appendChild(wrap);
  wrap.querySelector('textarea').addEventListener('input', (e) => {
    data.extraNotes = e.target.value;
  });
}

function buildFogDetailFields(root) {
  const data = { severity: 3, sleepTime: '', wakeTime: '', lastMeal: '', lastCaffeine: '', extraNotes: '' };
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="field">
      <span class="label">How foggy? <em>(1 clear &middot; 5 completely numb)</em></span>
      <div class="pills severity" id="fogSeverityRow"></div>
    </div>
    <div class="field two-col">
      <div><span class="label">Slept</span><input type="time" id="fogSleepTime" /></div>
      <div><span class="label">Woke</span><input type="time" id="fogWakeTime" /></div>
      <span class="derived" id="fogSleepHours"></span>
    </div>
    <div class="field">
      <span class="label">Last meal</span>
      <div class="pills" id="fogMealChips"></div>
    </div>
    <div class="field">
      <span class="label">Last caffeine</span>
      <div class="pills" id="fogCaffeineChips"></div>
    </div>
  `;
  root.appendChild(wrap);

  renderPillRow(wrap.querySelector('#fogSeverityRow'), [1, 2, 3, 4, 5], null, () => data.severity, (v) => (data.severity = v));
  renderPillRow(wrap.querySelector('#fogMealChips'), BUCKETS, null, () => data.lastMeal, (v) => (data.lastMeal = v));
  renderPillRow(wrap.querySelector('#fogCaffeineChips'), BUCKETS, null, () => data.lastCaffeine, (v) => (data.lastCaffeine = v));

  const sleepInput = wrap.querySelector('#fogSleepTime');
  const wakeInput = wrap.querySelector('#fogWakeTime');
  const hoursLabel = wrap.querySelector('#fogSleepHours');
  const updateHours = () => {
    const h = sleepHoursValue(sleepInput, wakeInput);
    hoursLabel.textContent = h === null ? '' : `≈ ${h.toFixed(1)}h`;
    data.sleepTime = sleepInput.value;
    data.wakeTime = wakeInput.value;
  };
  sleepInput.addEventListener('change', updateHours);
  wakeInput.addEventListener('change', updateHours);

  appendNotesField(wrap, data);
  return data;
}

function buildGeneralFollowup(root, missing) {
  const data = { weather: '', foodTiming: '', reason: '', extraNotes: '' };
  if (missing.includes('weather')) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.innerHTML = `<span class="label">Weather?</span><div class="pills" id="gWeather"></div>`;
    root.appendChild(wrap);
    renderPillRow(wrap.querySelector('#gWeather'), WEATHER_OPTIONS, null, () => data.weather, (v) => (data.weather = v));
  }
  if (missing.includes('food_timing')) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.innerHTML = `<span class="label">When did you last eat?</span><div class="pills" id="gFood"></div>`;
    root.appendChild(wrap);
    renderPillRow(wrap.querySelector('#gFood'), BUCKETS, null, () => data.foodTiming, (v) => (data.foodTiming = v));
  }
  if (missing.includes('reason')) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.innerHTML = `<span class="label">Any specific reason? <em>(optional)</em></span><input type="text" id="gReason" maxlength="80" placeholder="e.g. good news, a message, poor sleep…" />`;
    root.appendChild(wrap);
    wrap.querySelector('#gReason').addEventListener('input', (e) => (data.reason = e.target.value.trim()));
  }
  appendNotesField(root, data);
  return data;
}

async function submit() {
  const text = $('dumpText').value.trim();
  const parsed = await invoke('parse_journal_draft', { text });

  const finalMood = state.moodTouched ? state.mood : parsed.mood;
  const finalEnergy = state.energyTouched ? state.energy : (parsed.energy ?? state.energy);
  const finalConcentration = state.concentrationTouched
    ? state.concentration
    : (parsed.concentration ?? state.concentration);
  const fogSuspected = parsed.fog_suspected || finalMood === 'foggy';

  const base = {
    mood: finalMood,
    energy: finalEnergy,
    concentration: finalConcentration,
    text,
    fog_suspected: fogSuspected,
    fog_confirmed: false,
    weather: '',
    food_timing: '',
    reason: parsed.reason_guess || '',
    sleep_time: '',
    wake_time: '',
    sleep_hours: 0,
    last_meal: '',
    last_caffeine: '',
    severity: 3,
    parsed_by: parsed.parsed_by,
  };

  if (finalMood === 'okay' && !fogSuspected) {
    finalize(base);
    return;
  }

  $('phase-dump').classList.add('hidden');
  $('phase-followup').classList.remove('hidden');
  const content = $('followupContent');
  content.innerHTML = '';

  if (text && parsed.parsed_by !== 'none') {
    const badge = document.createElement('p');
    badge.className = 'note';
    badge.textContent = parsed.parsed_by === 'ai' ? 'Parsed by AI' : 'Parsed locally (keyword match)';
    content.appendChild(badge);
  }

  if (fogSuspected) {
    buildFogFollowup(content, (isFog) => {
      content.innerHTML = '';
      if (isFog) {
        base.fog_confirmed = true;
        const fogData = buildFogDetailFields(content);
        wireSave(() => {
          base.severity = fogData.severity;
          base.sleep_time = fogData.sleepTime;
          base.wake_time = fogData.wakeTime;
          base.sleep_hours = sleepHoursValueFromStrings(fogData.sleepTime, fogData.wakeTime);
          base.last_meal = fogData.lastMeal;
          base.last_caffeine = fogData.lastCaffeine;
          appendExtraNotes(base, fogData.extraNotes);
          finalize(base);
        });
      } else {
        base.fog_confirmed = false;
        const generalData = buildGeneralFollowup(content, parsed.missing || []);
        wireSave(() => {
          base.weather = generalData.weather;
          base.food_timing = generalData.foodTiming;
          base.reason = generalData.reason || base.reason;
          appendExtraNotes(base, generalData.extraNotes);
          finalize(base);
        });
      }
    });
  } else {
    const generalData = buildGeneralFollowup(content, parsed.missing || []);
    wireSave(() => {
      base.weather = generalData.weather;
      base.food_timing = generalData.foodTiming;
      base.reason = generalData.reason || base.reason;
      appendExtraNotes(base, generalData.extraNotes);
      finalize(base);
    });
  }
}

function appendExtraNotes(base, extra) {
  const trimmed = (extra || '').trim();
  if (!trimmed) return;
  base.text = base.text ? `${base.text}\n${trimmed}` : trimmed;
}

function sleepHoursValueFromStrings(s, w) {
  if (!s || !w) return 0;
  const [sh, sm] = s.split(':').map(Number);
  const [wh, wm] = w.split(':').map(Number);
  let mins = (wh * 60 + wm) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

function wireSave(handler) {
  const btn = $('followupSave');
  const clone = btn.cloneNode(true);
  btn.replaceWith(clone);
  clone.addEventListener('click', handler);
}

async function finalize(entry) {
  const result = await invoke('submit_journal_entry', { entry });
  showResult(entry.mood, result);
}

function showResult(mood, { suggestion, reminders }) {
  $('phase-dump').classList.add('hidden');
  $('phase-followup').classList.add('hidden');
  $('phase-result').classList.remove('hidden');

  const lead = $('resultLead');
  const card = $('suggestionCard');
  if (mood === 'great' || mood === 'good') {
    lead.textContent = 'Noted — good to hear.';
    card.classList.add('hidden');
  } else {
    lead.textContent = 'Try this:';
    card.classList.remove('hidden');
    card.textContent = suggestion ? suggestion.text : 'Take a slow breath and look away from the screen for a moment.';
  }

  const box = $('reminderCards');
  box.innerHTML = '';
  for (const r of reminders || []) {
    const div = document.createElement('div');
    div.className = 'result-card reminder';
    const tag = document.createElement('span');
    tag.className = 'reminder-tag';
    tag.textContent = 'your reminder';
    div.appendChild(tag);
    div.appendChild(document.createTextNode(r.text));
    box.appendChild(div);
  }

  clearTimeout(dismissTimer);
  dismissTimer = setTimeout(dismiss, 6000);
}

function dismiss() {
  clearTimeout(dismissTimer);
  invoke('dismiss_mood_quicklog');
}

$('closeBtn').addEventListener('click', dismiss);
$('doneBtn').addEventListener('click', dismiss);
$('submitBtn').addEventListener('click', submit);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dismiss();
});

window.__TAURI__.event.listen('mood-quicklog-reset', resetForm);

resetForm();
