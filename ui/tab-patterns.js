import { drawBarChart, drawLineChart } from './charts.js';

const invoke = window.__TAURI__.core.invoke;

const HOUR_BUCKETS = [
  { label: '12a-4a', start: 0, end: 4 },
  { label: '4a-8a', start: 4, end: 8 },
  { label: '8a-12p', start: 8, end: 12 },
  { label: '12p-4p', start: 12, end: 16 },
  { label: '4p-8p', start: 16, end: 20 },
  { label: '8p-12a', start: 20, end: 24 },
];
const BUCKET_ORDER = ['just now', '<1h', '1-3h', '3-6h', '>6h', 'none today'];

function bucketByHour(logs) {
  const counts = HOUR_BUCKETS.map(() => 0);
  for (const e of logs) {
    const h = new Date(e.ts).getHours();
    const idx = HOUR_BUCKETS.findIndex((b) => h >= b.start && h < b.end);
    if (idx >= 0) counts[idx] += 1;
  }
  return { labels: HOUR_BUCKETS.map((b) => b.label), values: counts };
}

function bucketByDay(logs) {
  const map = new Map();
  for (const e of logs) {
    const key = new Date(e.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    map.set(key, (map.get(key) || 0) + 1);
  }
  const entries = [...map.entries()].slice(-30);
  return { labels: entries.map((x) => x[0]), values: entries.map((x) => x[1]) };
}

function bucketByField(logs, field) {
  const counts = BUCKET_ORDER.map(() => 0);
  for (const e of logs) {
    const idx = BUCKET_ORDER.indexOf(e[field]);
    if (idx >= 0) counts[idx] += 1;
  }
  return { labels: BUCKET_ORDER, values: counts };
}

const MOOD_ORDER = ['great', 'good', 'okay', 'low', 'foggy'];

function energyOverTime(journalLogs) {
  const entries = journalLogs.filter((e) => typeof e.energy === 'number');
  const recent = entries.slice(-30);
  return {
    labels: recent.map((e) => new Date(e.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
    values: recent.map((e) => e.energy),
  };
}

function concentrationOverTime(journalLogs) {
  const entries = journalLogs.filter((e) => typeof e.concentration === 'number');
  const recent = entries.slice(-30);
  return {
    labels: recent.map((e) => new Date(e.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
    values: recent.map((e) => e.concentration),
  };
}

function moodFrequency(journalLogs) {
  const counts = MOOD_ORDER.map(() => 0);
  for (const e of journalLogs) {
    const idx = MOOD_ORDER.indexOf(e.mood);
    if (idx >= 0) counts[idx] += 1;
  }
  return { labels: MOOD_ORDER, values: counts };
}

function sleepComparison(logs) {
  const heavy = logs.filter((e) => e.severity >= 4);
  const light = logs.filter((e) => e.severity < 4);
  const avg = (arr) => (arr.length ? arr.reduce((s, e) => s + (e.sleep_hours || 0), 0) / arr.length : 0);
  return {
    labels: [`Fog-heavy (${heavy.length})`, `Other (${light.length})`],
    values: [Number(avg(heavy).toFixed(1)), Number(avg(light).toFixed(1))],
  };
}

const SYMBOLS = {
  commandorcontrol: '⌘',
  command: '⌘',
  cmd: '⌘',
  super: '⌘',
  control: '⌃',
  ctrl: '⌃',
  shift: '⇧',
  alt: '⌥',
  option: '⌥',
};

function formatShortcut(s) {
  if (!s) return '';
  const parts = s.split('+').filter(Boolean);
  const key = parts.pop();
  const mods = parts.map((p) => SYMBOLS[p.toLowerCase()] || p).join('');
  return mods + key.toUpperCase();
}

function chartCard(title) {
  const card = document.createElement('section');
  card.className = 'card wide';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const canvas = document.createElement('canvas');
  canvas.className = 'chart-canvas';
  card.appendChild(h2);
  card.appendChild(canvas);
  return { card, canvas };
}

export async function init(panel, fog) {
  panel.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'tab-content';
  panel.appendChild(wrap);

  const shortcut = formatShortcut(fog?.shortcut);
  const shortcutNote = document.createElement('p');
  shortcutNote.className = 'note shortcut-note';
  shortcutNote.innerHTML = `Quick-log shortcut: <kbd>${shortcut}</kbd> — or pick "Log Mood" from the menu bar.`;
  wrap.appendChild(shortcutNote);

  const chartsHost = document.createElement('div');
  chartsHost.style.display = 'contents';
  wrap.appendChild(chartsHost);

  async function refresh() {
    chartsHost.innerHTML = '';

    const [logs, journalLogs] = await Promise.all([
      invoke('get_fog_log'),
      invoke('get_journal_log'),
    ]);

    if (!logs.length && !journalLogs.length) {
      const empty = document.createElement('section');
      empty.className = 'card wide';
      empty.innerHTML = `<h2>Patterns</h2><p class="note">Nothing logged yet — press <kbd>${shortcut}</kbd> or use the menu bar to log one.</p>`;
      chartsHost.appendChild(empty);
      return;
    }

    if (journalLogs.length) {
      const byEnergy = chartCard('Energy over recent entries');
      const byConcentration = chartCard('Concentration over recent entries');
      const byMood = chartCard('Mood frequency');
      chartsHost.appendChild(byEnergy.card);
      chartsHost.appendChild(byConcentration.card);
      chartsHost.appendChild(byMood.card);
      drawLineChart(byEnergy.canvas, energyOverTime(journalLogs));
      drawLineChart(byConcentration.canvas, concentrationOverTime(journalLogs));
      drawBarChart(byMood.canvas, moodFrequency(journalLogs));
    }

    if (logs.length) {
      const byHour = chartCard('By time of day');
      const byDay = chartCard('Trend over recent days');
      const bySleep = chartCard('Avg sleep hours: fog-heavy days vs others');
      const byMeal = chartCard('Frequency by time since last meal');
      const byCaffeine = chartCard('Frequency by time since last caffeine');

      for (const c of [byHour, byDay, bySleep, byMeal, byCaffeine]) chartsHost.appendChild(c.card);

      drawBarChart(byHour.canvas, bucketByHour(logs));
      drawLineChart(byDay.canvas, bucketByDay(logs));
      drawBarChart(bySleep.canvas, sleepComparison(logs));
      drawBarChart(byMeal.canvas, bucketByField(logs, 'last_meal'));
      drawBarChart(byCaffeine.canvas, bucketByField(logs, 'last_caffeine'));
    }
  }

  await refresh();
  window.__TAURI__.event.listen('journal-updated', refresh);
}
