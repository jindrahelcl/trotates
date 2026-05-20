'use strict';

const JWT_KEY = 'mapRotatorJWT';

function getJWT()         { return localStorage.getItem(JWT_KEY); }
function clearJWT()       { localStorage.removeItem(JWT_KEY); }
function authHeaders()    { return { 'Authorization': 'Bearer ' + getJWT(), 'Content-Type': 'application/json' }; }

async function init() {
  const token = getJWT();
  if (!token) {
    show('content-unauth');
    return;
  }

  const r = await fetch('/profile/stats', { headers: { 'Authorization': 'Bearer ' + token } });
  if (r.status === 401) {
    clearJWT();
    show('content-unauth');
    return;
  }

  const data = await r.json();

  // Sidebar
  document.getElementById('sidebar-avatar').textContent   = data.nickname[0].toUpperCase();
  document.getElementById('sidebar-nickname').textContent = data.nickname;

  // Header
  document.getElementById('member-since').textContent =
    'Member since ' + new Date(data.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' });

  // Account info
  document.getElementById('info-email').textContent  = data.email || '—';
  document.getElementById('info-google').textContent = data.googleLinked ? '✓ Linked' : 'Not linked';
  document.getElementById('info-google').className   = 'account-value' + (data.googleLinked ? ' linked' : ' unlinked');

  // Stats
  document.getElementById('stat-solves').textContent   = data.solves;
  document.getElementById('stat-wins').textContent     = data.wins;
  document.getElementById('stat-campaign').textContent = data.campaignLevel;

  show('content-main');
}

function show(id) {
  document.getElementById('content-loading').style.display = 'none';
  document.getElementById(id).style.display = '';
}

// ── Name change ───────────────────────────────────────────────────────────

document.getElementById('name-btn').addEventListener('click', async () => {
  const input = document.getElementById('name-input');
  const msg   = document.getElementById('name-msg');
  const btn   = document.getElementById('name-btn');
  const nick  = input.value.trim();
  if (!nick) return;

  btn.disabled = true;
  msg.style.display = 'none';

  try {
    const r    = await fetch('/account/rename', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ nickname: nick }) });
    const data = await r.json();
    if (data.ok) {
      localStorage.setItem(JWT_KEY, data.token);
      document.getElementById('sidebar-avatar').textContent   = nick[0].toUpperCase();
      document.getElementById('sidebar-nickname').textContent = nick;
      input.value = '';
      msg.textContent = 'Nickname updated.';
      msg.className   = 'field-msg ok';
      msg.style.display = '';
    } else {
      const msgs = { nickname_taken: 'Already taken.', nickname_invalid: 'Must be 2–20 characters.' };
      msg.textContent = msgs[data.error] || 'Error — try again.';
      msg.className   = 'field-msg';
      msg.style.display = '';
    }
  } catch {
    msg.textContent = 'Network error.';
    msg.className   = 'field-msg';
    msg.style.display = '';
  }

  btn.disabled = false;
});

document.getElementById('name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('name-btn').click();
});

// ── Sign out ──────────────────────────────────────────────────────────────

document.getElementById('signout-btn').addEventListener('click', () => {
  clearJWT();
  sessionStorage.removeItem('mapRotatorSkip');
  location.href = '/welcome';
});

// ── Boot ──────────────────────────────────────────────────────────────────

init();
