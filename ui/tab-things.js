function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function init(panel, fog) {
  panel.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'tab-content';

  const card = document.createElement('section');
  card.className = 'card wide';
  card.innerHTML = `
    <h2>Things to Try</h2>
    <p class="note">One is suggested right after every fog log. Flag an item as a reminder to have it fire every time too — like "when in confusion, drink water".</p>
    <div id="thingsList" class="things-list"></div>
    <div class="row add-row">
      <input id="thingsInput" type="text" placeholder="add a custom thing to try…" maxlength="80" />
      <button id="thingsAdd" type="button" class="ghost">Add</button>
    </div>
  `;
  wrap.appendChild(card);
  panel.appendChild(wrap);

  const list = card.querySelector('#thingsList');
  const input = card.querySelector('#thingsInput');

  function render() {
    list.innerHTML = '';
    for (const item of fog.things_to_try) {
      const row = document.createElement('div');
      row.className = 'thing-row';
      row.innerHTML = `
        <span class="thing-text">${escapeHtml(item.text)}</span>
        <label class="thing-toggle"><span>on</span><input type="checkbox" class="switch" data-role="enabled" /></label>
        <label class="thing-toggle"><span>reminder</span><input type="checkbox" class="switch" data-role="reminder" /></label>
        ${item.builtin ? '' : '<button type="button" class="icon-remove" aria-label="Remove">×</button>'}
      `;
      row.querySelector('[data-role="enabled"]').checked = item.enabled;
      row.querySelector('[data-role="reminder"]').checked = item.fires_as_reminder;
      row.querySelector('[data-role="enabled"]').addEventListener('change', (e) => {
        item.enabled = e.target.checked;
      });
      row.querySelector('[data-role="reminder"]').addEventListener('change', (e) => {
        item.fires_as_reminder = e.target.checked;
      });
      const removeBtn = row.querySelector('.icon-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          fog.things_to_try = fog.things_to_try.filter((t) => t !== item);
          render();
        });
      }
      list.appendChild(row);
    }
  }

  card.querySelector('#thingsAdd').addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) return;
    fog.things_to_try.push({
      id: `custom-${Date.now()}`,
      text,
      builtin: false,
      enabled: true,
      fires_as_reminder: false,
    });
    input.value = '';
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') card.querySelector('#thingsAdd').click();
  });

  render();
}
