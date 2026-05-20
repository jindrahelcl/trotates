'use strict';

const JWT_KEY = 'mapRotatorJWT';

function setJWT(token) {
  localStorage.setItem(JWT_KEY, token);
}

function redirect() {
  const next = new URLSearchParams(location.search).get('next') || '/';
  location.href = next;
}

function showMsg(id, text, isOk = false) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'auth-msg' + (isOk ? ' ok' : '');
  el.style.display = '';
}

function hideMsg(id) {
  document.getElementById(id).style.display = 'none';
}

// ── Tabs ──────────────────────────────────────────────────────────────────

document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.authTab;
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('auth-login-tab').style.display    = tab === 'login'    ? '' : 'none';
    document.getElementById('auth-register-tab').style.display = tab === 'register' ? '' : 'none';
  });
});

// ── Login ─────────────────────────────────────────────────────────────────

document.getElementById('auth-login-btn').addEventListener('click', async () => {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const btn      = document.getElementById('auth-login-btn');
  if (!email || !password) return;
  btn.disabled = true;
  hideMsg('auth-login-msg');
  try {
    const r    = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (data.ok) { setJWT(data.token); redirect(); }
    else {
      const msgs = { not_found: 'No account with that email.', wrong_password: 'Wrong password.' };
      showMsg('auth-login-msg', msgs[data.error] || 'Sign in failed.');
    }
  } catch { showMsg('auth-login-msg', 'Network error.'); }
  btn.disabled = false;
});

document.getElementById('auth-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('auth-login-btn').click();
});

// ── Register ──────────────────────────────────────────────────────────────

document.getElementById('auth-register-btn').addEventListener('click', async () => {
  const nickname = document.getElementById('auth-nickname').value.trim();
  const email    = document.getElementById('auth-reg-email').value.trim();
  const password = document.getElementById('auth-reg-password').value;
  const btn      = document.getElementById('auth-register-btn');
  if (!nickname || !email || !password) return;
  btn.disabled = true;
  hideMsg('auth-register-msg');
  try {
    const r    = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, email, password }),
    });
    const data = await r.json();
    if (data.ok) { setJWT(data.token); redirect(); }
    else {
      const msgs = {
        nickname_taken:   'That nickname is already taken.',
        email_taken:      'An account with that email already exists.',
        nickname_invalid: 'Nickname must be 2–20 characters.',
        password_short:   'Password must be at least 8 characters.',
      };
      showMsg('auth-register-msg', msgs[data.error] || 'Registration failed.');
    }
  } catch { showMsg('auth-register-msg', 'Network error.'); }
  btn.disabled = false;
});

// ── Google One Tap ────────────────────────────────────────────────────────

const clientId = document.querySelector('meta[name="google-client-id"]')?.content;

if (clientId && window.google) {
  initGoogle();
} else {
  document.querySelector('script[src*="gsi"]')?.addEventListener('load', initGoogle);
}

function initGoogle() {
  if (!window.google || !clientId) return;
  google.accounts.id.initialize({
    client_id: clientId,
    callback: async ({ credential }) => {
      try {
        const r    = await fetch('/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential }),
        });
        const data = await r.json();
        if (data.ok) { setJWT(data.token); redirect(); }
        else showMsg('auth-login-msg', 'Google sign-in failed.');
      } catch { showMsg('auth-login-msg', 'Network error.'); }
    },
  });
  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    { theme: 'filled_black', size: 'large', width: 340 }
  );
}

// ── Skip ──────────────────────────────────────────────────────────────────

document.getElementById('auth-skip-btn').addEventListener('click', () => {
  sessionStorage.setItem('mapRotatorSkip', '1');
  redirect();
});
