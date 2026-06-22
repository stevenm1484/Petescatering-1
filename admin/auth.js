// Webnara admin login gate.
// Credentials are never stored in this file - only salted SHA-256 hashes.
// The page content stays hidden (CSS) until the body gets the "authed" class.

const AUTH_SALT = 'webnara|';
const AUTH_USERS = [
  {
    userHash: '5de4dfbf0e6526d1622eed973d2e5a09afb7aad33dd3434ecb902b525e059b7c',
    passHash: '72b63bb8db70b4b63f257b6463c6508acd77c4a35565553cbac562b06744ea1e'
  },
  {
    userHash: 'd3854334ac8c1a33128379c29da03057850a58309eb1aab00d47e382d6d19b3d',
    passHash: '08880fa85a9a7e1264faf035dedc5bee0a30bbbbd696375a03c93d336a25dec0'
  }
];
const SESSION_KEY = 'webgap_session';

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function isValidSession(token) {
  return AUTH_USERS.some(user => user.passHash === token);
}

function unlock() {
  document.body.classList.add('authed');
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.remove();
}

// Already signed in this browser session?
if (isValidSession(sessionStorage.getItem(SESSION_KEY))) {
  unlock();
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const errorEl = document.getElementById('loginError');
    const user = document.getElementById('loginUser').value.trim().toLowerCase();
    const pass = document.getElementById('loginPass').value;

    const [userHash, passHash] = await Promise.all([
      sha256Hex(AUTH_SALT + user),
      sha256Hex(AUTH_SALT + pass)
    ]);

    const match = AUTH_USERS.find(
      account => account.userHash === userHash && account.passHash === passHash
    );

    if (match) {
      sessionStorage.setItem(SESSION_KEY, passHash);
      unlock();
    } else {
      errorEl.hidden = false;
      document.getElementById('loginPass').value = '';
      document.getElementById('loginPass').focus();
    }
  });
}

const signOutBtn = document.getElementById('signOutBtn');
if (signOutBtn) {
  signOutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });
}
