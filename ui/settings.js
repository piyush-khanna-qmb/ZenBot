const invoke = window.__TAURI__.core.invoke;
const $ = (id) => document.getElementById(id);

let fixedTimes = [];

function renderChips() {
  const box = $('timesChips');
  box.innerHTML = '';
  for (const t of fixedTimes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.addEventListener('click', () => {
      fixedTimes = fixedTimes.filter((x) => x !== t);
      renderChips();
    });
    box.appendChild(b);
  }
}

function updateEyeState() {
  const on = $('eyeEnabled').checked;
  $('eyeSecondsRow').style.opacity = on ? 1 : 0.45;
  $('eyeListRow').style.opacity = on ? 1 : 0.45;
}

function fill(s) {
  $('interval').value = s.interval_minutes;
  fixedTimes = [...s.fixed_times];
  renderChips();
  $('breakSeconds').value = s.break_seconds;
  $('messages').value = s.messages.join('\n');
  $('sound').checked = s.sound;
  $('allowEscape').checked = s.allow_escape;
  $('escHold').value = s.escape_hold_seconds;
  $('escHoldRow').style.opacity = s.allow_escape ? 1 : 0.45;
  $('assistantName').value = s.assistant_name;
  $('eyeEnabled').checked = s.eye_exercises_enabled;
  $('eyeSeconds').value = s.eye_seconds_per_card;
  $('eyeExercises').value = s.eye_exercises.join('\n');
  updateEyeState();
  $('autostart').checked = s.autostart;
}

function collect() {
  return {
    interval_minutes: Math.max(1, parseInt($('interval').value, 10) || 45),
    fixed_times: fixedTimes,
    break_seconds: Math.max(5, parseInt($('breakSeconds').value, 10) || 30),
    messages: $('messages').value.split('\n').map((m) => m.trim()).filter(Boolean),
    allow_escape: $('allowEscape').checked,
    escape_hold_seconds: Math.max(1, parseInt($('escHold').value, 10) || 3),
    sound: $('sound').checked,
    assistant_name: $('assistantName').value.trim() || 'ZenBot',
    eye_exercises_enabled: $('eyeEnabled').checked,
    eye_seconds_per_card: Math.max(3, parseInt($('eyeSeconds').value, 10) || 10),
    eye_exercises: $('eyeExercises').value.split('\n').map((m) => m.trim()).filter(Boolean),
    autostart: $('autostart').checked,
  };
}

async function refreshStatus() {
  try {
    const st = await invoke('get_status');
    const line = $('statusLine');
    $('pauseBtn').classList.toggle('hidden', !!st.paused_until_ms);
    $('resumeBtn').classList.toggle('hidden', !st.paused_until_ms);
    if (st.in_break) {
      line.textContent = 'Break in progress ◉';
    } else if (st.paused_until_ms) {
      line.textContent = `Paused until ${fmt(st.paused_until_ms)}`;
    } else if (st.next_break_ms) {
      const mins = Math.max(0, Math.round((st.next_break_ms - Date.now()) / 60000));
      line.textContent = `Next break at ${fmt(st.next_break_ms)} (in ${mins} min)`;
    } else {
      line.textContent = 'Scheduling…';
    }
  } catch {
    $('statusLine').textContent = '';
  }
}

const fmt = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

async function refreshMood() {
  const log = await invoke('get_mood_log');
  const strip = $('moodStrip');
  strip.innerHTML = '';
  const emoji = { happy: '✦', meh: '◇', skipped: '⏭' };
  for (const e of log.slice(-30)) {
    const span = document.createElement('span');
    span.textContent = emoji[e.mood] || '·';
    span.className = `mood-${e.mood}`;
    span.title = `${e.mood}, ${new Date(e.ts).toLocaleString()}`;
    strip.appendChild(span);
  }
  const happy = log.filter((e) => e.mood === 'happy').length;
  const total = log.filter((e) => e.mood !== 'skipped').length;
  $('moodSummary').textContent = total
    ? `${happy}/${total} happy breaks recently · stored only on this device`
    : 'No breaks logged yet, your first one is coming. Stored only on this device.';
}

// --- wiring ---
$('addTime').addEventListener('click', () => {
  const v = $('fixedTimeInput').value;
  if (v && !fixedTimes.includes(v)) {
    fixedTimes.push(v);
    fixedTimes.sort();
    renderChips();
  }
});

$('allowEscape').addEventListener('change', (e) => {
  $('escHoldRow').style.opacity = e.target.checked ? 1 : 0.45;
});
$('eyeEnabled').addEventListener('change', updateEyeState);

$('save').addEventListener('click', async () => {
  await invoke('save_settings', { settings: collect() });
  const toast = $('savedToast');
  toast.textContent = 'Saved ✓';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
  refreshStatus();
});

$('tryBreak').addEventListener('click', () => invoke('take_break_now'));
$('pauseBtn').addEventListener('click', async () => {
  await invoke('pause_breaks', { minutes: 60 });
  refreshStatus();
});
$('resumeBtn').addEventListener('click', async () => {
  await invoke('resume_breaks');
  refreshStatus();
});

async function main() {
  fill(await invoke('get_settings'));
  refreshStatus();
  refreshMood();
  setInterval(refreshStatus, 5000);
  setInterval(refreshMood, 30000);
}

main();
