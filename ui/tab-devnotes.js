const invoke = window.__TAURI__.core.invoke;

function renderSetup(card) {
  card.innerHTML = `
    <h2>Developer Notes</h2>
    <p class="note">No password set yet. Choose one to gate this tab — it protects a manual notes area plus a log of Claude/Codex sessions that worked on this app.</p>
    <div class="row col">
      <input type="password" id="dnNewPassword" placeholder="new password" />
      <button type="button" class="ghost" id="dnSetPassword" style="margin-top:8px;">Set Password</button>
    </div>
  `;
  card.querySelector('#dnSetPassword').addEventListener('click', async () => {
    const pw = card.querySelector('#dnNewPassword').value;
    if (!pw) return;
    await invoke('set_devnotes_password', { password: pw });
    renderUnlocked(card);
  });
}

function renderLock(card) {
  card.innerHTML = `
    <h2>Developer Notes</h2>
    <p class="note">Password-gated — enter it to view notes and session history.</p>
    <div class="row">
      <input type="password" id="dnPassword" placeholder="password" />
      <button type="button" class="ghost" id="dnUnlock">Unlock</button>
    </div>
    <p class="note hidden" id="dnError">Incorrect password.</p>
  `;
  const tryUnlock = async () => {
    const pw = card.querySelector('#dnPassword').value;
    const ok = await invoke('verify_devnotes_password', { password: pw });
    if (ok) renderUnlocked(card);
    else card.querySelector('#dnError').classList.remove('hidden');
  };
  card.querySelector('#dnUnlock').addEventListener('click', tryUnlock);
  card.querySelector('#dnPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryUnlock();
  });
}

async function renderUnlocked(card) {
  const [settings, sessions] = await Promise.all([
    invoke('get_settings'),
    invoke('get_dev_sessions'),
  ]);

  card.innerHTML = `
    <h2>Developer Notes</h2>
    <label class="row col">
      <span>Manual notes</span>
      <textarea id="dnNotes" rows="6" spellcheck="false"></textarea>
    </label>
    <div class="row" style="justify-content:flex-end;">
      <span class="toast" id="dnSavedToast">Saved ✓</span>
      <button type="button" class="ghost" id="dnSaveNotes">Save Notes</button>
    </div>
    <h2 style="margin-top:20px;">Sessions</h2>
    <p class="note">Auto-logged whenever a Claude/Codex session does dev work on this app. "Title" is a descriptive label written by that session — there's no API to read the CLI's own auto-generated session title from inside a session.</p>
    <div id="dnSessions" class="things-list"></div>
  `;

  card.querySelector('#dnNotes').value = settings.devnotes.notes || '';
  card.querySelector('#dnSaveNotes').addEventListener('click', async () => {
    await invoke('save_dev_notes', { notes: card.querySelector('#dnNotes').value });
    const toast = card.querySelector('#dnSavedToast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  });

  const list = card.querySelector('#dnSessions');
  for (const s of sessions) {
    const row = document.createElement('div');
    row.className = 'thing-row';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'stretch';
    row.style.gap = '4px';
    row.innerHTML = `
      <span class="thing-text" style="font-weight:600;">${escapeHtml(s.title)}</span>
      <span class="note">${new Date(s.ts).toLocaleDateString()} · ${escapeHtml(s.working_dir)}</span>
      <span class="note"><code>${escapeHtml(s.resume_hint)}</code></span>
    `;
    list.appendChild(row);
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export async function init(panel) {
  panel.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'tab-content';
  const card = document.createElement('section');
  card.className = 'card wide';
  wrap.appendChild(card);
  panel.appendChild(wrap);

  const hasPassword = await invoke('devnotes_password_is_set');
  if (hasPassword) renderLock(card);
  else renderSetup(card);
}
