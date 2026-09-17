const invoke = window.__TAURI__.core.invoke;

const MOOD_EMOJI = { great: '✦', good: '◇', okay: '·', low: '▽', foggy: '◍' };

function fmtTs(ts) {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderEntries(body, logs) {
  body.innerHTML = '';

  if (!logs.length) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = 'No journal entries yet — press the mood shortcut or "Log Mood" from the menu bar.';
    body.appendChild(p);
    return;
  }

  const list = document.createElement('div');
  list.className = 'journal-list';
  body.appendChild(list);

  for (const e of [...logs].reverse()) {
    const row = document.createElement('div');
    row.className = 'journal-entry';

    const summary = document.createElement('div');
    summary.className = 'journal-summary';
    summary.innerHTML = `
      <span class="journal-mood mood-${e.mood}">${MOOD_EMOJI[e.mood] || '·'} ${e.mood}</span>
      <span class="journal-energy">energy ${e.energy}/5 · focus ${e.concentration ?? '—'}/5</span>
      <span class="journal-ts">${fmtTs(e.ts)}</span>
      ${e.parsed_by && e.parsed_by !== 'none' ? `<span class="badge">${e.parsed_by}</span>` : ''}
    `;
    row.appendChild(summary);

    if (e.text) {
      const text = document.createElement('p');
      text.className = 'journal-text';
      text.textContent = e.text;
      row.appendChild(text);
    }

    const details = [];
    if (e.fog_confirmed) {
      details.push(
        `Fog confirmed · severity ${e.severity}/5 · slept ${e.sleep_hours ? e.sleep_hours.toFixed(1) + 'h' : '—'} · last meal ${e.last_meal || '—'} · last caffeine ${e.last_caffeine || '—'}`
      );
    }
    if (e.weather) details.push(`Weather: ${e.weather}`);
    if (e.food_timing) details.push(`Last ate: ${e.food_timing}`);
    if (e.reason) details.push(`Reason: ${e.reason}`);
    if (details.length) {
      const meta = document.createElement('p');
      meta.className = 'note journal-meta';
      meta.textContent = details.join(' · ');
      row.appendChild(meta);
    }

    list.appendChild(row);
  }
}

export async function init(panel) {
  panel.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'tab-content';
  panel.appendChild(wrap);

  const card = document.createElement('section');
  card.className = 'card wide';
  card.innerHTML = `
    <div class="journal-header">
      <h2>Journal</h2>
      <button type="button" class="ghost" id="journalAddBtn">+ Add Entry</button>
    </div>
  `;
  wrap.appendChild(card);
  card.querySelector('#journalAddBtn').addEventListener('click', () => invoke('open_mood_log_now'));

  const body = document.createElement('div');
  card.appendChild(body);

  const refresh = async () => renderEntries(body, await invoke('get_journal_log'));
  await refresh();

  window.__TAURI__.event.listen('journal-updated', refresh);
}
